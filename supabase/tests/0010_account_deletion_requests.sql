begin;
create extension if not exists pgtap with schema extensions;

select plan(37);

select has_table(
  'public',
  'account_deletion_requests',
  'the server-only account deletion outbox exists'
);
select has_index(
  'public',
  'account_deletion_requests',
  'one_active_account_deletion_per_user',
  'unfinished deletion requests are unique per user'
);
select is(
  (
    select count(*)::integer
    from pg_constraint
    where conrelid = 'public.account_deletion_requests'::regclass
      and contype = 'f'
  ),
  0,
  'the deletion outbox has no foreign key that can erase it with auth.users'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.account_deletion_requests'::regclass),
  'row level security is enabled on the outbox'
);
select ok(
  (select relforcerowsecurity from pg_class where oid = 'public.account_deletion_requests'::regclass),
  'row level security is forced on the outbox'
);
select table_privs_are(
  'public',
  'account_deletion_requests',
  'authenticated',
  array[]::text[],
  'authenticated clients have no deletion-state table privileges'
);
select table_privs_are(
  'public',
  'account_deletion_requests',
  'anon',
  array[]::text[],
  'anonymous clients have no deletion-state table privileges'
);
select table_privs_are(
  'public',
  'account_deletion_requests',
  'service_role',
  array['DELETE', 'INSERT', 'SELECT', 'UPDATE'],
  'the trusted service role has only the table operations needed by initiation, worker, and cleanup code'
);

