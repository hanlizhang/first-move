# First Move sync test plan

Status: pre-implementation test specification. No Supabase project or deployed environment is assumed.

## Test strategy

Test the sync system at four layers: deterministic domain/unit tests, PostgreSQL migration/RLS tests, client repository integration tests, and end-to-end multi-device scenarios. Use isolated users and seeded clocks. Never use real journal text, email addresses, access tokens, API keys, or toothbrush photos in fixtures/logs.

Release gates: all existing guest-mode tests remain green; migration applies and rolls back in an ephemeral database; every user-owned table passes cross-user RLS tests; economic concurrency tests show no duplicate rewards, negative balances, or duplicate milestones; offline and second-device scenarios pass on web plus platform adapters for iOS and Android.

## 1. Schema and migration

- Apply `0001_initial_schema.sql` to an empty ephemeral Supabase-compatible PostgreSQL instance; verify types, constraints, triggers, views, functions, grants, indexes, and seed rows.
- Confirm every user-owned table has RLS enabled and no accidental `anon` access.
- Verify client-generated UUID inserts and all composite ownership foreign keys.
- Reject invalid direction, weekday, ratings, durations, states, negative elapsed time, invalid timezone, multiple entity links, and empty journal content.
- Verify partial unique indexes allow only one pending intent and one open session per user, while different users remain independent.
- Verify all mutable updates increment `version` and set server `updated_at`; tombstones remain pullable.
- Confirm append-only tables cannot be updated/deleted by authenticated clients.
- Run query plans for per-user cursor pulls, daily history, ledger balance, active-day derivation, and inventory history; assert intended indexes are used at production-like volumes.

## 2. RLS and authorization matrix

For each user-owned table, test as anon, owner A, non-owner B, and service/trusted server where applicable:

- Anon cannot select/insert/update/delete.
- A can read only A’s rows.
- B cannot read or mutate A’s rows, including by guessing UUIDs or linking A’s parent ID into B’s child row.
- Direct writes to reward ledger, inventory events/balances, milestone grants, and morning successes are denied; approved RPCs can write only for `auth.uid()`.
- Views (`active_days`, `point_balances`) expose only caller-owned rows under `security_invoker`.
- Journal content never appears through generic timeline/list RPCs or another user’s queries.
- Security-definer functions use an empty search path, ignore supplied ownership claims, and are safe against object-shadowing/search-path attacks.

## 3. Guest mode and account entry

- Fresh install works offline without contacting Supabase and exposes all core manual paths.
- UI labels account entry **Sync across devices** and never blocks guest use.
- Failed/cancelled OTP returns to usable guest mode without altering local state.
- OTP rate-limit, expired link, wrong code, duplicate callback, and deep-link reopening produce safe recoverable states.
- The same account authenticates on web, iOS, and Android adapters; tokens use the platform’s protected storage and never logs.

## 4. First login: Start fresh

- Snapshot populated guest state, select Start fresh, and verify empty cloud hydration.
- Verify original guest snapshot remains intact, accessible/exportable, and never uploads automatically.
- Crash at every transition boundary; restart must present an unambiguous guest/cloud workspace and never delete data.
- Repeating the choice/idempotency mutation creates one profile/import batch.
- Logging out and back in restores the empty/since-created cloud workspace, not the old guest snapshot.

## 5. First login: Import local data

- Import empty, minimal, and maximum-size valid schema-v8 snapshots.
- Map every legacy prefixed ID to a UUID and preserve task/habit/intent/session links.
- Expand `completedOn` arrays into unique completion rows; duplicates remain one row.
- Preserve UTC instants, local dates, and importing IANA timezone metadata.
- Import journal rows separately and honor the explicit journal opt-in decision.
- Confirm no image/blob/data URL or toothbrush image hash is included.
- Reconstruct reward/inventory events, compare derived point and quantity projections, and flag unexplained cached balances without minting value.
- Interrupt each batch/chunk, resume on the same or another network, and prove mutation/batch idempotency.
- Reject malformed rows individually with a review report; retain the untouched source snapshot.
- Complete only after server counts/checksums match the preview. Re-running a completed import changes nothing.

## 6. Offline outbox and retries

- Create/edit/delete each mutable entity offline, restart the app, reconnect, and verify ordered replay plus canonical acknowledgement.
- Queue parent and child creation together and verify dependency order.
- Retry identical mutation IDs after timeout-before-response; assert exactly one database effect.
- Simulate 429, 500, 503, network loss, DNS failure, and realtime disconnect; verify exponential backoff with jitter and no UI lockout.
- Validation/403/insufficient-balance/stale-version errors do not loop; they remain visible with repair actions.
- Pull by cursor across identical timestamps and pagination boundaries without gaps or duplicates.
- Tombstones sync to a device that was offline for a long period. Tombstone compaction is blocked until the approved device/cursor safety rule is satisfied.
- Exhaust IndexedDB quota and corrupt cache metadata; recover from cloud without discarding the pending outbox.

## 7. Conflict tests by entity

- **Tasks:** edit different fields on two devices (merge); edit same field (prompt); reorder concurrently (stable deterministic order); edit versus delete (tombstone wins); explicit restore creates a new accepted version.
- **Task/habit completions:** concurrent complete creates one row/reward; uncomplete plus stale complete does not duplicate reward; later explicit re-complete restores completion without another reward.
- **Habits:** concurrent weekday additions merge; add/remove same weekday resolves by version/tombstone rule; parent deletion preserves history.
- **Intent:** simultaneous creation accepts one pending intent and leaves the other local for review.
- **Session:** simultaneous start accepts one open session; pause/resume races respect version; simultaneous closes choose the first valid close; review metadata conflict is surfaced.
- **Journal:** concurrent edits from one base never concatenate/overwrite silently; both versions remain recoverable. Delete versus stale edit leaves a tombstone and offers explicit restore.
- **Morning:** duplicate success returns the existing check/reward; three-attempt counter is atomic; offline local verification cannot fabricate a reward.
- **Inventory:** balances cannot be directly uploaded; concurrent commands serialize.

