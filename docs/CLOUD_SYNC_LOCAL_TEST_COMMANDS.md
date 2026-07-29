# First Move local Supabase test commands

Status: proposed commands only. They have not been run. Docker has not been started and the migration has not been executed.

Run from `/Users/zhanghanli/Projects/first-move` only after approval:

```sh
npx supabase init
npx supabase start
npx supabase db reset
npx supabase test db
npx supabase db lint --level error
npx supabase stop --no-backup
```

Purpose and effects:

1. `npx supabase init` creates project-local Supabase configuration if it is absent. It does not link a remote project.
2. `npx supabase start` starts local Docker services only.
3. `npx supabase db reset` recreates the local database and applies `supabase/migrations/20260729000000_initial_schema.sql`.
4. `npx supabase test db` runs all SQL files under `supabase/tests/` against the local database.
5. `npx supabase db lint --level error` performs local schema linting.
6. `npx supabase stop --no-backup` stops local services without creating a database backup.

Do not run `supabase link`, `supabase db push`, `supabase migration up --linked`, or any command with a remote project reference during local approval testing.

For a clean repeat after the first approved initialization:

```sh
npx supabase db reset
npx supabase test db
npx supabase db lint --level error
```
