-- First Move: proposed initial Supabase schema.
-- Design artifact only; do not execute until product scope and security review are approved.

create extension if not exists pgcrypto;

create type public.direction as enum ('Work & Study', 'Daily Life', 'Exercise & Movement', 'Intentional Entertainment', 'Rest');
create type public.weekday as enum ('sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat');
create type public.session_mode as enum ('countdown', 'stopwatch');
create type public.session_status as enum ('running', 'paused', 'completed', 'stopped');
create type public.intent_status as enum ('pending', 'consumed', 'cancelled');
create type public.import_choice as enum ('start_fresh', 'import_local');
create type public.import_status as enum ('pending', 'running', 'completed', 'failed');
create type public.inventory_event_kind as enum ('purchase', 'consume', 'milestone_grant', 'correction');

create function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = transaction_timestamp();
  new.version = old.version + 1;
  return new;
end;
$$;

create function public.valid_timezone(value text)
returns boolean language sql stable set search_path = '' as $$
  select exists (select 1 from pg_catalog.pg_timezone_names where name = value);
$$;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  timezone text not null default 'UTC' check (public.valid_timezone(timezone)),
  first_use_local_date date,
  created_at timestamptz not null default transaction_timestamp(),
  updated_at timestamptz not null default transaction_timestamp(),
  version bigint not null default 1 check (version > 0)
);

create table public.devices (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('web', 'ios', 'android')),
  display_name text check (char_length(display_name) <= 100),
  last_pull_cursor bigint not null default 0 check (last_pull_cursor >= 0),
  last_seen_at timestamptz not null default transaction_timestamp(),
  created_at timestamptz not null default transaction_timestamp(),
  updated_at timestamptz not null default transaction_timestamp(),
  version bigint not null default 1 check (version > 0),
  deleted_at timestamptz,
  unique (user_id, id)
);

create table public.import_batches (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null,
  choice public.import_choice not null,
  status public.import_status not null default 'pending',
  source_schema_version integer,
  source_timezone text check (source_timezone is null or public.valid_timezone(source_timezone)),
  record_counts jsonb not null default '{}'::jsonb check (jsonb_typeof(record_counts) = 'object'),
  error_code text,
  created_at timestamptz not null default transaction_timestamp(),
  completed_at timestamptz,
  unique (user_id, id),
  foreign key (user_id, device_id) references public.devices(user_id, id)
);

create table public.client_mutations (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null,
  mutation_id uuid not null,
  operation text not null,
  entity_type text not null,
  entity_id uuid,
  result jsonb,
  created_at timestamptz not null default transaction_timestamp(),
  primary key (user_id, device_id, mutation_id),
  foreign key (user_id, device_id) references public.devices(user_id, id)
);

create table public.tasks (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  direction public.direction not null,
  rank text not null check (char_length(rank) between 1 and 64),
  created_at timestamptz not null default transaction_timestamp(),
  updated_at timestamptz not null default transaction_timestamp(),
  version bigint not null default 1 check (version > 0),
  deleted_at timestamptz,
  unique (user_id, id)
);

create table public.task_completions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null,
  local_date date not null,
  timezone text not null check (public.valid_timezone(timezone)),
  occurred_at timestamptz not null,
  created_at timestamptz not null default transaction_timestamp(),
  updated_at timestamptz not null default transaction_timestamp(),
  version bigint not null default 1 check (version > 0),
  deleted_at timestamptz,
  unique (user_id, task_id, local_date),
  foreign key (user_id, task_id) references public.tasks(user_id, id)
);

create table public.habits (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  direction public.direction not null,
  schedule_kind text not null check (schedule_kind in ('daily', 'weekdays')),
  created_at timestamptz not null default transaction_timestamp(),
  updated_at timestamptz not null default transaction_timestamp(),
  version bigint not null default 1 check (version > 0),
  deleted_at timestamptz,
  unique (user_id, id)
);

create table public.habit_schedule_weekdays (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  habit_id uuid not null,
  weekday public.weekday not null,
  created_at timestamptz not null default transaction_timestamp(),
  updated_at timestamptz not null default transaction_timestamp(),
  version bigint not null default 1 check (version > 0),
  deleted_at timestamptz,
  unique (user_id, habit_id, weekday),
  foreign key (user_id, habit_id) references public.habits(user_id, id)
);

