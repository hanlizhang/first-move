# First Move Mobile v1 handoff

Status: current Web Sync v1 and Mobile v1 implementation handoff, updated 2026-09-04 from the repository working tree. Web Sync v1 remains a frozen MVP checkpoint with pending smoke tests and is not a claim of production-perfect or fully QA-complete synchronization.

Status vocabulary used here:

- **Implemented:** present in the inspected repository working tree.
- **Automated tested:** corresponding application/database test coverage exists; this documentation pass did not rerun it.
- **Manually verified:** explicitly recorded as verified in the repository documents.
- **Designed only / not started:** architecture exists, but production implementation does not.
- **Intentionally deferred:** deliberately outside the current release scope and not implemented.

## 1. Product summary

First Move is a gentle cross-platform Web and native Mobile productivity product for moving from passive scrolling or inactivity into one intentionally small action. Guest Mode provides the complete non-AI product without an account. Core Web features include the I'm Stuck flow, five intentional directions, local First Move templates, tasks, habits, countdown/stopwatch sessions, daily planning, Morning Start, Mini Journal, history, rewards, and the virtual cat/store experience; current Mobile scope is recorded separately below.

The product is not medical treatment and does not diagnose or claim to repair or stimulate the brain. Rest and Intentional Entertainment are valid directions. AI is optional, explicit, and always has a manual/local fallback.

## 2. Current Web Sync v1 capabilities

| Capability | State | Evidence/boundary |
| --- | --- | --- |
| Guest Mode | Implemented and automated tested | Full local product remains usable without authentication. |
| Email magic-link account | Implemented and automated tested | Supabase `signInWithOtp`, callback code exchange, cookie session, refresh proxy, restored email, and sign out. |
| Phase B2 setup | Implemented, automated tested, manually verified | Import an existing local workspace and load canonical cloud progress are recorded as manually verified. |
| Start fresh | Implemented and automated tested | Creates an empty initialized workspace only after immutable backup; second-empty-account manual verification is pending. |
| Use cloud progress | Implemented, automated tested, manually verified as part of Phase B2 | Requires confirmation, backs up the device, validates the complete payload, then replaces the active cache. |
| Continuous canonical reads | Implemented, deployed, and automated tested | Full workspace hydration at startup, window focus, manual refresh, and after successful writes; setup/import/hydration are manually verified. |
| Continuous writes | Implemented, deployed, and automated tested | Profile/settings, tasks/completions, habits/schedules/completions, intents, sessions, plans/items, morning metadata/attempts, journal, and active-day facts. |
| Soft deletion/history parents | Implemented and automated/database tested | Canonical payload retains tombstoned parents needed by historical session links; active UI filters tombstones. |
| Economic authority | Implemented and automated/database tested | Rewards, point balance, purchase/consumption inventory, and milestones are derived/changed server-side and idempotently. |
| Continuous two-browser convergence | Core manual verification complete | Task creation, task updates, and habits passed. Broader smoke checks remain documented below. |
| Owner isolation | Automated database verification complete | RLS and cross-user database tests passed; manual remote user-A/user-B smoke test remains pending. |

## 3. Architecture overview

The Web app is Next.js App Router with React, strict TypeScript, Tailwind CSS, `@supabase/ssr`, and `@supabase/supabase-js`. Guest state is schema v8 in `first-move:app-state`; daily plans have their own local store. The production database is normalized rather than a single JSON state row.

Once cloud mode is activated, Supabase is canonical and the schema-v8 local workspace is the immediate UI cache. Each local mutation queues a complete validated workspace snapshot plus narrowly derived economic commands. `sync_cloud_workspace_v1` derives `auth.uid()`, locks the account, applies normalized rows atomically with server-receipt-time last-write-wins, soft-deletes omitted mutable rows, applies economic commands, records the mutation receipt, and returns the canonical workspace. This full-snapshot MVP is intentionally smaller than the designed normalized IndexedDB outbox/change-cursor architecture.

Immutable pre-setup guest backups live in IndexedDB. Cloud runtime metadata and pending full-snapshot mutations live in localStorage under a versioned runtime key. Neither mechanism is automatically erased.

