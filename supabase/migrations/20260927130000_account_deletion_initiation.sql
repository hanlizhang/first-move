-- First Move iOS App Store R1 account deletion, Phase 1C.
-- Non-destructive initiation and pending-deletion write protection only.

create function public.account_accepts_writes(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception 'invalid_account_identity' using errcode = '22023';
  end if;

  -- Deletion initiation and every guarded write use the same transaction lock.
  -- Whichever obtains the lock first is the serialization point: an earlier
  -- write may finish, but no write may begin after the deletion request commits.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 0)
  );

  return not exists (
    select 1
    from public.account_deletion_requests
    where user_id = p_user_id
      and status <> 'completed'
  );
end;
$$;

revoke all on function public.account_accepts_writes(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.account_accepts_writes(uuid) to service_role;

comment on function public.account_accepts_writes(uuid) is
  'Service-only pending-deletion gate. Takes the same per-user transaction lock as deletion initiation so writes and initiation have one database serialization order.';

create function public.reject_pending_account_deletion_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Authenticated clients and authenticated SECURITY DEFINER RPCs retain the
  -- caller JWT claims. Trusted service-role maintenance remains available;
  -- every application service-role write path must call account_accepts_writes
  -- explicitly (reserve_ai_usage does so below).
  if (select auth.role()) = 'authenticated'
    and not public.account_accepts_writes(new.user_id) then
    raise exception 'account_deletion_pending' using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke all on function public.reject_pending_account_deletion_write()
from public, anon, authenticated, service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles',
    'devices',
    'import_batches',
    'import_entity_mappings',
    'client_mutations',
    'tasks',
    'task_completions',
    'habits',
    'habit_schedule_weekdays',
    'habit_completions',
    'activity_intents',
    'activity_sessions',
    'daily_plans',
    'daily_plan_items',
    'journal_entries',
    'morning_checks',
    'morning_attempts',
    'reward_ledger',
    'user_settings',
    'inventory_events',
    'inventory_balances',
    'milestone_grants',
    'ai_usage_events'
  ]
  loop
    execute pg_catalog.format(
      'create trigger account_deletion_write_gate before insert or update on public.%I for each row execute function public.reject_pending_account_deletion_write()',
      table_name
    );
  end loop;
end;
$$;

create function public.initiate_account_deletion(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_status text;
begin
  if p_user_id is null then
    raise exception 'invalid_account_identity' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 0)
  );

  select status into existing_status
  from public.account_deletion_requests
  where user_id = p_user_id
    and status <> 'completed'
  limit 1;

  if found then
    return pg_catalog.jsonb_build_object('outcome', 'already_pending');
  end if;

  -- A stale request must never recreate deletion work after Auth deletion.
  if not exists (select 1 from auth.users where id = p_user_id) then
    return pg_catalog.jsonb_build_object('outcome', 'user_not_found');
  end if;

  insert into public.account_deletion_requests (user_id)
  values (p_user_id);

  return pg_catalog.jsonb_build_object('outcome', 'initiated');
end;
$$;

