begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select plan(44);

select has_function(
  'public', 'account_accepts_writes', array['uuid'],
  'the service-side pending-deletion gate exists'
);
select ok(
  has_function_privilege('service_role', 'public.account_accepts_writes(uuid)', 'EXECUTE'),
  'the service role may check the pending-deletion gate'
);
select ok(
  not has_function_privilege('authenticated', 'public.account_accepts_writes(uuid)', 'EXECUTE'),
  'authenticated clients cannot inspect deletion state through the write gate'
);
select ok(
  not has_function_privilege('anon', 'public.account_accepts_writes(uuid)', 'EXECUTE'),
  'anonymous clients cannot inspect deletion state through the write gate'
);
select has_function(
  'public', 'initiate_account_deletion', array['uuid'],
  'the non-destructive deletion initiation function exists'
);
select ok(
  has_function_privilege('service_role', 'public.initiate_account_deletion(uuid)', 'EXECUTE'),
  'the service role may initiate deletion'
);
select ok(
  not has_function_privilege('authenticated', 'public.initiate_account_deletion(uuid)', 'EXECUTE'),
  'authenticated clients cannot call deletion initiation directly'
);
select ok(
  not has_function_privilege('anon', 'public.initiate_account_deletion(uuid)', 'EXECUTE'),
  'anonymous clients cannot call deletion initiation'
);

