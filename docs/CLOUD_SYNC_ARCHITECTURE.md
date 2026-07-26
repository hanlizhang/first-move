# First Move cloud sync architecture

Status: design proposal only. This document deliberately does not authorize implementation. Authentication and cross-device sync conflict with the current PRD/TASKS scope and require product approval plus updates to both files before application work begins.

## 1. Goals and boundaries

First Move remains fully usable in guest mode. The account entry point is phrased **Sync across devices**, not “Sign up to continue.” Email OTP is the first login method. Supabase Auth provides one user identity usable by the web client and future iOS and Android clients; platform clients use the public project URL and publishable/anon key, never the service-role key.

Cloud sync stores structured product records, not a single JSON state row. Toothbrush photos are never uploaded to Supabase Storage or retained in the database. The existing live verification route may send a transient image to OpenAI after explicit consent and must continue to discard it. Mini Journal rows are private user data, excluded from AI input, logs, analytics payloads, support tooling, and notification previews. OpenAI credentials remain server-only environment variables in Next.js route handlers (or another trusted server runtime).

## 2. Current local architecture and risks

The inspected application persists `AppState` schema version 8 as one `first-move:app-state` JSON value in `localStorage`. `useSyncExternalStore` holds one in-memory snapshot and every mutation rewrites the aggregate. Validation and recovery are centralized in `normalizeAppState`.

Current entities are tasks, habits, pending activity intents, sessions, reward events, one journal entry per local date, morning checks/attempt counts, inventory, and derived progress. Task/habit completion dates are embedded arrays. Points are partly derived from the reward events but also cached in progress; inventory changes are mutable quantities, while purchases also create negative reward events. Active dates are derived from qualifying rewards, sessions of at least 60 seconds, and journal entries. Running sessions recover from `startedAt`, `lastResumedAt`, and accumulated elapsed milliseconds.

Risks to resolve before sync:

- Concurrent devices can overwrite the aggregate, and localStorage has no durable pending-operation queue.
- Current prefixed string IDs are not database UUIDs; import must map every local ID and foreign key deterministically within an import batch.
- Embedded completion arrays cannot be independently merged or tombstoned.
- Cached points/progress and mutable inventory can drift from their source events.
- Local dates are calculated from the device clock with no stored IANA timezone, so travel, incorrect clocks, and second-device edits are ambiguous.
- There is no server authority for balance checks, purchases, milestones, or “one open session” invariants.
- Deleting local records currently removes evidence while some rewards intentionally remain; cloud semantics must make this explicit.
- PRD.md and TASKS.md explicitly exclude authentication, databases, and sync.

## 3. Modes and ownership

### Guest mode

Guest mode uses the existing local repository and requires no network or account. It must expose every core manual path. A random installation/device UUID is stored locally for queue idempotency, but is not an identity and must not be inserted into cloud tables before authentication.

The app must not silently create anonymous Supabase users: that would turn guest data into server data and complicate ownership. “Sync across devices” starts email OTP explicitly.

### Authenticated mode

After OTP verification, `auth.uid()` owns every cloud row. The client maintains a normalized offline cache and a pending mutation queue. Supabase is the durable shared source; local storage/IndexedDB is a cache and outbox, not an independently authoritative balance calculator.

Use secure platform session storage: HttpOnly server-managed cookies on web where the selected Supabase SSR integration permits it, and Keychain/Keystore-backed storage on iOS/Android. Never log OTPs, access/refresh tokens, journal contents, or AI request text.

## 4. Proposed tables and relationships

All user-owned tables include `user_id uuid references auth.users(id) on delete cascade`. Mutable records include `created_at`, `updated_at`, and `deleted_at`; deletion is a soft delete until account erasure. UUID primary keys are client-generatable so offline inserts can be retried.

