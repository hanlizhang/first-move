begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select plan(39);

select has_function(
  'public',
  'reserve_ai_usage',
  array['uuid', 'uuid', 'text', 'ai_feature', 'ai_access_basis', 'text'],
  'trusted paid-AI reservation RPC exists'
);
select is(
  has_function_privilege('authenticated', 'public.reserve_ai_usage(uuid,uuid,text,public.ai_feature,public.ai_access_basis,text)', 'EXECUTE'),
  false,
  'authenticated clients cannot execute the reservation RPC'
);
select is(
  has_function_privilege('anon', 'public.reserve_ai_usage(uuid,uuid,text,public.ai_feature,public.ai_access_basis,text)', 'EXECUTE'),
  false,
  'anonymous clients cannot execute the reservation RPC'
);
select is(
  has_function_privilege('service_role', 'public.reserve_ai_usage(uuid,uuid,text,public.ai_feature,public.ai_access_basis,text)', 'EXECUTE'),
  true,
  'the trusted service role can execute the reservation RPC'
);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('a0000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ai-free@example.test', '', now(), now(), now()),
  ('b0000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ai-pro@example.test', '', now(), now(), now()),
  ('c0000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ai-timezone@example.test', '', now(), now(), now()),
  ('d0000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ai-idempotency@example.test', '', now(), now(), now());
insert into public.profiles (user_id, timezone)
values
  ('a0000000-0000-4000-8000-000000000001', 'Europe/Zurich'),
  ('b0000000-0000-4000-8000-000000000002', 'UTC'),
  ('c0000000-0000-4000-8000-000000000003', 'Pacific/Pago_Pago'),
  ('d0000000-0000-4000-8000-000000000004', 'UTC');

select results_eq(
  $$
    select (public.reserve_ai_usage(
      'a0000000-0000-4000-8000-000000000001',
      ('a1000000-0000-4000-8000-' || lpad(call_number::text, 12, '0'))::uuid,
      lpad(call_number::text, 64, 'a'),
      case call_number % 3
        when 1 then 'daily_plan'::public.ai_feature
        when 2 then 'toothbrush_verification'::public.ai_feature
        else 'make_smaller'::public.ai_feature
      end,
      'introductory',
      'CH'
    ))->>'outcome'
    from generate_series(1, 5) call_number
    order by call_number
  $$,
  array['reserved'::text, 'reserved', 'reserved', 'reserved', 'reserved'],
  'the first five lifetime Free requests across mixed features are reserved'
);
select is(
  (select count(*)::integer from public.ai_usage_events where user_id = 'a0000000-0000-4000-8000-000000000001' and access_basis = 'introductory'),
  5,
  'five introductory reservations are stored'
);
select is(
  (public.reserve_ai_usage('a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000006', repeat('6', 64), 'daily_plan', 'introductory', 'CH'))->>'code',
  'introductory_quota_exhausted',
  'the sixth lifetime Free request is denied'
);
select is(
  (select count(*)::integer from public.ai_usage_events where user_id = 'a0000000-0000-4000-8000-000000000001' and access_basis = 'introductory'),
  5,
  'a denied Free request stores no usage event'
);
select is(
  (public.reserve_ai_usage('a0000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', repeat('b', 64), 'daily_plan', 'pro', 'CH'))->>'outcome',
  'reserved',
  'becoming Pro uses a separate feature/day quota'
);
select is(
  (select count(*)::integer from public.ai_usage_events where user_id = 'a0000000-0000-4000-8000-000000000001' and access_basis = 'introductory'),
  5,
  'becoming Pro does not delete or reset introductory usage'
);

select is(
  (public.reserve_ai_usage('b0000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001', repeat('1', 64), 'daily_plan', 'pro', 'CH'))->>'outcome',
  'reserved',
  'the first Pro daily-plan request is reserved'
);
select is(
  (public.reserve_ai_usage('b0000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', repeat('2', 64), 'daily_plan', 'pro', 'CH'))->>'code',
  'pro_feature_quota_exhausted',
  'the second Pro daily-plan request on the same local day is denied'
);
select is(
  (select count(*)::integer from public.ai_usage_events where user_id = 'b0000000-0000-4000-8000-000000000002' and feature = 'daily_plan'),
  1,
  'the denied daily-plan request stores no event'
);