select results_eq(
  $$
    select event_object_table::name
    from information_schema.triggers
    where trigger_schema = 'public'
      and trigger_name = 'account_deletion_write_gate'
      and event_manipulation = 'INSERT'
    order by event_object_table
  $$,
  array[
    'activity_intents', 'activity_sessions', 'ai_usage_events',
    'client_mutations', 'daily_plan_items', 'daily_plans', 'devices',
    'habit_completions', 'habit_schedule_weekdays', 'habits',
    'import_batches', 'import_entity_mappings', 'inventory_balances',
    'inventory_events', 'journal_entries', 'milestone_grants',
    'morning_attempts', 'morning_checks', 'profiles', 'reward_ledger',
    'task_completions', 'tasks', 'user_settings'
  ]::name[],
  'all 23 user-owned tables have a pending-deletion insert gate'
);
select is(
  (
    select count(*)::integer
    from information_schema.triggers
    where trigger_schema = 'public'
      and trigger_name = 'account_deletion_write_gate'
      and event_manipulation in ('INSERT', 'UPDATE')
  ),
  46,
  'every user-owned table gates both inserts and updates'
);
select is(
  (
    select count(*)::integer
    from information_schema.triggers
    where trigger_schema = 'public'
      and trigger_name = 'account_deletion_write_gate'
      and event_manipulation = 'DELETE'
  ),
  0,
  'the gate does not block trusted deletion and cascade operations'
);
select ok(
  position('pg_advisory_xact_lock' in pg_get_functiondef('public.account_accepts_writes(uuid)'::regprocedure)) > 0,
  'write checks take the per-user transaction lock'
);
select ok(
  position('pg_advisory_xact_lock' in pg_get_functiondef('public.initiate_account_deletion(uuid)'::regprocedure)) > 0,
  'deletion initiation takes the same per-user transaction lock'
);
select ok(
  position('account_accepts_writes' in pg_get_functiondef('public.reserve_ai_usage(uuid,uuid,text,public.ai_feature,public.ai_access_basis,text)'::regprocedure)) > 0,
  'the service-role AI quota reservation explicitly checks the deletion gate'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values
  ('a1000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'phase1c-a@example.test', '', now(), now(), now()),
  ('b1000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'phase1c-b@example.test', '', now(), now(), now()),
  ('c1000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'phase1c-c@example.test', '', now(), now(), now()),
  ('d1000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'phase1c-d@example.test', '', now(), now(), now());

insert into public.profiles (user_id, timezone) values
  ('a1000000-0000-4000-8000-000000000001', 'UTC'),
  ('d1000000-0000-4000-8000-000000000004', 'UTC');
insert into public.tasks (id, user_id, title, direction, rank)
values ('a1100000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'Economic gate fixture', 'Daily Life', '000000000001');
insert into public.task_completions (
  id, user_id, task_id, local_date, timezone, occurred_at
) values (
  'a1200000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'a1100000-0000-4000-8000-000000000001',
  '2026-09-27', 'UTC', now()
);
insert into public.reward_ledger (
  id, user_id, source_type, source_id, local_date, timezone,
  points_tenths, idempotency_key
) values (
  'a1300000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'task', 'a1200000-0000-4000-8000-000000000001',
  '2026-09-27', 'UTC', 100, 'phase1c-economic-fixture'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$select public.initialize_cloud_workspace_v2(
    'start_fresh', 'b1100000-0000-4000-8000-000000000002', repeat('b', 64),
    8, 'UTC', '{}'::jsonb
  )$$,
  'the sync fixture can initialize before deletion is pending'
);
reset role;
select set_config('request.jwt.claim.role', '', true);
select set_config('request.jwt.claim.sub', '', true);

select is(
  (public.initiate_account_deletion('a1000000-0000-4000-8000-000000000001'))->>'outcome',
  'initiated',
  'trusted initiation creates the first active request'
);
select is(
  (public.initiate_account_deletion('a1000000-0000-4000-8000-000000000001'))->>'outcome',
  'already_pending',
  'a repeated request returns the existing active operation'
);
select is(
  (
    select count(*)::integer
    from public.account_deletion_requests
    where user_id = 'a1000000-0000-4000-8000-000000000001'
      and status <> 'completed'
  ),
  1,
  'repeated initiation cannot duplicate active work'
);
select is(
  (public.initiate_account_deletion('f1000000-0000-4000-8000-000000000006'))->>'outcome',
  'user_not_found',
  'a missing Auth user cannot receive a new deletion request'
);
select is(
  (
    select count(*)::integer
    from public.account_deletion_requests
    where user_id = 'f1000000-0000-4000-8000-000000000006'
  ),
  0,
  'missing-user initiation leaves no outbox row'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select public.initiate_account_deletion('a1000000-0000-4000-8000-000000000001')$$,
  '42501', null,
  'an authenticated client cannot bypass the server initiation route'
);
select throws_ok(
  $$select public.account_accepts_writes('a1000000-0000-4000-8000-000000000001')$$,
  '42501', null,
  'an authenticated client cannot inspect pending state directly'
);
reset role;

set local role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$select public.initiate_account_deletion('a1000000-0000-4000-8000-000000000001')$$,
  '42501', null,
  'an anonymous client cannot initiate deletion'
);
reset role;

select is(
  (public.initiate_account_deletion('b1000000-0000-4000-8000-000000000002'))->>'outcome',
  'initiated',
  'the initialized sync fixture becomes pending'
);
select is(
  (public.initiate_account_deletion('c1000000-0000-4000-8000-000000000003'))->>'outcome',
  'initiated',
  'the empty setup fixture becomes pending'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$insert into public.tasks (id, user_id, title, direction, rank) values (
    'a1400000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'Blocked stale write', 'Daily Life', '000000000002'
  )$$,
  '55000', 'account_deletion_pending',
  'a direct owner insert is rejected while deletion is pending'
);
select throws_ok(
  $$update public.profiles set timezone = 'Europe/Zurich' where user_id = 'a1000000-0000-4000-8000-000000000001'$$,
  '55000', 'account_deletion_pending',
  'a direct owner update is rejected while deletion is pending'
);
select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000004', true);
select lives_ok(
  $$insert into public.tasks (id, user_id, title, direction, rank) values (
    'd1100000-0000-4000-8000-000000000004',
    'd1000000-0000-4000-8000-000000000004',
    'Unrelated account write', 'Daily Life', '000000000001'
  )$$,
  'an unrelated account remains writable'
);
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$insert into public.tasks (id, user_id, title, direction, rank) values (
    'd1200000-0000-4000-8000-000000000004',
    'd1000000-0000-4000-8000-000000000004',
    'Cross-user write', 'Daily Life', '000000000002'
  )$$,
  '42501', null,
  'the write gate does not weaken normal cross-user RLS isolation'
);

select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$select public.initialize_cloud_workspace_v2(
    'start_fresh', 'c1100000-0000-4000-8000-000000000003', repeat('c', 64),
    8, 'UTC', '{}'::jsonb
  )$$,
  '55000', 'account_deletion_pending',
  'initial workspace setup cannot create data after deletion initiation'
);

select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select public.sync_cloud_workspace_v1(
    'b1200000-0000-4000-8000-000000000002',
    'b1100000-0000-4000-8000-000000000002',
    'UTC',
    '{"schemaVersion":8,"tasks":[],"habits":[],"activityIntents":[],"sessions":[],"journalEntries":[],"morningAttempts":[],"morningChecks":[],"inventory":{"items":[]},"progress":{}}'::jsonb,
    '[]'::jsonb,
    '{"purchases":[],"consumptions":[]}'::jsonb
  )$$,
  '55000', 'account_deletion_pending',
  'continuous sync cannot update data after deletion initiation'
);

select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select public.purchase_inventory_item(
    'kitten-milk', 'a1500000-0000-4000-8000-000000000001',
    '2026-09-27', 'UTC'
  )$$,
  '55000', 'account_deletion_pending',
  'server-authoritative economic writes are rejected while deletion is pending'
);
reset role;
select set_config('request.jwt.claim.role', '', true);
select set_config('request.jwt.claim.sub', '', true);

select throws_ok(
  $$select public.reserve_ai_usage(
    'a1000000-0000-4000-8000-000000000001',
    'a1600000-0000-4000-8000-000000000001',
    repeat('a', 64), 'daily_plan', 'introductory', 'CH'
  )$$,
  '55000', 'account_deletion_pending',
  'AI quota reservation cannot authorize provider dispatch after deletion initiation'
);
select is(
  public.account_accepts_writes('a1000000-0000-4000-8000-000000000001'),
  false,
  'the pending account fails the trusted write check'
);
select is(
  public.account_accepts_writes('d1000000-0000-4000-8000-000000000004'),
  true,
  'an unrelated account passes the trusted write check'
);

-- Fresh disposable Supabase projects do not always install the platform's
-- default service-role table grants. Keep that harness accommodation inside
-- this rollback-scoped test rather than changing an applied migration.
grant usage on schema public to service_role;
grant select, insert, update, delete on table public.tasks to service_role;

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $$update public.tasks set title = 'Trusted maintenance update' where id = 'a1100000-0000-4000-8000-000000000001'$$,
  'trusted service-role maintenance remains available'
);
select lives_ok(
  $$insert into public.tasks (id, user_id, title, direction, rank) values (
    'a1700000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'Trusted maintenance fixture', 'Daily Life', '000000000003'
  )$$,
  'trusted service-role administrative inserts remain available'
);
select lives_ok(
  $$delete from public.tasks where id = 'a1700000-0000-4000-8000-000000000001'$$,
  'trusted administrative deletion remains available for a future worker'
);
reset role;
select set_config('request.jwt.claim.role', '', true);