| Table | Purpose and key relationships | Model |
| --- | --- | --- |
| `profiles` | One per auth user; timezone and first-use metadata | mutable singleton |
| `devices` | Registered installations and last sync cursor | mutable |
| `import_batches` | Records start-fresh/import-local choice and import result | append-oriented audit |
| `client_mutations` | `(user_id, device_id, mutation_id)` idempotency receipts | append-only |
| `tasks` | Ordered manual tasks | mutable + tombstone |
| `task_completions` | One task/date completion | mutable tombstone; unique task/date |
| `habits` | Habit title, direction, schedule kind | mutable + tombstone |
| `habit_schedule_weekdays` | Normalized selected weekdays | mutable set + tombstone |
| `habit_completions` | One habit/date check-in | mutable tombstone; unique habit/date |
| `activity_intents` | Stuck state, move, duration, optional task/habit link | mutable + tombstone |
| `activity_sessions` | Timer/stopwatch state and recovery timestamps | mutable state machine + tombstone |
| `journal_entries` | One private Mini Journal entry per local date | mutable + tombstone |
| `morning_checks` | One successful check per local date; metadata only | append-only fact |
| `morning_attempts` | Per-date bounded attempt count; no images | server-mutated counter |
| `reward_ledger` | Immutable point credits/debits | append-only ledger |
| `inventory_items` | Catalog snapshot/seed, not user-owned | server-managed reference |
| `inventory_events` | Purchase, consume, and milestone inventory deltas | append-only ledger |
| `inventory_balances` | Transactionally maintained quantity projection | mutable projection |
| `milestone_grants` | One grant per user/threshold | append-only idempotency record |

Task/habit/session references use `on delete restrict` or soft-deleted parents so historical meaning survives. Journal rows are not joined into general timeline payloads unless the user explicitly opens the journal/history view.

## 5. IDs, clocks, local dates, and timezones

- IDs are UUID v4 generated client-side for offline creation. The auth user UUID is never accepted from a request body; RLS and RPCs use `auth.uid()`.
- All instants are PostgreSQL `timestamptz`, stored and compared in UTC. Clients render in the chosen timezone.
- Every day-scoped action stores `local_date date` and `timezone text` (an IANA name such as `Europe/Berlin`) captured when the action occurred. Store the instant too.
- The server validates timezone names and checks that `local_date` is plausible for the supplied occurrence instant. A small tolerance is needed for queued offline events and travel; rejected clock anomalies require user-visible repair, never silent reassignment.
- Editing from another timezone does not change an event’s original `local_date`. A deliberate “move to another day” is a new mutation that updates the date and timezone and may affect derived active days, but never retroactively duplicates rewards.
- `updated_at` is server-set. Clients provide a `base_updated_at`/version for optimistic concurrency, not an authoritative update timestamp.
- Import preserves valid original instants and date keys. Where the old row lacks timezone, record the importing device’s IANA timezone and mark the batch as legacy-derived.

## 6. Sync protocol and offline queue

Use an IndexedDB normalized cache for cloud mode, including `sync_meta`, entity stores, and a durable `pending_mutations` outbox. Guest mode may initially retain the current localStorage aggregate; migration to one local repository abstraction is an implementation stage.

Each mutation contains `mutation_id` (UUID), `device_id`, entity type/id, operation, payload, base version, and queued time. The server transaction first claims the unique mutation receipt, applies the change, and returns the canonical row plus a monotonic change cursor. A retry of the same mutation returns the prior result without duplicating events.

Pull changes using a server-issued cursor ordered by `(updated_at, id)` or, preferably, a dedicated monotonic change sequence populated by triggers. Do not rely on a client wall clock. Pull includes tombstones. Realtime may prompt an early pull but is not the correctness mechanism.

Push order is parent rows, child rows, then append-only events. Exponential backoff with jitter applies to network/5xx failures. Do not retry validation, authorization, insufficient-balance, or stale-version errors without user/action changes. Keep failed mutations visible and exportable; never drop local data automatically.

## 7. First login and initial hydration

1. The user selects **Sync across devices**, enters email, and verifies the OTP/deep link.
2. The app freezes no local functionality; it snapshots the guest state and displays two explicit choices:
   - **Start fresh**: create an empty cloud profile, leave the guest snapshot untouched on-device, and offer “Keep local copy”/export. Never upload or erase it automatically.
   - **Import local data**: validate and preview counts, create an `import_batch`, map legacy string IDs to UUIDs, normalize completion arrays to rows, and upload in resumable idempotent chunks.
3. Import is additive into an empty account for v1. If cloud data already exists, require a separate merge preview rather than treating import as first login.
4. After server acknowledgement and a full checksum/count comparison, hydrate the local cloud cache. Retain the original guest snapshot until the user explicitly removes it.

For **Start fresh**, local and cloud workspaces must be visibly separated during transition so guest records cannot accidentally enter the new account. For **Import local data**, reward and inventory history must be reconstructed and validated: import ledger entries first, derive point balance, import inventory event equivalents, then compare projected quantities. Invalid or unexplained cached balances are reported, not minted.

## 8. Second-device hydration

