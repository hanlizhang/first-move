begin;
create extension if not exists pgtap with schema extensions;

select plan(42);

select has_function(
  'public', 'sync_cloud_workspace_v1',
  array['uuid', 'uuid', 'text', 'jsonb', 'jsonb', 'jsonb'],
  'continuous workspace sync RPC exists'
);
select is(
  has_function_privilege('authenticated', 'public.sync_cloud_workspace_v1(uuid,uuid,text,jsonb,jsonb,jsonb)', 'EXECUTE'),
  true,
  'authenticated users may execute the owner-derived sync RPC'
);
select is(
  has_function_privilege('anon', 'public.sync_cloud_workspace_v1(uuid,uuid,text,jsonb,jsonb,jsonb)', 'EXECUTE'),
  false,
  'anonymous users cannot execute the sync RPC'
);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('80000000-0000-4000-8000-000000000008', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sync-a@example.test', '', now(), now(), now()),
  ('90000000-0000-4000-8000-000000000009', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sync-b@example.test', '', now(), now(), now());

create temporary table sync_fixture (state jsonb not null, plans jsonb not null);
insert into sync_fixture values (
  '{
    "schemaVersion":8,
    "tasks":[{"id":"81000000-0000-4000-8000-000000000008","title":"Owner task","direction":"Daily Life","order":0,"createdAt":"2026-07-31T08:00:00Z","updatedAt":"2026-07-31T08:00:00Z","completedOn":["2026-07-31"]}],
    "habits":[{"id":"82000000-0000-4000-8000-000000000008","title":"Owner habit","direction":"Exercise & Movement","schedule":{"kind":"weekdays","weekdays":["fri"]},"createdAt":"2026-07-31T08:00:00Z","updatedAt":"2026-07-31T08:00:00Z","completedOn":["2026-07-31"]}],
    "activityIntents":[{"id":"83000000-0000-4000-8000-000000000008","stuckState":"unsure what is needed","direction":"Rest","moveText":"Take one breath","intendedDurationMinutes":2,"createdAt":"2026-07-31T08:30:00Z","status":"pending"}],
    "sessions":[{"id":"84000000-0000-4000-8000-000000000008","mode":"countdown","direction":"Daily Life","label":"Owner session","targetDurationMinutes":2,"linkedTaskId":"81000000-0000-4000-8000-000000000008","status":"completed","startedAt":"2026-07-31T09:00:00Z","accumulatedElapsedMs":120000,"endedAt":"2026-07-31T09:02:00Z","actualElapsedMs":120000,"reviewedAt":"2026-07-31T09:03:00Z"}],
    "rewardEvents":[{"id":"forged","source":"task","sourceId":"forged","dateKey":"2026-07-31","points":999,"createdAt":"2026-07-31T09:00:00Z"}],
    "journalEntries":[{"dateKey":"2026-07-31","whatHelped":"private sync fixture","updatedAt":"2026-07-31T20:00:00Z"}],
    "morningChecks":[{"dateKey":"2026-07-31","verifiedAt":"2026-07-31T07:00:00Z","captureMethod":"camera","verifierMode":"mock"}],
    "morningAttempts":[{"dateKey":"2026-07-31","count":1}],
    "inventory":{"items":[]},
    "progress":{"points":999,"activeDateKeys":["2026-07-31"],"unlockedMilestones":[],"grantedMilestones":[],"firstUseDate":"2026-07-31","lastActiveDate":"2026-07-31","journeyDay":1,"totalActiveDays":1,"gentleStreak":1}
  }'::jsonb,
  '[{"dateKey":"2026-07-31","items":[{"id":"local-first-move","group":"first-move","title":"Owner plan","firstStep":"Open the page","category":"Daily Life","durationMinutes":2}]}]'::jsonb
);
grant select on sync_fixture to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '', true);

select throws_ok(
  $$select public.sync_cloud_workspace_v1(
    gen_random_uuid(), gen_random_uuid(), 'UTC',
    '{"schemaVersion":8}'::jsonb, '[]'::jsonb, '{}'::jsonb
  )$$,
  '42501', 'not_authenticated', 'sync rejects unauthenticated access'
);