### Repository build boundary

- The repository root is the Next.js Web project; Vercel builds that root application.
- `/mobile` is an independent Expo project with its own package/configuration files; EAS builds the `/mobile` application.
- Root TypeScript and ESLint explicitly exclude `/mobile`. Do not convert the repository into a package workspace or move the Web app.

## 4. Supabase Auth and Web setup data flow

1. The server renders the restored email from the Supabase cookie session.
2. **Sync across devices** submits email through `signInWithOtp` with `<current-origin>/auth/callback`.
3. The callback exchanges the returned code for a cookie session and redirects to the app; the Next.js proxy refreshes session cookies.
4. Authentication alone does not activate sync. With `NEXT_PUBLIC_CLOUD_SETUP_ENABLED=true`, the authenticated Supabase browser client calls `cloud_workspace_status` after session initialization.
5. An empty account offers Import this device or Start fresh. An initialized account offers Use cloud progress; no automatic device merge occurs.
6. Setup creates and verifies an immutable IndexedDB guest snapshot before mutation. The authenticated atomic RPC derives ownership from `auth.uid()` and rejects import into a non-empty workspace.
7. Canonical hydration validates every relationship, balance, inventory projection, milestone, and active-day result before replacing the active local cache.
8. Cloud activation is persisted per authenticated UUID. Reloads hydrate automatically and do not ask the same initialized device to repeat setup.

Web uses cookie-based sessions. Mobile must use the same Supabase Auth user UUID with platform-secure token persistence, not web cookies.

## 5. Current Mobile v1 state

### Implemented

- Web and Mobile use the same Supabase Auth UUID.
- Mobile authenticated business writes are enabled for the implemented Task, Habit/check-in, ActivityIntent, and ActivitySession mutations.
- Mobile writes only after an already-initialized account has successfully hydrated; empty-account Start fresh and Import this device remain deferred and write-disabled on Mobile.
- Mobile reuses the existing Web Sync v1 backend, RPCs, schema-v8 snapshot, and canonical-response contract; no new SQL, RPC, RLS, or Auth architecture was introduced for Mobile sync.
- Guest Mode remains local-only. Mobile queue, canonical cache, and editable working workspace are owner-scoped by Supabase Auth UUID; Guest and other accounts are never merged.
- Authenticated writes queue ordered full snapshots in AsyncStorage, flush pending writes before reads, revalidate the current session UUID, and replace the working/cache state only after canonical responses pass validation.
- A running timer is owned by the device that started it. Persisted Session state converges through normal sync; running timers are not realtime synchronized between devices.

### Manually verified where known

- On iOS Simulator, `firstmove://auth/callback`, magic-link sign-in, authenticated session persistence across restart, and canonical initialized-workspace hydration are manually verified.
- The repository records passing automated Mobile coverage and export checks. True-device iOS/Android acceptance is not complete; the M1E Mobile↔Web, offline/restart, and account-switch checklist remains pending.
- Web-side setup/import/hydration and core two-browser Task/Habit convergence remain the manually verified cross-platform evidence recorded in Sections 2 and 11.

### Intentionally deferred

- Mobile Today production usability, Cat interaction polish, RevenueCat Pro entitlement, server-controlled AI quota, true-device iOS/Android testing, and App Store/Google Play release requirements are not implemented.
- Mobile empty-account setup/import, post-session choices, rewards/history presentation, Cat/Morning Start, AI, notifications, and background services remain outside this handoff’s implemented Mobile scope.

## 6. Applied migration list

The repository contains these migrations in order:

| Migration | Purpose | Repository-recorded remote state |
| --- | --- | --- |
| `20260729000000_initial_schema.sql` | Normalized schema, RLS, privileges, catalog, point/active-day views, purchase and milestone foundations | Expected applied; Phase B2 could not operate without it. |
| `20260730120000_import_workspace.sql` | Workspace status, canonical v1 read, atomic Phase B2 initialization/import | Expected applied by recorded Phase B2 verification. |
| `20260731120000_import_completion_tombstones.sql` | v2 import with reward-only completion tombstones | Expected applied by the verified import path. |
| `20260731140000_canonical_history_parents.sql` | Canonical v2 payload including tombstoned relationship parents | Expected applied by verified canonical hydration. |
| `20260731180000_continuous_cloud_sync.sql` | Atomic continuous full-workspace sync and economic commands | Applied locally and remotely; automated tests passed; core two-browser behavior manually verified. |

