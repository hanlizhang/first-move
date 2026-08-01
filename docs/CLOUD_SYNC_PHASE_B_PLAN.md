# First Move Phase B cloud-sync plan

Status: frozen Web Sync v1 MVP checkpoint. B1–B4 are implemented, automated application/database tests are recorded as passing, and every migration through `20260731180000_continuous_cloud_sync.sql` is applied remotely. Phase B2 setup/import/hydration plus two-browser task creation, task update, and habit convergence are manually verified. Start fresh with a second empty account, offline retry convergence, and a remote user-isolation smoke test remain pending. B5 remains deferred.

## Release invariant

Keep cloud setup and sync behind `NEXT_PUBLIC_CLOUD_SETUP_ENABLED` for controlled rollout. Authentication alone is never synchronization. Present Synced only after initialization, canonical hydration, core writes, and economic commands have completed successfully; present offline or attention states while durable writes remain pending.

The first developer test may use **Import this device** or **Start fresh**. Both choices first create an immutable local snapshot. Import is allowed only into an empty account and follows `CLOUD_SYNC_IMPORT_MAPPING.md`; an account with existing cloud data offers **Use cloud progress** and defers merge. A cloud workspace becomes active only after initialization/import commits, canonical hydration succeeds, and all integrity checks pass.

## B1. Apply and security-test the migration

Prerequisite: explicit approval to install/use project-local Supabase tooling or an approved ephemeral test path.

1. Re-review `20260729000000_initial_schema.sql` and pin the target Supabase/PostgreSQL environment.
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

## B2. Account initialization, import, and initial hydration

Implementation status: applied and automated tested. Cloud setup, Import this device, canonical hydration, refresh, and retry RPCs are deployed; Phase B2 import/hydration are manually verified. Start fresh is implemented and automatically tested, with a second-empty-account manual check pending. Continuous mode activates only after the verified canonical copy is loaded.

1. Add a server-authoritative initialization command using `auth.uid()`.
2. Register the device and create `profiles`, `user_settings`, and a completed `import_batches` Start-fresh audit row idempotently.
3. Snapshot but do not modify the current guest localStorage.
4. Offer **Import this device** and **Start fresh** only for an empty account; otherwise offer **Use cloud progress** and retain the local snapshot.
5. For Import, create durable local-ID/cloud-UUID mappings and upload parents, children, facts, ledgers, milestones, and inventory projections in one trusted transaction.
6. For Start fresh, initialize the empty workspace transactionally without uploading guest records.
7. Pull the canonical result into a separate cache namespace.
8. Compare counts, references, reward balance, inventory event sums/projections, milestones, and snapshot checksum; then mark initialization successful.
9. Only after canonical hydration succeeds switch into cloud mode; never delete the guest snapshot.
10. On error or interruption, remain in Guest Mode and resume with the same batch and mappings.

Exit gate: repeated initialization/import is idempotent; every failure preserves local data; an existing cloud account never receives an automatic guest upload; all clients hydrate the same verified account identity.

## B3. Core records sync

Implementation status: smallest complete MVP implemented and remotely deployed using an authenticated atomic full-workspace command, server-receipt-time last-write-wins, soft deletion, startup/focus/manual hydration, and a durable localStorage retry queue. Two-browser task creation, task updates, and habits are manually verified. The normalized IndexedDB outbox and change cursor remain B5 work.

Scope: profiles/timezone, tasks/completions, habits/schedules/completions, intents, sessions, daily plans/items, morning metadata, morning attempt counters, and private journal entries.

1. Introduce cloud DTOs and repository interfaces without replacing the local guest repository.
2. Use UUIDs, versions, server timestamps, local dates, and IANA timezones consistently.
3. Implement owner-scoped commands and parent/child ordering.
4. Implement tombstones and pull them during hydration.
5. Implement session state transitions and running-session recovery, but keep economic side effects behind B4 commands.
6. Implement private journal conflict handling without automatic text merge.
7. Hydrate into an isolated normalized cache; verify counts and relationships before UI swap.
8. Test same-field conflicts, delete-versus-edit, completion toggles, daily-plan item limits/order, and one-open-session behavior.

Exit gate: remote migration application and core two-browser task/habit convergence are complete. Broader entity smoke coverage remains part of incremental Web QA, not a blocker for Mobile M0 architecture work.

## B4. Reward, inventory, and milestone sync

Implementation status: smallest complete MVP implemented locally. Task, habit, session, morning, and reflection rewards are server-derived; purchases, consumption, balances, and milestones remain server-authoritative and idempotent.

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

Exit gate: automated database and application tests cover idempotent economic operations, and the migration is remotely applied. Manual offline retry/convergence remains a documented smoke test.

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

Implementation status: automated coverage exists for second-client hydration, core writes, private journal data, economic retry idempotency, owner isolation, cache preservation, retry recovery, and the Synced gate. Manual two-browser task creation, task updates, and habits have passed. Start fresh with a second empty account, offline edit/retry convergence, and remote user-A/user-B isolation remain manual verification pending.

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

## Migration and release record

Migration order and deployment record:

1. `20260729000000_initial_schema.sql` — required and treated as remotely applied by the recorded Phase B2 verification.
2. `20260730120000_import_workspace.sql` — required and treated as remotely applied by the recorded Phase B2 initialization/import verification.
3. `20260731120000_import_completion_tombstones.sql` — required by the verified import path and treated as remotely applied.
4. `20260731140000_canonical_history_parents.sql` — required by verified canonical hydration and treated as remotely applied.
5. `20260731180000_continuous_cloud_sync.sql` — applied locally and remotely; automated tests passed and core two-browser convergence is manually verified.

`npx supabase migration list` was manually verified to show `20260731180000_continuous_cloud_sync.sql` in both Local and Remote. The remaining manual smoke checks are known verification items and do not block Mobile M0 architecture work. This checkpoint is not a claim of complete Web QA.

## Static and pre-apply review checklist

- SQL contains no image/blob/storage column for toothbrush captures.
- Every owned table has `user_id`, RLS, authenticated owner SELECT, appropriate owner or denied INSERT/UPDATE, and explicit hard-DELETE denial.
- Policy lookup fields are backed by PK, unique, sync, history, or quota indexes.
- Reward source uniqueness, completion/date uniqueness, milestone uniqueness, purchase idempotency, and client mutation uniqueness are present.
- The implementation exists, but documentation-only handoff work must not execute SQL, mutate remote state, or change local caches.
