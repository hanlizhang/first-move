# First Move Mobile v1 handoff

Status: frozen Web Sync v1 MVP checkpoint on 2026-08-01 from development branch `cloud-sync`, based on recorded commit `eddce4ba75c1d3ffb9c0da32e8bd4cb13d8cf19b` plus the documented checkpoint changes. The checkpoint has pending smoke tests and is not a claim of production-perfect or fully QA-complete synchronization.

Status vocabulary used here:

- **Implemented:** present in the inspected repository working tree.
- **Automated tested:** corresponding application/database test coverage exists; this documentation pass did not rerun it.
- **Manually verified:** explicitly recorded as verified in the repository documents.
- **Designed only / not started:** architecture exists, but production implementation does not.

## 1. Product summary

First Move is a gentle, responsive productivity app for moving from passive scrolling or inactivity into one intentionally small action. Guest Mode provides the complete non-AI product without an account. Core Web features include the I'm Stuck flow, five intentional directions, local First Move templates, tasks, habits, countdown/stopwatch sessions, daily planning, Morning Start, Mini Journal, history, rewards, and the virtual cat/store experience.

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

## 4. Supabase Auth and data flow

1. The server renders the restored email from the Supabase cookie session.
2. **Sync across devices** submits email through `signInWithOtp` with `<current-origin>/auth/callback`.
3. The callback exchanges the returned code for a cookie session and redirects to the app; the Next.js proxy refreshes session cookies.
4. Authentication alone does not activate sync. With `NEXT_PUBLIC_CLOUD_SETUP_ENABLED=true`, the authenticated Supabase browser client calls `cloud_workspace_status` after session initialization.
5. An empty account offers Import this device or Start fresh. An initialized account offers Use cloud progress; no automatic device merge occurs.
6. Setup creates and verifies an immutable IndexedDB guest snapshot before mutation. The authenticated atomic RPC derives ownership from `auth.uid()` and rejects import into a non-empty workspace.
7. Canonical hydration validates every relationship, balance, inventory projection, milestone, and active-day result before replacing the active local cache.
8. Cloud activation is persisted per authenticated UUID. Reloads hydrate automatically and do not ask the same initialized device to repeat setup.

Web uses cookie-based sessions. Mobile must use the same Supabase Auth user UUID with platform-secure token persistence, not web cookies.

## 5. Applied migration list

The repository contains these migrations in order:

| Migration | Purpose | Repository-recorded remote state |
| --- | --- | --- |
| `20260729000000_initial_schema.sql` | Normalized schema, RLS, privileges, catalog, point/active-day views, purchase and milestone foundations | Expected applied; Phase B2 could not operate without it. |
| `20260730120000_import_workspace.sql` | Workspace status, canonical v1 read, atomic Phase B2 initialization/import | Expected applied by recorded Phase B2 verification. |
| `20260731120000_import_completion_tombstones.sql` | v2 import with reward-only completion tombstones | Expected applied by the verified import path. |
| `20260731140000_canonical_history_parents.sql` | Canonical v2 payload including tombstoned relationship parents | Expected applied by verified canonical hydration. |
| `20260731180000_continuous_cloud_sync.sql` | Atomic continuous full-workspace sync and economic commands | Applied locally and remotely; automated tests passed; core two-browser behavior manually verified. |

Manual `npx supabase migration list` verification shows `20260731180000_continuous_cloud_sync.sql` in both Local and Remote. Cloud setup, import, hydration, refresh, retry, and continuous-sync RPCs are deployed. This documentation correction did not query or modify Supabase.

## 6. Cloud-mode lifecycle

- Feature flag absent/false: authenticated users remain local; setup choices and continuous sync are hidden; the UI never says Synced.
- Empty account: **Set up sync** → Preparing backup → Importing → Verifying → Cloud copy ready.
- Existing account: **Cloud copy needs loading** → explicit confirmation → immutable backup → canonical validation/hydration → persisted active cloud mode.
- Active startup: restore authenticated UUID and runtime metadata, then hydrate the complete canonical workspace. A mismatched guest cache is never silently replaced.
- Active mutation: save locally first, append a durable pending mutation, display Syncing/Offline, submit when online, validate the canonical response, remove the acknowledged queue entry, and display Synced.
- Focus/manual refresh: flush pending writes before applying a canonical read, preventing a known unsent local snapshot from being silently overwritten.
- Failure: preserve cache, backup, and queue; display Offline · saved locally or Sync needs attention; retry manually or on return online.

