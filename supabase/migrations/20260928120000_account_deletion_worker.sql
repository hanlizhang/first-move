-- First Move iOS App Store R1 account deletion, Phase 1D.
-- Trusted worker claim/transition helpers only. No scheduler or client access.

create function public.claim_account_deletion_request(
  p_lease_token uuid,
  p_lease_seconds integer,
  p_user_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed jsonb;
begin
  if p_lease_token is null
    or p_lease_seconds is null
    or p_lease_seconds not between 30 and 900 then
    raise exception 'invalid_account_deletion_lease' using errcode = '22023';
  end if;

  with candidate as (
    select request.id
    from public.account_deletion_requests as request
    where (p_user_id is null or request.user_id = p_user_id)
      and (
        (
          request.status in ('pending', 'retry_wait')
          and request.next_retry_at <= pg_catalog.transaction_timestamp()
        ) or (
          request.status = 'processing'
          and request.lease_expires_at <= pg_catalog.transaction_timestamp()
        )
    )
    order by
      case
        when request.status = 'processing' then request.lease_expires_at
        else request.next_retry_at
      end,
      request.created_at,
      request.id
    for update skip locked
    limit 1
  ), updated as (
    update public.account_deletion_requests as request
    set status = 'processing',
      next_retry_at = null,
      failure_category = null,
      lease_token = p_lease_token,
      lease_expires_at = pg_catalog.transaction_timestamp()
        + pg_catalog.make_interval(secs => p_lease_seconds::double precision)
    from candidate
    where request.id = candidate.id
    returning request.*
  )
  select pg_catalog.jsonb_build_object(
    'requestId', updated.id,
    'userId', updated.user_id,
    'revenuecatStatus', updated.revenuecat_status,
    'supabaseStatus', updated.supabase_status,
    'retryCount', updated.retry_count,
    'leaseToken', updated.lease_token,
    'leaseExpiresAt', updated.lease_expires_at
  ) into claimed
  from updated;

  return claimed;
end;
$$;

create function public.record_account_deletion_revenuecat_satisfied(
  p_request_id uuid,
  p_lease_token uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_request_id is null or p_lease_token is null then
    raise exception 'invalid_account_deletion_progress' using errcode = '22023';
  end if;

  update public.account_deletion_requests
  set revenuecat_status = 'deletion_satisfied'
  where id = p_request_id
    and status = 'processing'
    and lease_token = p_lease_token
    and lease_expires_at > pg_catalog.transaction_timestamp()
    and revenuecat_status = 'pending'
    and supabase_status = 'pending';

  return found;
end;
$$;

create function public.retry_account_deletion_request(
  p_request_id uuid,
  p_lease_token uuid,
  p_failure_category text,
  p_retry_after_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_request_id is null
    or p_lease_token is null
    or p_failure_category is null
    or p_failure_category not in (
      'revenuecat_permission',
      'revenuecat_transient',
      'supabase_storage',
      'supabase_transient',
      'internal'
    )
    or p_retry_after_seconds is null
    or p_retry_after_seconds not between 5 and 21600 then
    raise exception 'invalid_account_deletion_retry' using errcode = '22023';
  end if;

  update public.account_deletion_requests
  set status = 'retry_wait',
    retry_count = retry_count + 1,
    next_retry_at = pg_catalog.transaction_timestamp()
      + pg_catalog.make_interval(secs => p_retry_after_seconds::double precision),
    failure_category = p_failure_category,
    lease_token = null,
    lease_expires_at = null
  where id = p_request_id
    and status = 'processing'
    and lease_token = p_lease_token
    and lease_expires_at > pg_catalog.transaction_timestamp();

  return found;
end;
$$;

create function public.complete_account_deletion_request(
  p_request_id uuid,
  p_lease_token uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_request_id is null or p_lease_token is null then
    raise exception 'invalid_account_deletion_completion' using errcode = '22023';
  end if;

  update public.account_deletion_requests
  set status = 'completed',
    supabase_status = 'deleted',
    next_retry_at = null,
    failure_category = null,
    lease_token = null,
    lease_expires_at = null,
    completed_at = pg_catalog.transaction_timestamp()
  where id = p_request_id
    and status = 'processing'
    and lease_token = p_lease_token
    and lease_expires_at > pg_catalog.transaction_timestamp()
    and revenuecat_status = 'deletion_satisfied'
    and supabase_status in ('pending', 'deleted');

  return found;
end;
$$;

create function public.account_has_storage_objects(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception 'invalid_account_identity' using errcode = '22023';
  end if;

  return exists (
    select 1
    from storage.objects
    where owner_id = p_user_id::text
  );
end;
$$;

revoke all on function public.claim_account_deletion_request(uuid, integer, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.record_account_deletion_revenuecat_satisfied(uuid, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.retry_account_deletion_request(uuid, uuid, text, integer)
from public, anon, authenticated, service_role;
revoke all on function public.complete_account_deletion_request(uuid, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.account_has_storage_objects(uuid)
from public, anon, authenticated, service_role;

grant execute on function public.claim_account_deletion_request(uuid, integer, uuid)
to service_role;
grant execute on function public.record_account_deletion_revenuecat_satisfied(uuid, uuid)
to service_role;
grant execute on function public.retry_account_deletion_request(uuid, uuid, text, integer)
to service_role;
grant execute on function public.complete_account_deletion_request(uuid, uuid)
to service_role;
grant execute on function public.account_has_storage_objects(uuid)
to service_role;

comment on function public.claim_account_deletion_request(uuid, integer, uuid) is
  'Service-only atomic claim of one due or expired-lease account-deletion request using FOR UPDATE SKIP LOCKED. Optional user filtering is for the verified-bearer initiation path only.';
comment on function public.record_account_deletion_revenuecat_satisfied(uuid, uuid) is
  'Lease-checked terminal RevenueCat workflow transition. HTTP 200 accepted/queued deletion and HTTP 404 already absent both satisfy ensure-deleted; HTTP 200 does not prove asynchronous physical deletion has finished.';
comment on function public.retry_account_deletion_request(uuid, uuid, text, integer) is
  'Lease-checked bounded-category retry transition. Provider bodies and user content are never accepted.';
comment on function public.complete_account_deletion_request(uuid, uuid) is
  'Lease-checked completion after the RevenueCat deletion step is satisfied and supported Supabase Auth deletion/already-missing success.';
comment on function public.account_has_storage_objects(uuid) is
  'Read-only service preflight against storage.objects.owner_id. Any owned object blocks Auth deletion; this function never deletes Storage data.';
