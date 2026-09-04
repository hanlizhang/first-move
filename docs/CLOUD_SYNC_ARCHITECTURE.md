# First Move cloud sync architecture

Status: approved architecture and design reference. The frozen Web Sync v1 MVP and its remotely applied migrations are implemented; Mobile M1E now uses the same Supabase Auth UUID, RPCs, schema-v8 snapshot, and canonical-response contract for already-initialized accounts. The normalized B5 outbox/change-cursor/conflict design, realtime timer takeover, RevenueCat, server-controlled AI quotas, and release hardening remain deferred and are not claims about current behavior.

## 1. Goals and boundaries

First Move remains fully usable in guest mode. The account entry point is phrased **Sync across devices**, not “Sign up to continue.” Email OTP is the first login method. Supabase Auth provides one user identity used by the Web and current Expo Mobile clients; platform clients use the public project URL and publishable/anon key, never the service-role key.

Cloud sync stores structured product records, not a single JSON state row. Toothbrush photos are never uploaded to Supabase Storage or retained in the database. The existing live verification route may send a transient image to OpenAI after explicit consent and must continue to discard it. Mini Journal rows are private user data, excluded from AI input, logs, analytics payloads, support tooling, and notification previews. OpenAI credentials remain server-only environment variables in Next.js route handlers (or another trusted server runtime).

RevenueCat is the source of truth for the `pro` entitlement. The authenticated Supabase Auth user UUID, serialized as a string, is the RevenueCat App User ID on web, iOS, and Android. Clients may display cached subscription state for responsiveness, but clients never authorize paid features.

## 2. Original local architecture and pre-sync risks

This section records the Web architecture inspected before Sync v1 implementation. The Web application persists `AppState` schema version 8 as one `first-move:app-state` JSON value in `localStorage`. `useSyncExternalStore` holds one in-memory snapshot and every mutation rewrites the aggregate. Validation and recovery are centralized in `normalizeAppState`.

Current entities are tasks, habits, pending activity intents, sessions, reward events, one journal entry per local date, morning checks/attempt counts, inventory, and derived progress. Task/habit completion dates are embedded arrays. Points are partly derived from the reward events but also cached in progress; inventory changes are mutable quantities, while purchases also create negative reward events. Active dates are derived from qualifying rewards, sessions of at least 60 seconds, and journal entries. Running sessions recover from `startedAt`, `lastResumedAt`, and accumulated elapsed milliseconds.

Risks identified before sync:

- Concurrent devices can overwrite the aggregate, and localStorage has no durable pending-operation queue.
- Current prefixed string IDs are not database UUIDs; import must map every local ID and foreign key deterministically within an import batch.
- Embedded completion arrays cannot be independently merged or tombstoned.
- Cached points/progress and mutable inventory can drift from their source events.
- Local dates are calculated from the device clock with no stored IANA timezone, so travel, incorrect clocks, and second-device edits are ambiguous.
- There is no server authority for balance checks, purchases, milestones, or “one open session” invariants.
- Deleting local records currently removes evidence while some rewards intentionally remain; cloud semantics must make this explicit.
- Existing clients have no server-authoritative subscription, AI quota, or rate-limit accounting.

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
| `import_entity_mappings` | Durable local-ID to cloud-UUID and payload-digest mapping for retry-safe imports | append-only import audit |
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
| `ai_usage_events` | One immutable, idempotent reservation for each dispatched paid AI request | append-only server ledger |

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

Phase B2 implements this flow behind `NEXT_PUBLIC_CLOUD_SETUP_ENABLED` with authenticated `cloud_workspace_status`, `initialize_cloud_workspace`, and `get_cloud_workspace` RPCs. The setup RPC is atomic and derives ownership from `auth.uid()`; the readback RPC returns one canonical owner-scoped payload for verification before hydration. This is not continuous synchronization.

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

Append-only: client mutation receipts, successful morning checks, reward ledger, inventory events, milestone grants, AI usage events, and finalized import audit. “Append-only” is enforced by privileges/RLS: clients can read owned rows but cannot update/delete them. Security-definer RPCs create sensitive event rows.

