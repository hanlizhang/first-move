begin;
create extension if not exists pgtap with schema extensions;

select plan(48);

select has_function(
  'public',
  'purchase_inventory_item',
  array['text', 'uuid', 'date', 'text'],
  'Cat v1 reuses the existing purchase RPC signature'
);
select has_function(
  'public',
  'grant_earned_milestones',
  array['date', 'text'],
  'Cat v1 reuses the existing milestone RPC signature'
);

select results_eq(
  $$
    select
      id, name, kind, price_tenths, unlock_active_days,
      purchase_quantity, durable, milestone_only, active
    from public.inventory_items
    where id in (
      'wet-kitten-food', 'freeze-dried-treat', 'toy-mouse',
      'scratching-post', 'cat-tree'
    )
    order by id
  $$,
  $$
    select *
    from (values
      ('cat-tree'::text, 'Cat tree'::text, 'furniture'::text, 3000, 75, 1, true, false, true),
      ('freeze-dried-treat', 'Freeze-dried treat', 'food', 150, 50, 1, false, false, true),
      ('scratching-post', 'Scratching post', 'furniture', 800, 21, 1, true, false, true),
      ('toy-mouse', 'Toy mouse', 'toy', 350, 14, 1, true, false, true),
      ('wet-kitten-food', 'Wet kitten food', 'food', 100, 21, 1, false, false, true)
    ) as expected(
      id, name, kind, price_tenths, unlock_active_days,
      purchase_quantity, durable, milestone_only, active
    )
    order by id
  $$,
  'all five new catalog rows have the approved exact values'
);

select results_eq(
  $$
    select
      id, name, kind, price_tenths, unlock_active_days,
      purchase_quantity, durable, milestone_only, active
    from public.inventory_items
    where id in (
      'kitten-milk', 'cat-food', 'yarn-toy', 'teaser-wand', 'cat-treat',
      'high-five', 'paw-shake', 'outdoor-garden', 'butterfly',
      'cat-bed', 'window-cushion'
    )
    order by id
  $$,
  $$
    select *
    from (values
      ('butterfly'::text, 'Butterfly'::text, 'interaction'::text, 0, 100, 1, true, true, true),
      ('cat-bed', 'Cat bed', 'furniture', 1000, 50, 1, true, false, true),
      ('cat-food', 'Cat food', 'food', 100, 35, 1, false, false, true),
      ('cat-treat', 'Soft cat treat', 'food', 200, 50, 1, false, false, true),
      ('high-five', 'High-five', 'trick', 800, 50, 1, true, false, true),
      ('kitten-milk', 'Kitten milk', 'food', 50, 1, 1, false, false, true),
      ('outdoor-garden', 'Outdoor garden', 'scene', 0, 100, 1, true, true, true),
      ('paw-shake', 'Paw shake', 'trick', 1200, 100, 1, true, false, true),
      ('teaser-wand', 'Teaser wand', 'toy', 400, 7, 1, true, false, true),
      ('window-cushion', 'Window perch', 'furniture', 1400, 70, 1, true, false, true),
      ('yarn-toy', 'Yarn ball', 'toy', 250, 3, 1, true, false, true)
    ) as expected(
      id, name, kind, price_tenths, unlock_active_days,
      purchase_quantity, durable, milestone_only, active
    )
    order by id
  $$,
  'all retained stable IDs have the approved exact values'
);

