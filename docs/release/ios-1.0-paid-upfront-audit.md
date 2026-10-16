# iOS 1.0 paid-upfront release audit

**Historical implementation audit — 2026-10-13.** The passages, line numbers, baseline and verification below record that task as performed; they are not current publication status. On 2026-10-14 the public legal sources were revised locally for Build 2. See the [current privacy/publication audit](app-store-privacy-checklist.md) and [release gates](../IOS_APPSTORE_R1_RELEASE.md). Final owner-approved privacy classifications were applied to the current checklist on 2026-10-16; the historical classification questions below are superseded by that checklist. No deployment was performed. Build 1 remains the submitted/reviewed predecessor; Build 2 is the paid-upfront candidate.

## Baseline and authorized scope

Inspected 2026-10-13 before editing: branch `fix/focus-layout-regression`, HEAD `12cfe9d79e93010b74995cec063556d623492b61`, clean index and working tree. Preserve current UI work. The approved iPhone release costs USD $2.99 before download. No IAP, subscriptions, Pro tier, receipt gating, or user-facing AI. No Hearts/Bond work. No remote migration, deployment, environment change, EAS production build, Apple submission, commit, or push is authorized in this task.

## AI audit completed before removal

| Existing Mobile path | Exposure / call | Release action |
| --- | --- | --- |
| `mobile/src/ai/client.ts` → `loadMobileAiAccessStatus` | GET `/api/ai-access/status` with current Supabase bearer | Remove client and status types/tests; no replacement request. |
| `mobile/src/app-state/app-provider.tsx` → `refreshAiAccess` | Loads on account changes and foreground; exposes quota through context | Remove state, effects, refresh, and context fields. Preserve Auth/sync foreground refresh. |
| `mobile/src/components/ai-access-panel.tsx` / Settings | First Move AI, Free/Pro quotas, Refresh AI access | Remove panel and Settings entry. |
| `mobile/src/components/day-planner.tsx` → provider `organizeDay` → `requestMobileDayPlan` | POST `/api/organize-day`; brain dump and Organize with AI | Remove brain dump, provider call, AI review conversion, quota/status UI. Keep existing manual review, save, edit, and Focus handoff. |
| `mobile/src/components/morning-plan-flow.tsx` → provider `verifyToothbrush` → `requestMobileToothbrushVerification` | POST `/api/verify-toothbrush`; camera/library, resize, preview, verification, temporary files | Remove photo check and associated calls. Preserve the existing collapsed Today planning placement as manual planning. No substitute check or reward is introduced. |
| Make Smaller AI | Quota model mentions `make_smaller`; no Mobile implementation/call exists | Remove quota model. Local templates, manual First Moves, and duration shortening remain. |
| Other live AI | No other Mobile live AI endpoint/provider path found | Add a whole-Mobile source/network boundary regression guard. |
| Native image modules | `expo-image-picker`, `expo-image-manipulator`, direct `expo-file-system` used only by the removed photo component | Remove direct dependencies and picker permission plugin. Expo may retain file-system transitively for its own runtime. |

Historical Morning records and reward/sync schema remain compatible with existing accounts and Web. Existing manual plans, Journal, points, inventory, milestones, Cat interactions, Guest mode, secure optional accounts, Start fresh, and legal links remain.

## RevenueCat and deletion boundary audit

Mobile currently imports `revenuecat-native.ts` from its root provider. That adapter configures `react-native-purchases`, identifies the Supabase UUID, fetches CustomerInfo, presents the current/default Offering via `react-native-purchases-ui`, restores purchases, and reads platform public SDK keys. The provider subscribes to entitlement state and refreshes it on foreground. `subscription-panel.tsx` exposes Pro/Free state, Upgrade, purchase, and restore actions. All of these Mobile paths are removed.

Mobile account deletion keeps its authenticated initiation request, exact confirmation, fresh email link, UUID quarantine, owner-scoped cache/queue cleanup, stop-sync behavior, and local Supabase sign-out. Only the obsolete Apple recurring-billing warning/management action and Mobile RevenueCat identity callback are removed. Legacy Morning-skip key cleanup remains so old account data is still erased.

`src/lib/account-deletion-worker.ts` remains unchanged: it DELETEs the trusted UUID's RevenueCat customer, treats HTTP 200/404 as `deletion_satisfied`, then performs Storage preflight and Supabase Auth deletion. Provider failures retry with bounded categories. Existing database completion constraints require that RevenueCat status; removing it here would break deletion compatibility. No subscriber GET occurs in this deletion step and response bodies are not read. Keep the existing private server credential for this worker. The iOS client does not identify users to RevenueCat or read purchase/entitlement data.