AI usage events are server-written. They store feature, access basis, provider/model, local date/timezone, region code, request UUID, a server-computed request fingerprint, and dispatch time, but never prompts, images, journal text, model output, email, tokens, or provider credentials.

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

Current Web/Mobile v1 does not implement realtime cross-device timer takeover: a running timer is owned by the device that started it, and persisted Session state converges through normal sync. The fuller takeover/conflict behavior below is deferred B5 target architecture.

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

## 15. Deferred Free, Pro, entitlement, and AI quota design

This section records product and target-server behavior, not an implemented quota or entitlement system. Authenticated Free users are allotted five lifetime introductory actions; Guest is intended to receive five as well, but durable server-side Guest identity/enforcement remains unresolved in TASK-11. RevenueCat and the server-controlled AI quota gateway remain deferred.

| Capability | Free | Pro |
| --- | --- | --- |
| Core non-AI productivity | Included | Included |
| Manual daily planning and local First Move templates | Included | Included |
| Tasks, habits, timers, Mini Journal, cat, and cross-device sync | Included | Included |
| Introductory AI actions | Authenticated Free: 5 lifetime total per account. Guest: 5 intended, with durable identity/enforcement unresolved. | Not applicable while Pro is active; unused introductory credits remain if Pro lapses |
| AI daily plan | Uses a remaining lifetime introductory action | 1 per local day |
| AI toothbrush verification | Uses a remaining lifetime introductory action; manual/mock fallback remains | Up to 3 per local day |
| AI “Make this smaller” | Uses a remaining lifetime introductory action | Up to 5 per local day |
| Advanced history | Not included | Included |
| Premium cat content | Not included | Included |

An “AI action” is one server-dispatched provider request. Local templates, manual planning, manual toothbrush fallback, deterministic local shrinking, validation failures before dispatch, entitlement checks, quota checks, and unsupported-region checks do not consume an action. Once a request is dispatched to a paid provider it consumes quota even if the provider times out or rejects it, because cost may already have been incurred. There are no automatic model retries.

The product ceilings are therefore 5 lifetime calls for an authenticated Free account and 9 per local day for an active Pro account. The intended Guest allowance is also five, subject to the unresolved durable identity/enforcement design. These are target product ceilings, not implemented concurrency or abuse limits; future server-side minute/hour rate limits can be lower.

### Server-side authorization and reservation flow

The future paid AI gateway must use the following order:

1. Validate the Supabase access token on the trusted server and derive `auth.uid()`; never accept a user UUID from the client body.
2. Validate feature input, payload size, requested timezone/local date, and launch-region availability before spending quota.
3. Use `auth.uid()` as the RevenueCat App User ID and verify the active `pro` entitlement from RevenueCat. A signed webhook mirror may improve UI/cache performance, but RevenueCat remains authoritative. A short server cache is acceptable only with a defined freshness bound; a stale or unavailable check fails closed without spending an introductory credit.
4. Apply a server-side rate limit keyed by authenticated user plus IP/device risk signals. A rejected request creates no usage reservation.
5. In one database transaction, apply a per-user lock, look up the idempotency UUID, count authoritative usage, and reserve exactly one `ai_usage_events` row. Active Pro enforces the feature quota for the valid local day; otherwise enforce fewer than 5 lifetime introductory events across all features.
6. Dispatch exactly one provider request using `gpt-5.6-luna`, short structured output, bounded input/output, a timeout, and `maxRetries: 0`.
7. Validate the structured response and return a reviewable proposal. Never apply an AI result automatically.

The design requires reservation and counting to serialize concurrent devices at quota boundaries. Repeating the same request UUID must never cause another provider call; the server should return a stored safe status or an “already dispatched” response if model output is deliberately not retained. Different payload or feature with a reused request UUID must be rejected.

Daily quotas use the request’s server-validated IANA timezone and `local_date`. The server checks plausibility against its current time and profile timezone, permits a documented travel transition, and prevents arbitrary historic/future dates from evading limits.

### Subscription lifecycle

Purchase and restore run through RevenueCat SDKs for the applicable storefront/platform. After login, the client identifies the RevenueCat user with the Supabase UUID; anonymous RevenueCat identities must be aliased under an approved account-transfer policy before purchase restoration. Webhooks may populate a server-side read model for UI and audit, but do not replace authoritative entitlement verification.