select results_eq(
  $$
    select (public.reserve_ai_usage(
      'b0000000-0000-4000-8000-000000000002',
      ('b2000000-0000-4000-8000-' || lpad(call_number::text, 12, '0'))::uuid,
      lpad(call_number::text, 64, 'b'),
      'toothbrush_verification', 'pro', 'CH'
    ))->>'outcome'
    from generate_series(1, 3) call_number
    order by call_number
  $$,
  array['reserved'::text, 'reserved', 'reserved'],
  'the first three Pro toothbrush requests are reserved'
);
select is(
  (public.reserve_ai_usage('b0000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000004', repeat('4', 64), 'toothbrush_verification', 'pro', 'CH'))->>'code',
  'pro_feature_quota_exhausted',
  'the fourth Pro toothbrush request is denied'
);
select is(
  (select count(*)::integer from public.ai_usage_events where user_id = 'b0000000-0000-4000-8000-000000000002' and feature = 'toothbrush_verification'),
  3,
  'the toothbrush quota stores exactly three events'
);

select results_eq(
  $$
    select (public.reserve_ai_usage(
      'b0000000-0000-4000-8000-000000000002',
      ('b3000000-0000-4000-8000-' || lpad(call_number::text, 12, '0'))::uuid,
      lpad(call_number::text, 64, 'c'),
      'make_smaller', 'pro', 'CH'
    ))->>'outcome'
    from generate_series(1, 5) call_number
    order by call_number
  $$,
  array['reserved'::text, 'reserved', 'reserved', 'reserved', 'reserved'],
  'the Make this smaller contract reserves five Pro requests per day'
);
select is(
  (public.reserve_ai_usage('b0000000-0000-4000-8000-000000000002', 'b3000000-0000-4000-8000-000000000006', repeat('6', 64), 'make_smaller', 'pro', 'CH'))->>'code',
  'pro_feature_quota_exhausted',
  'the sixth Make this smaller request is denied'
);
select is(
  (select count(*)::integer from public.ai_usage_events where user_id = 'b0000000-0000-4000-8000-000000000002' and feature = 'make_smaller'),
  5,
  'Make this smaller stores exactly five events'
);
select is(
  (select count(*)::integer from public.ai_usage_events where user_id = 'b0000000-0000-4000-8000-000000000002'),
  9,
  'all three Pro feature quotas are enforced separately'
);

select is(
  (public.reserve_ai_usage('c0000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000001', repeat('d', 64), 'daily_plan', 'pro', 'CH'))->>'outcome',
  'reserved',
  'a Pro request is reserved on the authoritative profile-local day'
);
update public.profiles set timezone = 'Pacific/Kiritimati'
where user_id = 'c0000000-0000-4000-8000-000000000003';
select is(
  (public.reserve_ai_usage('c0000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000002', repeat('e', 64), 'daily_plan', 'pro', 'CH'))->>'outcome',
  'reserved',
  'the next valid profile-local date resets the Pro feature quota'
);
select is(
  (select count(distinct local_date)::integer from public.ai_usage_events where user_id = 'c0000000-0000-4000-8000-000000000003'),
  2,
  'the two valid timezone-boundary requests occupy distinct local dates'
);
select is(
  (select count(*)::integer from public.ai_usage_events where local_date <> (dispatched_at at time zone timezone)::date),
  0,
  'every local date is derived from database time and the stored profile timezone'
);

select is(
  (public.reserve_ai_usage('d0000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000001', repeat('f', 64), 'daily_plan', 'introductory', 'CH'))->>'outcome',
  'reserved',
  'an idempotency fixture request is initially reserved'
);
select is(
  (public.reserve_ai_usage('d0000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000001', repeat('f', 64), 'daily_plan', 'introductory', 'CH'))->>'outcome',
  'already_reserved',
  'a duplicate request UUID is not authorized again'
);
select is(
  (select count(*)::integer from public.ai_usage_events where user_id = 'd0000000-0000-4000-8000-000000000004'),
  1,
  'a duplicate request UUID does not double-consume quota'
);
select throws_ok(
  $$select public.reserve_ai_usage('d0000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000001', repeat('0', 64), 'daily_plan', 'introductory', 'CH')$$,
  '22023',
  'ai_request_payload_mismatch',
  'reusing a request UUID for another payload is rejected'
);
select ok(
  position('pg_advisory_xact_lock' in pg_get_functiondef('public.reserve_ai_usage(uuid,uuid,text,public.ai_feature,public.ai_access_basis,text)'::regprocedure)) > 0,
  'simultaneous quota decisions serialize on a per-user transaction lock'
);

create temporary table ai_race_results (outcome text not null);
do $$
declare
  connection_string constant text := 'host=supabase_db_first-move port=5432 dbname=postgres user=postgres password=postgres';