After OTP on a second device, detect that the account has cloud data. Pull profile/reference data, mutable records and tombstones, then ledger/inventory events, followed by derived views. Hydrate into a new cache transaction and only swap the UI to it after integrity checks. An existing guest snapshot on that device remains untouched; offer start using cloud data or a reviewed merge/import flow.

Open sessions receive special treatment: pull them before enabling session controls. If another device has an open session, show its label, status, source device, and computed elapsed time. The user may resume/take over; takeover is a version-checked mutation. Never start a second open session silently.

## 9. Entity conflict rules

| Entity | Rule |
| --- | --- |
| Profile/preferences | Field-level last accepted server update; timezone changes are explicit and do not rewrite history. |
| Tasks | Optimistic version check. Non-overlapping field edits can merge; same-field conflicts show local/server choices. Ordering uses stable fractional/rank keys and deterministic `(rank,id)` fallback. Delete tombstone wins over later stale edits; restore is explicit. |
| Task completions | Unique `(user_id, task_id, local_date)`. Complete is idempotent. Uncomplete sets a tombstone but never removes an already-earned reward ledger event. Explicit later re-complete restores the row without a second reward. |
| Habits/schedule | Habit fields use task rules. Weekdays are independent set rows, so different-day edits merge. |
| Habit completions | Same as task completions. |
| Activity intents | Only one active/pending intent per user via partial unique index. Concurrent creation: first accepted wins; the other stays local for user review. Consumed/cancelled is a state transition, not hard deletion. |
| Sessions | Server state machine and optimistic version. One open session per user. Pause/resume/close transitions are idempotent; a closed session cannot reopen. First valid close wins, later close returns canonical state. Review fields may be edited after close. |
| Journal | One row per local date. Never auto-merge private free text. If both changed from the same base, retain both versions locally and ask the user; deletion tombstone wins over stale edits, with explicit restore. |
| Morning check | One immutable success per local date. Duplicate success returns existing row/reward. Attempt count is an atomic server counter; offline verification cannot claim a cloud reward until acknowledged. No image or image hash is stored. |
| Reward ledger | Append-only; dedupe by semantic idempotency key. Corrections are compensating entries, never update/delete. |
| Inventory | Clients submit commands, not balances. Purchase/consume/milestone RPCs lock and update ledgers/projections atomically. |
| Milestones | Derived from distinct qualifying active dates; unique `(user_id, milestone_day)`. RPC inserts once and grants inventory in the same transaction. |

## 10. Mutable records and append-only events

Mutable: profile, devices, tasks, task/habit schedule and completion state, intents, sessions, journal, morning attempt counter, and inventory balance projection. Mutable user records carry a version and tombstone.

Append-only: client mutation receipts, successful morning checks, reward ledger, inventory events, milestone grants, and finalized import audit. “Append-only” is enforced by privileges/RLS: clients can read owned rows but cannot update/delete them. Security-definer RPCs create sensitive event rows.

## 11. Rewards, balances, active days, and RPCs

`reward_ledger.points_delta` uses integer tenths of a point (`points_tenths`) to avoid floating-point drift. Current values become task `50`, habit `30`, reflection `20`, morning `50`; session rewards use the existing rounding rule converted to tenths. Store prices are multiplied by ten.

Balance is `sum(points_tenths)` from the ledger. It may be exposed through an authenticated view/function. Do not accept a client-provided balance. A purchase RPC takes item and mutation UUID, locks the user’s ledger/inventory scope, checks unlock and derived balance, inserts a negative reward event, inserts an inventory event, upserts the inventory projection, and returns the canonical balance/quantity. Its idempotency key prevents double spending on retries.

Qualifying active days are the distinct union of:

- non-tombstoned task/habit completions;
- successful morning checks;
- non-tombstoned journal entries;
- closed sessions with `actual_elapsed_ms >= 60000`.

Store this as a view, not a user-editable counter. Total active days is `count(distinct local_date)`. First/last active dates and gentle streak are derived. Journey day uses the profile’s first-use local date and the viewer’s current local date; it is presentation metadata, not a reward authority.

The milestone RPC recomputes active-day count inside the transaction, inserts the unique milestone grant, and applies all inventory grants. Concurrent calls are harmless. A scheduled/server call or a post-qualifying-action call may invoke it. SQL in the initial migration provides purchase and milestone foundations; reward creation for ordinary actions should likewise move into narrowly scoped RPCs/triggers during implementation.

## 12. Running-session recovery