create table public.habit_completions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  habit_id uuid not null,
  local_date date not null,
  timezone text not null check (public.valid_timezone(timezone)),
  occurred_at timestamptz not null,
  created_at timestamptz not null default transaction_timestamp(),
  updated_at timestamptz not null default transaction_timestamp(),
  version bigint not null default 1 check (version > 0),
  deleted_at timestamptz,
  unique (user_id, habit_id, local_date),
  foreign key (user_id, habit_id) references public.habits(user_id, id)
);

create table public.activity_intents (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  stuck_state text not null check (stuck_state in ('scrolling and unable to stop', 'in bed and unable to get up', 'knows what to do but cannot start', 'overwhelmed by a large task', 'needs intentional rest', 'unsure what is needed')),
  direction public.direction not null,
  move_text text not null check (char_length(btrim(move_text)) between 1 and 160),
  intended_duration_minutes integer not null check (intended_duration_minutes in (2, 5, 10, 25)),
  linked_task_id uuid,
  linked_habit_id uuid,
  status public.intent_status not null default 'pending',
  created_at timestamptz not null default transaction_timestamp(),
  updated_at timestamptz not null default transaction_timestamp(),
  version bigint not null default 1 check (version > 0),
  deleted_at timestamptz,
  unique (user_id, id),
  check (num_nonnulls(linked_task_id, linked_habit_id) <= 1),
  foreign key (user_id, linked_task_id) references public.tasks(user_id, id),
  foreign key (user_id, linked_habit_id) references public.habits(user_id, id)
);

create table public.activity_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null,
  mode public.session_mode not null,
  status public.session_status not null,
  direction public.direction not null,
  label text not null check (char_length(btrim(label)) between 1 and 160),
  target_duration_minutes integer check (target_duration_minutes between 1 and 720),
  linked_task_id uuid,
  linked_habit_id uuid,
  linked_intent_id uuid,
  started_at timestamptz not null,
  last_resumed_at timestamptz,
  accumulated_elapsed_ms bigint not null default 0 check (accumulated_elapsed_ms >= 0),
  ended_at timestamptz,
  actual_elapsed_ms bigint check (actual_elapsed_ms >= 0),
  reviewed_at timestamptz,
  local_date date not null,
  timezone text not null check (public.valid_timezone(timezone)),
  created_at timestamptz not null default transaction_timestamp(),
  updated_at timestamptz not null default transaction_timestamp(),
  version bigint not null default 1 check (version > 0),
  deleted_at timestamptz,
  unique (user_id, id),
  check (num_nonnulls(linked_task_id, linked_habit_id, linked_intent_id) <= 1),
  check ((mode = 'countdown' and target_duration_minutes is not null) or mode = 'stopwatch'),
  check ((status = 'running' and last_resumed_at is not null and ended_at is null and actual_elapsed_ms is null) or
         (status = 'paused' and last_resumed_at is null and ended_at is null and actual_elapsed_ms is null) or
         (status in ('completed', 'stopped') and last_resumed_at is null and ended_at is not null and actual_elapsed_ms is not null)),
  foreign key (user_id, device_id) references public.devices(user_id, id),
  foreign key (user_id, linked_task_id) references public.tasks(user_id, id),
  foreign key (user_id, linked_habit_id) references public.habits(user_id, id),
  foreign key (user_id, linked_intent_id) references public.activity_intents(user_id, id)
);

create table public.journal_entries (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  timezone text not null check (public.valid_timezone(timezone)),
  mood smallint check (mood between 1 and 5),
  energy smallint check (energy between 1 and 5),
  completed text check (char_length(completed) <= 1000),
  difficult text check (char_length(difficult) <= 1000),
  next_step text check (char_length(next_step) <= 1000),
  free_text text check (char_length(free_text) <= 1000),
  created_at timestamptz not null default transaction_timestamp(),
  updated_at timestamptz not null default transaction_timestamp(),
  version bigint not null default 1 check (version > 0),
  deleted_at timestamptz,
  unique (user_id, local_date),
  check (num_nonnulls(mood, energy, completed, difficult, next_step, free_text) > 0)
);

create table public.morning_checks (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  timezone text not null check (public.valid_timezone(timezone)),
  verified_at timestamptz not null,
  capture_method text not null check (capture_method in ('camera', 'upload')),
  verifier_mode text not null check (verifier_mode in ('mock', 'live')),
  created_at timestamptz not null default transaction_timestamp(),
  unique (user_id, local_date),
  unique (user_id, id)
);