Visible states are **Sign in to sync**, **Set up sync**, **Preparing backup**, **Importing**, **Verifying**, **Cloud copy ready**, **Syncing**, **Synced**, **Offline · saved locally**, and **Sync needs attention**. Authentication alone is never Synced. Settings shows the last successful sync time, Refresh cloud data, and a retry action when appropriate.

## 7. Data ownership and RLS rules

- Every user-owned table includes `user_id`; ownership is always the authenticated `auth.uid()`.
- RLS is enabled on all exposed user-owned tables. Policies explicitly target `authenticated` and prevent cross-user SELECT/INSERT/UPDATE/DELETE.
- Hard DELETE is denied to clients. Mutable entities use `deleted_at`; historical foreign keys remain intact.
- Anonymous clients have no public-schema data privileges. Authenticated clients receive only allowlisted table/view/function privileges.
- Trusted security-definer RPCs use a fixed safe search path, reject unauthenticated requests, and never accept an arbitrary target user ID.
- Browser/mobile clients use only the Supabase URL and publishable key. Service-role keys, database passwords, JWT signing secrets, OpenAI keys, and RevenueCat secrets must never ship in a client.
- Mini Journal rows are owner-private and excluded from AI, logs, analytics, notification previews, and support payloads.
- No toothbrush image, image hash, blob, or storage path exists in the cloud schema.

## 8. Reward and inventory authority rules

Clients may request product actions but never set a total point balance or arbitrary inventory quantity. Point balance is the sum of append-only `reward_ledger.points_tenths`. Task, habit, session, Morning Start, and first-reflection rewards are created server-side with semantic uniqueness so retries or two devices cannot duplicate them.

Purchases use a mutation UUID, server catalog price/unlock checks, an account transaction lock, a negative reward-ledger event, an inventory event, and the inventory-balance projection in one transaction. Consumption rejects insufficient quantity. Milestones recompute distinct canonical active days and grant each of 21, 50, and 100 days at most once. After an economic action, the RPC returns the canonical balance and inventory as part of the full workspace.

Imported inventory uses documented opening correction events because schema v8 does not retain complete historical inventory events. Existing rewards are preserved; reward-only task/habit completions are imported as tombstoned completion rows so historical ledger foreign keys remain valid without making the item appear completed.

## 9. Environment-variable names only

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

## 10. Manual Web acceptance checklist and recorded results

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

Remaining manual checks are known verification items and do not block Mobile M0 architecture work. They must remain visible in Web QA tracking; this MVP checkpoint is not fully QA-complete.

## 11. Known limitations and deferred features

- The continuous MVP queues complete workspace snapshots in localStorage, not normalized per-entity IndexedDB mutations.
- Conflict handling is server-receipt-time last-write-wins; there is no long-offline conflict UI, field merge, or monotonic change cursor.
- There is no realtime subscription. Startup, focus, online retry, and manual refresh trigger convergence.
- There is no automatic merge of guest data from a second initialized device.
- Logout does not yet offer a cache keep/remove choice. Export, account deletion, backup management, and recovery UI are not implemented.
- A running session has no explicit cross-device takeover workflow beyond canonical refresh/LWW behavior.
- Continuous sync remains feature-gated for controlled rollout. Its migration is remotely applied and core task/habit convergence is manually verified; the documented smoke tests remain pending.
- Guest data, immutable IndexedDB backups, the runtime retry queue, transient planning drafts, local First Move templates, toothbrush image previews, and development-only controls remain device-local by design.
- Toothbrush photos are transient only; they are never synchronized or stored.
- RevenueCat, subscription UI/SDKs/webhooks, server AI quota/entitlement enforcement, region allowlisting, production AI access control, and native mobile are not started.
- Current optional live AI routes are server-side and user-initiated, with mock/manual fallback and no automatic retries, but they are not the designed authenticated paid-AI gateway.
- The architecture documents describe a more complete B5 conflict/outbox design than the implemented MVP.

## 12. Mobile architecture constraints

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

## 13. Mobile roadmap

### M0 — Foundation and authentication

Status: **implemented on `mobile/expo-v1`; automated checks pass, manual device acceptance pending**. An independent Expo SDK 57/React Native/TypeScript project now lives under `/mobile` without moving Web or creating a workspace. Expo Router provides First Moves, Today, Focus, Cat, and Settings placeholders. The app implements loading, signed-out, Guest Mode, authenticated, and privacy-safe error states; email magic links use `firstmove://auth/callback`; Supabase session values use a chunked `expo-secure-store` adapter backed by iOS Keychain and Android Keystore-encrypted storage.

