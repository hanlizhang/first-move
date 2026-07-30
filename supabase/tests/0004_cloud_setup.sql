begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('40000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'setup-a@example.test', '', now(), now(), now()),
  ('50000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'setup-b@example.test', '', now(), now(), now()),
  ('60000000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'import@example.test', '', now(), now(), now());

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
  $$select public.initialize_cloud_workspace(
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

select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000005', true);
select is((select count(*)::integer from public.tasks), 0, 'user B cannot read user A/import user tasks');
select is(jsonb_array_length(public.get_cloud_workspace()->'journal_entries'), 0, 'user B canonical hydration cannot read another journal');

reset role;
select * from finish();
rollback;
