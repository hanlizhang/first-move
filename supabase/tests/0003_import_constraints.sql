begin;
create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('30000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'import@example.test', '', now(), now(), now());
insert into public.devices (id, user_id, platform)
values ('33000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', 'web');
insert into public.import_batches (
  id, user_id, device_id, choice, status, source_schema_version, snapshot_sha256,
  expected_record_counts, expected_points_tenths, expected_inventory_balances
) values (
  '33300000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003',
  '33000000-0000-4000-8000-000000000003', 'import_local', 'running', 8, repeat('a', 64),
  '{"tasks":1}'::jsonb, 50, '{"kitten-milk":2}'::jsonb
);
insert into public.import_entity_mappings (user_id, import_batch_id, entity_type, local_id, cloud_id, payload_sha256)
values ('30000000-0000-4000-8000-000000000003', '33300000-0000-4000-8000-000000000003', 'task', 'task-local-1', '33330000-0000-4000-8000-000000000003', repeat('b', 64));

select is(
  (select cloud_id from public.import_entity_mappings where local_id = 'task-local-1'),
  '33330000-0000-4000-8000-000000000003'::uuid,
  'mapping stores generated cloud UUID'
);
select is(
  (select payload_sha256 from public.import_entity_mappings where local_id = 'task-local-1'),
  repeat('b', 64),
  'mapping stores payload fingerprint'
);
select throws_ok(
  $$insert into public.import_batches (id, user_id, device_id, choice, snapshot_sha256) values (gen_random_uuid(), '30000000-0000-4000-8000-000000000003', '33000000-0000-4000-8000-000000000003', 'import_local', repeat('a', 64))$$,
  '23505',
  null,
  'same snapshot cannot create another batch'
);
select throws_ok(
  $$insert into public.import_entity_mappings (user_id, import_batch_id, entity_type, local_id, cloud_id, payload_sha256) values ('30000000-0000-4000-8000-000000000003', '33300000-0000-4000-8000-000000000003', 'task', 'task-local-1', gen_random_uuid(), repeat('c', 64))$$,
  '23505',
  null,
  'same local identity cannot remap on retry'
);
select throws_ok(
  $$insert into public.import_entity_mappings (user_id, import_batch_id, entity_type, local_id, cloud_id, payload_sha256) values ('30000000-0000-4000-8000-000000000003', '33300000-0000-4000-8000-000000000003', 'task', 'task-local-2', '33330000-0000-4000-8000-000000000003', repeat('d', 64))$$,
  '23505',
  null,
  'cloud UUID cannot be reused in a batch'
);
select throws_ok(
  $$update public.import_batches set status = 'completed', completed_at = now() where id = '33300000-0000-4000-8000-000000000003'$$,
  '23514',
  null,
  'completed import requires verification'
);
select lives_ok(
  $$update public.import_batches set status = 'completed', imported_record_counts = '{"tasks":1}'::jsonb, verified_points_tenths = 50, verified_inventory_balances = '{"kitten-milk":2}'::jsonb, completed_at = now(), verified_at = now() where id = '33300000-0000-4000-8000-000000000003'$$,
  'verified import can complete'
);
select is(
  (select status::text from public.import_batches where id = '33300000-0000-4000-8000-000000000003'),
  'completed',
  'completed status persists'
);

select * from finish();
rollback;
