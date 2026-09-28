begin;
create extension if not exists pgtap with schema extensions;

select plan(54);

select results_eq(
  $$
    select child.relname
    from pg_constraint constraint_record
    join pg_class child on child.oid = constraint_record.conrelid
    join pg_attribute child_column
      on child_column.attrelid = child.oid
     and child_column.attnum = constraint_record.conkey[1]
    where constraint_record.contype = 'f'
      and constraint_record.confrelid = 'auth.users'::regclass
      and constraint_record.connamespace = 'public'::regnamespace
      and child_column.attname = 'user_id'
      and constraint_record.confdeltype = 'c'
    order by child.relname
  $$,
  array[
    'activity_intents',
    'activity_sessions',
    'ai_usage_events',
    'client_mutations',
    'daily_plan_items',
    'daily_plans',
    'devices',
    'habit_completions',
    'habit_schedule_weekdays',
    'habits',
    'import_batches',
    'import_entity_mappings',
    'inventory_balances',
    'inventory_events',
    'journal_entries',
    'milestone_grants',
    'morning_attempts',
    'morning_checks',
    'profiles',
    'reward_ledger',
    'task_completions',
    'tasks',
    'user_settings'
  ]::name[],
  'all 23 application-data tables retain a direct user_id ON DELETE CASCADE'
);