Manual `npx supabase migration list` verification shows `20260731180000_continuous_cloud_sync.sql` in both Local and Remote. Cloud setup, import, hydration, refresh, retry, and continuous-sync RPCs are deployed. This documentation correction did not query or modify Supabase.

## 7. Web cloud lifecycle

The setup/import lifecycle in this section is implemented on Web. Mobile currently reuses the resulting initialized account and does not offer empty-account Start fresh or Import this device.

- Feature flag absent/false: authenticated users remain local; setup choices and continuous sync are hidden; the UI never says Synced.
- Empty account: **Set up sync** → Preparing backup → Importing → Verifying → Cloud copy ready.
- Existing account: **Cloud copy needs loading** → explicit confirmation → immutable backup → canonical validation/hydration → persisted active cloud mode.
- Active startup: restore authenticated UUID and runtime metadata, then hydrate the complete canonical workspace. A mismatched guest cache is never silently replaced.
- Active mutation: save locally first, append a durable pending mutation, display Syncing/Offline, submit when online, validate the canonical response, remove the acknowledged queue entry, and display Synced.
- Focus/manual refresh: flush pending writes before applying a canonical read, preventing a known unsent local snapshot from being silently overwritten.
- Failure: preserve cache, backup, and queue; display Offline · saved locally or Sync needs attention; retry manually or on return online.

Visible states are **Sign in to sync**, **Set up sync**, **Preparing backup**, **Importing**, **Verifying**, **Cloud copy ready**, **Syncing**, **Synced**, **Offline · saved locally**, and **Sync needs attention**. Authentication alone is never Synced. Settings shows the last successful sync time, Refresh cloud data, and a retry action when appropriate.

## 8. Data ownership and RLS rules

- Every user-owned table includes `user_id`; ownership is always the authenticated `auth.uid()`.
- RLS is enabled on all exposed user-owned tables. Policies explicitly target `authenticated` and prevent cross-user SELECT/INSERT/UPDATE/DELETE.
- Hard DELETE is denied to clients. Mutable entities use `deleted_at`; historical foreign keys remain intact.
- Anonymous clients have no public-schema data privileges. Authenticated clients receive only allowlisted table/view/function privileges.
- Trusted security-definer RPCs use a fixed safe search path, reject unauthenticated requests, and never accept an arbitrary target user ID.
- Browser/mobile clients use only the Supabase URL and publishable key. Service-role keys, database passwords, JWT signing secrets, OpenAI keys, and RevenueCat secrets must never ship in a client.
- Mini Journal rows are owner-private and excluded from AI, logs, analytics, notification previews, and support payloads.
- No toothbrush image, image hash, blob, or storage path exists in the cloud schema.

## 9. Reward and inventory authority rules

Clients may request product actions but never set a total point balance or arbitrary inventory quantity. Point balance is the sum of append-only `reward_ledger.points_tenths`. Task, habit, session, Morning Start, and first-reflection rewards are created server-side with semantic uniqueness so retries or two devices cannot duplicate them.

Purchases use a mutation UUID, server catalog price/unlock checks, an account transaction lock, a negative reward-ledger event, an inventory event, and the inventory-balance projection in one transaction. Consumption rejects insufficient quantity. Milestones recompute distinct canonical active days and grant each of 21, 50, and 100 days at most once. After an economic action, the RPC returns the canonical balance and inventory as part of the full workspace.

Imported inventory uses documented opening correction events because schema v8 does not retain complete historical inventory events. Existing rewards are preserved; reward-only task/habit completions are imported as tombstoned completion rows so historical ledger foreign keys remain valid without making the item appear completed.

## 10. Environment-variable names only

