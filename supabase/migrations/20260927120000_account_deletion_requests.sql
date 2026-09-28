-- First Move iOS App Store R1 account deletion, Phase 1B.
-- Persistent trusted-server state only: no endpoint, worker, or client access.

create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  status text not null default 'pending'
    constraint account_deletion_requests_status_check
    check (status in ('pending', 'processing', 'retry_wait', 'completed')),
  revenuecat_status text not null default 'pending'
    constraint account_deletion_requests_revenuecat_status_check
    check (revenuecat_status in ('pending', 'deletion_satisfied')),
  supabase_status text not null default 'pending'
    constraint account_deletion_requests_supabase_status_check
    check (supabase_status in ('pending', 'deleted')),
  retry_count integer not null default 0
    constraint account_deletion_requests_retry_count_check
    check (retry_count >= 0),
  next_retry_at timestamptz default transaction_timestamp(),
  failure_category text
    constraint account_deletion_requests_failure_category_check
    check (failure_category in (
      'revenuecat_permission',
      'revenuecat_transient',
      'supabase_storage',
      'supabase_transient',
      'internal'
    )),
  lease_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz not null default transaction_timestamp(),
  updated_at timestamptz not null default transaction_timestamp(),
  completed_at timestamptz,
  version bigint not null default 1 check (version > 0),
  constraint account_deletion_requests_retry_state_check check (
    (status in ('pending', 'retry_wait') and next_retry_at is not null)
    or (status in ('processing', 'completed') and next_retry_at is null)
  ),
  constraint account_deletion_requests_failure_state_check check (
    (status = 'retry_wait' and failure_category is not null)
    or (status <> 'retry_wait' and failure_category is null)
  ),
  constraint account_deletion_requests_lease_state_check check (
    (status = 'processing' and lease_token is not null and lease_expires_at is not null)
    or (status <> 'processing' and lease_token is null and lease_expires_at is null)
  ),
  constraint account_deletion_requests_service_order_check check (
    supabase_status <> 'deleted' or revenuecat_status = 'deletion_satisfied'
  ),
  constraint account_deletion_requests_completion_check check (
    (
      status = 'completed'
      and revenuecat_status = 'deletion_satisfied'
      and supabase_status = 'deleted'
      and completed_at is not null
    )
    or (status <> 'completed' and completed_at is null)
  )
);

-- A completed row is retained temporarily as a deletion tombstone, while a
-- user can have only one request that still needs trusted-server work.
create unique index one_active_account_deletion_per_user
on public.account_deletion_requests(user_id)
where status <> 'completed';

create index account_deletion_requests_due_idx
on public.account_deletion_requests(next_retry_at, created_at)
where status in ('pending', 'retry_wait');

create index account_deletion_requests_expired_lease_idx
on public.account_deletion_requests(lease_expires_at)
where status = 'processing';

create trigger account_deletion_requests_updated
before update on public.account_deletion_requests
for each row execute function public.set_updated_at();

alter table public.account_deletion_requests enable row level security;
alter table public.account_deletion_requests force row level security;

-- No client policy is intentional. Only the trusted server service role may
-- create, inspect, claim, advance, retry, complete, or purge these rows.
revoke all on table public.account_deletion_requests
from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.account_deletion_requests
to service_role;

comment on table public.account_deletion_requests is
  'Server-only account-deletion outbox. user_id deliberately has no auth.users foreign key so retry/completion state survives Auth deletion. Completed rows contain only operational UUID/status metadata, are retained for 30 days, and must then be purged by trusted cleanup; Phase 1B adds no cleanup worker.';
comment on column public.account_deletion_requests.revenuecat_status is
  'deletion_satisfied records a terminal ensure-deleted result for this workflow: RevenueCat v1 HTTP 200 accepted and queued deletion, or HTTP 404 already absent. HTTP 200 is not proof that asynchronous physical deletion has finished.';
comment on column public.account_deletion_requests.failure_category is
  'Bounded operational category only. Never store raw provider errors, emails, tokens, credentials, user content, prompts, photos, or receipts.';
comment on column public.account_deletion_requests.lease_token is
  'Opaque trusted-worker claim token. An expired processing lease is reclaimable after process interruption.';