select is(
  (select count(*)::integer from public.inventory_items),
  16,
  'the smaller Cat v1 catalog contains exactly sixteen rows'
);
select results_eq(
  $$
    select id, name, price_tenths, unlock_active_days, active
    from public.inventory_items
    where id in ('cat-bed', 'window-cushion')
    order by id
  $$,
  $$values
    ('cat-bed'::text, 'Cat bed'::text, 1000, 50, true),
    ('window-cushion', 'Window perch', 1400, 70, true)
  $$,
  'existing cat-bed and window-cushion rows are activated and repriced in place'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values
  ('a1000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cat-catalog-a@example.test', '', now(), now(), now()),
  ('b1000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cat-catalog-b@example.test', '', now(), now(), now()),
  ('c1000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cat-catalog-history@example.test', '', now(), now(), now()),
  ('d1000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cat-catalog-milestone@example.test', '', now(), now(), now());

-- Owner A can exercise every unlocked purchase and the sync-based consumption
-- contract. Owner B remains below the first new durable unlock. Owner C models
-- a pre-migration day-21 grant, and owner D models a future ungranted day 21.
insert into public.journal_entries (id, user_id, local_date, timezone, what_helped)
select gen_random_uuid(), 'a1000000-0000-4000-8000-000000000001', date '2026-01-01' + day_offset, 'UTC', 'Owner A active-day fixture'
from generate_series(0, 99) as days(day_offset);
insert into public.journal_entries (id, user_id, local_date, timezone, what_helped)
values (gen_random_uuid(), 'b1000000-0000-4000-8000-000000000002', '2026-01-01', 'UTC', 'Owner B active-day fixture');
insert into public.journal_entries (id, user_id, local_date, timezone, what_helped)
select gen_random_uuid(), 'c1000000-0000-4000-8000-000000000003', date '2026-01-01' + day_offset, 'UTC', 'Historical owner active-day fixture'
from generate_series(0, 99) as days(day_offset);
insert into public.journal_entries (id, user_id, local_date, timezone, what_helped)
select gen_random_uuid(), 'd1000000-0000-4000-8000-000000000004', date '2026-01-01' + day_offset, 'UTC', 'Future milestone active-day fixture'
from generate_series(0, 20) as days(day_offset);

insert into public.reward_ledger (
  id, user_id, source_type, local_date, timezone,
  points_tenths, idempotency_key
) values
  (gen_random_uuid(), 'a1000000-0000-4000-8000-000000000001', 'correction', '2026-04-10', 'UTC', 10000, 'fixture:cat-catalog-a-funds'),
  (gen_random_uuid(), 'b1000000-0000-4000-8000-000000000002', 'correction', '2026-01-01', 'UTC', 10000, 'fixture:cat-catalog-b-funds');

-- This is the old day-21 shape: ten cat-food servings plus a historical
-- cat-food purchase/debit. The forward migration must not rewrite either.
insert into public.milestone_grants (user_id, milestone_day, active_day_count)
values ('c1000000-0000-4000-8000-000000000003', 21, 21);
insert into public.reward_ledger (
  id, user_id, source_type, source_id, local_date, timezone,
  points_tenths, idempotency_key
) values (
  gen_random_uuid(),
  'c1000000-0000-4000-8000-000000000003',
  'purchase',
  'c2000000-0000-4000-8000-000000000001',
  '2026-01-21',
  'UTC',
  -100,
  'purchase:c2000000-0000-4000-8000-000000000001'
);
insert into public.inventory_events (
  id, user_id, item_id, kind, quantity_delta,
  idempotency_key, local_date, timezone
) values
  (gen_random_uuid(), 'c1000000-0000-4000-8000-000000000003', 'cat-food', 'milestone_grant', 10, 'milestone:21:cat-food', '2026-01-21', 'UTC'),
  (gen_random_uuid(), 'c1000000-0000-4000-8000-000000000003', 'cat-food', 'purchase', 1, 'purchase:c2000000-0000-4000-8000-000000000001', '2026-01-21', 'UTC');
insert into public.inventory_balances (user_id, item_id, quantity)
values ('c1000000-0000-4000-8000-000000000003', 'cat-food', 11);

-- Owners A and B use the existing initialized-workspace and
-- selected-furniture validation paths without adding a Cat-specific RPC.
-- Owner B's historical scratching-post balance deliberately predates its
-- current day-21 threshold: unlock timing gates new purchases, not continued
-- use of an already-owned durable.
insert into public.devices (id, user_id, platform) values
  ('a4000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'web'),
  ('b4000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', 'web');
insert into public.import_batches (
  id, user_id, device_id, choice, status, snapshot_sha256,
  completed_at, verified_at
) values
  (
    'a5000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'a4000000-0000-4000-8000-000000000001',
    'start_fresh',
    'completed',
    repeat('a', 64),
    now(),
    now()
  ),
  (
    'b5000000-0000-4000-8000-000000000002',
    'b1000000-0000-4000-8000-000000000002',
    'b4000000-0000-4000-8000-000000000002',
    'start_fresh',
    'completed',
    repeat('b', 64),
    now(),
    now()
  );
insert into public.inventory_balances (user_id, item_id, quantity)
values ('b1000000-0000-4000-8000-000000000002', 'scratching-post', 1);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000002', true);

select is(
  (select count(*)::integer from public.inventory_items),
  16,
  'authenticated owners can read the complete reference catalog'
);
select throws_ok(
  $$select public.purchase_inventory_item('toy-mouse', 'b2000000-0000-4000-8000-000000000001', '2026-01-01', 'UTC')$$,
  'P0001',
  'item_locked',
  'a new item cannot be purchased before its active-day unlock'
);
select lives_ok(
  $$
    select public.sync_cloud_workspace_v1(
      'b3000000-0000-4000-8000-000000000001',
      'b4000000-0000-4000-8000-000000000002',
      'UTC',
      '{
        "schemaVersion":8,
        "tasks":[],
        "habits":[],
        "activityIntents":[],
        "sessions":[],
        "morningAttempts":[],
        "morningChecks":[],
        "journalEntries":[],
        "inventory":{"items":[],"selectedFurnitureId":"scratching-post"},
        "progress":{}
      }'::jsonb,
      '[]'::jsonb,
      '{"purchases":[],"consumptions":[]}'::jsonb
    )
  $$,
  'an already-owned durable remains selectable below its current unlock threshold'
);
select is(
  (select selected_furniture_id from public.user_settings),
  'scratching-post',
  'continued durable use depends on ownership rather than current active days'
);

select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$select public.purchase_inventory_item('cat-tree', 'c2000000-0000-4000-8000-000000000002', '2026-04-10', 'UTC')$$,
  'P0001',
  'insufficient_points',
  'insufficient balance remains rejected for an unlocked new item'
);