| Name | Client/server | Current purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public client configuration | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public client configuration | Publishable/anon client key; safe only with RLS and minimum privileges. |
| `NEXT_PUBLIC_CLOUD_SETUP_ENABLED` | Public build-time flag | Enables Phase B2 and continuous Web sync only when exactly `true`. |
| `OPENAI_API_KEY` | Server only | Optional live AI credential. Never expose to mobile/web clients. |
| `OPENAI_MODEL` | Server only | Optional model override; current default is `gpt-5.6-luna`. |
| `OPENAI_LIVE_VISION` | Server only | Enables explicit live toothbrush verification when exactly `true`. |
| `OPENAI_LIVE_PLANNING` | Server only | Enables explicit live planner requests when exactly `true`. |

No RevenueCat environment contract is implemented yet. `NODE_ENV` is framework/runtime configuration, not a First Move secret or deployment decision.

## 11. Manual Web acceptance checklist and recorded results

| Check | Recorded result |
| --- | --- |
| Guest Mode remains usable without login | Automated coverage present; manual verification pending for this freeze. |
| Email link callback restores a cookie session and shows the account email | Automated coverage present; repository records authentication as working, but no dated manual checklist is stored. |
| Import this device preserves guest data and creates verified cloud copy | **Manually verified** as Phase B2. |
| Use cloud progress hydrates the imported canonical copy | **Manually verified** as Phase B2. |
| Start fresh preserves guest data and creates an empty workspace | Implemented and automatically tested; manual second-empty-account verification pending. |
| Reload of an activated device bypasses setup and hydrates cloud | Automated coverage present; manual verification pending. |
| Client A creates a task; client B refreshes and converges | **Manually verified.** |
| Client A updates a task; client B refreshes and converges | **Manually verified.** Task deletion remains outside the recorded manual result. |
| Habits converge between two browsers | **Manually verified.** The recorded result does not separately claim every habit-completion conflict case. |
| Session, daily plan, and private journal converge | Automated coverage present; manual two-browser verification pending. |
| Reward/purchase retries do not duplicate points or inventory | Application/database coverage present; manual two-browser verification pending. |
| Offline write preserves cache and succeeds after retry | Implemented and automatically tested; manual offline edit/retry/second-browser convergence pending. |
| Owner A cannot read/write owner B | Automated RLS and cross-user database verification complete; manual remote user-A/user-B smoke test pending. |
| Header says Synced only after successful cloud activity | Automated coverage present; manual verification pending. |
| Continuous migration is applied remotely | **Verified.** Listed in both Local and Remote. |

Remaining manual checks are known verification items and do not block the current Mobile v1 implementation. They must remain visible in Web QA tracking; this MVP checkpoint is not fully QA-complete.

## 12. Known limitations and deferred features

- The continuous Web MVP queues complete workspace snapshots in localStorage, not normalized per-entity IndexedDB mutations; Mobile uses the corresponding owner-scoped AsyncStorage queue.
- Conflict handling is server-receipt-time last-write-wins; there is no long-offline conflict UI, field merge, or monotonic change cursor.
- There is no realtime subscription. Startup, focus, online retry, and manual refresh trigger convergence.
- There is no automatic merge of guest data from a second initialized device.
- Logout does not yet offer a cache keep/remove choice. Export, account deletion, backup management, and recovery UI are not implemented.
- A running timer has no realtime cross-device takeover workflow; it remains owned by the device that started it and persisted Session state converges through normal sync.
- Continuous sync remains feature-gated for controlled rollout. Its migration is remotely applied and core task/habit convergence is manually verified; the documented smoke tests remain pending.
- Guest data, immutable IndexedDB backups, Web runtime metadata, the Mobile AsyncStorage retry queue, transient planning drafts, local First Move templates, toothbrush image previews, and development-only controls remain device-local by design.
- Toothbrush photos are transient only; they are never synchronized or stored.
- RevenueCat, subscription UI/SDKs/webhooks, server AI quota/entitlement enforcement, region allowlisting, production AI access control, Mobile Today/Cat release polish, true-device testing, and store release work remain deferred.
- Current optional live AI routes are server-side and user-initiated, with mock/manual fallback and no automatic retries, but they are not the designed authenticated paid-AI gateway.
- The architecture documents describe a more complete B5 conflict/outbox design than the implemented MVP.

