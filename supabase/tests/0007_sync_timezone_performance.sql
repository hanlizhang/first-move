begin;
create extension if not exists pgtap with schema extensions;

select plan(8);

select has_table(
  'public',
  'valid_timezones',
  'the sync timezone validator has a materialized lookup table'
);
select is(
  (select count(*) from public.valid_timezones),
  (select count(*) from pg_catalog.pg_timezone_names),
  'the lookup preserves the complete PostgreSQL timezone-name set'
);
select ok(public.valid_timezone('UTC'), 'UTC remains a valid timezone');
select ok(
  public.valid_timezone('Europe/Zurich'),
  'IANA region timezones remain valid'
);
select ok(
  not public.valid_timezone('Not/A_Timezone'),
  'unknown timezone names remain invalid'
);
select is(
  has_table_privilege('authenticated', 'public.valid_timezones', 'SELECT'),
  false,
  'authenticated clients cannot read the internal lookup table directly'
);
select ok(
  position(
    'pg_timezone_names' in
    pg_get_functiondef('public.valid_timezone(text)'::regprocedure)
  ) = 0,
  'row constraints no longer scan the filesystem-backed timezone catalog'
);
select performs_ok(
  $$
    select count(*)
    from generate_series(1, 100) call_number
    where public.valid_timezone(
      case when call_number > 0 then 'UTC' else 'Europe/Zurich' end
    )
  $$,
  1000,
  'one hundred row-dependent timezone checks complete within one second'
);

select * from finish();
rollback;