create table public.morning_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  timezone text not null check (public.valid_timezone(timezone)),
  attempt_count smallint not null default 0 check (attempt_count between 0 and 3),
  updated_at timestamptz not null default transaction_timestamp(),
  version bigint not null default 1 check (version > 0),
  primary key (user_id, local_date)
);

create table public.reward_ledger (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('task', 'habit', 'session', 'morning', 'reflection', 'purchase', 'correction')),
  source_id uuid,
  local_date date not null,
  timezone text not null check (public.valid_timezone(timezone)),
  points_tenths integer not null check (points_tenths <> 0),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 200),
  created_at timestamptz not null default transaction_timestamp(),
  unique (user_id, idempotency_key),
  unique (user_id, id)
);

create table public.inventory_items (
  id text primary key,
  name text not null,
  kind text not null check (kind in ('food', 'toy', 'trick', 'scene', 'interaction', 'furniture')),
  price_tenths integer not null check (price_tenths >= 0),
  unlock_active_days integer not null check (unlock_active_days >= 0),
  purchase_quantity integer not null default 1 check (purchase_quantity > 0),
  durable boolean not null,
  milestone_only boolean not null default false,
  active boolean not null default true
);

create table public.inventory_events (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null references public.inventory_items(id),
  kind public.inventory_event_kind not null,
  quantity_delta integer not null check (quantity_delta <> 0),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 200),
  local_date date not null,
  timezone text not null check (public.valid_timezone(timezone)),
  created_at timestamptz not null default transaction_timestamp(),
  unique (user_id, idempotency_key),
  unique (user_id, id)
);

create table public.inventory_balances (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null references public.inventory_items(id),
  quantity integer not null check (quantity >= 0),
  updated_at timestamptz not null default transaction_timestamp(),
  version bigint not null default 1 check (version > 0),
  primary key (user_id, item_id)
);

create table public.milestone_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  milestone_day integer not null check (milestone_day in (21, 50, 100)),
  active_day_count integer not null check (active_day_count >= milestone_day),
  granted_at timestamptz not null default transaction_timestamp(),
  unique (user_id, milestone_day)
);

create unique index one_pending_intent_per_user on public.activity_intents(user_id) where status = 'pending' and deleted_at is null;
create unique index one_open_session_per_user on public.activity_sessions(user_id) where status in ('running', 'paused') and deleted_at is null;
create index tasks_sync_idx on public.tasks(user_id, updated_at, id);
create index task_completions_sync_idx on public.task_completions(user_id, updated_at, id);
create index habits_sync_idx on public.habits(user_id, updated_at, id);
create index habit_completions_sync_idx on public.habit_completions(user_id, updated_at, id);
create index sessions_sync_idx on public.activity_sessions(user_id, updated_at, id);
create index sessions_history_idx on public.activity_sessions(user_id, local_date, ended_at) where deleted_at is null;
create index journal_sync_idx on public.journal_entries(user_id, updated_at, id);
create index reward_ledger_user_date_idx on public.reward_ledger(user_id, local_date, created_at);
create index inventory_events_user_idx on public.inventory_events(user_id, created_at);

create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger devices_updated before update on public.devices for each row execute function public.set_updated_at();
create trigger tasks_updated before update on public.tasks for each row execute function public.set_updated_at();
create trigger task_completions_updated before update on public.task_completions for each row execute function public.set_updated_at();
create trigger habits_updated before update on public.habits for each row execute function public.set_updated_at();
create trigger habit_schedule_updated before update on public.habit_schedule_weekdays for each row execute function public.set_updated_at();
create trigger habit_completions_updated before update on public.habit_completions for each row execute function public.set_updated_at();
create trigger intents_updated before update on public.activity_intents for each row execute function public.set_updated_at();
create trigger sessions_updated before update on public.activity_sessions for each row execute function public.set_updated_at();
create trigger journal_updated before update on public.journal_entries for each row execute function public.set_updated_at();
create trigger attempts_updated before update on public.morning_attempts for each row execute function public.set_updated_at();
create trigger inventory_balances_updated before update on public.inventory_balances for each row execute function public.set_updated_at();

create view public.active_days with (security_invoker = true) as
select user_id, local_date from public.task_completions where deleted_at is null
union
select user_id, local_date from public.habit_completions where deleted_at is null
union
select user_id, local_date from public.activity_sessions where deleted_at is null and status in ('completed', 'stopped') and actual_elapsed_ms >= 60000
union
select user_id, local_date from public.journal_entries where deleted_at is null
union
select user_id, local_date from public.morning_checks;

