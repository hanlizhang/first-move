begin;
create extension if not exists pgtap with schema extensions;

select plan(32);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('40000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'setup-a@example.test', '', now(), now(), now()),
  ('50000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'setup-b@example.test', '', now(), now(), now()),
  ('60000000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'import@example.test', '', now(), now(), now()),
  ('70000000-0000-4000-8000-000000000007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'history@example.test', '', now(), now(), now());

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '', true);

select throws_ok(
  $$select public.cloud_workspace_status()$$,
  '42501',
  'not_authenticated',
  'workspace detection rejects unauthenticated access'
);
select throws_ok(
  $$select public.initialize_cloud_workspace('start_fresh', gen_random_uuid(), repeat('a', 64), 8, 'UTC', '{}'::jsonb)$$,
  '42501',
  'not_authenticated',
  'workspace initialization rejects unauthenticated access'
);

select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000004', true);
select is((public.cloud_workspace_status()->>'initialized')::boolean, false, 'new account is detected as empty');
select lives_ok(
  $$select public.initialize_cloud_workspace_v2(
    'start_fresh', '44000000-0000-4000-8000-000000000004', repeat('a', 64), 8, 'Europe/Berlin', '{}'::jsonb
  )$$,
  'Start fresh initializes an empty workspace'
);
select is((public.cloud_workspace_status()->>'initialized')::boolean, true, 'Start fresh marks workspace initialized');
select is((select count(*)::integer from public.import_batches), 1, 'owner sees one setup batch');
select lives_ok(
  $$select public.initialize_cloud_workspace(
    'start_fresh', '44000000-0000-4000-8000-000000000004', repeat('a', 64), 8, 'Europe/Berlin', '{}'::jsonb
  )$$,
  'retrying the same completed setup is idempotent'
);
select is((select count(*)::integer from public.import_batches), 1, 'retry does not duplicate setup batch');
select throws_ok(
  $$select public.initialize_cloud_workspace(
    'import_local', '44000000-0000-4000-8000-000000000004', repeat('b', 64), 8, 'Europe/Berlin',
    '{"expected":{"record_counts":{},"points_tenths":0,"inventory_balances":{},"milestones":[],"active_days":0}}'::jsonb
  )$$,
  'P0001',
  'workspace_not_empty',
  'import into a non-empty account is rejected'
);

select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000006', true);
select lives_ok(
  $$select public.initialize_cloud_workspace(
    'import_local',
    '66000000-0000-4000-8000-000000000006',
    repeat('c', 64),
    8,
    'Europe/Berlin',
    '{
      "mappings":[
        {"entity_type":"task","local_id":"task-local","cloud_id":"66100000-0000-4000-8000-000000000006","payload_sha256":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"},
        {"entity_type":"journal_entry","local_id":"2026-07-30","cloud_id":"66200000-0000-4000-8000-000000000006","payload_sha256":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"},
        {"entity_type":"reward_event","local_id":"reflection:2026-07-30","cloud_id":"66300000-0000-4000-8000-000000000006","payload_sha256":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"},
        {"entity_type":"inventory_event","local_id":"kitten-milk","cloud_id":"66400000-0000-4000-8000-000000000006","payload_sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}
      ],
      "profile":{"first_use_local_date":"2026-07-30"},
      "settings":{},
      "tasks":[{"id":"66100000-0000-4000-8000-000000000006","title":"Imported task","direction":"Daily Life","rank":"000000000000","created_at":"2026-07-30T08:00:00Z"}],
      "journal_entries":[{"id":"66200000-0000-4000-8000-000000000006","local_date":"2026-07-30","timezone":"Europe/Berlin","what_helped":"private fixture","updated_at":"2026-07-30T20:00:00Z"}],
      "reward_ledger":[{"id":"66300000-0000-4000-8000-000000000006","source_type":"reflection","source_id":"66200000-0000-4000-8000-000000000006","local_date":"2026-07-30","timezone":"Europe/Berlin","points_tenths":20,"idempotency_key":"import:reflection:2026-07-30","created_at":"2026-07-30T20:00:00Z"}],
      "inventory_events":[{"id":"66400000-0000-4000-8000-000000000006","item_id":"kitten-milk","kind":"correction","quantity_delta":2,"idempotency_key":"import-opening:test:kitten-milk","local_date":"2026-07-30","timezone":"Europe/Berlin"}],
      "inventory_balances":[{"item_id":"kitten-milk","quantity":2}],
      "expected":{"record_counts":{"tasks":1,"task_completions":0,"habits":0,"habit_completions":0,"activity_intents":0,"activity_sessions":0,"daily_plans":0,"journal_entries":1,"morning_checks":0,"reward_ledger":1},"points_tenths":20,"inventory_balances":{"kitten-milk":2},"milestones":[],"active_days":1}
    }'::jsonb
  )$$,
  'Import this device accepts and verifies a complete normalized payload'
);
select is((select count(*)::integer from public.tasks), 1, 'imported task is visible to its owner');
select is((select points_tenths from public.point_balances), 20::bigint, 'imported point balance is verified');
select is((select quantity from public.inventory_balances where item_id = 'kitten-milk'), 2, 'imported inventory projection is verified');
select is((select what_helped from public.journal_entries), 'private fixture', 'imported journal remains owner-readable');
select lives_ok(
  $$select public.initialize_cloud_workspace(
    'import_local', '66000000-0000-4000-8000-000000000006', repeat('c', 64), 8, 'Europe/Berlin', '{}'::jsonb
  )$$,
  'retry after a committed import returns the canonical workspace'
);
select is((select count(*)::integer from public.reward_ledger), 1, 'committed import retry does not duplicate its reward');

select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000007', true);
select lives_ok(
  $$select public.initialize_cloud_workspace_v2(
    'import_local', '77000000-0000-4000-8000-000000000007', repeat('7', 64), 8, 'Europe/Berlin',
    '{
      "mappings":[
        {"entity_type":"task","local_id":"deleted-task","cloud_id":"77100000-0000-4000-8000-000000000007","payload_sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},
        {"entity_type":"task_completion","local_id":"deleted-task:2026-07-20","cloud_id":"77200000-0000-4000-8000-000000000007","payload_sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},
        {"entity_type":"reward_event","local_id":"task:deleted-task:2026-07-20","cloud_id":"77300000-0000-4000-8000-000000000007","payload_sha256":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"}
      ],
      "profile":{},"settings":{},
      "tasks":[{"id":"77100000-0000-4000-8000-000000000007","title":"Deleted task","direction":"Daily Life","rank":"000000000000","created_at":"2026-07-20T10:00:00Z","deleted_at":"2026-07-20T10:00:00Z"}],
      "task_completions":[{"id":"77200000-0000-4000-8000-000000000007","task_id":"77100000-0000-4000-8000-000000000007","local_date":"2026-07-20","timezone":"Europe/Berlin","occurred_at":"2026-07-20T10:00:00Z","deleted_at":"2026-07-20T10:00:00Z"}],
      "reward_ledger":[{"id":"77300000-0000-4000-8000-000000000007","source_type":"task","source_id":"77200000-0000-4000-8000-000000000007","local_date":"2026-07-20","timezone":"Europe/Berlin","points_tenths":50,"idempotency_key":"import:task:deleted-task:2026-07-20","created_at":"2026-07-20T10:00:00Z"}],
      "expected":{"record_counts":{"tasks":1,"task_completions":1,"habits":0,"habit_completions":0,"activity_intents":0,"activity_sessions":0,"daily_plans":0,"journal_entries":0,"morning_checks":0,"reward_ledger":1},"points_tenths":50,"inventory_balances":{},"milestones":[],"active_days":1}
    }'::jsonb
  )$$,
  'reward-only completion imports as a tombstone'
);
select isnt((select deleted_at from public.task_completions limit 1), null, 'historical completion is tombstoned');
select is((select source_id from public.reward_ledger limit 1), '77200000-0000-4000-8000-000000000007'::uuid, 'reward references tombstoned completion');
select is(jsonb_array_length(public.get_cloud_workspace()->'task_completions'), 0, 'tombstone is absent from canonical active completions');
select lives_ok(
  $$select public.initialize_cloud_workspace_v2('import_local', '77000000-0000-4000-8000-000000000007', repeat('7', 64), 8, 'Europe/Berlin', '{}'::jsonb)$$,
  'historical import retry is idempotent'
);
select is((select count(*)::integer from public.reward_ledger), 1, 'historical retry duplicates neither completion nor reward');

reset role;
insert into public.devices (id, user_id, platform)
values ('77400000-0000-4000-8000-000000000007', '70000000-0000-4000-8000-000000000007', 'web');
insert into public.habits (id, user_id, title, direction, schedule_kind, deleted_at)
values ('77500000-0000-4000-8000-000000000007', '70000000-0000-4000-8000-000000000007', 'Removed habit fixture', 'Daily Life', 'daily', '2026-07-20T10:00:00Z');
insert into public.activity_intents (
  id, user_id, stuck_state, direction, move_text, intended_duration_minutes, status, deleted_at
) values (
  '77600000-0000-4000-8000-000000000007', '70000000-0000-4000-8000-000000000007',
  'unsure what is needed', 'Daily Life', 'Historical fixture', 2, 'consumed', '2026-07-20T10:00:00Z'
);
insert into public.activity_sessions (
  id, user_id, device_id, mode, status, direction, label,
  linked_task_id, linked_habit_id, linked_intent_id,
  started_at, accumulated_elapsed_ms, ended_at, actual_elapsed_ms, local_date, timezone
) values
  ('77700000-0000-4000-8000-000000000007', '70000000-0000-4000-8000-000000000007', '77400000-0000-4000-8000-000000000007', 'stopwatch', 'stopped', 'Daily Life', 'Task history fixture', '77100000-0000-4000-8000-000000000007', null, null, '2026-07-20T10:00:00Z', 0, '2026-07-20T10:00:00Z', 0, '2026-07-20', 'Europe/Berlin'),
  ('77800000-0000-4000-8000-000000000007', '70000000-0000-4000-8000-000000000007', '77400000-0000-4000-8000-000000000007', 'stopwatch', 'stopped', 'Daily Life', 'Habit history fixture', null, '77500000-0000-4000-8000-000000000007', null, '2026-07-20T10:00:00Z', 0, '2026-07-20T10:00:00Z', 0, '2026-07-20', 'Europe/Berlin'),
  ('77900000-0000-4000-8000-000000000007', '70000000-0000-4000-8000-000000000007', '77400000-0000-4000-8000-000000000007', 'stopwatch', 'stopped', 'Daily Life', 'Intent history fixture', null, null, '77600000-0000-4000-8000-000000000007', '2026-07-20T10:00:00Z', 0, '2026-07-20T10:00:00Z', 0, '2026-07-20', 'Europe/Berlin');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000007', true);

select is(jsonb_array_length(public.get_cloud_workspace()->'tasks'), 0, 'legacy canonical output filters a tombstoned linked task');
select is(jsonb_array_length(public.get_cloud_workspace_v2()->'tasks'), 1, 'canonical v2 includes a tombstoned linked task');
select ok(public.get_cloud_workspace_v2()->'tasks'->0->>'deleted_at' is not null, 'canonical v2 preserves the task tombstone');
select is(jsonb_array_length(public.get_cloud_workspace_v2()->'habits'), 1, 'canonical v2 includes a tombstoned linked habit');
select is(jsonb_array_length(public.get_cloud_workspace_v2()->'activity_intents'), 1, 'canonical v2 includes a tombstoned linked intent');
select is(jsonb_array_length(public.get_cloud_workspace_v2()->'activity_sessions'), 3, 'canonical v2 retains every historical session');
select is((
  select count(*)::integer
  from jsonb_array_elements(public.get_cloud_workspace_v2()->'activity_sessions') session_row
  where coalesce(session_row->>'linked_task_id', session_row->>'linked_habit_id', session_row->>'linked_intent_id') is not null
), 3, 'canonical v2 preserves all historical parent relationships');

select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000005', true);
select is((select count(*)::integer from public.tasks), 0, 'user B cannot read user A/import user tasks');
select is(jsonb_array_length(public.get_cloud_workspace()->'journal_entries'), 0, 'user B canonical hydration cannot read another journal');
select is(jsonb_array_length(public.get_cloud_workspace_v2()->'tasks'), 0, 'user B canonical hydration cannot read another user tombstone');

reset role;
select * from finish();
rollback;