## 13. Mobile architecture constraints

- Use the existing Supabase project, normalized schema, RLS, RPC contracts, and Supabase Auth UUID. Do not create a parallel identity or database model.
- Store mobile access/refresh tokens using Keychain/Keystore-backed platform storage. Do not copy the web cookie adapter.
- Preserve Guest Mode and explicit **Sync across devices**. Never require login for core non-AI functionality.
- Preserve Import this device, Start fresh, and Use cloud progress semantics. Never upload a second device's guest data automatically or delete its backup.
- Keep UUID mappings and all parent/child relationships stable. Include tombstoned parents required by history and filter them only from active UI.
- Use UTC `timestamptz`, explicit `local_date`, and captured IANA timezone consistently. Do not derive historical dates using the current timezone.
- Treat Supabase as canonical only after complete validated hydration; preserve the active cache and pending work on failure.
- Never calculate authoritative points, inventory, purchases, rewards, or milestones in the mobile client.
- Never persist toothbrush images. Never send Mini Journal content to AI, analytics, logs, or notifications.
- Keep server-only keys and service-role credentials out of mobile builds.
- Maintain manual/local fallback for every AI feature and treat Rest/Intentional Entertainment as valid directions.

## 14. Mobile roadmap

### M0 — Foundation and authentication

Status: **implemented in the current `/mobile` tree; automated checks pass; callback/sign-in/restart persistence/hydration are manually verified on iOS Simulator; true-device acceptance remains pending**. An independent Expo SDK 57/React Native/TypeScript project now lives under `/mobile` without moving Web or creating a workspace. Expo Router provides First Moves, Today, Focus, Cat, and Settings placeholders. The app implements loading, signed-out, Guest Mode, authenticated, and privacy-safe error states; email magic links use `firstmove://auth/callback`; Supabase session values use a chunked `expo-secure-store` adapter backed by iOS Keychain and Android Keystore-encrypted storage.

M0 keeps schema-v8 guest data and account-scoped validated cloud caches separate. Authentication restores the existing Supabase Auth UUID. An initialized account is detected with `cloud_workspace_status` and hydrated read-only with the exact existing `get_cloud_workspace_v2` canonical payload, including UUID/reference, tombstone, balance, date, and captured timezone validation. An empty account receives a clear M1 setup boundary. No initialization, import, merge, continuous-sync, or other business-data write RPC exists in mobile M0. See `/mobile/README.md` for environment names, local commands, the manual acceptance checklist, and the exact redirect URL that the user must add manually.

### M1 — Core features

Status: **M1A through M1E implemented; automated Mobile checks pass and manual cross-platform M1E acceptance remains pending**. Mobile ports the local, non-AI I’m Stuck intent builder: schema-v8 normalization/migration through AsyncStorage, all six stuck states, the exact five directions, the existing offline template matrix, another suggestion, wording edits, manual entry, shorter duration, and one validated pending `ActivityIntent`.

Focus has three entries through the same local `ActivitySession` engine: the pending First Move at its 2/5/10/25-minute intended duration, standalone Countdown with 2/5/10/25/50-minute presets or validated 1–720 custom minutes, and standalone Stopwatch. Standalone tools accept an optional title, one of the five directions, and one existing Task or Habit link or no link; they do not create an `ActivityIntent`. Selecting Intentional Entertainment as the standalone direction does not narrow these normal Focus durations; only the separate dedicated Intentional Entertainment flow is limited to 5/10 minutes. Timestamp-derived elapsed time supports pause/resume, app-restart recovery, automatic countdown completion, neutral early stop, cancellation, actual elapsed persistence, and duplicate-open/completion prevention.