create view public.point_balances with (security_invoker = true) as
select user_id, coalesce(sum(points_tenths), 0)::bigint as points_tenths
from public.reward_ledger group by user_id;

-- Sensitive economic operations are transactionally server-authoritative.
create function public.purchase_inventory_item(
  p_item_id text,
  p_mutation_id uuid,
  p_local_date date,
  p_timezone text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_item public.inventory_items%rowtype;
  v_existing_item_id text;
  v_balance bigint;
  v_quantity integer;
  v_active_days integer;
  v_key text := 'purchase:' || p_mutation_id::text;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.valid_timezone(p_timezone) then raise exception 'invalid_timezone' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  select item_id into v_existing_item_id
  from public.inventory_events
  where user_id = v_user and idempotency_key = v_key;
  if found then
    if v_existing_item_id <> p_item_id then raise exception 'mutation_payload_mismatch' using errcode = '22023'; end if;
    select quantity into v_quantity from public.inventory_balances where user_id = v_user and item_id = p_item_id;
    select coalesce(sum(points_tenths), 0) into v_balance from public.reward_ledger where user_id = v_user;
    return jsonb_build_object('outcome', 'already_applied', 'quantity', coalesce(v_quantity, 0), 'points_tenths', v_balance);
  end if;

  select * into v_item from public.inventory_items where id = p_item_id and active and not milestone_only;
  if not found then raise exception 'invalid_item' using errcode = '22023'; end if;

  select count(*) into v_active_days from public.active_days where user_id = v_user;
  if v_active_days < v_item.unlock_active_days then raise exception 'item_locked' using errcode = 'P0001'; end if;
  select coalesce(sum(points_tenths), 0) into v_balance from public.reward_ledger where user_id = v_user;
  if v_balance < v_item.price_tenths then raise exception 'insufficient_points' using errcode = 'P0001'; end if;

  select quantity into v_quantity from public.inventory_balances where user_id = v_user and item_id = p_item_id;
  if v_item.durable and coalesce(v_quantity, 0) > 0 then raise exception 'already_owned' using errcode = 'P0001'; end if;

  insert into public.reward_ledger (id, user_id, source_type, source_id, local_date, timezone, points_tenths, idempotency_key)
  values (gen_random_uuid(), v_user, 'purchase', p_mutation_id, p_local_date, p_timezone, -v_item.price_tenths, v_key)
  on conflict (user_id, idempotency_key) do nothing;

  insert into public.inventory_events (id, user_id, item_id, kind, quantity_delta, idempotency_key, local_date, timezone)
  values (gen_random_uuid(), v_user, p_item_id, 'purchase', v_item.purchase_quantity, v_key, p_local_date, p_timezone);
  insert into public.inventory_balances (user_id, item_id, quantity)
  values (v_user, p_item_id, v_item.purchase_quantity)
  on conflict (user_id, item_id) do update set quantity = public.inventory_balances.quantity + excluded.quantity;
  select quantity into v_quantity from public.inventory_balances where user_id = v_user and item_id = p_item_id;
  return jsonb_build_object('outcome', 'purchased', 'quantity', v_quantity, 'points_tenths', v_balance - v_item.price_tenths);
end;
$$;

create function public.grant_earned_milestones(p_local_date date, p_timezone text)
returns table (milestone_day integer, newly_granted boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_active_days integer;
  v_day integer;
  v_inserted integer;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.valid_timezone(p_timezone) then raise exception 'invalid_timezone' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  select count(*) into v_active_days from public.active_days where user_id = v_user;

  foreach v_day in array array[21, 50, 100] loop
    if v_active_days < v_day then continue; end if;
    insert into public.milestone_grants (user_id, milestone_day, active_day_count)
    values (v_user, v_day, v_active_days) on conflict (user_id, milestone_day) do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted = 1 then
      if v_day = 21 then
        insert into public.inventory_events values (gen_random_uuid(), v_user, 'cat-food', 'milestone_grant', 10, 'milestone:21:cat-food', p_local_date, p_timezone, transaction_timestamp());
        insert into public.inventory_balances (user_id, item_id, quantity) values (v_user, 'cat-food', 10)
          on conflict (user_id, item_id) do update set quantity = public.inventory_balances.quantity + 10;
      elsif v_day = 50 then
        insert into public.inventory_events values (gen_random_uuid(), v_user, 'cat-treat', 'milestone_grant', 10, 'milestone:50:cat-treat', p_local_date, p_timezone, transaction_timestamp());
        insert into public.inventory_balances (user_id, item_id, quantity) values (v_user, 'cat-treat', 10)
          on conflict (user_id, item_id) do update set quantity = public.inventory_balances.quantity + 10;
      else
        insert into public.inventory_events values
          (gen_random_uuid(), v_user, 'outdoor-garden', 'milestone_grant', 1, 'milestone:100:garden', p_local_date, p_timezone, transaction_timestamp()),
          (gen_random_uuid(), v_user, 'butterfly', 'milestone_grant', 1, 'milestone:100:butterfly', p_local_date, p_timezone, transaction_timestamp());
        insert into public.inventory_balances (user_id, item_id, quantity) values (v_user, 'outdoor-garden', 1), (v_user, 'butterfly', 1)
          on conflict (user_id, item_id) do update set quantity = greatest(public.inventory_balances.quantity, excluded.quantity);
      end if;
    end if;
    milestone_day := v_day;
    newly_granted := v_inserted = 1;
    return next;
  end loop;
end;
$$;

-- RLS: every user-owned table is isolated by auth.uid(). Append-only tables have no client update/delete policy.
alter table public.profiles enable row level security;
alter table public.devices enable row level security;
alter table public.import_batches enable row level security;
alter table public.client_mutations enable row level security;
alter table public.tasks enable row level security;
alter table public.task_completions enable row level security;
alter table public.habits enable row level security;
alter table public.habit_schedule_weekdays enable row level security;
alter table public.habit_completions enable row level security;
alter table public.activity_intents enable row level security;
alter table public.activity_sessions enable row level security;
alter table public.journal_entries enable row level security;
alter table public.morning_checks enable row level security;
alter table public.morning_attempts enable row level security;
alter table public.reward_ledger enable row level security;
alter table public.inventory_events enable row level security;
alter table public.inventory_balances enable row level security;
alter table public.milestone_grants enable row level security;

do $$
declare t text;
begin
  foreach t in array array['profiles','devices','import_batches','client_mutations','tasks','task_completions','habits','habit_schedule_weekdays','habit_completions','activity_intents','activity_sessions','journal_entries','morning_checks','morning_attempts','reward_ledger','inventory_events','inventory_balances','milestone_grants']
  loop
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t || '_select_own', t);
  end loop;
  foreach t in array array['profiles','devices','import_batches','tasks','task_completions','habits','habit_schedule_weekdays','habit_completions','activity_intents','activity_sessions','journal_entries']
  loop
    execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t || '_update_own', t);
  end loop;