select hasnt_column('public', 'account_deletion_requests', 'email', 'the outbox stores no email');
select hasnt_column('public', 'account_deletion_requests', 'token', 'the outbox stores no token');
select hasnt_column('public', 'account_deletion_requests', 'credential', 'the outbox stores no credential');
select hasnt_column('public', 'account_deletion_requests', 'content', 'the outbox stores no user content');
select hasnt_column('public', 'account_deletion_requests', 'prompt', 'the outbox stores no prompt');
select hasnt_column('public', 'account_deletion_requests', 'photo', 'the outbox stores no photo');
select hasnt_column('public', 'account_deletion_requests', 'receipt', 'the outbox stores no receipt');
select hasnt_column('public', 'account_deletion_requests', 'raw_error', 'the outbox stores no raw external error');

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values
  ('93000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'deletion-state-a@example.test', '', now(), now(), now()),
  ('94000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'deletion-state-b@example.test', '', now(), now(), now());

insert into public.account_deletion_requests (user_id)
values ('93000000-0000-4000-8000-000000000001');

select ok(
  (select id is not null from public.account_deletion_requests where user_id = '93000000-0000-4000-8000-000000000001'),
  'the database generates a request UUID when trusted code omits it'
);
select results_eq(
  $$
    select status, revenuecat_status, supabase_status, retry_count,
      next_retry_at is not null, failure_category is null,
      lease_token is null and lease_expires_at is null,
      completed_at is null, version
    from public.account_deletion_requests
    where user_id = '93000000-0000-4000-8000-000000000001'
  $$,
  $$values ('pending'::text, 'pending'::text, 'pending'::text, 0, true, true, true, true, 1::bigint)$$,
  'a new request has safe pending defaults'
);
select throws_ok(
  $$insert into public.account_deletion_requests (user_id) values ('93000000-0000-4000-8000-000000000001')$$,
  '23505',
  null,
  'a user cannot have two unfinished deletion requests'
);
select lives_ok(
  $$
    update public.account_deletion_requests
    set status = 'processing', next_retry_at = null,
      lease_token = '93500000-0000-4000-8000-000000000001',
      lease_expires_at = transaction_timestamp() + interval '5 minutes'
    where user_id = '93000000-0000-4000-8000-000000000001'
  $$,
  'trusted work can claim a request with an expiring lease'
);
select is(
  (select version from public.account_deletion_requests where user_id = '93000000-0000-4000-8000-000000000001'),
  2::bigint,
  'claiming work increments the optimistic version'
);
select lives_ok(
  $$
    update public.account_deletion_requests
    set status = 'retry_wait', retry_count = retry_count + 1,
      next_retry_at = transaction_timestamp() + interval '1 minute',
      failure_category = 'revenuecat_transient',
      lease_token = null, lease_expires_at = null
    where user_id = '93000000-0000-4000-8000-000000000001'
  $$,
  'a recoverable provider failure records bounded retry metadata'
);
select results_eq(
  $$
    select retry_count, failure_category, next_retry_at is not null
    from public.account_deletion_requests
    where user_id = '93000000-0000-4000-8000-000000000001'
  $$,
  $$values (1, 'revenuecat_transient'::text, true)$$,
  'retry count, category, and schedule remain distinguishable'
);
select throws_ok(
  $$
    update public.account_deletion_requests
    set retry_count = -1
    where user_id = '93000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  null,
  'negative retry counts are rejected'
);
select throws_ok(
  $$
    update public.account_deletion_requests
    set failure_category = 'raw provider response'
    where user_id = '93000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  null,
  'unbounded failure categories are rejected'
);
select throws_ok(
  $$
    update public.account_deletion_requests
    set status = 'processing', next_retry_at = null,
      failure_category = null, lease_token = null, lease_expires_at = null
    where user_id = '93000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  null,
  'processing without a complete worker lease is rejected'
);
select throws_ok(
  $$
    update public.account_deletion_requests
    set supabase_status = 'deleted'
    where user_id = '93000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  null,
  'Supabase Auth deletion cannot precede confirmed RevenueCat absence'
);
select throws_ok(
  $$
    update public.account_deletion_requests
    set status = 'completed', next_retry_at = null,
      failure_category = null, revenuecat_status = 'deletion_requested',
      supabase_status = 'deleted', completed_at = transaction_timestamp()
    where user_id = '93000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  null,
  'RevenueCat request acceptance alone cannot mark deletion complete'
);
select lives_ok(
  $$
    update public.account_deletion_requests
    set status = 'completed', next_retry_at = null,
      failure_category = null, revenuecat_status = 'absence_confirmed',
      supabase_status = 'deleted', completed_at = transaction_timestamp()
    where user_id = '93000000-0000-4000-8000-000000000001'
  $$,
  'completion requires confirmed RevenueCat absence and Auth deletion'
);
select lives_ok(
  $$insert into public.account_deletion_requests (user_id) values ('93000000-0000-4000-8000-000000000001')$$,
  'a completed tombstone does not violate unfinished-request uniqueness'
);

insert into public.account_deletion_requests (user_id)
values ('94000000-0000-4000-8000-000000000002');
delete from auth.users where id = '94000000-0000-4000-8000-000000000002';
select is(
  (select count(*)::integer from public.account_deletion_requests where user_id = '94000000-0000-4000-8000-000000000002'),
  1,
  'deletion state survives deletion of the associated Auth user'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '93000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select count(*) from public.account_deletion_requests$$,
  '42501',
  null,
  'an authenticated user cannot read own or another user deletion state'
);
select throws_ok(
  $$insert into public.account_deletion_requests (user_id) values ('93000000-0000-4000-8000-000000000001')$$,
  '42501',
  null,
  'an authenticated user cannot initiate deletion by direct table write'
);
select throws_ok(
  $$update public.account_deletion_requests set retry_count = 99$$,
  '42501',
  null,
  'an authenticated user cannot alter any deletion request'
);
select throws_ok(
  $$delete from public.account_deletion_requests$$,
  '42501',
  null,
  'an authenticated user cannot remove deletion state'
);
reset role;

set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select throws_ok(
  $$select count(*) from public.account_deletion_requests$$,
  '42501',
  null,
  'an anonymous client cannot read deletion state'
);
reset role;

select is(
  obj_description('public.account_deletion_requests'::regclass),
  'Server-only account-deletion outbox. user_id deliberately has no auth.users foreign key so retry/completion state survives Auth deletion. Completed rows contain only operational UUID/status metadata, are retained for 30 days, and must then be purged by trusted cleanup; Phase 1B adds no cleanup worker.',
  'the schema documents the completed-row retention and cleanup policy'
);

select * from finish();
rollback;
