-- Avoid re-reading PostgreSQL's filesystem-backed timezone catalog for every
-- row-level timezone constraint during workspace reconciliation.

create table public.valid_timezones (
  name text primary key
);

insert into public.valid_timezones (name)
select name
from pg_catalog.pg_timezone_names;

alter table public.valid_timezones enable row level security;
revoke all on table public.valid_timezones from public, anon, authenticated;

comment on table public.valid_timezones is
  'Migration-time snapshot of PostgreSQL timezone names used by row constraints.';

create or replace function public.valid_timezone(value text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.valid_timezones timezone
    where timezone.name = $1
  );
$$;

comment on function public.valid_timezone(text) is
  'Validates an accepted PostgreSQL timezone name through an indexed migration-time snapshot.';
