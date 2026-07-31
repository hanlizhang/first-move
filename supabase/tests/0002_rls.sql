begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-a@example.test', '', now(), now(), now()),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-b@example.test', '', now(), now(), now());

insert into public.devices (id, user_id, platform) values
  ('11000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'web'),
  ('22000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'web');
insert into public.tasks (id, user_id, title, direction, rank) values
  ('11100000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Owner A task', 'Daily Life', 'a'),
  ('22200000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Owner B task', 'Rest', 'a');
insert into public.journal_entries (id, user_id, local_date, timezone, what_helped) values
  ('11110000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '2026-07-29', 'Europe/Berlin', 'private-a'),
  ('22220000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '2026-07-29', 'Europe/Berlin', 'private-b');
insert into public.import_batches (id, user_id, device_id, choice, snapshot_sha256) values
  ('11111000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 'import_local', repeat('a', 64));
insert into public.import_entity_mappings (user_id, import_batch_id, entity_type, local_id, cloud_id, payload_sha256) values
  ('10000000-0000-4000-8000-000000000001', '11111000-0000-4000-8000-000000000001', 'task', 'local-task-a', '11100000-0000-4000-8000-000000000001', repeat('b', 64));
insert into public.reward_ledger (id, user_id, source_type, source_id, local_date, timezone, points_tenths, idempotency_key) values
  ('11111100-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'task', '11100000-0000-4000-8000-000000000001', '2026-07-29', 'Europe/Berlin', 50, 'task:local-task-a:2026-07-29');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

select results_eq('select count(*)::bigint from public.tasks', array[1::bigint], 'owner sees only own tasks');
select results_eq('select title from public.tasks', array['Owner A task'::text], 'cross-user task is hidden');
select results_eq('select what_helped from public.journal_entries', array['private-a'::text], 'journal is private to owner');
select results_eq('select count(*)::bigint from public.import_batches', array[1::bigint], 'owner sees own import audit');
select results_eq('select count(*)::bigint from public.import_entity_mappings', array[1::bigint], 'owner sees own mappings');
select results_eq('select points_tenths from public.point_balances', array[50::bigint], 'balance view is owner scoped');
select lives_ok(
  $$insert into public.tasks (id, user_id, title, direction, rank) values ('11111110-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Owner insert', 'Daily Life', 'b')$$,
  'owner can insert own mutable row'
);
select throws_ok(
  $$insert into public.tasks (id, user_id, title, direction, rank) values ('21111110-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Cross owner insert', 'Daily Life', 'b')$$,
  '42501',
  null,
  'owner cannot insert for another user'
);
select lives_ok(
  $$update public.tasks set title = 'cross update' where id = '22200000-0000-4000-8000-000000000002'$$,
  'cross-user update safely affects no accessible row'
);
select throws_ok(
  $$delete from public.tasks where id = '11100000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'hard delete is denied'
);
select throws_ok(
  $$insert into public.reward_ledger (id, user_id, source_type, local_date, timezone, points_tenths, idempotency_key) values (gen_random_uuid(), '10000000-0000-4000-8000-000000000001', 'correction', '2026-07-29', 'Europe/Berlin', 10, 'forged')$$,
  '42501',
  null,
  'client cannot write reward ledger'
);
select throws_ok(
  $$insert into public.import_batches (id, user_id, device_id, choice) values (gen_random_uuid(), '10000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 'import_local')$$,
  '42501',
  null,
  'client cannot create import audit'
);
select throws_ok(
  $$insert into public.import_entity_mappings (user_id, import_batch_id, entity_type, local_id, cloud_id, payload_sha256) values ('10000000-0000-4000-8000-000000000001', '11111000-0000-4000-8000-000000000001', 'task', 'forged', gen_random_uuid(), repeat('f', 64))$$,
  '42501',
  null,
  'client cannot create import mapping'
);
select is(
  has_table_privilege('anon', 'public.tasks', 'select'),
  false,
  'anon cannot select user data'
);

reset role;
select * from finish();
rollback;
