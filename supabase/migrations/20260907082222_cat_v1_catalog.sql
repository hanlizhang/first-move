-- Approved Cat v1 catalog refresh.
-- Existing inventory and reward ledgers are append-only and are intentionally
-- left untouched; stable catalog IDs continue to resolve historical rows.

insert into public.inventory_items (
  id,
  name,
  kind,
  price_tenths,
  unlock_active_days,
  purchase_quantity,
  durable,
  milestone_only,
  active
) values
  ('wet-kitten-food', 'Wet kitten food', 'food', 100, 21, 1, false, false, true),
  ('freeze-dried-treat', 'Freeze-dried treat', 'food', 150, 50, 1, false, false, true),
  ('toy-mouse', 'Toy mouse', 'toy', 350, 14, 1, true, false, true),
  ('scratching-post', 'Scratching post', 'furniture', 800, 21, 1, true, false, true),
  ('cat-tree', 'Cat tree', 'furniture', 3000, 75, 1, true, false, true);

do $$
declare
  v_updated integer;
begin
  update public.inventory_items as item
  set
    name = approved.name,
    kind = approved.kind,
    price_tenths = approved.price_tenths,
    unlock_active_days = approved.unlock_active_days,
    purchase_quantity = approved.purchase_quantity,
    durable = approved.durable,
    milestone_only = approved.milestone_only,
    active = approved.active
  from (values
    ('cat-food', 'Cat food', 'food', 100, 35, 1, false, false, true),
    ('yarn-toy', 'Yarn ball', 'toy', 250, 3, 1, true, false, true),
    ('teaser-wand', 'Teaser wand', 'toy', 400, 7, 1, true, false, true),
    ('cat-treat', 'Soft cat treat', 'food', 200, 50, 1, false, false, true),
    ('cat-bed', 'Cat bed', 'furniture', 1000, 50, 1, true, false, true),
    ('window-cushion', 'Window perch', 'furniture', 1400, 70, 1, true, false, true)
  ) as approved(
    id,
    name,
    kind,
    price_tenths,
    unlock_active_days,
    purchase_quantity,
    durable,
    milestone_only,
    active
  )
  where item.id = approved.id;

  get diagnostics v_updated = row_count;
  if v_updated <> 6 then
    raise exception 'cat_catalog_stable_item_missing';
  end if;
end;
$$;

create or replace function public.grant_earned_milestones(p_local_date date, p_timezone text)
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
    values (v_user, v_day, v_active_days)
    on conflict on constraint milestone_grants_user_id_milestone_day_key do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted = 1 then
      if v_day = 21 then
        -- Only newly earned day-21 milestones reach this branch. A historical
        -- day-21 milestone row therefore keeps its original cat-food grant and
        -- receives no conversion, backfill, or duplicate inventory.
        insert into public.inventory_events values (gen_random_uuid(), v_user, 'wet-kitten-food', 'milestone_grant', 10, 'milestone:21:wet-kitten-food', p_local_date, p_timezone, transaction_timestamp());
        insert into public.inventory_balances (user_id, item_id, quantity) values (v_user, 'wet-kitten-food', 10)
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