Persist `started_at`, `status`, `last_resumed_at`, `accumulated_elapsed_ms`, target duration, and a version. For a running session, displayed elapsed time is accumulated time plus server-adjusted time since last resume. Clients should estimate server clock offset from response `Date`/RPC time and must clamp countdown completion to its target. A pause transaction converts the running interval to accumulated milliseconds. Close stores immutable outcome timing and creates its session reward in the same transaction.

If the app was offline, local timer behavior continues. On reconnect, state transition mutations replay with their captured occurrence instant. If another device already closed the session, canonical closure wins and the local result is shown as a conflict note, not duplicated.

## 13. Logout and account deletion

Logout revokes/clears the local auth session and leaves a clearly labeled encrypted/platform-protected or ordinary browser cache according to the user’s choice: **Keep synced data on this device** or **Remove synced data from this device**. Neither option deletes the guest snapshot. Pending mutations must be uploaded or exported/discarded by explicit choice before local removal.

Account deletion requires recent authentication and a confirmation step describing permanent cloud erasure. A trusted server endpoint/Edge Function uses the service role only server-side to delete the Auth user; foreign-key cascades erase owned cloud rows. Before deletion, offer data export. If offline or deletion fails, keep data and show pending/failed status. Local caches are removed only after server confirmation or a separate explicit local-clear action. Backups follow the published retention window; this must be disclosed.

## 14. Privacy and security

- Enable RLS on every user-owned table, including audit/outbox receipt tables and private journal rows. Policies use `(select auth.uid()) = user_id`; foreign-key ownership is additionally validated in triggers/RPCs.
- Grant clients only necessary table operations. Ledger, inventory event, milestone, and morning-success writes go through RPCs. Revoke direct update/delete on append-only tables.
- The anon/publishable key is safe to ship only with correct RLS; service-role, database passwords, JWT signing secrets, and OpenAI keys are server-only.
- Rate-limit email OTP, verification, AI routes, imports, and command RPCs. Use generic auth responses to reduce email enumeration.
- Do not use journal fields in telemetry. Redact request bodies and tokens from logs. Encrypt transport and rely on Supabase encryption at rest; document that RLS is access control, not end-to-end encryption.
- Do not create a toothbrush-photo bucket. Verification endpoints use `Cache-Control: no-store`, bounded payloads, no body logging, and immediate memory disposal.

## 15. Decisions requiring approval

1. Approve changing PRD/TASKS product scope from local-only/no-auth to optional account sync.
2. Confirm whether v1 import is allowed only into an empty cloud account (recommended) or must merge two populated histories.
3. Confirm soft-delete retention (recommended: retain tombstones while the account exists, compact only after every registered device passes a cursor plus a safety window).
4. Confirm account backup/deletion retention language and target jurisdictions.
5. Choose web session strategy and native framework before implementation; both affect deep links and secure token storage.
6. Decide whether Mini Journal is cloud-synced by default with the rest of an imported account or requires a separate opt-in. Recommended: explicit checkbox because it is private text.
7. Decide whether logout defaults to keeping or removing the synced cache on shared devices. Recommended: ask every time.
8. Approve integer tenths as the canonical points unit and the rule that undoing a completion never claws back an earned reward.

## 16. Staged implementation plan

1. **Product approval:** update PRD.md and TASKS.md; settle the decisions above and privacy copy.
2. **Repository boundary:** introduce normalized domain DTOs, UUID generation, a repository interface, legacy-ID mapper, and migration tests without enabling auth.
3. **Supabase foundation:** create separate development project, apply reviewed migration, seed catalog, verify RLS with adversarial tests, and configure email OTP/deep links for web/iOS/Android.
4. **Server commands:** implement idempotent mutation, reward, purchase, consume, session-close, morning-success, and milestone RPCs; add concurrency tests.
5. **Local sync engine:** add IndexedDB cache/outbox, cursored pull, retry/backoff, tombstones, integrity checks, and offline tests.
6. **Account UI:** add **Sync across devices**, OTP flow, Start fresh/Import local data preview, resumable import, and explicit journal choice.
7. **Hydration and conflicts:** add second-device hydration, running-session takeover, conflict UI, logout choices, export, and account deletion.
8. **Platform hardening:** validate universal/app links and secure token storage on web/iOS/Android; privacy/security review and observability redaction.
9. **Release:** staged rollout behind a feature flag, migration telemetry without private content, rollback/export rehearsal, and documented support procedures.
