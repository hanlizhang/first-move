begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select plan(36);

select has_function(
  'public', 'claim_account_deletion_request', array['uuid', 'integer', 'uuid'],
  'the atomic deletion worker claim exists'
);
select has_function(
  'public', 'record_account_deletion_revenuecat_satisfied', array['uuid', 'uuid'],
  'the RevenueCat terminal workflow transition exists'
);
select has_function(
  'public', 'retry_account_deletion_request', array['uuid', 'uuid', 'text', 'integer'],
  'the bounded retry transition exists'
);
select has_function(
  'public', 'complete_account_deletion_request', array['uuid', 'uuid'],
  'the lease-checked completion transition exists'
);
select has_function(
  'public', 'account_has_storage_objects', array['uuid'],
  'the read-only Storage ownership preflight exists'
);

select ok(
  has_function_privilege('service_role', 'public.claim_account_deletion_request(uuid,integer,uuid)', 'EXECUTE'),
  'service role may claim deletion work'
);
select ok(
  has_function_privilege('service_role', 'public.record_account_deletion_revenuecat_satisfied(uuid,uuid)', 'EXECUTE'),
  'service role may record the terminal RevenueCat workflow result'
);
select ok(
  has_function_privilege('service_role', 'public.retry_account_deletion_request(uuid,uuid,text,integer)', 'EXECUTE'),
  'service role may schedule bounded retries'
);
select ok(
  has_function_privilege('service_role', 'public.complete_account_deletion_request(uuid,uuid)', 'EXECUTE'),
  'service role may complete deletion work'
);
select ok(
  has_function_privilege('service_role', 'public.account_has_storage_objects(uuid)', 'EXECUTE'),
  'service role may run the Storage ownership preflight'
);
select ok(
  not has_function_privilege('authenticated', 'public.claim_account_deletion_request(uuid,integer,uuid)', 'EXECUTE'),
  'authenticated clients cannot claim deletion work'
);
select ok(
  not has_function_privilege('anon', 'public.claim_account_deletion_request(uuid,integer,uuid)', 'EXECUTE'),
  'anonymous clients cannot claim deletion work'
);
select ok(
  not has_function_privilege('authenticated', 'public.record_account_deletion_revenuecat_satisfied(uuid,uuid)', 'EXECUTE'),
  'authenticated clients cannot record RevenueCat progress'
);
select ok(
  not has_function_privilege('anon', 'public.record_account_deletion_revenuecat_satisfied(uuid,uuid)', 'EXECUTE'),
  'anonymous clients cannot record RevenueCat progress'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values
  ('a2000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'phase1d-a@example.test', '', now(), now(), now()),
  ('b2000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000000', 'authenticated', 'authenticated', 'phase1d-b@example.test', '', now(), now(), now()),
  ('c2000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000000', 'authenticated', 'authenticated', 'phase1d-c@example.test', '', now(), now(), now());

insert into public.account_deletion_requests (id, user_id, next_retry_at)
values
  ('a2100000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', transaction_timestamp() - interval '1 minute'),
  ('b2100000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000002', transaction_timestamp() - interval '1 minute');

select is(
  public.claim_account_deletion_request(
    'f2200000-0000-4000-8000-000000000001', 90,
    'f2000000-0000-4000-8000-000000000001'
  ),
  null::jsonb,
  'a targeted claim never takes another user''s due request'
);

select is(
  (public.claim_account_deletion_request(
    'a2200000-0000-4000-8000-000000000001', 90,
    'a2000000-0000-4000-8000-000000000001'
  ))->>'requestId',
  'a2100000-0000-4000-8000-000000000001',
  'the worker claims one due request'
);
select results_eq(
  $$
    select status, lease_token, next_retry_at is null, failure_category is null
    from public.account_deletion_requests
    where id = 'a2100000-0000-4000-8000-000000000001'
  $$,
  $$values (
    'processing'::text,
    'a2200000-0000-4000-8000-000000000001'::uuid,
    true,
    true
  )$$,
  'claim stores an active lease and clears due/failure metadata'
);
select is(
  (select status from public.account_deletion_requests where id = 'b2100000-0000-4000-8000-000000000002'),
  'pending'::text,
  'the targeted claim leaves another user''s due request untouched'
);
update public.account_deletion_requests
set next_retry_at = transaction_timestamp() + interval '1 hour'
where id = 'b2100000-0000-4000-8000-000000000002';
select is(
  public.claim_account_deletion_request(
    'b2200000-0000-4000-8000-000000000002', 90,
    'a2000000-0000-4000-8000-000000000001'
  ),
  null::jsonb,
  'an active targeted lease cannot be stolen'
);
select is(
  public.record_account_deletion_revenuecat_satisfied(
    'a2100000-0000-4000-8000-000000000001',
    'ffffffff-0000-4000-8000-000000000001'
  ),
  false,
  'a stale lease cannot record RevenueCat progress'
);
select is(
  public.complete_account_deletion_request(
    'a2100000-0000-4000-8000-000000000001',
    'a2200000-0000-4000-8000-000000000001'
  ),
  false,
  'completion is impossible before the RevenueCat deletion step is satisfied'
);
select is(
  public.record_account_deletion_revenuecat_satisfied(
    'a2100000-0000-4000-8000-000000000001',
    'a2200000-0000-4000-8000-000000000001'
  ),
  true,
  'RevenueCat HTTP 200 or 404 satisfaction is recorded under the active lease'
);
select results_eq(
  $$
    select status, revenuecat_status, failure_category is null,
      next_retry_at is null, lease_token
    from public.account_deletion_requests
    where id = 'a2100000-0000-4000-8000-000000000001'
  $$,
  $$values (
    'processing'::text,
    'deletion_satisfied'::text,
    true,
    true,
    'a2200000-0000-4000-8000-000000000001'::uuid
  )$$,
  'RevenueCat satisfaction keeps the active lease for Storage and Auth work'
);
select is(
  public.account_has_storage_objects('a2000000-0000-4000-8000-000000000001'),
  false,
  'Storage preflight permits an account with no owned objects'
);

insert into storage.buckets (id, name)
values ('phase1d-fixtures', 'phase1d-fixtures');
insert into storage.objects (id, bucket_id, name, owner_id)
values (
  'a2400000-0000-4000-8000-000000000001',
  'phase1d-fixtures',
  'owned-fixture',
  'b2000000-0000-4000-8000-000000000002'
);
select is(
  public.account_has_storage_objects('b2000000-0000-4000-8000-000000000002'),
  true,
  'Storage preflight detects an owned object without deleting it'
);

select is(
  public.complete_account_deletion_request(
    'a2100000-0000-4000-8000-000000000001',
    'a2200000-0000-4000-8000-000000000001'
  ),
  true,
  'a satisfied RevenueCat step permits trusted Auth completion recording'
);
select results_eq(
  $$
    select status, revenuecat_status, supabase_status,
      completed_at is not null, lease_token is null
    from public.account_deletion_requests
    where id = 'a2100000-0000-4000-8000-000000000001'
  $$,
  $$values ('completed'::text, 'deletion_satisfied'::text, 'deleted'::text, true, true)$$,
  'completion records both required terminal states and releases the lease'
);
delete from auth.users where id = 'a2000000-0000-4000-8000-000000000001';
select is(
  (
    select count(*)::integer
    from public.account_deletion_requests
    where id = 'a2100000-0000-4000-8000-000000000001'
  ),
  1,
  'the completed request survives Auth user deletion'
);

insert into public.account_deletion_requests (
  id, user_id, status, next_retry_at, failure_category,
  lease_token, lease_expires_at
) values (
  'c2100000-0000-4000-8000-000000000003',
  'c2000000-0000-4000-8000-000000000003',
  'processing', null, null,
  'c2200000-0000-4000-8000-000000000003',
  transaction_timestamp() - interval '1 second'
);
select is(
  (public.claim_account_deletion_request(
    'c2300000-0000-4000-8000-000000000003', 90
  ))->>'requestId',
  'c2100000-0000-4000-8000-000000000003',
  'an expired processing lease is safely reclaimed'
);
select is(
  public.retry_account_deletion_request(
    'c2100000-0000-4000-8000-000000000003',
    'c2300000-0000-4000-8000-000000000003',
    'revenuecat_transient',
    30
  ),
  true,
  'a transient failure releases the lease into retry_wait'
);
select results_eq(
  $$
    select status, retry_count, failure_category,
      next_retry_at is not null, lease_token is null
    from public.account_deletion_requests
    where id = 'c2100000-0000-4000-8000-000000000003'
  $$,
  $$values ('retry_wait'::text, 1, 'revenuecat_transient'::text, true, true)$$,
  'retry preserves bounded operational metadata only'
);

update public.account_deletion_requests
set next_retry_at = transaction_timestamp() - interval '1 second'
where id = 'c2100000-0000-4000-8000-000000000003';
do $$
begin
  perform public.claim_account_deletion_request(
    'c2400000-0000-4000-8000-000000000003', 90
  );
end;
$$;
select is(
  public.retry_account_deletion_request(
    'c2100000-0000-4000-8000-000000000003',
    'c2300000-0000-4000-8000-000000000003',
    'internal',
    30
  ),
  false,
  'an old lease cannot overwrite work after reclamation'
);
select throws_ok(
  $$select public.retry_account_deletion_request(
    'c2100000-0000-4000-8000-000000000003',
    'c2400000-0000-4000-8000-000000000003',
    'raw provider body',
    30
  )$$,
  '22023', 'invalid_account_deletion_retry',
  'unbounded or raw failure data is rejected'
);

create temporary table concurrent_worker_claims (
  first_request_id text,
  second_was_empty boolean
) on commit drop;

do $$
declare
  connection_string text := pg_catalog.format(
    'hostaddr=%s port=%s dbname=%s user=postgres password=postgres application_name=phase1d_worker',
    pg_catalog.inet_server_addr(), pg_catalog.inet_server_port(), current_database()
  );
  first_claim jsonb;
  second_claim jsonb;
begin
  perform extensions.dblink_connect('phase1d_worker_one', connection_string);
  perform extensions.dblink_connect('phase1d_worker_two', connection_string);
  perform extensions.dblink_exec(
    'phase1d_worker_one',
    $remote$
      insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at
      ) values (
        'd2000000-0000-4000-8000-000000000004',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'phase1d-race@example.test', '',
        now(), now(), now()
      );
      insert into public.account_deletion_requests (id, user_id)
      values (
        'd2100000-0000-4000-8000-000000000004',
        'd2000000-0000-4000-8000-000000000004'
      )
    $remote$
  );

  perform extensions.dblink_exec('phase1d_worker_one', 'begin');
  select result into first_claim
  from extensions.dblink(
    'phase1d_worker_one',
    $remote$
      select public.claim_account_deletion_request(
        'd2200000-0000-4000-8000-000000000004', 90
      )
    $remote$
  ) as response(result jsonb);
  select result into second_claim
  from extensions.dblink(
    'phase1d_worker_two',
    $remote$
      select public.claim_account_deletion_request(
        'd2300000-0000-4000-8000-000000000004', 90
      )
    $remote$
  ) as response(result jsonb);

  insert into concurrent_worker_claims (first_request_id, second_was_empty)
  values (first_claim->>'requestId', second_claim is null);
  perform extensions.dblink_exec('phase1d_worker_one', 'commit');
end;
$$;

select is(
  (select first_request_id from concurrent_worker_claims),
  'd2100000-0000-4000-8000-000000000004',
  'the first concurrent worker claims the due request'
);
select ok(
  (select second_was_empty from concurrent_worker_claims),
  'FOR UPDATE SKIP LOCKED prevents a concurrent double-claim'
);
select is(
  (
    select count(*)::integer
    from public.account_deletion_requests
    where id = 'd2100000-0000-4000-8000-000000000004'
      and status = 'processing'
      and lease_token = 'd2200000-0000-4000-8000-000000000004'
  ),
  1,
  'concurrent claiming leaves exactly one active lease owner'
);

do $$
begin
  perform extensions.dblink_exec(
    'phase1d_worker_one',
    $remote$
      delete from public.account_deletion_requests
      where id = 'd2100000-0000-4000-8000-000000000004';
      delete from auth.users
      where id = 'd2000000-0000-4000-8000-000000000004'
    $remote$
  );
  perform extensions.dblink_disconnect('phase1d_worker_one');
  perform extensions.dblink_disconnect('phase1d_worker_two');
end;
$$;

select * from finish();
rollback;