select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.purchase_inventory_item('cat-tree', 'a2000000-0000-4000-8000-000000000001', '2026-04-10', 'UTC')$$,
  'an unlocked durable furniture item can be purchased once'
);
select throws_ok(
  $$select public.purchase_inventory_item('cat-tree', 'a2000000-0000-4000-8000-000000000002', '2026-04-10', 'UTC')$$,
  'P0001',
  'already_owned',
  'a durable item cannot be purchased twice with distinct mutations'
);
select is(
  (select quantity from public.inventory_balances where item_id = 'cat-tree'),
  1,
  'the durable item balance stays at one'
);
select is(
  (select count(*)::integer from public.reward_ledger where source_type = 'purchase' and idempotency_key like 'purchase:a2%'),
  1,
  'the rejected second durable purchase creates no second debit'
);

select lives_ok(
  $$select public.purchase_inventory_item('freeze-dried-treat', 'a2000000-0000-4000-8000-000000000003', '2026-04-10', 'UTC')$$,
  'the new consumable can be purchased'
);
select lives_ok(
  $$select public.purchase_inventory_item('freeze-dried-treat', 'a2000000-0000-4000-8000-000000000004', '2026-04-10', 'UTC')$$,
  'the new consumable can be purchased repeatedly'
);
select is(
  (select quantity from public.inventory_balances where item_id = 'freeze-dried-treat'),
  2,
  'repeated consumable purchases add one serving each'
);
select lives_ok(
  $$select public.purchase_inventory_item('wet-kitten-food', 'a2000000-0000-4000-8000-000000000005', '2026-04-10', 'UTC')$$,
  'wet kitten food uses the generic purchase contract'
);
select lives_ok(
  $$
    select public.sync_cloud_workspace_v1(
      'a3000000-0000-4000-8000-000000000001',
      'a4000000-0000-4000-8000-000000000001',
      'UTC',
      '{
        "schemaVersion":8,
        "tasks":[],
        "habits":[],
        "activityIntents":[],
        "sessions":[],
        "morningAttempts":[],
        "morningChecks":[],
        "journalEntries":[],
        "inventory":{"items":[],"selectedFurnitureId":"cat-tree"},
        "progress":{}
      }'::jsonb,
      '[]'::jsonb,
      '{"purchases":[],"consumptions":[{"itemId":"wet-kitten-food","quantity":1,"localDate":"2026-04-10"}]}'::jsonb
    )
  $$,
  'wet kitten food uses the existing sync-based consumption contract'
);
select is(
  (select quantity from public.inventory_balances where item_id = 'wet-kitten-food'),
  0,
  'consuming wet kitten food decrements its balance'
);
select is(
  (select quantity_delta from public.inventory_events where item_id = 'wet-kitten-food' and kind = 'consume'),
  -1,
  'wet kitten food consumption writes the canonical negative inventory event'
);
select is(
  (select selected_furniture_id from public.user_settings),
  'cat-tree',
  'new furniture reuses selected-furniture ownership validation'
);

