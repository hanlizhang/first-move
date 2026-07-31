-- Phase B3/B4 continuous cloud-sync MVP.
-- Full workspace snapshots are applied atomically. Economic state is derived server-side.

create function public.sync_cloud_workspace_v1(
  p_mutation_id uuid,
  p_device_id uuid,
  p_timezone text,
  p_state jsonb,
  p_daily_plans jsonb,
  p_commands jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_row jsonb;
  v_child jsonb;
  v_id uuid;
  v_parent_id uuid;
  v_local_date date;
  v_occurred_at timestamptz;
  v_points_tenths integer;
  v_item public.inventory_items%rowtype;
  v_quantity integer;
  v_position integer;
  v_selected_furniture text;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p_mutation_id is null or p_device_id is null then raise exception 'invalid_mutation_identity' using errcode = '22023'; end if;
  if not public.valid_timezone(p_timezone) then raise exception 'invalid_timezone' using errcode = '22023'; end if;
  if jsonb_typeof(p_state) <> 'object' or coalesce((p_state->>'schemaVersion')::integer, -1) <> 8 then
    raise exception 'unsupported_schema_version' using errcode = '22023';
  end if;
  if jsonb_typeof(p_daily_plans) <> 'array' or jsonb_typeof(p_commands) <> 'object' then
    raise exception 'invalid_sync_payload' using errcode = '22023';
  end if;
  if p_state::text ~* 'data:image|toothbrush_(image|photo)|toothbrush(image|photo)' then
    raise exception 'image_payload_forbidden' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text, 0));
  if not exists (
    select 1 from public.import_batches
    where user_id = v_user and status = 'completed' and verified_at is not null
  ) then raise exception 'workspace_not_initialized' using errcode = 'P0001'; end if;
  if exists (select 1 from public.devices where id = p_device_id and user_id <> v_user) then
    raise exception 'device_not_owned' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.client_mutations
    where user_id = v_user and device_id = p_device_id and mutation_id = p_mutation_id
  ) then return public.get_cloud_workspace_v2(); end if;

  insert into public.devices (id, user_id, platform, last_seen_at)
  values (p_device_id, v_user, 'web', transaction_timestamp())
  on conflict (id) do update set last_seen_at = excluded.last_seen_at, deleted_at = null;

  insert into public.profiles (user_id, timezone, first_use_local_date)
  values (v_user, p_timezone, nullif(p_state->'progress'->>'firstUseDate', '')::date)
  on conflict (user_id) do update set
    timezone = excluded.timezone,
    first_use_local_date = excluded.first_use_local_date;

  v_selected_furniture := nullif(p_state->'inventory'->>'selectedFurnitureId', '');
  if v_selected_furniture is not null and not exists (
    select 1 from public.inventory_items item
    join public.inventory_balances balance on balance.item_id = item.id
    where item.id = v_selected_furniture and item.kind = 'furniture'
      and balance.user_id = v_user and balance.quantity > 0
  ) then raise exception 'furniture_not_owned' using errcode = '42501'; end if;
  insert into public.user_settings (user_id, selected_furniture_id)
  values (v_user, v_selected_furniture)
  on conflict (user_id) do update set selected_furniture_id = excluded.selected_furniture_id;

  -- Missing rows are tombstoned before upserts so partial unique indexes do not
  -- block a replacement pending intent or open session.
  update public.activity_intents target set status = 'cancelled', deleted_at = transaction_timestamp()
  where target.user_id = v_user and target.deleted_at is null and not exists (
    select 1 from jsonb_array_elements(coalesce(p_state->'activityIntents', '[]'::jsonb)) source
    where (source->>'id')::uuid = target.id
  );
  update public.activity_sessions target set deleted_at = transaction_timestamp()
  where target.user_id = v_user and target.deleted_at is null and not exists (
    select 1 from jsonb_array_elements(coalesce(p_state->'sessions', '[]'::jsonb)) source
    where (source->>'id')::uuid = target.id
  );

  -- Tasks and task completions. Reward rows are append-only and keyed to the
  -- durable completion UUID, so unchecking cannot duplicate or revoke points.
  for v_row in select value from jsonb_array_elements(coalesce(p_state->'tasks', '[]'::jsonb)) loop
    v_id := (v_row->>'id')::uuid;
    if exists (select 1 from public.tasks where id = v_id and user_id <> v_user) then
      raise exception 'task_not_owned' using errcode = '42501';
    end if;
    insert into public.tasks (id, user_id, title, direction, rank, created_at, updated_at, deleted_at)
    values (
      v_id, v_user, v_row->>'title', (v_row->>'direction')::public.direction,
      pg_catalog.lpad(coalesce(v_row->>'order', '0'), 12, '0'),
      (v_row->>'createdAt')::timestamptz, transaction_timestamp(), null
    )
    on conflict (id) do update set
      title = excluded.title, direction = excluded.direction, rank = excluded.rank, deleted_at = null;

    for v_child in select value from jsonb_array_elements(coalesce(v_row->'completedOn', '[]'::jsonb)) loop
      v_local_date := trim(both '"' from v_child::text)::date;
      v_occurred_at := ((v_local_date::text || ' 12:00:00')::timestamp at time zone p_timezone);
      select id into v_parent_id from public.task_completions
      where user_id = v_user and task_id = v_id and local_date = v_local_date;
      if v_parent_id is null then
        v_parent_id := gen_random_uuid();
        insert into public.task_completions
          (id, user_id, task_id, local_date, timezone, occurred_at)
        values (v_parent_id, v_user, v_id, v_local_date, p_timezone, v_occurred_at);
      else
        update public.task_completions set timezone = p_timezone, deleted_at = null
        where user_id = v_user and id = v_parent_id;
      end if;
      insert into public.reward_ledger
        (id, user_id, source_type, source_id, local_date, timezone, points_tenths, idempotency_key, created_at)
      values (gen_random_uuid(), v_user, 'task', v_parent_id, v_local_date, p_timezone, 50,
        'task:' || v_parent_id::text, v_occurred_at)
      on conflict do nothing;
    end loop;
  end loop;
  update public.tasks target set deleted_at = transaction_timestamp()
  where target.user_id = v_user and target.deleted_at is null and not exists (
    select 1 from jsonb_array_elements(coalesce(p_state->'tasks', '[]'::jsonb)) source
    where (source->>'id')::uuid = target.id
  );
  update public.task_completions target set deleted_at = transaction_timestamp()
  where target.user_id = v_user and target.deleted_at is null and not exists (
    select 1
    from jsonb_array_elements(coalesce(p_state->'tasks', '[]'::jsonb)) task
    cross join lateral jsonb_array_elements_text(coalesce(task->'completedOn', '[]'::jsonb)) completed(local_date)
    where (task->>'id')::uuid = target.task_id and completed.local_date::date = target.local_date
  );

  -- Habits, schedules, and completions use the same parent-first and
  -- completion-ledger rules as tasks.
  for v_row in select value from jsonb_array_elements(coalesce(p_state->'habits', '[]'::jsonb)) loop
    v_id := (v_row->>'id')::uuid;
    if exists (select 1 from public.habits where id = v_id and user_id <> v_user) then
      raise exception 'habit_not_owned' using errcode = '42501';
    end if;
    insert into public.habits (id, user_id, title, direction, schedule_kind, created_at, updated_at, deleted_at)
    values (
      v_id, v_user, v_row->>'title', (v_row->>'direction')::public.direction,
      (v_row->'schedule'->>'kind'), (v_row->>'createdAt')::timestamptz, transaction_timestamp(), null
    )
    on conflict (id) do update set
      title = excluded.title, direction = excluded.direction, schedule_kind = excluded.schedule_kind, deleted_at = null;

    if v_row->'schedule'->>'kind' = 'weekdays' then
      for v_child in select value from jsonb_array_elements(coalesce(v_row->'schedule'->'weekdays', '[]'::jsonb)) loop
        insert into public.habit_schedule_weekdays (id, user_id, habit_id, weekday, deleted_at)
        values (gen_random_uuid(), v_user, v_id, trim(both '"' from v_child::text)::public.weekday, null)
        on conflict (user_id, habit_id, weekday) do update set deleted_at = null;
      end loop;
    end if;
    update public.habit_schedule_weekdays target set deleted_at = transaction_timestamp()
    where target.user_id = v_user and target.habit_id = v_id and target.deleted_at is null and not exists (
      select 1 from jsonb_array_elements_text(coalesce(v_row->'schedule'->'weekdays', '[]'::jsonb)) weekday(value)
      where weekday.value::public.weekday = target.weekday
    );

    for v_child in select value from jsonb_array_elements(coalesce(v_row->'completedOn', '[]'::jsonb)) loop
      v_local_date := trim(both '"' from v_child::text)::date;
      v_occurred_at := ((v_local_date::text || ' 12:00:00')::timestamp at time zone p_timezone);
      select id into v_parent_id from public.habit_completions
      where user_id = v_user and habit_id = v_id and local_date = v_local_date;
      if v_parent_id is null then
        v_parent_id := gen_random_uuid();
        insert into public.habit_completions
          (id, user_id, habit_id, local_date, timezone, occurred_at)
        values (v_parent_id, v_user, v_id, v_local_date, p_timezone, v_occurred_at);
      else
        update public.habit_completions set timezone = p_timezone, deleted_at = null
        where user_id = v_user and id = v_parent_id;
      end if;
      insert into public.reward_ledger
        (id, user_id, source_type, source_id, local_date, timezone, points_tenths, idempotency_key, created_at)
      values (gen_random_uuid(), v_user, 'habit', v_parent_id, v_local_date, p_timezone, 30,
        'habit:' || v_parent_id::text, v_occurred_at)
      on conflict do nothing;
    end loop;
  end loop;
  update public.habits target set deleted_at = transaction_timestamp()
  where target.user_id = v_user and target.deleted_at is null and not exists (
    select 1 from jsonb_array_elements(coalesce(p_state->'habits', '[]'::jsonb)) source
    where (source->>'id')::uuid = target.id
  );
  update public.habit_completions target set deleted_at = transaction_timestamp()
  where target.user_id = v_user and target.deleted_at is null and not exists (
    select 1
    from jsonb_array_elements(coalesce(p_state->'habits', '[]'::jsonb)) habit
    cross join lateral jsonb_array_elements_text(coalesce(habit->'completedOn', '[]'::jsonb)) completed(local_date)
    where (habit->>'id')::uuid = target.habit_id and completed.local_date::date = target.local_date
  );

  -- Pending activity intents.
  for v_row in select value from jsonb_array_elements(coalesce(p_state->'activityIntents', '[]'::jsonb)) loop
    v_id := (v_row->>'id')::uuid;
    if exists (select 1 from public.activity_intents where id = v_id and user_id <> v_user) then
      raise exception 'intent_not_owned' using errcode = '42501';
    end if;
    insert into public.activity_intents (
      id, user_id, stuck_state, direction, move_text, intended_duration_minutes,
      linked_task_id, linked_habit_id, status, created_at, deleted_at
    ) values (
      v_id, v_user, v_row->>'stuckState', (v_row->>'direction')::public.direction,
      v_row->>'moveText', (v_row->>'intendedDurationMinutes')::integer,
      nullif(v_row->>'linkedTaskId', '')::uuid, nullif(v_row->>'linkedHabitId', '')::uuid,
      'pending', (v_row->>'createdAt')::timestamptz, null
    )
    on conflict (id) do update set
      stuck_state = excluded.stuck_state, direction = excluded.direction, move_text = excluded.move_text,
      intended_duration_minutes = excluded.intended_duration_minutes, linked_task_id = excluded.linked_task_id,
      linked_habit_id = excluded.linked_habit_id, status = 'pending', deleted_at = null;
  end loop;

  -- Sessions are mutable until closed. The receipt timestamp is the MVP LWW
  -- boundary; historical links retain their foreign keys to tombstoned parents.
  for v_row in select value from jsonb_array_elements(coalesce(p_state->'sessions', '[]'::jsonb)) loop
    v_id := (v_row->>'id')::uuid;
    if exists (select 1 from public.activity_sessions where id = v_id and user_id <> v_user) then
      raise exception 'session_not_owned' using errcode = '42501';
    end if;
    v_local_date := ((v_row->>'startedAt')::timestamptz at time zone p_timezone)::date;
    insert into public.activity_sessions (
      id, user_id, device_id, mode, status, direction, label, target_duration_minutes,
      linked_task_id, linked_habit_id, linked_intent_id, started_at, last_resumed_at,
      accumulated_elapsed_ms, ended_at, actual_elapsed_ms, reviewed_at, local_date, timezone, deleted_at
    ) values (
      v_id, v_user, p_device_id, (v_row->>'mode')::public.session_mode,
      (v_row->>'status')::public.session_status, (v_row->>'direction')::public.direction,
      v_row->>'label', nullif(v_row->>'targetDurationMinutes', '')::integer,
      nullif(v_row->>'linkedTaskId', '')::uuid, nullif(v_row->>'linkedHabitId', '')::uuid,
      nullif(v_row->>'linkedIntentId', '')::uuid, (v_row->>'startedAt')::timestamptz,
      nullif(v_row->>'lastResumedAt', '')::timestamptz,
      coalesce((v_row->>'accumulatedElapsedMs')::bigint, 0), nullif(v_row->>'endedAt', '')::timestamptz,
      nullif(v_row->>'actualElapsedMs', '')::bigint, nullif(v_row->>'reviewedAt', '')::timestamptz,
      v_local_date, p_timezone, null
    )
    on conflict (id) do update set
      device_id = excluded.device_id, mode = excluded.mode, status = excluded.status,
      direction = excluded.direction, label = excluded.label,
      target_duration_minutes = excluded.target_duration_minutes,
      linked_task_id = excluded.linked_task_id, linked_habit_id = excluded.linked_habit_id,
      linked_intent_id = excluded.linked_intent_id, started_at = excluded.started_at,
      last_resumed_at = excluded.last_resumed_at, accumulated_elapsed_ms = excluded.accumulated_elapsed_ms,
      ended_at = excluded.ended_at, actual_elapsed_ms = excluded.actual_elapsed_ms,
      reviewed_at = excluded.reviewed_at, local_date = excluded.local_date,
      timezone = excluded.timezone, deleted_at = null;

    if v_row->>'status' in ('completed', 'stopped') and coalesce((v_row->>'actualElapsedMs')::bigint, 0) >= 60000 then
      v_points_tenths := case when v_row->>'status' = 'completed'
        then round(((v_row->>'actualElapsedMs')::numeric / 60000))::integer
        else round(((v_row->>'actualElapsedMs')::numeric / 60000) * 0.3)::integer end;
      if v_points_tenths <> 0 then
        v_local_date := (nullif(v_row->>'endedAt', '')::timestamptz at time zone p_timezone)::date;
        insert into public.reward_ledger
          (id, user_id, source_type, source_id, local_date, timezone, points_tenths, idempotency_key, created_at)
        values (gen_random_uuid(), v_user, 'session', v_id, v_local_date, p_timezone, v_points_tenths,
          'session:' || v_id::text || ':time', (v_row->>'endedAt')::timestamptz)
        on conflict do nothing;
      end if;
    end if;
  end loop;

  -- Daily plans and items are a normalized server projection of the local plan store.
  for v_row in select value from jsonb_array_elements(p_daily_plans) loop
    v_local_date := (v_row->>'dateKey')::date;
    select id into v_parent_id from public.daily_plans
    where user_id = v_user and local_date = v_local_date;
    if v_parent_id is null then
      v_parent_id := gen_random_uuid();
      insert into public.daily_plans (id, user_id, local_date, timezone)
      values (v_parent_id, v_user, v_local_date, p_timezone);
    else
      update public.daily_plans set timezone = p_timezone, deleted_at = null
      where user_id = v_user and id = v_parent_id;
    end if;
    update public.daily_plan_items set deleted_at = transaction_timestamp()
    where user_id = v_user and daily_plan_id = v_parent_id and deleted_at is null;
    for v_child, v_position in
      select value, (ordinality - 1)::integer
      from jsonb_array_elements(coalesce(v_row->'items', '[]'::jsonb)) with ordinality
    loop
      select id into v_id from public.daily_plan_items
      where user_id = v_user and daily_plan_id = v_parent_id
        and position = v_position
      order by created_at limit 1;
      v_id := coalesce(v_id, gen_random_uuid());
      insert into public.daily_plan_items (
        id, user_id, daily_plan_id, item_group, title, first_step, direction,
        duration_minutes, position, deleted_at
      ) values (
        v_id, v_user, v_parent_id, (v_child->>'group')::public.daily_plan_group,
        v_child->>'title', v_child->>'firstStep', (v_child->>'category')::public.direction,
        (v_child->>'durationMinutes')::integer, v_position, null
      )
      on conflict (id) do update set
        item_group = excluded.item_group, title = excluded.title, first_step = excluded.first_step,
        direction = excluded.direction, duration_minutes = excluded.duration_minutes,
        position = excluded.position, deleted_at = null;
    end loop;
  end loop;
  update public.daily_plans target set deleted_at = transaction_timestamp()
  where target.user_id = v_user and target.deleted_at is null and not exists (
    select 1 from jsonb_array_elements(p_daily_plans) source
    where (source->>'dateKey')::date = target.local_date
  );
  update public.daily_plan_items item set deleted_at = transaction_timestamp()
  where item.user_id = v_user and item.deleted_at is null and exists (
    select 1 from public.daily_plans plan where plan.user_id = v_user and plan.id = item.daily_plan_id and plan.deleted_at is not null
  );

  -- Morning metadata only. No image field is accepted or persisted.
  for v_row in select value from jsonb_array_elements(coalesce(p_state->'morningAttempts', '[]'::jsonb)) loop
    v_local_date := (v_row->>'dateKey')::date;
    insert into public.morning_attempts (user_id, local_date, timezone, attempt_count)
    values (v_user, v_local_date, p_timezone, (v_row->>'count')::smallint)
    on conflict (user_id, local_date) do update set
      timezone = excluded.timezone,
      attempt_count = greatest(public.morning_attempts.attempt_count, excluded.attempt_count);
  end loop;
  for v_row in select value from jsonb_array_elements(coalesce(p_state->'morningChecks', '[]'::jsonb)) loop
    v_local_date := (v_row->>'dateKey')::date;
    select id into v_id from public.morning_checks where user_id = v_user and local_date = v_local_date;
    if v_id is null then
      v_id := gen_random_uuid();
      insert into public.morning_checks
        (id, user_id, local_date, timezone, verified_at, capture_method, verifier_mode)
      values (
        v_id, v_user, v_local_date, p_timezone, (v_row->>'verifiedAt')::timestamptz,
        v_row->>'captureMethod', v_row->>'verifierMode'
      );
    end if;
    insert into public.reward_ledger
      (id, user_id, source_type, source_id, local_date, timezone, points_tenths, idempotency_key, created_at)
    values (gen_random_uuid(), v_user, 'morning', v_id, v_local_date, p_timezone, 50,
      'morning:' || v_local_date::text, (v_row->>'verifiedAt')::timestamptz)
    on conflict do nothing;
  end loop;

  -- Private Mini Journal rows are mutable; their one-time rewards remain append-only.
  for v_row in select value from jsonb_array_elements(coalesce(p_state->'journalEntries', '[]'::jsonb)) loop
    v_local_date := (v_row->>'dateKey')::date;
    select id into v_id from public.journal_entries where user_id = v_user and local_date = v_local_date;
    v_id := coalesce(v_id, gen_random_uuid());
    insert into public.journal_entries (
      id, user_id, local_date, timezone, mood, energy, what_helped, completed,
      difficult, next_step, free_text, updated_at, deleted_at
    ) values (
      v_id, v_user, v_local_date, p_timezone, nullif(v_row->>'mood', '')::smallint,
      nullif(v_row->>'energy', '')::smallint, nullif(v_row->>'whatHelped', ''),
      nullif(v_row->>'completed', ''), nullif(v_row->>'difficult', ''),
      nullif(v_row->>'nextStep', ''), nullif(v_row->>'freeText', ''),
      transaction_timestamp(), null
    )
    on conflict (id) do update set
      timezone = excluded.timezone, mood = excluded.mood, energy = excluded.energy,
      what_helped = excluded.what_helped, completed = excluded.completed,
      difficult = excluded.difficult, next_step = excluded.next_step,
      free_text = excluded.free_text, deleted_at = null;
    insert into public.reward_ledger
      (id, user_id, source_type, source_id, local_date, timezone, points_tenths, idempotency_key)
    values (gen_random_uuid(), v_user, 'reflection', v_id, v_local_date, p_timezone, 20,
      'reflection:' || v_local_date::text)
    on conflict do nothing;
  end loop;
  update public.journal_entries target set deleted_at = transaction_timestamp()
  where target.user_id = v_user and target.deleted_at is null and not exists (
    select 1 from jsonb_array_elements(coalesce(p_state->'journalEntries', '[]'::jsonb)) source
    where (source->>'dateKey')::date = target.local_date
  );

  -- Purchases and food consumption are explicit, idempotent economic commands.
  for v_row in select value from jsonb_array_elements(coalesce(p_commands->'purchases', '[]'::jsonb)) loop
    perform public.purchase_inventory_item(
      v_row->>'itemId', (v_row->>'mutationId')::uuid,
      (v_row->>'localDate')::date, p_timezone
    );
  end loop;
  for v_row in select value from jsonb_array_elements(coalesce(p_commands->'consumptions', '[]'::jsonb)) loop
    select * into v_item from public.inventory_items
    where id = v_row->>'itemId' and kind = 'food' and active;
    if not found then raise exception 'invalid_consumable' using errcode = '22023'; end if;
    v_quantity := (v_row->>'quantity')::integer;
    if v_quantity <= 0 then raise exception 'invalid_consumption_quantity' using errcode = '22023'; end if;
    if not exists (
      select 1 from public.inventory_events
      where user_id = v_user and idempotency_key = 'consume:' || p_mutation_id::text || ':' || v_item.id
    ) then
      update public.inventory_balances set quantity = quantity - v_quantity
      where user_id = v_user and item_id = v_item.id and quantity >= v_quantity;
      if not found then raise exception 'insufficient_inventory' using errcode = 'P0001'; end if;
      insert into public.inventory_events
        (id, user_id, item_id, kind, quantity_delta, idempotency_key, local_date, timezone)
      values (
        gen_random_uuid(), v_user, v_item.id, 'consume', -v_quantity,
        'consume:' || p_mutation_id::text || ':' || v_item.id,
        (v_row->>'localDate')::date, p_timezone
      );
    end if;
  end loop;

  perform public.grant_earned_milestones(
    coalesce(
      nullif(p_state->'progress'->>'lastActiveDate', '')::date,
      (transaction_timestamp() at time zone p_timezone)::date
    ), p_timezone
  );

  insert into public.client_mutations
    (user_id, device_id, mutation_id, operation, entity_type, result)
  values (v_user, p_device_id, p_mutation_id, 'workspace_sync', 'workspace', '{"applied":true}'::jsonb);

  return public.get_cloud_workspace_v2();
end;
$$;

revoke all on function public.sync_cloud_workspace_v1(uuid, uuid, text, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.sync_cloud_workspace_v1(uuid, uuid, text, jsonb, jsonb, jsonb)
  to authenticated;

comment on function public.sync_cloud_workspace_v1(uuid, uuid, text, jsonb, jsonb, jsonb)
  is 'Owner-derived atomic continuous-sync snapshot. Ignores client reward totals and accepts only idempotent economic commands.';