## 8. Reward ledger and active days

- Assert canonical integer-tenths rewards: task 50, habit 30, reflection 20, morning 50; session results match current one-decimal calculation including stopped multiplier and the 60-second boundary.
- Semantic idempotency keys prevent reward duplication across retries/imports/devices.
- Ledger rows cannot change; correction uses a compensating event with audit reason.
- Derived balance equals ledger sum after every test step and never depends on a client cache.
- Active-day union counts a date once across any number of qualifying actions.
- Sessions at 59,999 ms do not qualify; 60,000 ms do.
- Tombstoned journal/completion rows stop contributing to active-day derivation, while retained earned reward rows follow the approved no-clawback rule.
- Travel across UTC midnight, daylight-saving transitions, leap day, invalid device clock, and two devices in different IANA timezones preserve stored `local_date` semantics.
- Gentle streak, first/last active date, total active days, and journey day match deterministic fixtures.

## 9. Transactional RPC concurrency

- Send 20 identical purchase requests with one mutation ID: one debit and one inventory event.
- Send concurrent distinct purchases whose combined price exceeds balance: only affordable serialized transactions succeed; balance never becomes negative.
- Concurrent durable-item purchase returns one owned item and one debit.
- Consumable purchases increase exact quantity; concurrent consumes never go below zero (consume RPC required before release).
- Purchase at locked and exact-unlock active-day boundaries.
- Call milestone grant concurrently from multiple devices at days 20/21, 49/50, and 99/100: one grant record and exact inventory grants.
- Fail the transaction after ledger insertion using a test hook; verify all effects roll back. Repeat for inventory and milestone steps.
- Confirm RPC error codes are stable, user-safe, and contain no SQL/schema secrets.

## 10. Running-session recovery

- Recover running and paused countdown/stopwatch sessions after refresh, process death, offline duration, and device clock changes.
- Compute elapsed from accumulated time and last resume; compare using known server clock offset.
- Countdown completion clamps actual elapsed to target; stopwatch does not.
- Take over an open session on device B, then reconnect device A; A adopts canonical version and cannot create a duplicate close/reward.
- Close offline on A while B closes online; first server close wins and A displays the canonical result plus a neutral conflict notice.
- App startup hydrates the open session before enabling a new-session button.

## 11. Second-device hydration

- Hydrate an account containing every table, tombstones, 10k sessions, journal content, ledger, and milestone inventory.
- Pull reference/profile, mutable rows/tombstones, events, then projections; atomically swap cache only after integrity validation.
- Kill the app during every page and resume without showing a false empty state.
- Existing guest data on device B remains untouched; importing/merging requires explicit review.
- Verify balance, active days, store unlocks, inventory quantities, and open session equal device A/server after hydration.
- Realtime missed events are recovered by the next cursor pull.

## 12. Logout and account deletion

- Logout with no pending writes and choose keep/remove synced cache; guest snapshot remains in both cases.
- With pending writes, require sync, export, or explicit discard; no silent deletion.
- Token revocation prevents further reads/writes and cross-user cache data is never shown after another login.
- Account deletion requires recent authentication and confirmation, offers export, and uses the trusted server only.
- Failed/offline deletion retains cloud/local data and clearly reports status.
- Successful deletion cascades every owned table, invalidates sessions, then clears selected local cloud caches. Verify journal and audit rows are gone according to documented backup retention.

## 13. Privacy and AI boundaries

- Static/runtime tests assert no toothbrush image, base64 payload, blob, or image hash reaches database/storage/logs.
- AI organization receives only explicit brain dump; toothbrush verification receives only transient explicit image; neither receives journal, history, habits, cat state, tokens, or sync payloads.
- OpenAI API key exists only in server environment and is absent from client bundles, source maps, network responses, Supabase rows, and mobile packages.
- Service-role/database/JWT secrets are absent from clients. Only public project URL and publishable/anon key ship.
- Logs redact Authorization, cookies, OTPs, email addresses where possible, journal fields, AI request bodies, and mutation payload text.
- Export contains journal only after explicit confirmation and is protected from accidental analytics upload.

## 14. Performance, resilience, and release

- Measure initial hydration, incremental pull, and outbox replay on slow mobile networks and low-memory devices.
- Validate pagination and bounded payloads at 1, 3, and 5 years of realistic activity.
- Simulate Supabase outage: guest/manual/local cached experience remains usable; queued status is clear.
- Verify feature-flag rollback preserves outbox and export access.
- Run web accessibility tests for OTP, import choice, conflict dialogs, offline banners, and deletion confirmation.
- Complete threat model, RLS review, dependency review, backup/restore drill, account-deletion drill, and incident runbook before production enablement.

## Staged implementation test gates

1. Product documents approved; privacy and conflict decisions recorded.
2. Legacy mapper passes fixture/property tests without network.
3. Migration and exhaustive RLS suite pass in ephemeral CI.
4. Command/RPC concurrency and rollback suite passes.
5. Offline cache/outbox and cursor sync suite passes.
6. Start fresh/import and second-device end-to-end suites pass.
7. Web/iOS/Android auth-link and secure-storage adapter suites pass.
8. Privacy, load, resilience, accessibility, and deletion gates pass before rollout.