M0 keeps schema-v8 guest data and account-scoped validated cloud caches separate. Authentication restores the existing Supabase Auth UUID. An initialized account is detected with `cloud_workspace_status` and hydrated read-only with the exact existing `get_cloud_workspace_v2` canonical payload, including UUID/reference, tombstone, balance, date, and captured timezone validation. An empty account receives a clear M1 setup boundary. No initialization, import, merge, continuous-sync, or other business-data write RPC exists in mobile M0. See `/mobile/README.md` for environment names, local commands, the manual acceptance checklist, and the exact redirect URL that the user must add manually.

### M1 — Core features

Status: **not started**. Port the I'm Stuck flow, local templates, tasks, habits, timers/session recovery, daily plans, Morning metadata, Mini Journal, history, cat/inventory presentation, Phase B2 choices, canonical hydration, retry-safe continuous writes, and all server-authoritative economy RPCs. Run web/mobile same-account acceptance.

### M2 — Native capabilities

Status: **not started**. Add camera/photo-picker permission flows with memory-only toothbrush images, haptics, optional local notifications where platform rules permit, background/foreground timer recovery, accessibility, reduced motion, secure storage recovery, deep-link hardening, and offline lifecycle tests. Do not promise guaranteed background alarms or app blocking.

### M3 — RevenueCat and AI access

Status: **designed only**. Integrate RevenueCat with Supabase Auth UUID as App User ID; implement purchase/restore/account-change lifecycle and trusted entitlement verification. Build the server AI provider interface, supported-region gate, idempotent usage ledger, rate limits, five lifetime Free actions, Pro daily quotas, short structured `gpt-5.6-luna` outputs, and no automatic retries.

### M4 — Store release

Status: **not started**. Complete privacy disclosures, data export/deletion, subscription copy, app-store products and review notes, accessibility/device matrix, security review, incident/rollback plan, analytics consent decisions, production migration verification, staged rollout, and App Store/Play Store submission.

## 14. Monetization decisions already made

- Core non-AI productivity, manual planning, local templates, tasks, habits, timers, Mini Journal, core cat content, and cross-device sync remain Free.
- Free accounts receive five lifetime introductory paid AI actions shared across AI features.
- Pro allows one AI daily-plan request, three toothbrush-verification attempts, and five Make this smaller requests per local day.
- Pro may add advanced history and premium cat content without degrading or removing Free/earned core content.
- RevenueCat is authoritative for the `pro` entitlement; the Supabase Auth UUID is the RevenueCat App User ID.
- Client entitlement/counter claims are never authoritative. The server checks auth, entitlement or introductory credit, feature quota, region, and rate limit before dispatch.
- OpenAI-backed features launch only in supported international markets; Mainland China is excluded initially.

## 15. Monetization decisions still open

- Subscription prices, billing periods, introductory/trial offers, storefront products, and launch currencies.
- Exact advanced-history and premium-cat feature scope.
- RevenueCat account-transfer/alias policy, webhook retention, grace period, refund, family-sharing, and outage behavior.
- Whether introductory credits survive account deletion/recreation and the abuse-prevention policy.
- Supported-country allowlist, legal/privacy review, tax/storefront availability, and any future region-specific AI provider.
- Usage display, upgrade timing/copy, manage-subscription UX, and customer-support/refund process.
- Cost budgets, model-change policy, and production rate-limit values.

## 16. Files a new Codex session must read first

1. `AGENTS.md`
2. `PRD.md`
3. `TASKS.md`
4. `docs/MOBILE_V1_HANDOFF.md`
5. `docs/CLOUD_SYNC_ARCHITECTURE.md`
6. `docs/CLOUD_SYNC_MAPPING.md`
7. `docs/CLOUD_SYNC_IMPORT_MAPPING.md`
8. `docs/CLOUD_SYNC_PHASE_B_PLAN.md`
9. All files in `supabase/migrations/`, in timestamp order
10. `src/lib/models.ts`, `src/lib/app-state.ts`, `src/lib/store.ts`, `src/lib/repository.ts`, and `src/lib/daily-plan-state.ts`
11. `src/lib/cloud-backup.ts`, `src/lib/cloud-import.ts`, `src/lib/cloud-setup.ts`, `src/lib/cloud-hydration.ts`, and `src/lib/cloud-runtime.ts`
12. `src/lib/auth-flow.ts`, `src/lib/supabase/`, `src/proxy.ts`, `src/app/auth/callback/route.ts`, `src/app/auth-settings.tsx`, and `src/app/first-move-app.tsx`

Read the implementation and migration tests alongside these files before changing a contract. Some older design/status wording outside the four handoff documents may describe a pre-implementation state.

## 17. Things the mobile implementation must not redesign or break

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
