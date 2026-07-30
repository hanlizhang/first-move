-- Phase B2 only: atomic first workspace setup/import and canonical initial hydration.
-- This migration is intentionally local-only until reviewed and explicitly pushed later.

create function public.cloud_workspace_status()
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_batch public.import_batches%rowtype;
  v_initialized boolean;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select exists (
    select 1 from public.profiles where user_id = v_user
    union all select 1 from public.import_batches where user_id = v_user
    union all select 1 from public.tasks where user_id = v_user
    union all select 1 from public.habits where user_id = v_user
    union all select 1 from public.activity_sessions where user_id = v_user
    union all select 1 from public.journal_entries where user_id = v_user
    union all select 1 from public.reward_ledger where user_id = v_user
  ) into v_initialized;
  select * into v_batch from public.import_batches
  where user_id = v_user order by created_at desc limit 1;
  return jsonb_build_object(
    'initialized', v_initialized,
    'choice', case when v_batch.id is null then null else v_batch.choice end,
    'status', case when v_batch.id is null then null else v_batch.status end,
    'verified_at', v_batch.verified_at
  );
end;
$$;

create function public.get_cloud_workspace()
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  return jsonb_build_object(
    'profile', coalesce((select to_jsonb(p) - 'user_id' from public.profiles p where p.user_id = v_user), '{}'::jsonb),
    'settings', coalesce((select to_jsonb(s) - 'user_id' from public.user_settings s where s.user_id = v_user), '{}'::jsonb),
    'tasks', coalesce((select jsonb_agg(to_jsonb(t) - 'user_id' order by t.rank, t.id) from public.tasks t where t.user_id = v_user and t.deleted_at is null), '[]'::jsonb),
    'task_completions', coalesce((select jsonb_agg(to_jsonb(t) - 'user_id' order by t.local_date, t.id) from public.task_completions t where t.user_id = v_user and t.deleted_at is null), '[]'::jsonb),
    'habits', coalesce((select jsonb_agg(to_jsonb(h) - 'user_id' order by h.created_at, h.id) from public.habits h where h.user_id = v_user and h.deleted_at is null), '[]'::jsonb),
    'habit_schedule_weekdays', coalesce((select jsonb_agg(to_jsonb(h) - 'user_id' order by h.habit_id, h.weekday, h.id) from public.habit_schedule_weekdays h where h.user_id = v_user and h.deleted_at is null), '[]'::jsonb),
    'habit_completions', coalesce((select jsonb_agg(to_jsonb(h) - 'user_id' order by h.local_date, h.id) from public.habit_completions h where h.user_id = v_user and h.deleted_at is null), '[]'::jsonb),
    'activity_intents', coalesce((select jsonb_agg(to_jsonb(i) - 'user_id' order by i.created_at, i.id) from public.activity_intents i where i.user_id = v_user and i.deleted_at is null), '[]'::jsonb),
    'activity_sessions', coalesce((select jsonb_agg(to_jsonb(s) - 'user_id' - 'device_id' order by s.started_at, s.id) from public.activity_sessions s where s.user_id = v_user and s.deleted_at is null), '[]'::jsonb),
    'daily_plans', coalesce((select jsonb_agg(to_jsonb(p) - 'user_id' order by p.local_date, p.id) from public.daily_plans p where p.user_id = v_user and p.deleted_at is null), '[]'::jsonb),
    'daily_plan_items', coalesce((select jsonb_agg(to_jsonb(i) - 'user_id' order by i.daily_plan_id, i.position, i.id) from public.daily_plan_items i where i.user_id = v_user and i.deleted_at is null), '[]'::jsonb),
    'morning_checks', coalesce((select jsonb_agg(to_jsonb(m) - 'user_id' order by m.local_date, m.id) from public.morning_checks m where m.user_id = v_user), '[]'::jsonb),
    'morning_attempts', coalesce((select jsonb_agg(to_jsonb(m) - 'user_id' order by m.local_date) from public.morning_attempts m where m.user_id = v_user), '[]'::jsonb),
    'journal_entries', coalesce((select jsonb_agg(to_jsonb(j) - 'user_id' order by j.local_date, j.id) from public.journal_entries j where j.user_id = v_user and j.deleted_at is null), '[]'::jsonb),
    'reward_ledger', coalesce((select jsonb_agg(to_jsonb(r) - 'user_id' order by r.created_at, r.id) from public.reward_ledger r where r.user_id = v_user), '[]'::jsonb),
    'inventory_events', coalesce((select jsonb_agg(to_jsonb(i) - 'user_id' order by i.created_at, i.id) from public.inventory_events i where i.user_id = v_user), '[]'::jsonb),
    'inventory_balances', coalesce((select jsonb_agg(to_jsonb(i) - 'user_id' order by i.item_id) from public.inventory_balances i where i.user_id = v_user), '[]'::jsonb),
    'milestone_grants', coalesce((select jsonb_agg(to_jsonb(m) - 'user_id' order by m.milestone_day) from public.milestone_grants m where m.user_id = v_user), '[]'::jsonb),
    'active_days', coalesce((select jsonb_agg(a.local_date order by a.local_date) from public.active_days a where a.user_id = v_user), '[]'::jsonb),
    'points_tenths', coalesce((select sum(r.points_tenths) from public.reward_ledger r where r.user_id = v_user), 0)
  );