create temporary table deletion_write_race_result (
  sqlstate text,
  message text,
  saw_advisory_wait boolean not null default false
) on commit drop;

do $$
declare
  connection_string text := pg_catalog.format(
    'hostaddr=%s port=%s dbname=%s user=postgres password=postgres application_name=phase1c_race',
    pg_catalog.inet_server_addr(), pg_catalog.inet_server_port(), current_database()
  );
  ignored jsonb;
  saw_wait boolean;
  failure_state text;
  failure_message text;
begin
  perform extensions.dblink_connect('phase1c_blocker', connection_string);
  perform extensions.dblink_connect('phase1c_writer', connection_string);
  perform extensions.dblink_exec(
    'phase1c_blocker',
    $remote$
      insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at
      ) values (
        'e1000000-0000-4000-8000-000000000005',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'phase1c-race@example.test', '',
        now(), now(), now()
      );
      insert into public.profiles (user_id, timezone)
      values ('e1000000-0000-4000-8000-000000000005', 'UTC')
    $remote$
  );
  perform extensions.dblink_exec('phase1c_writer', 'set role authenticated');
  perform configured
  from extensions.dblink(
    'phase1c_writer',
    $remote$
      select set_config('request.jwt.claim.role', 'authenticated', false)
      union all
      select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000005', false)
    $remote$
  ) as result(configured text);

  perform extensions.dblink_exec('phase1c_blocker', 'begin');
  select result into ignored
  from extensions.dblink(
    'phase1c_blocker',
    $remote$
      select public.initiate_account_deletion(
        'e1000000-0000-4000-8000-000000000005'
      )
    $remote$
  ) as response(result jsonb);

  perform extensions.dblink_send_query(
    'phase1c_writer',
    $remote$
      with inserted as (
        insert into public.tasks (id, user_id, title, direction, rank)
        values (
          'e1100000-0000-4000-8000-000000000005',
          'e1000000-0000-4000-8000-000000000005',
          'Concurrent stale write', 'Daily Life', '000000000001'
        ) returning 1
      ) select count(*)::integer from inserted
    $remote$
  );
  perform pg_catalog.pg_sleep(0.1);
  select exists (
    select 1 from pg_catalog.pg_stat_activity
    where datname = current_database()
      and application_name = 'phase1c_race'
      and wait_event = 'advisory'
  ) into saw_wait;
  update deletion_write_race_result set saw_advisory_wait = saw_wait;
  if not found then
    insert into deletion_write_race_result (saw_advisory_wait) values (saw_wait);
  end if;
  perform extensions.dblink_exec('phase1c_blocker', 'commit');

  begin
    perform result
    from extensions.dblink_get_result('phase1c_writer') as response(result integer);
  exception when others then
    get stacked diagnostics
      failure_state = returned_sqlstate,
      failure_message = message_text;
    update deletion_write_race_result
    set sqlstate = failure_state, message = failure_message;
  end;