revoke all on function public.initiate_account_deletion(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.initiate_account_deletion(uuid) to service_role;

comment on function public.initiate_account_deletion(uuid) is
  'Service-role-only, non-destructive, idempotent deletion initiation. The trusted server must derive p_user_id from a verified current Supabase bearer token and enforce recent interactive authentication and exact confirmation.';

-- The AI reservation is the only current application write performed with the
-- service role, so it needs an explicit gate in addition to the authenticated
-- table triggers above. The reservation remains the provider-dispatch
-- serialization point: OpenAI is called only after this transaction succeeds.
create or replace function public.reserve_ai_usage(
  p_user_id uuid,
  p_request_id uuid,
  p_request_fingerprint text,
  p_feature public.ai_feature,
  p_access_basis public.ai_access_basis,
  p_region_code text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := transaction_timestamp();
  v_timezone text;
  v_local_date date;
  v_used integer;
  v_limit integer;
  v_existing public.ai_usage_events%rowtype;
begin
  if p_user_id is null or p_request_id is null then
    raise exception 'invalid_ai_reservation_identity' using errcode = '22023';
  end if;
  if p_feature is null or p_access_basis is null then
    raise exception 'invalid_ai_quota_scope' using errcode = '22023';
  end if;
  if p_request_fingerprint is null or p_request_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_ai_request_fingerprint' using errcode = '22023';
  end if;
  if p_region_code is null or p_region_code !~ '^[A-Z]{2}$' then
    raise exception 'invalid_ai_region_code' using errcode = '22023';
  end if;

  -- Keep the reservation's established per-account serialization explicit;
  -- account_accepts_writes takes the same re-entrant transaction lock.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 0)
  );
  if not public.account_accepts_writes(p_user_id) then
    raise exception 'account_deletion_pending' using errcode = '55000';
  end if;

  select * into v_existing
  from public.ai_usage_events
  where user_id = p_user_id and request_id = p_request_id;
  if found then
    if v_existing.feature <> p_feature
      or v_existing.request_fingerprint <> p_request_fingerprint then
      raise exception 'ai_request_payload_mismatch' using errcode = '22023';
    end if;
    return jsonb_build_object('outcome', 'already_reserved');
  end if;

  select timezone into v_timezone
  from public.profiles
  where user_id = p_user_id;
  if not found then
    raise exception 'profile_timezone_unavailable' using errcode = 'P0001';
  end if;
  v_local_date := (v_now at time zone v_timezone)::date;

  if p_access_basis = 'introductory' then
    select count(*)::integer into v_used
    from public.ai_usage_events
    where user_id = p_user_id and access_basis = 'introductory';

    if v_used >= 5 then
      return jsonb_build_object(
        'outcome', 'denied',
        'code', 'introductory_quota_exhausted',
        'quota', jsonb_build_object(
          'accessBasis', 'introductory',
          'feature', p_feature,
          'remainingIntroductoryTotal', 0
        )
      );
    end if;
  else
    v_limit := case p_feature
      when 'daily_plan' then 1
      when 'toothbrush_verification' then 3
      when 'make_smaller' then 5
    end;
    select count(*)::integer into v_used
    from public.ai_usage_events
    where user_id = p_user_id
      and access_basis = 'pro'
      and feature = p_feature
      and local_date = v_local_date;

    if v_used >= v_limit then
      return jsonb_build_object(
        'outcome', 'denied',
        'code', 'pro_feature_quota_exhausted',
        'quota', jsonb_build_object(
          'accessBasis', 'pro',
          'feature', p_feature,
          'remainingFeatureActionsToday', 0
        )
      );
    end if;
  end if;

  insert into public.ai_usage_events (
    user_id,
    request_id,
    request_fingerprint,
    feature,
    access_basis,
    provider,
    model,
    local_date,
    timezone,
    region_code,
    entitlement_checked_at,
    dispatched_at
  ) values (
    p_user_id,
    p_request_id,
    p_request_fingerprint,
    p_feature,
    p_access_basis,
    'openai',
    'gpt-5.6-luna',
    v_local_date,
    v_timezone,
    p_region_code,
    v_now,
    v_now
  );

  if p_access_basis = 'introductory' then
    return jsonb_build_object(
      'outcome', 'reserved',
      'quota', jsonb_build_object(
        'accessBasis', 'introductory',
        'feature', p_feature,
        'remainingIntroductoryTotal', 5 - v_used - 1
      )
    );
  end if;
  return jsonb_build_object(
    'outcome', 'reserved',
    'quota', jsonb_build_object(
      'accessBasis', 'pro',
      'feature', p_feature,
      'remainingFeatureActionsToday', v_limit - v_used - 1
    )
  );
end;
$$;

revoke all on function public.reserve_ai_usage(
  uuid, uuid, text, public.ai_feature, public.ai_access_basis, text
) from public, anon, authenticated;
grant execute on function public.reserve_ai_usage(
  uuid, uuid, text, public.ai_feature, public.ai_access_basis, text
) to service_role;

comment on function public.reserve_ai_usage(
  uuid, uuid, text, public.ai_feature, public.ai_access_basis, text
) is 'Service-role-only atomic paid-AI reservation. Rejects pending-deletion accounts before quota reservation; provider dispatch occurs only after a successful reservation.';