end;
$$;

create function public.initialize_cloud_workspace(
  p_choice public.import_choice,
  p_device_id uuid,
  p_snapshot_sha256 text,
  p_source_schema_version integer,
  p_timezone text,
  p_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_batch_id uuid;
  v_existing public.import_batches%rowtype;
  v_expected jsonb;
  v_counts jsonb;
  v_points bigint;
  v_inventory jsonb;
  v_milestones jsonb;
  v_active_days integer;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p_choice not in ('start_fresh', 'import_local') then raise exception 'invalid_choice' using errcode = '22023'; end if;
  if p_source_schema_version <> 8 then raise exception 'unsupported_schema_version' using errcode = '22023'; end if;
  if p_snapshot_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'invalid_snapshot_hash' using errcode = '22023'; end if;
  if not public.valid_timezone(p_timezone) then raise exception 'invalid_timezone' using errcode = '22023'; end if;
  if jsonb_typeof(p_payload) <> 'object' then raise exception 'invalid_payload' using errcode = '22023'; end if;
  if p_payload::text ~* 'data:image|toothbrush_(image|photo)|toothbrush(image|photo)' then
    raise exception 'image_payload_forbidden' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  select * into v_existing from public.import_batches
  where user_id = v_user and snapshot_sha256 = p_snapshot_sha256;
  if found then
    if v_existing.choice <> p_choice then raise exception 'snapshot_choice_mismatch' using errcode = '22023'; end if;
    if v_existing.status = 'completed' then return public.get_cloud_workspace(); end if;
    raise exception 'import_in_progress' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.profiles where user_id = v_user
    union all select 1 from public.import_batches where user_id = v_user
    union all select 1 from public.tasks where user_id = v_user
    union all select 1 from public.habits where user_id = v_user
    union all select 1 from public.activity_sessions where user_id = v_user
    union all select 1 from public.journal_entries where user_id = v_user
    union all select 1 from public.reward_ledger where user_id = v_user
  ) then
    raise exception 'workspace_not_empty' using errcode = 'P0001';
  end if;
  if p_choice = 'start_fresh' and p_payload <> '{}'::jsonb then
    raise exception 'start_fresh_payload_must_be_empty' using errcode = '22023';
  end if;
  if p_choice = 'import_local' and not (p_payload ? 'expected') then
    raise exception 'import_expected_summary_missing' using errcode = '22023';
  end if;

  insert into public.devices (id, user_id, platform)
  values (p_device_id, v_user, 'web');
  insert into public.profiles (user_id, timezone, first_use_local_date)
  values (v_user, p_timezone, nullif(p_payload->'profile'->>'first_use_local_date', '')::date);
  insert into public.user_settings (user_id, selected_furniture_id)
  values (v_user, nullif(p_payload->'settings'->>'selected_furniture_id', ''));
  v_batch_id := gen_random_uuid();
  v_expected := coalesce(p_payload->'expected', '{}'::jsonb);
  insert into public.import_batches (
    id, user_id, device_id, choice, status, source_schema_version, source_timezone, snapshot_sha256,
    expected_record_counts, expected_points_tenths, expected_inventory_balances
  ) values (
    v_batch_id, v_user, p_device_id, p_choice, 'running', p_source_schema_version, p_timezone, p_snapshot_sha256,
    coalesce(v_expected->'record_counts', '{}'::jsonb), nullif(v_expected->>'points_tenths', '')::bigint,
    coalesce(v_expected->'inventory_balances', '{}'::jsonb)
  );

  if p_choice = 'import_local' then
    insert into public.import_entity_mappings (user_id, import_batch_id, entity_type, local_id, cloud_id, payload_sha256)
    select v_user, v_batch_id, x.entity_type::public.import_entity_type, x.local_id, x.cloud_id, x.payload_sha256
    from jsonb_to_recordset(coalesce(p_payload->'mappings', '[]'::jsonb))
      as x(entity_type text, local_id text, cloud_id uuid, payload_sha256 text);

    insert into public.tasks (id, user_id, title, direction, rank, created_at)
    select x.id, v_user, x.title, x.direction::public.direction, x.rank, x.created_at
    from jsonb_to_recordset(coalesce(p_payload->'tasks', '[]'::jsonb))
      as x(id uuid, title text, direction text, rank text, created_at timestamptz);
    insert into public.task_completions (id, user_id, task_id, local_date, timezone, occurred_at)
    select x.id, v_user, x.task_id, x.local_date, x.timezone, x.occurred_at
    from jsonb_to_recordset(coalesce(p_payload->'task_completions', '[]'::jsonb))
      as x(id uuid, task_id uuid, local_date date, timezone text, occurred_at timestamptz);
    insert into public.habits (id, user_id, title, direction, schedule_kind, created_at)
    select x.id, v_user, x.title, x.direction::public.direction, x.schedule_kind, x.created_at
    from jsonb_to_recordset(coalesce(p_payload->'habits', '[]'::jsonb))
      as x(id uuid, title text, direction text, schedule_kind text, created_at timestamptz);
    insert into public.habit_schedule_weekdays (id, user_id, habit_id, weekday)
    select x.id, v_user, x.habit_id, x.weekday::public.weekday
    from jsonb_to_recordset(coalesce(p_payload->'habit_schedule_weekdays', '[]'::jsonb))
      as x(id uuid, habit_id uuid, weekday text);
    insert into public.habit_completions (id, user_id, habit_id, local_date, timezone, occurred_at)
    select x.id, v_user, x.habit_id, x.local_date, x.timezone, x.occurred_at
    from jsonb_to_recordset(coalesce(p_payload->'habit_completions', '[]'::jsonb))
      as x(id uuid, habit_id uuid, local_date date, timezone text, occurred_at timestamptz);
    insert into public.activity_intents (
      id, user_id, stuck_state, direction, move_text, intended_duration_minutes,
      linked_task_id, linked_habit_id, status, created_at
    )
    select x.id, v_user, x.stuck_state, x.direction::public.direction, x.move_text, x.intended_duration_minutes,
      x.linked_task_id, x.linked_habit_id, x.status::public.intent_status, x.created_at
    from jsonb_to_recordset(coalesce(p_payload->'activity_intents', '[]'::jsonb))
      as x(id uuid, stuck_state text, direction text, move_text text, intended_duration_minutes integer,
        linked_task_id uuid, linked_habit_id uuid, status text, created_at timestamptz);
    insert into public.activity_sessions (
      id, user_id, device_id, mode, status, direction, label, target_duration_minutes,
      linked_task_id, linked_habit_id, linked_intent_id, started_at, last_resumed_at,
      accumulated_elapsed_ms, ended_at, actual_elapsed_ms, reviewed_at, local_date, timezone
    )
    select x.id, v_user, p_device_id, x.mode::public.session_mode, x.status::public.session_status,
      x.direction::public.direction, x.label, x.target_duration_minutes, x.linked_task_id, x.linked_habit_id,
      x.linked_intent_id, x.started_at, x.last_resumed_at, x.accumulated_elapsed_ms, x.ended_at,
      x.actual_elapsed_ms, x.reviewed_at, x.local_date, x.timezone
    from jsonb_to_recordset(coalesce(p_payload->'activity_sessions', '[]'::jsonb))
      as x(id uuid, mode text, status text, direction text, label text, target_duration_minutes integer,
        linked_task_id uuid, linked_habit_id uuid, linked_intent_id uuid, started_at timestamptz,
        last_resumed_at timestamptz, accumulated_elapsed_ms bigint, ended_at timestamptz,
        actual_elapsed_ms bigint, reviewed_at timestamptz, local_date date, timezone text);
    insert into public.daily_plans (id, user_id, local_date, timezone)
    select x.id, v_user, x.local_date, x.timezone
    from jsonb_to_recordset(coalesce(p_payload->'daily_plans', '[]'::jsonb))
      as x(id uuid, local_date date, timezone text);
    insert into public.daily_plan_items (id, user_id, daily_plan_id, item_group, title, first_step, direction, duration_minutes, position)
    select x.id, v_user, x.daily_plan_id, x.item_group::public.daily_plan_group, x.title, x.first_step,
      x.direction::public.direction, x.duration_minutes, x.position
    from jsonb_to_recordset(coalesce(p_payload->'daily_plan_items', '[]'::jsonb))
      as x(id uuid, daily_plan_id uuid, item_group text, title text, first_step text, direction text, duration_minutes integer, position integer);
    insert into public.morning_checks (id, user_id, local_date, timezone, verified_at, capture_method, verifier_mode)
    select x.id, v_user, x.local_date, x.timezone, x.verified_at, x.capture_method, x.verifier_mode
    from jsonb_to_recordset(coalesce(p_payload->'morning_checks', '[]'::jsonb))
      as x(id uuid, local_date date, timezone text, verified_at timestamptz, capture_method text, verifier_mode text);
    insert into public.morning_attempts (user_id, local_date, timezone, attempt_count)
    select v_user, x.local_date, x.timezone, x.attempt_count
    from jsonb_to_recordset(coalesce(p_payload->'morning_attempts', '[]'::jsonb))
      as x(local_date date, timezone text, attempt_count smallint);
    insert into public.journal_entries (
      id, user_id, local_date, timezone, mood, energy, what_helped, completed, difficult, next_step, free_text, updated_at
    )
    select x.id, v_user, x.local_date, x.timezone, x.mood, x.energy, x.what_helped,
      x.completed, x.difficult, x.next_step, x.free_text, x.updated_at
    from jsonb_to_recordset(coalesce(p_payload->'journal_entries', '[]'::jsonb))
      as x(id uuid, local_date date, timezone text, mood smallint, energy smallint, what_helped text,
        completed text, difficult text, next_step text, free_text text, updated_at timestamptz);
    insert into public.reward_ledger (
      id, user_id, source_type, source_id, local_date, timezone, points_tenths, idempotency_key, created_at
    )
    select x.id, v_user, x.source_type, x.source_id, x.local_date, x.timezone,
      x.points_tenths, x.idempotency_key, x.created_at
    from jsonb_to_recordset(coalesce(p_payload->'reward_ledger', '[]'::jsonb))
      as x(id uuid, source_type text, source_id uuid, local_date date, timezone text,
        points_tenths integer, idempotency_key text, created_at timestamptz);
    insert into public.milestone_grants (id, user_id, milestone_day, active_day_count)
    select x.id, v_user, x.milestone_day, x.active_day_count
    from jsonb_to_recordset(coalesce(p_payload->'milestone_grants', '[]'::jsonb))
      as x(id uuid, milestone_day integer, active_day_count integer);
    insert into public.inventory_events (
      id, user_id, item_id, kind, quantity_delta, idempotency_key, local_date, timezone
    )
    select x.id, v_user, x.item_id, x.kind::public.inventory_event_kind, x.quantity_delta,
      x.idempotency_key, x.local_date, x.timezone
    from jsonb_to_recordset(coalesce(p_payload->'inventory_events', '[]'::jsonb))
      as x(id uuid, item_id text, kind text, quantity_delta integer, idempotency_key text, local_date date, timezone text);
    insert into public.inventory_balances (user_id, item_id, quantity)
    select v_user, x.item_id, x.quantity
    from jsonb_to_recordset(coalesce(p_payload->'inventory_balances', '[]'::jsonb))
      as x(item_id text, quantity integer);

    v_counts := jsonb_build_object(
      'tasks', (select count(*) from public.tasks where user_id = v_user),
      'task_completions', (select count(*) from public.task_completions where user_id = v_user),
      'habits', (select count(*) from public.habits where user_id = v_user),
      'habit_completions', (select count(*) from public.habit_completions where user_id = v_user),
      'activity_intents', (select count(*) from public.activity_intents where user_id = v_user),
      'activity_sessions', (select count(*) from public.activity_sessions where user_id = v_user),
      'daily_plans', (select count(*) from public.daily_plans where user_id = v_user),
      'journal_entries', (select count(*) from public.journal_entries where user_id = v_user),
      'morning_checks', (select count(*) from public.morning_checks where user_id = v_user),
      'reward_ledger', (select count(*) from public.reward_ledger where user_id = v_user)
    );
    if v_counts <> coalesce(v_expected->'record_counts', '{}'::jsonb) then
      raise exception 'record_count_mismatch' using errcode = 'P0001';
    end if;
    select coalesce(sum(points_tenths), 0) into v_points from public.reward_ledger where user_id = v_user;
    if v_points <> (v_expected->>'points_tenths')::bigint then
      raise exception 'point_balance_mismatch' using errcode = 'P0001';
    end if;
    select coalesce(jsonb_object_agg(item_id, quantity order by item_id), '{}'::jsonb)
      into v_inventory from public.inventory_balances where user_id = v_user;
    if v_inventory <> coalesce(v_expected->'inventory_balances', '{}'::jsonb) then
      raise exception 'inventory_balance_mismatch' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.inventory_balances b
      where b.user_id = v_user and b.quantity <> coalesce((
        select sum(e.quantity_delta) from public.inventory_events e
        where e.user_id = v_user and e.item_id = b.item_id
      ), 0)
    ) then raise exception 'inventory_event_mismatch' using errcode = 'P0001'; end if;
    select coalesce(jsonb_agg(milestone_day order by milestone_day), '[]'::jsonb)
      into v_milestones from public.milestone_grants where user_id = v_user;
    if v_milestones <> coalesce(v_expected->'milestones', '[]'::jsonb) then
      raise exception 'milestone_mismatch' using errcode = 'P0001';
    end if;
    select count(*) into v_active_days from public.active_days where user_id = v_user;
    if v_active_days <> (v_expected->>'active_days')::integer then
      raise exception 'active_day_mismatch' using errcode = 'P0001';
    end if;
  else
    v_counts := '{}'::jsonb;
    v_points := 0;
    v_inventory := '{}'::jsonb;
  end if;

  update public.import_batches set
    status = 'completed',
    imported_record_counts = coalesce(v_counts, '{}'::jsonb),
    verified_points_tenths = coalesce(v_points, 0),
    verified_inventory_balances = coalesce(v_inventory, '{}'::jsonb),
    completed_at = transaction_timestamp(),
    verified_at = transaction_timestamp()
  where user_id = v_user and id = v_batch_id;
  return public.get_cloud_workspace();
end;
$$;

revoke all on function public.cloud_workspace_status() from public, anon, authenticated;
revoke all on function public.get_cloud_workspace() from public, anon, authenticated;
revoke all on function public.initialize_cloud_workspace(public.import_choice, uuid, text, integer, text, jsonb) from public, anon, authenticated;
grant execute on function public.cloud_workspace_status() to authenticated;
grant execute on function public.get_cloud_workspace() to authenticated;
grant execute on function public.initialize_cloud_workspace(public.import_choice, uuid, text, integer, text, jsonb) to authenticated;

comment on function public.initialize_cloud_workspace(public.import_choice, uuid, text, integer, text, jsonb)
  is 'Phase B2 authenticated atomic setup/import. Ownership derives only from auth.uid(); no service-role client path.';
