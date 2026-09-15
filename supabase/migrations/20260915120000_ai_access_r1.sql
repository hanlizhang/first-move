-- First Move AI Access R1: trusted-server quota reservation immediately before
-- one paid OpenAI dispatch. Entitlement verification remains outside the
-- database on the trusted server; this function is executable only by the
-- service role.

create function public.reserve_ai_usage(
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

  -- One account lock serializes all introductory and feature/day quota
  -- decisions, including requests arriving from different devices.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

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
) is 'Service-role-only atomic paid-AI reservation. Derives local date from profile timezone and database time; reservations are never refunded after provider failure.';