Completed and intentionally stopped Sessions persist before optional review; no second `Save session` action is required, and `Edit details` is optional. Review can change title and direction; standalone Sessions can link, relink, or unlink an existing Task/Habit without creating a parent. An assisted Session retains `linkedIntentId`, while its full Intent record becomes historical/consumed and retains any Task/Habit relationship. Session cancellation removes the open Session without creating a completed/stopped result and keeps the assisted Intent pending.

Guest local state and each Supabase Auth UUID’s local working/cache state use separate namespaces; switching owners exposes only that owner without merging data. For an initialized account, a completely validated canonical hydration becomes the editable working copy under the same stable UUIDs. An unreconciled pre-M1E account-local array is never submitted or merged into the full-snapshot RPC; canonical state replaces it on first successful activation. Validated canonical caches and durable retry records remain UUID-scoped.

Dedicated Mobile Tasks and Habits screens are directly usable from the current Today navigation in both Guest and authenticated account-local workspaces; the production-usable Today screen remains deferred. They retain the Web/schema-v8 fields and exact directions, use UUID-v4 parent identities and ISO timestamps, keep Task ordering, store completion facts in `completedOn` by current local date, and use daily or non-empty selected-weekday Habit schedules. New Focus link eligibility matches Web: only incomplete active Tasks and unchecked-today active Habits are selectable; completed, checked-today, deleted, or inactive items are excluded. Removing an item removes it only from the active schema-v8 local list while historical Session/Intent relationship IDs remain unchanged; the existing Web snapshot contract translates omission of an already-canonical parent into a database tombstone. M1D introduced no reward/history records; M1E now persists its authenticated mutations through the existing sync contract.

The Focus parent selector is one compact field that opens a searchable modal with separate Tasks and Habits, No linked item, and a clear selected state. It reads the current owner’s authoritative working set and still writes only `linkedTaskId` or `linkedHabitId`.

M1E preserves ordered start-before-close mutations. The existing snapshot RPC treats submitted Intent rows as pending, so the Mobile serializer submits only the active pending view and never reinterprets retained local `consumed` history as pending. Ordered durable snapshots ensure an offline assisted start creates its Intent parent before the closed Session retains that foreign key.

M1E reuses `cloud_workspace_status`, `get_cloud_workspace_v2`, and `sync_cloud_workspace_v1` unchanged. A per-Supabase-UUID AsyncStorage record holds one stable device UUID, the last successful cloud time, and ordered full schema-v8 snapshot mutations. Local UI state is saved only after the snapshot is durably queued; every dispatch revalidates the current authenticated UUID; failed or invalid responses keep the queue; startup, foreground, and manual refresh flush before reading; and only a validated canonical response replaces the working/cache state. Canonical daily plans and all untouched schema-v8 fields pass through unchanged, while economic command arrays stay empty and reward/point/inventory authority remains server-side.

M1E deliberately enables writes only for an already-initialized account that has successfully hydrated. Empty-account Start fresh / Import this device / Use cloud progress setup choices remain unimplemented on Mobile and write-disabled. Guest is still fully local. Manual same-account Mobile↔Web, offline/restart, and account-switch acceptance is the remaining release gate; `/mobile/README.md` contains the exact checklist.

Other remaining M1 work includes post-session choices, Today rewards/history, daily plans, Morning metadata, Mini Journal, cat/inventory presentation, and server-authoritative economy commands beyond Task/Habit completion rewards.

### M2 — Native capabilities

Status: **not started**. Add camera/photo-picker permission flows with memory-only toothbrush images, haptics, optional local notifications where platform rules permit, background/foreground lifecycle hardening, accessibility, reduced motion, secure storage recovery, deep-link hardening, and offline lifecycle tests. Do not promise guaranteed background alarms or app blocking.

### M3 — RevenueCat and AI access

Status: **designed only**. Integrate RevenueCat with Supabase Auth UUID as App User ID; implement purchase/restore/account-change lifecycle and trusted entitlement verification. Build the server AI provider interface, supported-region gate, idempotent usage ledger, rate limits, five lifetime actions for authenticated Free users, Pro daily quotas, short structured `gpt-5.6-luna` outputs, and no automatic retries. Guest is also intended to receive five introductory actions, but durable server-side Guest identity and enforcement remain unresolved in TASK-11.