end;
$$;

select ok(
  (select saw_advisory_wait from deletion_write_race_result),
  'a concurrent stale write waits on the deletion initiation lock'
);
select results_eq(
  $$select sqlstate, message from deletion_write_race_result$$,
  $$values ('55000'::text, 'account_deletion_pending'::text)$$,
  'the waiting write rechecks state and is rejected after initiation commits'
);
select is(
  (
    select count(*)::integer from public.account_deletion_requests
    where user_id = 'e1000000-0000-4000-8000-000000000005'
      and status <> 'completed'
  ),
  1,
  'the concurrent initiation leaves exactly one active request'
);
select is(
  (
    select count(*)::integer from public.tasks
    where user_id = 'e1000000-0000-4000-8000-000000000005'
  ),
  0,
  'the concurrent stale write creates no user data'
);

do $$
begin
  perform extensions.dblink_exec(
    'phase1c_blocker',
    $remote$
      delete from auth.users where id = 'e1000000-0000-4000-8000-000000000005';
      delete from public.account_deletion_requests
      where user_id = 'e1000000-0000-4000-8000-000000000005'
    $remote$
  );
  perform extensions.dblink_disconnect('phase1c_writer');
  perform extensions.dblink_disconnect('phase1c_blocker');
end;
$$;

create temporary table concurrent_initiation_results (outcome text not null) on commit drop;
do $$
declare
  connection_string text := pg_catalog.format(
    'hostaddr=%s port=%s dbname=%s user=postgres password=postgres application_name=phase1c_initiation',
    pg_catalog.inet_server_addr(), pg_catalog.inet_server_port(), current_database()
  );
begin
  perform extensions.dblink_connect('phase1c_init_blocker', connection_string);
  perform extensions.dblink_connect('phase1c_init_one', connection_string);
  perform extensions.dblink_connect('phase1c_init_two', connection_string);
  perform extensions.dblink_exec(
    'phase1c_init_blocker',
    $remote$
      insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at
      ) values (
        'f2000000-0000-4000-8000-000000000007',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'phase1c-init-race@example.test', '',
        now(), now(), now()
      )
    $remote$
  );
  perform extensions.dblink_exec('phase1c_init_blocker', 'begin');
  perform locked
  from extensions.dblink(
    'phase1c_init_blocker',
    $remote$
      select true from pg_advisory_xact_lock(
        hashtextextended('f2000000-0000-4000-8000-000000000007', 0)
      )
    $remote$
  ) as result(locked boolean);
  perform extensions.dblink_send_query(
    'phase1c_init_one',
    $remote$select public.initiate_account_deletion('f2000000-0000-4000-8000-000000000007')$remote$
  );
  perform extensions.dblink_send_query(
    'phase1c_init_two',
    $remote$select public.initiate_account_deletion('f2000000-0000-4000-8000-000000000007')$remote$
  );
  perform extensions.dblink_exec('phase1c_init_blocker', 'commit');
end;
$$;

insert into concurrent_initiation_results (outcome)
select result->>'outcome'
from extensions.dblink_get_result('phase1c_init_one') as response(result jsonb);
do $$ begin
  perform result from extensions.dblink_get_result('phase1c_init_one') as response(result jsonb);
end $$;
insert into concurrent_initiation_results (outcome)
select result->>'outcome'
from extensions.dblink_get_result('phase1c_init_two') as response(result jsonb);
do $$ begin
  perform result from extensions.dblink_get_result('phase1c_init_two') as response(result jsonb);
end $$;

select results_eq(
  'select outcome from concurrent_initiation_results order by outcome',
  array['already_pending'::text, 'initiated'],
  'two concurrent initiations return one new and one existing operation'
);
select is(
  (
    select count(*)::integer from public.account_deletion_requests
    where user_id = 'f2000000-0000-4000-8000-000000000007'
      and status <> 'completed'
  ),
  1,
  'concurrent initiation creates only one active outbox row'
);

do $$
begin
  perform extensions.dblink_exec(
    'phase1c_init_one',
    $remote$
      delete from auth.users where id = 'f2000000-0000-4000-8000-000000000007';
      delete from public.account_deletion_requests
      where user_id = 'f2000000-0000-4000-8000-000000000007'
    $remote$
  );
  perform extensions.dblink_disconnect('phase1c_init_blocker');
  perform extensions.dblink_disconnect('phase1c_init_one');
  perform extensions.dblink_disconnect('phase1c_init_two');
end;
$$;

select * from finish();
rollback;