select set_config('request.jwt.claim.sub', '80000000-0000-4000-8000-000000000008', true);
select lives_ok(
  $$select public.initialize_cloud_workspace_v2(
    'start_fresh', '88000000-0000-4000-8000-000000000008', repeat('8', 64), 8, 'Europe/Berlin', '{}'::jsonb
  )$$,
  'owner A initializes its workspace'
);
select lives_ok(
  $$select public.sync_cloud_workspace_v1(
    '88100000-0000-4000-8000-000000000008', '88000000-0000-4000-8000-000000000008', 'Europe/Berlin',
    (select state from sync_fixture), (select plans from sync_fixture),
    '{"purchases":[],"consumptions":[]}'::jsonb
  )$$,
  'one atomic snapshot syncs all core records'
);

select is((select count(*)::integer from public.tasks where deleted_at is null), 1, 'task syncs');
select is((select count(*)::integer from public.task_completions where deleted_at is null), 1, 'task completion syncs');
select is((select count(*)::integer from public.habits where deleted_at is null), 1, 'habit syncs');
select is((select count(*)::integer from public.habit_schedule_weekdays where deleted_at is null), 1, 'habit schedule syncs');
select is((select count(*)::integer from public.habit_completions where deleted_at is null), 1, 'habit completion syncs');
select is((select count(*)::integer from public.activity_intents where deleted_at is null), 1, 'pending intent syncs');
select is((select count(*)::integer from public.activity_sessions where deleted_at is null), 1, 'session syncs');
select is((select count(*)::integer from public.daily_plans where deleted_at is null), 1, 'daily plan syncs');
select is((select count(*)::integer from public.daily_plan_items where deleted_at is null), 1, 'daily plan item syncs');
select is((select what_helped from public.journal_entries where deleted_at is null), 'private sync fixture', 'private journal syncs');
select is((select attempt_count::integer from public.morning_attempts), 1, 'morning attempt count syncs');
select is((select count(*)::integer from public.morning_checks), 1, 'morning check metadata syncs');
select is((select count(*)::integer from public.reward_ledger), 5, 'server derives one reward for each eligible source');
select is((select coalesce(sum(points_tenths), 0) from public.reward_ledger), 152::bigint, 'server ignores the forged client total and derives 15.2 points');
select is((select count(*)::integer from public.active_days), 1, 'active days are derived from canonical rows');

select lives_ok(
  $$select public.sync_cloud_workspace_v1(
    '88100000-0000-4000-8000-000000000008', '88000000-0000-4000-8000-000000000008', 'Europe/Berlin',
    (select state from sync_fixture), (select plans from sync_fixture),
    '{"purchases":[],"consumptions":[]}'::jsonb
  )$$,
  'retrying the same workspace mutation is idempotent'
);
select is((select count(*)::integer from public.reward_ledger), 5, 'reward retry does not duplicate points');
select is((select count(*)::integer from public.client_mutations), 1, 'retry reuses one mutation receipt');

select lives_ok(
  $$select public.sync_cloud_workspace_v1(
    '88200000-0000-4000-8000-000000000008', '88000000-0000-4000-8000-000000000008', 'Europe/Berlin',
    jsonb_set((select state from sync_fixture), '{tasks,0,title}', '"Edited task"'::jsonb),
    (select plans from sync_fixture), '{"purchases":[],"consumptions":[]}'::jsonb
  )$$,
  'mutable task update succeeds'
);
select is((select title from public.tasks where id = '81000000-0000-4000-8000-000000000008'), 'Edited task', 'task uses last-write-wins update');