select set_config('request.jwt.claim.sub', 'd1000000-0000-4000-8000-000000000004', true);
select results_eq(
  $$select milestone_day, newly_granted from public.grant_earned_milestones('2026-01-21', 'UTC')$$,
  $$values (21, true)$$,
  'a future ungranted day-21 milestone is granted once'
);
select is(
  (select count(*)::integer from public.milestone_grants where milestone_day = 21),
  1,
  'the future owner receives one day-21 milestone row'
);
select is(
  (select quantity from public.inventory_balances where item_id = 'wet-kitten-food'),
  10,
  'the future day-21 milestone grants exactly ten wet-food servings'
);
select results_eq(
  $$
    select item_id, kind::text, quantity_delta, idempotency_key
    from public.inventory_events
    where kind = 'milestone_grant'
  $$,
  $$values ('wet-kitten-food'::text, 'milestone_grant'::text, 10, 'milestone:21:wet-kitten-food'::text)$$,
  'the future grant records the new stable wet-food idempotency key'
);
select is(
  (select count(*)::integer from public.inventory_events where item_id = 'cat-food'),
  0,
  'a future day-21 grant creates no cat-food event'
);
select is(
  (select count(*)::integer from public.inventory_balances where item_id = 'cat-food'),
  0,
  'a future day-21 grant creates no cat-food balance'
);
select results_eq(
  $$select milestone_day, newly_granted from public.grant_earned_milestones('2026-01-21', 'UTC')$$,
  $$values (21, false)$$,
  'retry reports that day 21 was already granted'
);
select is(
  (select quantity from public.inventory_balances where item_id = 'wet-kitten-food'),
  10,
  'retry cannot duplicate the ten wet-food servings'
);
select is(
  (select count(*)::integer from public.inventory_events where idempotency_key = 'milestone:21:wet-kitten-food'),
  1,
  'retry cannot duplicate the wet-food milestone event'
);