Upgrade takes effect after RevenueCat reports active `pro`. Downgrade, expiry, refund, billing grace, and transfer behavior follow RevenueCat entitlement state. Losing Pro never deletes synced data, local data, history, cat items, or journal entries. Pro-only views/content become unavailable without destructive mutation. Remaining lifetime introductory credits are preserved and may be used after Pro lapses.

### Regional provider strategy

Define a trusted-server `AiProvider` interface for daily planning, toothbrush verification, and making a move smaller:

- `OpenAiProvider`: initial supported international markets; `gpt-5.6-luna`, structured short outputs, no automatic retries, server-held key.
- `ManualLocalProvider`: always available; manual planning, local First Move templates, manual toothbrush path, and deterministic/local shrinking; no paid request or usage event.
- `RegionSpecificProvider`: future adapter using the same validated contracts after privacy, data-residency, safety, and quality review.

Region gating occurs server-side before entitlement/quota reservation using the production launch allowlist and applicable legal/provider availability signals. The client may hide unavailable controls but is not authoritative. Do not offer OpenAI-backed features in unsupported regions. Mainland China is excluded from the initial production launch. The first launch targets supported international markets only. Subscription copy must not promise AI where regional restrictions apply; non-AI features and manual fallbacks remain usable where the overall product launches.

## 16. Original open decisions

This list is retained as architecture history. Decisions already resolved—including empty-account-only v1 import and Expo React Native for Mobile—are superseded by `PRD.md`, `TASKS.md`, and `docs/MOBILE_V1_HANDOFF.md`; unresolved release decisions remain tracked there.

1. Confirm whether v1 import is allowed only into an empty cloud account (recommended) or must merge two populated histories.
2. Confirm soft-delete retention and account backup/deletion retention language for target launch jurisdictions.
3. Choose web subscription checkout approach, native framework, and RevenueCat account-transfer policy.
4. Decide whether Mini Journal cloud import requires a separate opt-in (recommended).
5. Approve the exact supported-country allowlist, prices, grace-period behavior, and advanced-history/premium-cat inventory.
6. Approve integer-tenths points and the no-reward-clawback rule.

## 17. Original staged implementation plan

This sequence is preserved as design history. Web Sync v1 and Mobile M1E implement the documented full-snapshot compatibility path; B5, RevenueCat, AI quota, platform hardening, and store release stages remain deferred.

1. **Product specification:** finalize remaining decisions, regional allowlist, subscription copy, privacy disclosures, and store policies.
2. **Repository boundary:** introduce normalized domain DTOs, UUID generation, a repository interface, legacy-ID mapper, and migration tests without enabling auth.
3. **Supabase foundation:** create separate development project, apply reviewed migration, seed catalog, verify RLS with adversarial tests, and configure email OTP/deep links for web/iOS/Android.
4. **RevenueCat foundation:** map Supabase UUIDs to RevenueCat App User IDs, configure `pro`, purchases/restores/webhooks, and server entitlement verification.
5. **AI gateway:** implement provider interface, region allowlist, idempotent quota reservation, rate limiting, `gpt-5.6-luna` structured calls with no retries, and manual fallbacks.
6. **Server commands:** implement idempotent mutation, reward, purchase, consume, session-close, morning-success, and milestone RPCs; add concurrency tests.
7. **Local sync engine:** add IndexedDB cache/outbox, cursored pull, retry/backoff, tombstones, integrity checks, and offline tests.
8. **Account UI:** add **Sync across devices**, OTP flow, Start fresh/Import local data preview, resumable import, and explicit journal choice.
9. **Paywall and premium UI:** show Free/Pro limits, usage, upgrade/restore/manage-subscription, advanced history, and premium cat gates without blocking core features.
10. **Hydration and conflicts:** add second-device hydration, running-session takeover, conflict UI, logout choices, export, and account deletion.
11. **Platform hardening:** validate auth links, secure token storage, RevenueCat identity transitions, storefront rules, privacy/security review, and log redaction.
12. **Release:** launch only in the approved supported-market allowlist behind feature flags; rehearse rollback/export and provider/RevenueCat outages.