end $$;

-- Reference catalog is readable but only server/migrations may change it.
alter table public.inventory_items enable row level security;
create policy inventory_items_read on public.inventory_items for select to authenticated using (active);

revoke all on function public.purchase_inventory_item(text, uuid, date, text) from public;
revoke all on function public.grant_earned_milestones(date, text) from public;
grant execute on function public.purchase_inventory_item(text, uuid, date, text) to authenticated;
grant execute on function public.grant_earned_milestones(date, text) to authenticated;

-- Catalog seed mirrors the current local product. Prices are integer tenths of a point.
insert into public.inventory_items (id, name, kind, price_tenths, unlock_active_days, purchase_quantity, durable, milestone_only) values
  ('kitten-milk', 'Kitten milk', 'food', 50, 1, 1, false, false),
  ('cat-food', 'Cat food', 'food', 100, 21, 1, false, false),
  ('cat-treat', 'Cat treat', 'food', 200, 50, 1, false, false),
  ('yarn-toy', 'Yarn ball', 'toy', 250, 3, 1, true, false),
  ('teaser-wand', 'Teaser wand', 'toy', 400, 7, 1, true, false),
  ('high-five', 'High-five', 'trick', 800, 50, 1, true, false),
  ('paw-shake', 'Paw shake', 'trick', 1200, 100, 1, true, false),
  ('outdoor-garden', 'Outdoor garden', 'scene', 0, 100, 1, true, true),
  ('butterfly', 'Butterfly', 'interaction', 0, 100, 1, true, true);

comment on table public.journal_entries is 'Private Mini Journal data. Exclude from AI, analytics payloads, logs, and notification previews.';
comment on table public.morning_checks is 'Metadata only. Toothbrush images and image hashes must never be stored.';