select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000003', true);
select results_eq(
  $$select milestone_day, newly_granted from public.grant_earned_milestones('2026-04-10', 'UTC') order by milestone_day$$,
  $$values (21, false), (50, true), (100, true)$$,
  'a historical day-21 owner receives only the still-ungranted later milestones'
);
select is(
  (select count(*)::integer from public.inventory_events where item_id = 'wet-kitten-food'),
  0,
  'a historical day-21 owner receives no wet-food backfill event'
);
select is(
  (select count(*)::integer from public.inventory_balances where item_id = 'wet-kitten-food'),
  0,
  'a historical day-21 owner receives no wet-food backfill balance'
);
select results_eq(
  $$
    select idempotency_key, quantity_delta
    from public.inventory_events
    where item_id = 'cat-food'
    order by idempotency_key
  $$,
  $$values
    ('milestone:21:cat-food'::text, 10),
    ('purchase:c2000000-0000-4000-8000-000000000001', 1)
  $$,
  'historical cat-food inventory events remain unchanged and valid'
);
select is(
  (select quantity from public.inventory_balances where item_id = 'cat-food'),
  11,
  'historical cat-food balance remains unchanged'
);
select results_eq(
  $$
    select source_type, source_id, points_tenths, idempotency_key
    from public.reward_ledger
    where idempotency_key = 'purchase:c2000000-0000-4000-8000-000000000001'
  $$,
  $$values
    ('purchase'::text, 'c2000000-0000-4000-8000-000000000001'::uuid, -100, 'purchase:c2000000-0000-4000-8000-000000000001'::text)
  $$,
  'historical cat-food reward ledger debit remains unchanged and valid'
);
select is(
  (select quantity from public.inventory_balances where item_id = 'cat-treat'),
  10,
  'day 50 still grants exactly ten cat-treat servings'
);
select results_eq(
  $$
    select item_id, quantity
    from public.inventory_balances
    where item_id in ('butterfly', 'outdoor-garden')
    order by item_id
  $$,
  $$values
    ('butterfly'::text, 1),
    ('outdoor-garden', 1)
  $$,
  'day 100 still grants the garden and butterfly once'
);
select results_eq(
  $$
    select item_id, quantity_delta, idempotency_key
    from public.inventory_events
    where idempotency_key in (
      'milestone:50:cat-treat',
      'milestone:100:garden',
      'milestone:100:butterfly'
    )
    order by idempotency_key
  $$,
  $$values
    ('butterfly'::text, 1, 'milestone:100:butterfly'::text),
    ('outdoor-garden', 1, 'milestone:100:garden'),
    ('cat-treat', 10, 'milestone:50:cat-treat')
  $$,
  'day-50 and day-100 inventory event keys and quantities are unchanged'
);
select is(
  (select count(*)::integer from public.milestone_grants),
  3,
  'historical and newly earned milestone rows remain one per threshold'
);
select results_eq(
  $$select milestone_day, newly_granted from public.grant_earned_milestones('2026-04-10', 'UTC') order by milestone_day$$,
  $$values (21, false), (50, false), (100, false)$$,
  'retry reports every historical owner milestone as already granted'
);
select is(
  (
    select count(*)::integer
    from public.inventory_events
    where idempotency_key in (
      'milestone:50:cat-treat',
      'milestone:100:garden',
      'milestone:100:butterfly'
    )
  ),
  3,
  'retry cannot duplicate unchanged day-50 or day-100 events'
);

select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000002', true);
select is(
  (select count(*)::integer from public.inventory_events where user_id = 'c1000000-0000-4000-8000-000000000003'),
  0,
  'owner B cannot read owner C inventory events'
);
select is(
  (select count(*)::integer from public.inventory_balances where user_id = 'c1000000-0000-4000-8000-000000000003'),
  0,
  'owner B cannot read owner C inventory balances'
);
select is(
  (select count(*)::integer from public.milestone_grants where user_id = 'c1000000-0000-4000-8000-000000000003'),
  0,
  'owner B cannot read owner C milestone grants'
);
select is(
  (select count(*)::integer from public.reward_ledger where user_id = 'c1000000-0000-4000-8000-000000000003'),
  0,
  'owner B cannot read owner C reward ledger rows'
);

reset role;
select * from finish();
rollback;