### M4 — Store release

Status: **not started**. Complete privacy disclosures, data export/deletion, subscription copy, app-store products and review notes, accessibility/device matrix, security review, incident/rollback plan, analytics consent decisions, production migration verification, staged rollout, and App Store/Play Store submission.

## 15. Monetization decisions already made

- Core non-AI productivity, manual planning, local templates, tasks, habits, timers, Mini Journal, core cat content, and cross-device sync remain Free.
- Authenticated Free users receive five lifetime introductory paid AI actions shared across AI features.
- Guest is also intended to receive five introductory actions, but durable server-side Guest identity and enforcement remain unresolved TASK-11 design work.
- Pro allows one AI daily-plan request, three toothbrush-verification attempts, and five Make this smaller requests per local day.
- Pro may add advanced history and premium cat content without degrading or removing Free/earned core content.
- RevenueCat is authoritative for the `pro` entitlement; the Supabase Auth UUID is the RevenueCat App User ID.
- Client entitlement/counter claims are never authoritative. The planned server gateway must check identity, entitlement or introductory credit, feature quota, region, and rate limit before dispatch; this quota system is not implemented.
- OpenAI-backed features launch only in supported international markets; Mainland China is excluded initially.

## 16. Monetization decisions still open

- Subscription prices, billing periods, introductory/trial offers, storefront products, and launch currencies.
- Exact advanced-history and premium-cat feature scope.
- RevenueCat account-transfer/alias policy, webhook retention, grace period, refund, family-sharing, and outage behavior.
- Whether introductory credits survive account deletion/recreation and the abuse-prevention policy.
- Durable Guest identity, reset/reinstall behavior, and server-side enforcement for the intended five introductory Guest actions.
- Supported-country allowlist, legal/privacy review, tax/storefront availability, and any future region-specific AI provider.
- Usage display, upgrade timing/copy, manage-subscription UX, and customer-support/refund process.
- Cost budgets, model-change policy, and production rate-limit values.

## 17. Files a new Codex session must read first

Always read:

- `AGENTS.md`
- `PRD.md`
- `TASKS.md`
- `docs/MOBILE_V1_HANDOFF.md`

Then read only the implementation files relevant to the current feature.

Only when a task changes or inspects Auth, cloud sync, Supabase schema/RPC/RLS, UUID mapping, import/hydration, the offline queue, or backend contracts, additionally read:

- `docs/CLOUD_SYNC_ARCHITECTURE.md`
- `docs/CLOUD_SYNC_MAPPING.md`
- `docs/CLOUD_SYNC_IMPORT_MAPPING.md`
- `docs/CLOUD_SYNC_PHASE_B_PLAN.md`
- relevant Supabase migrations
- relevant Web/Mobile sync runtime and tests

For ordinary UI/product work such as Today, Cat, or release polish, do not require reading all cloud-sync documents and migrations.

## 18. Things the mobile implementation must not redesign or break

- Guest Mode as a complete, usable, no-login product.
- The five exact intentional directions and non-punitive treatment of Rest and Intentional Entertainment.
- The schema-v8 compatibility/import boundary and durable local-ID/cloud-UUID mapping semantics.
- Explicit Start fresh / Import this device / Use cloud progress choices and immutable device backup.
- Existing normalized table relationships, tombstones, canonical payload validation, RLS ownership, and minimum privileges.
- Supabase Auth UUID as the cross-platform identity and future RevenueCat App User ID.
- Append-only reward/inventory history, idempotency keys, derived point balance, and server-only economic authority.
- One reward per qualifying source/date and one 21/50/100 milestone grant per user.
- Mini Journal privacy and exclusion from AI/logs/analytics/notifications.
- The prohibition on storing toothbrush photos and exposing service-role, database, OpenAI, or RevenueCat secrets.
- UTC instant/local-date/IANA-timezone rules and preservation of historical references to tombstoned parents.
- Optional AI with explicit user action, manual fallback, short structured output, and no automatic retries.
- The distinction between authentication, initialized cloud copy, successful sync, offline cache, and error state.