begin
  perform extensions.dblink_connect('ai_race_blocker', connection_string);
  perform extensions.dblink_connect('ai_race_one', connection_string);
  perform extensions.dblink_connect('ai_race_two', connection_string);
  perform extensions.dblink_exec(
    'ai_race_blocker',
    $remote$
      insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
      values ('e0000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ai-race@example.test', '', now(), now(), now())
    $remote$
  );
  perform extensions.dblink_exec(
    'ai_race_blocker',
    $remote$
      insert into public.profiles (user_id, timezone)
      values ('e0000000-0000-4000-8000-000000000005', 'UTC')
    $remote$
  );
  perform extensions.dblink_exec(
    'ai_race_blocker',
    $remote$
      insert into public.ai_usage_events (
        user_id, request_id, request_fingerprint, feature, access_basis,
        provider, model, local_date, timezone, region_code,
        entitlement_checked_at, dispatched_at
      )
      select
        'e0000000-0000-4000-8000-000000000005',
        ('e1000000-0000-4000-8000-' || lpad(call_number::text, 12, '0'))::uuid,
        lpad(call_number::text, 64, 'a'),
        'daily_plan', 'introductory', 'openai', 'gpt-5.6-luna',
        (transaction_timestamp() at time zone 'UTC')::date,
        'UTC', 'CH', transaction_timestamp(), transaction_timestamp()
      from generate_series(1, 4) call_number
    $remote$
  );

  perform extensions.dblink_exec('ai_race_blocker', 'begin');
  perform locked
  from extensions.dblink(
    'ai_race_blocker',
    $remote$
      select true
      from pg_advisory_xact_lock(hashtextextended('e0000000-0000-4000-8000-000000000005', 0))
    $remote$
  ) as result(locked boolean);
  perform extensions.dblink_send_query(
    'ai_race_one',
    $remote$
      select public.reserve_ai_usage(
        'e0000000-0000-4000-8000-000000000005',
        'e2000000-0000-4000-8000-000000000001',
        repeat('5', 64), 'daily_plan', 'introductory', 'CH'
      )
    $remote$
  );
  perform extensions.dblink_send_query(
    'ai_race_two',
    $remote$
      select public.reserve_ai_usage(
        'e0000000-0000-4000-8000-000000000005',
        'e2000000-0000-4000-8000-000000000002',
        repeat('6', 64), 'toothbrush_verification', 'introductory', 'CH'
      )
    $remote$
  );
  perform extensions.dblink_exec('ai_race_blocker', 'commit');
end;
$$;

insert into ai_race_results (outcome)
select result->>'outcome'
from extensions.dblink_get_result('ai_race_one') as response(result jsonb);
do $$
begin
  perform result
  from extensions.dblink_get_result('ai_race_one') as response(result jsonb);
end;
$$;
insert into ai_race_results (outcome)
select result->>'outcome'
from extensions.dblink_get_result('ai_race_two') as response(result jsonb);
do $$
begin
  perform result
  from extensions.dblink_get_result('ai_race_two') as response(result jsonb);
end;
$$;
select results_eq(
  'select outcome from ai_race_results order by outcome',
  array['denied'::text, 'reserved'],
  'two simultaneous requests at the Free boundary allow exactly one dispatch'
);
select is(
  (select event_count
   from extensions.dblink(
     'ai_race_one',
     $remote$
       select count(*)::integer
       from public.ai_usage_events
       where user_id = 'e0000000-0000-4000-8000-000000000005'
     $remote$
   ) as result(event_count integer)),
  5,
  'the simultaneous Free requests cannot exceed the lifetime quota'
);
do $$
begin
  perform extensions.dblink_exec('ai_race_one', $remote$delete from auth.users where id = 'e0000000-0000-4000-8000-000000000005'$remote$);
  perform extensions.dblink_disconnect('ai_race_blocker');
  perform extensions.dblink_disconnect('ai_race_one');
  perform extensions.dblink_disconnect('ai_race_two');
end;
$$;

select hasnt_column('public', 'ai_usage_events', 'prompt', 'the ledger has no prompt column');
select hasnt_column('public', 'ai_usage_events', 'image', 'the ledger has no image column');
select hasnt_column('public', 'ai_usage_events', 'output', 'the ledger has no model-output column');
select hasnt_column('public', 'ai_usage_events', 'token', 'the ledger has no auth-token column');
select hasnt_column('public', 'ai_usage_events', 'secret', 'the ledger has no secret column');
select is((select count(*)::integer from public.ai_usage_events where provider <> 'openai'), 0, 'every reservation fixes the provider to OpenAI');
select is((select count(*)::integer from public.ai_usage_events where model <> 'gpt-5.6-luna'), 0, 'every reservation fixes the approved model');
select is((select count(*)::integer from public.ai_usage_events where entitlement_checked_at <> dispatched_at), 0, 'entitlement check and dispatch reservation use one server transaction timestamp');

select * from finish();
rollback;