select is(
  (select count(*)::integer from information_schema.triggers
   where trigger_schema = 'public' and event_manipulation = 'DELETE'),
  0,
  'application tables have no delete trigger with additional side effects'
);
select is((select count(*)::integer from storage.buckets), 0, 'the repository defines no Supabase Storage bucket');
select is((select count(*)::integer from storage.objects), 0, 'the isolated schema has no Supabase Storage object');

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values
  ('91000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'delete-fixture-a@example.test', '', now(), now(), now()),
  ('92000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'delete-fixture-b@example.test', '', now(), now(), now());

insert into public.profiles (user_id, timezone) values
  ('91000000-0000-4000-8000-000000000001', 'UTC'),
  ('92000000-0000-4000-8000-000000000002', 'UTC');
insert into public.devices (id, user_id, platform) values
  ('91100000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'ios'),
  ('92200000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000002', 'ios');
insert into public.import_batches (id, user_id, device_id, choice, snapshot_sha256) values
  ('91110000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', '91100000-0000-4000-8000-000000000001', 'import_local', repeat('a', 64)),
  ('92210000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000002', '92200000-0000-4000-8000-000000000002', 'import_local', repeat('b', 64));
insert into public.import_entity_mappings (
  user_id, import_batch_id, entity_type, local_id, cloud_id, payload_sha256
) values
  ('91000000-0000-4000-8000-000000000001', '91110000-0000-4000-8000-000000000001', 'task', 'fixture-a-task', '91120000-0000-4000-8000-000000000001', repeat('c', 64)),
  ('92000000-0000-4000-8000-000000000002', '92210000-0000-4000-8000-000000000002', 'task', 'fixture-b-task', '92220000-0000-4000-8000-000000000002', repeat('d', 64));
insert into public.client_mutations (user_id, device_id, mutation_id, operation, entity_type) values
  ('91000000-0000-4000-8000-000000000001', '91100000-0000-4000-8000-000000000001', '91111000-0000-4000-8000-000000000001', 'fixture', 'workspace'),
  ('92000000-0000-4000-8000-000000000002', '92200000-0000-4000-8000-000000000002', '92211000-0000-4000-8000-000000000002', 'fixture', 'workspace');

insert into public.tasks (id, user_id, title, direction, rank) values
  ('91120000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'Delete fixture A task', 'Daily Life', 'a'),
  ('92220000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000002', 'Delete fixture B task', 'Daily Life', 'a');
insert into public.task_completions (id, user_id, task_id, local_date, timezone, occurred_at) values
  ('91121000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', '91120000-0000-4000-8000-000000000001', '2026-09-27', 'UTC', now()),
  ('92221000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000002', '92220000-0000-4000-8000-000000000002', '2026-09-27', 'UTC', now());
insert into public.habits (id, user_id, title, direction, schedule_kind) values
  ('91130000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'Delete fixture A habit', 'Daily Life', 'weekdays'),
  ('92230000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000002', 'Delete fixture B habit', 'Daily Life', 'weekdays');
insert into public.habit_schedule_weekdays (id, user_id, habit_id, weekday) values
  ('91131000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', '91130000-0000-4000-8000-000000000001', 'sun'),
  ('92231000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000002', '92230000-0000-4000-8000-000000000002', 'sun');
insert into public.habit_completions (id, user_id, habit_id, local_date, timezone, occurred_at) values
  ('91132000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', '91130000-0000-4000-8000-000000000001', '2026-09-27', 'UTC', now()),
  ('92232000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000002', '92230000-0000-4000-8000-000000000002', '2026-09-27', 'UTC', now());
insert into public.activity_intents (
  id, user_id, stuck_state, direction, move_text,
  intended_duration_minutes, linked_task_id, status
) values
  ('91140000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'knows what to do but cannot start', 'Daily Life', 'Delete fixture A move', 2, '91120000-0000-4000-8000-000000000001', 'consumed'),
  ('92240000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000002', 'knows what to do but cannot start', 'Daily Life', 'Delete fixture B move', 2, '92220000-0000-4000-8000-000000000002', 'consumed');
insert into public.activity_sessions (
  id, user_id, device_id, mode, status, direction, label,
  target_duration_minutes, linked_intent_id, started_at, ended_at,
  actual_elapsed_ms, local_date, timezone
) values
  ('91141000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', '91100000-0000-4000-8000-000000000001', 'countdown', 'completed', 'Daily Life', 'Delete fixture A session', 2, '91140000-0000-4000-8000-000000000001', now() - interval '2 minutes', now(), 120000, '2026-09-27', 'UTC'),
  ('92241000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000002', '92200000-0000-4000-8000-000000000002', 'countdown', 'completed', 'Daily Life', 'Delete fixture B session', 2, '92240000-0000-4000-8000-000000000002', now() - interval '2 minutes', now(), 120000, '2026-09-27', 'UTC');

insert into public.daily_plans (id, user_id, local_date, timezone) values
  ('91150000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', '2026-09-27', 'UTC'),
  ('92250000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000002', '2026-09-27', 'UTC');
insert into public.daily_plan_items (
  id, user_id, daily_plan_id, item_group, title, first_step,
  direction, duration_minutes, position
) values
  ('91151000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', '91150000-0000-4000-8000-000000000001', 'first-move', 'Delete fixture A plan', 'Open it', 'Daily Life', 2, 0),
  ('92251000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000002', '92250000-0000-4000-8000-000000000002', 'first-move', 'Delete fixture B plan', 'Open it', 'Daily Life', 2, 0);
insert into public.journal_entries (id, user_id, local_date, timezone, free_text) values
  ('91160000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', '2026-09-27', 'UTC', 'fixture-a-private'),
  ('92260000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000002', '2026-09-27', 'UTC', 'fixture-b-private');
insert into public.morning_checks (
  id, user_id, local_date, timezone, verified_at, capture_method, verifier_mode
) values
  ('91170000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', '2026-09-27', 'UTC', now(), 'camera', 'mock'),
  ('92270000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000002', '2026-09-27', 'UTC', now(), 'camera', 'mock');
insert into public.morning_attempts (user_id, local_date, timezone, attempt_count) values
  ('91000000-0000-4000-8000-000000000001', '2026-09-27', 'UTC', 1),
  ('92000000-0000-4000-8000-000000000002', '2026-09-27', 'UTC', 1);
insert into public.reward_ledger (
  id, user_id, source_type, source_id, local_date, timezone,
  points_tenths, idempotency_key
) values
  ('91180000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'task', '91121000-0000-4000-8000-000000000001', '2026-09-27', 'UTC', 50, 'delete-fixture-a'),
  ('92280000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000002', 'task', '92221000-0000-4000-8000-000000000002', '2026-09-27', 'UTC', 50, 'delete-fixture-b');

insert into public.user_settings (user_id, selected_furniture_id) values
  ('91000000-0000-4000-8000-000000000001', 'cat-bed'),
  ('92000000-0000-4000-8000-000000000002', 'cat-bed');
insert into public.inventory_events (
  id, user_id, item_id, kind, quantity_delta, idempotency_key,
  local_date, timezone
) values
  ('91190000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'cat-food', 'correction', 1, 'delete-fixture-a-inventory', '2026-09-27', 'UTC'),
  ('92290000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000002', 'cat-food', 'correction', 1, 'delete-fixture-b-inventory', '2026-09-27', 'UTC');
insert into public.inventory_balances (user_id, item_id, quantity) values
  ('91000000-0000-4000-8000-000000000001', 'cat-food', 1),
  ('92000000-0000-4000-8000-000000000002', 'cat-food', 1);
insert into public.milestone_grants (id, user_id, milestone_day, active_day_count) values
  ('911a0000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 21, 21),
  ('922a0000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000002', 21, 21);
insert into public.ai_usage_events (
  id, user_id, request_id, request_fingerprint, feature, access_basis,
  provider, model, local_date, timezone, region_code,
  entitlement_checked_at, dispatched_at
) values
  ('911b0000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', '911b1000-0000-4000-8000-000000000001', repeat('e', 64), 'daily_plan', 'introductory', 'openai', 'gpt-5.6-luna', '2026-09-27', 'UTC', 'CH', now(), now()),
  ('922b0000-0000-4000-8000-000000000002', '92000000-0000-4000-8000-000000000002', '922b1000-0000-4000-8000-000000000002', repeat('f', 64), 'daily_plan', 'introductory', 'openai', 'gpt-5.6-luna', '2026-09-27', 'UTC', 'CH', now(), now());

create temporary table deletion_fixture_tables (table_name name primary key) on commit drop;
insert into deletion_fixture_tables (table_name) values
  ('activity_intents'),
  ('activity_sessions'),
  ('ai_usage_events'),
  ('client_mutations'),
  ('daily_plan_items'),
  ('daily_plans'),
  ('devices'),
  ('habit_completions'),
  ('habit_schedule_weekdays'),
  ('habits'),
  ('import_batches'),
  ('import_entity_mappings'),
  ('inventory_balances'),
  ('inventory_events'),
  ('journal_entries'),
  ('milestone_grants'),
  ('morning_attempts'),
  ('morning_checks'),
  ('profiles'),
  ('reward_ledger'),
  ('task_completions'),
  ('tasks'),
  ('user_settings');

create temporary table deletion_fixture_catalog_count as
select count(*)::integer as item_count from public.inventory_items;

delete from auth.users where id = '91000000-0000-4000-8000-000000000001';

select is(
  (select count(*)::integer from auth.users where id = '91000000-0000-4000-8000-000000000001'),
  0,
  'the selected fixture Auth user is deleted'
);
select is(
  (select count(*)::integer from auth.users where id = '92000000-0000-4000-8000-000000000002'),
  1,
  'the other fixture Auth user remains'
);

select results_eq(
  format(
    'select count(*)::bigint from public.%I where user_id = %L',
    table_name,
    '91000000-0000-4000-8000-000000000001'
  ),
  array[0::bigint],
  format('%s removes every row owned by the deleted fixture user', table_name)
)
from deletion_fixture_tables
order by table_name;

select results_eq(
  format(
    'select count(*)::bigint from public.%I where user_id = %L',
    table_name,
    '92000000-0000-4000-8000-000000000002'
  ),
  array[1::bigint],
  format('%s preserves the other fixture user', table_name)
)
from deletion_fixture_tables
order by table_name;

select is(
  (select count(*)::integer from public.inventory_items),
  (select item_count from deletion_fixture_catalog_count),
  'deleting an account preserves the shared inventory catalog'
);
select ok(
  exists (select 1 from public.valid_timezones where name = 'UTC'),
  'deleting an account preserves the shared timezone catalog'
);

select * from finish();
rollback;
