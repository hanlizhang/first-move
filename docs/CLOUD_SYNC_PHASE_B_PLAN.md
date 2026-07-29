# First Move Phase B cloud-sync plan

Status: implementation plan only. SQL has not been executed and sync remains disabled.

## Release invariant

Keep the cloud-sync feature flag disabled through B1, B2, B3, and B4. Authentication may show the signed-in email, but it must continue to state that progress is local-only. Do not present an account as synchronized until initialization, core records, reward/inventory/milestone commands, hydration, and integrity checks all work together.

The first developer test uses **Start fresh**. Existing schema-v8 local test progress remains untouched. No import, upload, merge, replacement, or local deletion is attempted. A cloud workspace becomes active only after initialization commits and an empty canonical hydration succeeds.

## B1. Apply and security-test the migration

Prerequisite: explicit approval to install/use project-local Supabase tooling or an approved ephemeral test path.

1. Re-review `0001_initial_schema.sql` and pin the target Supabase/PostgreSQL environment.
2. Apply only to an empty development/test project or ephemeral database, never production first.
3. Verify every table, enum, FK, CHECK, trigger, view, index, function privilege, and catalog seed.
4. Run an RLS matrix as anon, user A, user B, and trusted server:
   - owner SELECT only;
   - no cross-user SELECT/INSERT/UPDATE/DELETE;
   - hard DELETE denied;
   - append-only/projection direct writes denied;
   - journal owner privacy;
   - reference catalog read-only.
5. Run uniqueness/concurrency tests for morning checks, habit/task completions, reward source rows, pending intent, open session, daily plan/date/positions, milestone thresholds, purchases, AI usage, and client mutation IDs.
6. Run transaction rollback/concurrency tests for purchases and milestone grants.
7. Confirm no storage bucket or image column exists and no browser/mobile bundle contains a service-role or secret key.
8. Generate typed database definitions only after the tested schema is stable.

Exit gate: clean ephemeral apply, adversarial RLS suite, function privilege audit, and concurrency suite all pass. Any failure blocks B2.

## B2. Start-fresh account initialization and initial hydration

1. Add a server-authoritative initialization command using `auth.uid()`.
2. Register the device and create `profiles`, `user_settings`, and a completed `import_batches` Start-fresh audit row idempotently.
3. Snapshot but do not modify the current guest localStorage.
4. Show an explicit Start fresh confirmation that states local progress will remain on the device.
5. Initialize the empty cloud workspace transactionally.
6. Pull the canonical empty profile/settings/catalog result into a separate cache namespace.
7. Compare expected counts/checksum, then mark initialization successful.
8. Only after success allow a development-only switch into the empty cloud workspace; never delete the guest snapshot.
9. On error or interruption, remain in Guest Mode and make initialization safely retryable.

Exit gate: repeated initialization is idempotent; failure at every boundary preserves local data; localhost, Vercel desktop, and Vercel mobile hydrate the same empty account identity.

## B3. Core records sync

Scope: profiles/timezone, tasks/completions, habits/schedules/completions, intents, sessions, daily plans/items, morning metadata, morning attempt counters, and private journal entries.

1. Introduce cloud DTOs and repository interfaces without replacing the local guest repository.
2. Use UUIDs, versions, server timestamps, local dates, and IANA timezones consistently.
3. Implement owner-scoped commands and parent/child ordering.
4. Implement tombstones and pull them during hydration.
5. Implement session state transitions and running-session recovery, but keep economic side effects behind B4 commands.
6. Implement private journal conflict handling without automatic text merge.
7. Hydrate into an isolated normalized cache; verify counts and relationships before UI swap.
8. Test same-field conflicts, delete-versus-edit, completion toggles, daily-plan item limits/order, and one-open-session behavior.

Exit gate: core records converge on two test clients with no rewards/inventory drift. Cloud sync remains disabled to users.

## B4. Reward, inventory, and milestone sync

1. Implement transactionally scoped commands for:
   - task/habit completion plus one reward;
   - session close plus calculated reward;
   - first journal save plus one reward;
   - morning success plus one reward;
   - purchase debit plus inventory event/balance;
   - food consumption plus inventory event/balance;
   - furniture selection after ownership validation;
   - earned milestone row plus inventory grants.
2. Derive point balance only from `reward_ledger`.
3. Derive active days only from canonical qualifying facts.
4. Verify integer-tenths rounding matches `rewards.ts`.
5. Test retries, timeouts after commit, concurrent devices, insufficient balance, durable ownership, nonnegative consumption, and 21/50/100 boundaries.
6. Hydrate ledger/events/projections and assert balances match event sums.

Exit gate: economic invariants and active-day/milestone results remain identical after retry and two-device concurrency. Only then may the product begin presenting the account as synchronized.

## B5. Offline cache, outbox, conflicts, and recovery

1. Add an IndexedDB normalized cache and durable outbox; do not overload the guest localStorage aggregate.
2. Add client/device mutation UUIDs and dependency ordering.
3. Add a monotonic change cursor or formally adopt/test `(updated_at,id)` pagination.
4. Retry network/5xx failures with jitter; stop retrying validation, authorization, stale-version, or economic errors.
5. Preserve failed mutations for user repair/export.
6. Add realtime only as a pull trigger, not correctness.
7. Test process death, offline edits, quota/storage exhaustion, corrupted cache, long-offline tombstones, and canonical rehydration.
8. Add explicit recovery that never clears guest data or a pending outbox automatically.

Exit gate: offline work replays exactly once, conflicts are visible/recoverable, and cache rebuild cannot lose acknowledged or pending work.

## B6. Two-device acceptance testing

Run the same authenticated account on localhost, Vercel desktop, and Vercel mobile:

1. Initialize Start fresh once and hydrate all clients.
2. Create/edit/reorder/delete tasks and habits across devices.
3. Toggle completions concurrently and verify one reward.
4. Create/review/close sessions, including takeover and offline close conflict.
5. Save conflicting Mini Journal text and verify no silent overwrite.
6. Create/edit a daily plan and verify normalized item order/limits.
7. Complete Morning Start without storing the photo.
8. Purchase/consume inventory and cross each milestone boundary under retry.
9. Refresh, sign out/in, go offline/online, and rebuild cache.
10. Verify canonical counts, ledger sum, inventory event sum, balance projections, active dates, milestones, and local guest snapshot preservation.

Exit gate: every client converges, no cross-user access is possible, no duplicate economic event occurs, and local data remains until an explicit later removal action.

## Static and pre-apply review checklist

- SQL contains no image/blob/storage column for toothbrush captures.
- Every owned table has `user_id`, RLS, authenticated owner SELECT, appropriate owner or denied INSERT/UPDATE, and explicit hard-DELETE denial.
- Policy lookup fields are backed by PK, unique, sync, history, or quota indexes.
- Reward source uniqueness, completion/date uniqueness, milestone uniqueness, purchase idempotency, and client mutation uniqueness are present.
- No application sync code, localStorage mutation, SQL execution, remote project change, CLI install, commit, or push is part of B1 audit preparation.