select lives_ok(
  $$select public.sync_cloud_workspace_v1(
    '88300000-0000-4000-8000-000000000008', '88000000-0000-4000-8000-000000000008', 'Europe/Berlin',
    jsonb_set((select state from sync_fixture), '{tasks}', '[]'::jsonb),
    (select plans from sync_fixture), '{"purchases":[],"consumptions":[]}'::jsonb
  )$$,
  'removing a task creates a soft deletion'
);
select isnt((select deleted_at from public.tasks where id = '81000000-0000-4000-8000-000000000008'), null, 'task is tombstoned');
select is((select count(*)::integer from public.reward_ledger where source_type = 'task'), 1, 'soft deletion never revokes or duplicates its reward');

select lives_ok(
  $$select public.sync_cloud_workspace_v1(
    '88400000-0000-4000-8000-000000000008', '88000000-0000-4000-8000-000000000008', 'Europe/Berlin',
    (select state from sync_fixture), (select plans from sync_fixture),
    '{"purchases":[{"mutationId":"88500000-0000-4000-8000-000000000008","itemId":"kitten-milk","localDate":"2026-07-31"}],"consumptions":[]}'::jsonb
  )$$,
  'trusted purchase command succeeds'
);
select is((select quantity from public.inventory_balances where item_id = 'kitten-milk'), 1, 'purchase adds canonical inventory once');
select is((select coalesce(sum(points_tenths), 0) from public.reward_ledger), 102::bigint, 'purchase deducts points through the append-only ledger');

select lives_ok(
  $$select public.sync_cloud_workspace_v1(
    '88600000-0000-4000-8000-000000000008', '88700000-0000-4000-8000-000000000008', 'Europe/Berlin',
    (select state from sync_fixture), (select plans from sync_fixture),
    '{"purchases":[{"mutationId":"88500000-0000-4000-8000-000000000008","itemId":"kitten-milk","localDate":"2026-07-31"}],"consumptions":[]}'::jsonb
  )$$,
  'the same purchase command from a second device is idempotent'
);
select is((select quantity from public.inventory_balances where item_id = 'kitten-milk'), 1, 'purchase retry does not duplicate inventory');
select is((select count(*)::integer from public.reward_ledger where source_type = 'purchase'), 1, 'purchase retry does not duplicate its debit');

select lives_ok(
  $$select public.sync_cloud_workspace_v1(
    '88800000-0000-4000-8000-000000000008', '88000000-0000-4000-8000-000000000008', 'Europe/Berlin',
    (select state from sync_fixture), (select plans from sync_fixture),
    '{"purchases":[],"consumptions":[{"itemId":"kitten-milk","quantity":1,"localDate":"2026-07-31"}]}'::jsonb
  )$$,
  'trusted inventory consumption succeeds'
);
select is((select quantity from public.inventory_balances where item_id = 'kitten-milk'), 0, 'consumption updates canonical inventory');
select lives_ok(
  $$select public.sync_cloud_workspace_v1(
    '88800000-0000-4000-8000-000000000008', '88000000-0000-4000-8000-000000000008', 'Europe/Berlin',
    (select state from sync_fixture), (select plans from sync_fixture),
    '{"purchases":[],"consumptions":[{"itemId":"kitten-milk","quantity":1,"localDate":"2026-07-31"}]}'::jsonb
  )$$,
  'inventory consumption retry is idempotent'
);
select is((select count(*)::integer from public.inventory_events where kind = 'consume'), 1, 'consumption retry adds one inventory event');

select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000009', true);
select lives_ok(
  $$select public.initialize_cloud_workspace_v2(
    'start_fresh', '99000000-0000-4000-8000-000000000009', repeat('9', 64), 8, 'Europe/Berlin', '{}'::jsonb
  )$$,
  'owner B initializes its workspace'
);
select throws_ok(
  $$select public.sync_cloud_workspace_v1(
    '99100000-0000-4000-8000-000000000009', '99000000-0000-4000-8000-000000000009', 'Europe/Berlin',
    (select state from sync_fixture), (select plans from sync_fixture),
    '{"purchases":[],"consumptions":[]}'::jsonb
  )$$,
  '42501', 'task_not_owned', 'owner B cannot overwrite owner A task IDs'
);
select is((select count(*)::integer from public.journal_entries), 0, 'owner B cannot read owner A journal');

reset role;
select * from finish();
rollback;