The unchanged Web/server AI routes also retain RevenueCat entitlement checks and OpenAI implementations for the frozen Web scope. Their existence is not a Mobile feature; the release must contain no Mobile client path to them.

## Verification and legal follow-up

Approved public legal sources are not edited in this task. On 2026-10-13 all three production URLs returned successfully through an unauthenticated read. Every nonempty source line matches the published main content after Markdown/HTML formatting and whitespace normalization. These are published conflicts, not only unused draft text.

### Exact legal passages requiring separate review/update

The locations below refer to unchanged approved source lines. Section ranges identify the whole passage requiring review; quoted anchors identify the exact wording. These documents also cover the unchanged website: scope surviving Web AI and historical customer processing accurately instead of deleting truthful server/history statements globally.

| Public page / source | Exact passage or section | Required factual correction for iOS 1.0 |
| --- | --- | --- |
| [Privacy](https://firstmovestartsmall.com/privacy), [source line 10](../legal/privacy-policy.md#L10) | “cloud synchronization, subscriptions, and optional AI features.” | Intro still presents subscriptions/AI as part of the iOS app. Separate current iOS scope from any retained Web scope. |
| Privacy, lines 63–104 (section 4) | “The iOS 1.0 live AI features are:” followed by Plan my day and toothbrush verification; “First Move uses the **OpenAI API** to process these explicit AI requests.” | Entire iOS live-AI, brain-dump submission, photo capture/upload/processing, and temporary-photo descriptions are obsolete. Plan my day now has only its manual editor. |
| Privacy, lines 106–131 (section 5) | “For iOS 1.0, Pro includes:” and “one Plan my day AI action per day” / “three toothbrush-verification attempts per day.” | No Mobile Pro, lifetime introductory requests, quota reservation, or daily AI allowance. Historical/shared Web AI records may still exist. |
| Privacy, lines 133–145 (section 6) | “First Move Pro is offered through Apple's App Store as an auto-renewing subscription.” / “First Move uses **RevenueCat** to manage subscription entitlement and customer state.” / “The U.S. launch prices are US$4.99 per month and US$39.99 per year.” | Replace old iOS subscription/SDK identification/entitlement/pricing/billing claims with the separately approved paid-upfront model. |
| Privacy, lines 157–161 | “**OpenAI** processes content submitted through optional, explicit live AI requests.” / “**RevenueCat** manages App Store subscription entitlement and customer state.” / Apple “operates Apple subscription management.” | Scope providers to actual current iOS data flow. OpenAI no longer receives Mobile requests; RevenueCat remains a legacy server deletion recipient only for this app. Apple still distributes/charges for the app. |
| Privacy, lines 177–179 | “process optional AI requests that you initiate”; “enforce Free and Pro AI allowances”; “operate subscriptions and restore purchased entitlements” | These are no longer purposes of the Mobile app. |
| Privacy, line 195 and lines 207–209 | “OpenAI, RevenueCat, Resend, and Vercel are used under their standard commercial configurations.” / “AI usage records are retained…” / “Authentication, subscription, infrastructure, and transactional records…” | Review scope/retention for historical or Web records; removal from iOS does not prove those records or providers ceased to exist. |
| Privacy, lines 229 and 235 | “deletion of the associated RevenueCat customer record is requested”; “Use First Move's **Manage Apple subscription** control…” | Keep accurate legacy deletion disclosure at 229; the in-app management instruction at 235 is obsolete. Any historical subscription advice must be clearly separated from paid iOS 1.0. |
| [Terms](https://firstmovestartsmall.com/terms), [source line 5](../legal/terms-of-use.md#L5) | “subscriptions, and live AI services.” | Intro must distinguish paid iOS from unchanged Web features. |
| Terms, line 52; lines 56–94 (sections 5–6) | “The optional toothbrush verification feature…”; “The live AI features included in iOS 1.0 are:”; “For iOS 1.0, an active Pro entitlement includes:” | Photo feature, OpenAI submission, AI-generated suggestions, introductory/daily quota, and Pro benefit clauses no longer describe iOS. |
| Terms, lines 96–127 (sections 7–8) | “First Move Pro is offered as an **auto-renewing subscription through Apple's App Store**.”; “US$4.99 per month”; “US$39.99 per year”; “use **Restore purchases**”; “**Manage Apple subscription** control provided in First Move Settings” | Entire current-product subscription, price, renewal, RevenueCat, restore, and management section requires separate paid-app wording. Apple's billing/refund role still exists. |
| Terms, lines 131–135; line 146 | User content includes “photos”; AI permission “includes transmitting the specific content needed”; prohibition on bypassing “subscription… AI-quota” controls | Remove/scope claims about now-absent Mobile image/AI/purchase functionality while retaining valid cloud/content/security terms. |
| Terms, lines 165, 172, 176, 188, 214 | RevenueCat deletion request; “Account deletion does not cancel Apple billing”; “optional cloud and AI data flows”; “subscription benefits promised for an active paid period”; “AI results should be independently reviewed” | Retain legacy deletion where true. Review the remaining billing, service-change, privacy, and AI disclaimer clauses so they do not describe nonexistent iOS functionality. |
| [Support](https://firstmovestartsmall.com/support), [source lines 26–34](../legal/support.md#L26) | “First Move Pro subscriptions are purchased and billed through Apple's App Store.” / “The app includes **Restore purchases**… and a **Manage Apple subscription** control…” | This whole help section points to removed functionality. Paid-app support should use the separately approved wording. |
| Support, line 46 | “Deleting a First Move account does not cancel Apple billing.” | Scope any actual historical obligation; no recurring billing is offered by this release. |
| Support, lines 58–66 | “Live AI is optional and requires an authenticated account.” / “A toothbrush photo is uploaded only after you expressly request verification.” | Remove/scope the AI/photo help section; the iOS app provides neither feature. |

Additional context that should **not** be blindly removed: Privacy line 53 describes historical Morning completion metadata, which still synchronizes; Privacy line 59's Journal privacy protection remains true; Privacy line 229 and Terms line 165 describe the retained deletion worker. Provider retention must not be relabeled “zero” merely because the client modules are removed.

### App Store Privacy recommendations

The [internal checklist](app-store-privacy-checklist.md) is updated; App Store Connect is untouched.

| Declaration | Recommended iOS 1.0 answer | Evidence / limits |
| --- | --- | --- |
| Photos or Videos | **No** | No photo selection/capture/upload or AI verification in Mobile; photo modules and generated iOS usage descriptions are absent. Historical metadata contains no image bytes. |
| Purchases / Purchase History | **No** for monetary purchases | No SDK, IAP, receipt, StoreKit control, entitlement read, or purchase-history request. Apple sells the app before download. Legacy server DELETE sends only the UUID and never reads a response body; virtual point spending remains functional Cat/reward data. |
| Tracking | **No**, unchanged | No advertising, IDFA/ATT, cross-context advertising linkage, or tracking SDK was found. Auth/cloud sync and legacy deletion remain functional account processing. |

Retain the email, account-ID, user-content, and functional-activity disclosures for optional accounts. The old Device ID rationale is incomplete: the existing sync runtime sends an account-scoped device UUID as `p_device_id`; the checklist now explicitly flags this classification for review. Also review Gameplay Content for retained Cat progress/inventory under [Apple's App Privacy guidance](https://developer.apple.com/app-store/app-privacy-details/). These are existing data flows, not added collection. Do not mark the app “Data Not Collected.”

### Dependencies and configuration

Removed direct dependencies: `react-native-purchases`, `react-native-purchases-ui`, `expo-image-picker`, `expo-image-manipulator`, and `expo-file-system`. The lockfile also drops the three `@revenuecat/purchases-*` packages and `expo-image-loader`. Expo still depends on `expo-file-system` transitively for runtime assets; there is no Mobile application import or camera/photo access path.

Removed the image-picker config plugin and camera/photo permission strings. Removed all production/development RevenueCat public-key reads and example entries. Existing ignored local environment files and remote variables were left untouched; obsolete values cannot activate absent code. Kept Supabase public config and the public server origin for account deletion only. Build number is now `2`; display name, bundle, scheme, version `1.0.0`, iPhone-only setting, approved icon, domain, and EAS profiles are unchanged.

### Remaining steps and truthfulness

No implementation blocker remains to describing the **iOS client** as “One-time paid app, no In-App Purchases, no subscriptions, no user-facing AI.” A repository cannot itself set the App Store's selling price. The **published legal statements are still incompatible with that description**, and App Store pricing/product associations/listing/privacy answers still require owner reconciliation.

Before delivery: separately approve/publish the legal corrections; manually set USD $2.99 upfront pricing and detach subscription products from this submission; reconcile privacy classifications and listing/screenshots/review notes; verify existing Auth/sync/deletion configuration; authorize a fresh native Build 2; accept that exact build on iPhone/TestFlight, including optional account and disposable deletion tests; then separately authorize submission. No signed archive or device acceptance is claimed here. The retained server worker and shared Web AI/RevenueCat code do not create an iOS purchase or AI feature.

### Verification results

- Focused release/retained-feature suite: **69 passed** (includes Guest startup, authenticated sync, Start fresh, manual planning/Focus handoff, deletion cleanup, legal links, identity, and removal guards).
- Full Mobile suite: **309 passed**, zero failures. Mobile strict TypeScript and Expo lint pass.
- Unchanged server deletion suites: **37 passed**, covering initiation, fresh authentication, bounded worker/retry, RevenueCat 200/404 without GET/body reads, and Auth deletion compatibility. No real customer or account was deleted.
- `npm run validate:release-config`: public Expo config and iOS introspection pass for version/build **1.0.0 / 2**; no camera/photo/microphone usage descriptions, purchase plugin, or invented IAP entitlement.
- Native Expo and React Native iOS autolinking: removed modules absent. No generated `mobile/ios` or `mobile/android` directory exists to retain stale native code.
- Local production iOS Hermes export passes with dotenv disabled. Source-map audit covers **1,328 modules / 65 application source files**: no RevenueCat SDK, removed image modules, AI clients/endpoints, or paid/AI UI. Output: `/tmp/first-move-paid-ios-export`. This is an export, not an EAS production build or signed `.ipa`.
- Root strict TypeScript and ESLint pass. Full Web tests and Next production build are not rerun because Web/shared implementation and approved legal sources are unchanged. Server deletion regression tests above are the relevant compatibility check.
- `git diff --check` passes. Focus/Cat domain/UI, icon assets, Web source, Supabase migrations/worker, and approved legal sources have no diff.
- Outside-repository writes are limited to temporary export/config/autolinking/legal-read/test-log artifacts under `/tmp`; project-local dependency uninstall updates `mobile/node_modules`. No global installation, Git mutation, remote migration, deployment, production environment change, EAS build, Apple action, commit, or push.

### Changed files

The complete working-tree inventory follows (M = modified, D = deleted, A = new); every deletion is an audited removed Mobile AI/purchase path or its obsolete test. Existing UI code outside those surfaces is preserved.


| Status | File |
| --- | --- |
| M | `PRD.md` |
| M | `TASKS.md` |
| M | `docs/IOS_APPSTORE_R1_RELEASE.md` |
| M | `docs/MOBILE_V1_HANDOFF.md` |
| M | `docs/release/app-store-privacy-checklist.md` |
| A | `docs/release/ios-1.0-paid-upfront-audit.md` |
| M | `mobile/.env.example` |
| M | `mobile/README.md` |
| M | `mobile/app.json` |
| M | `mobile/package-lock.json` |
| M | `mobile/package.json` |
| A | `mobile/scripts/validate-release-config.mjs` |
| M | `mobile/src/account-deletion-ui.test.ts` |
| M | `mobile/src/account-deletion/account-deletion.test.ts` |
| M | `mobile/src/account-deletion/account-deletion.ts` |
| D | `mobile/src/ai-ui.test.ts` |
| D | `mobile/src/ai/access.ts` |
| D | `mobile/src/ai/client.test.ts` |
| D | `mobile/src/ai/client.ts` |
| M | `mobile/src/app-state/app-provider.tsx` |
| M | `mobile/src/app/(tabs)/first-moves.tsx` |
| M | `mobile/src/app/(tabs)/settings.tsx` |
| M | `mobile/src/app/(tabs)/today.tsx` |
| M | `mobile/src/components/account-deletion-panel.tsx` |
| D | `mobile/src/components/ai-access-panel.tsx` |
| A | `mobile/src/components/day-plan-flow.tsx` |
| M | `mobile/src/components/day-planner.tsx` |
| D | `mobile/src/components/morning-plan-flow.tsx` |
| M | `mobile/src/components/reflection-editor.tsx` |
| D | `mobile/src/components/subscription-panel.tsx` |
| M | `mobile/src/config.ts` |
| A | `mobile/src/paid-release.test.ts` |
| M | `mobile/src/release-config.test.ts` |
| M | `mobile/src/settings-polish-ui.test.ts` |
| D | `mobile/src/subscription-ui.test.ts` |
| D | `mobile/src/subscriptions/revenuecat-native.ts` |
| D | `mobile/src/subscriptions/revenuecat.test.ts` |
| D | `mobile/src/subscriptions/revenuecat.ts` |
| M | `mobile/src/today-ui.test.ts` |
