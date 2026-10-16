# First Move iOS 1.0 / Build 2 — App Store Privacy Checklist

**INTERNAL ONLY — DO NOT PUBLISH**

Final owner-approved classifications applied 2026-10-16 against implementation at `e723e8b3af8ee122cd80eedbf402bbf1a8876f45`. This document records the approved answers; App Store Connect and production settings are unchanged. The public legal sources have been revised locally for the paid-upfront release and are not yet published by this task.

Build 1 was submitted/reviewed under the earlier product model. Build 2 is the new USD $2.99 upfront candidate: no IAP, subscriptions, Pro, Mobile RevenueCat, receipts, or user-facing AI. Preserve Build 1 records as history. Launch storefronts remain United States, Canada, Switzerland, Australia, New Zealand, and Singapore. UK and Japan are outside this launch.

## Classification method and limits

Use [Apple's App Privacy guidance](https://developer.apple.com/app-store/app-privacy-details/) (checked 2026-10-14). Collection includes retained off-device processing by providers. Optional cloud use still counts; local-only Guest state does not. Apple's independent transaction processing is separate from developer collection. Classifications below are the owner-approved Build 2 decisions applying that guidance to the audited data flows, not an Apple ruling.

Scope: all Mobile source, dependencies/configuration, cloud queue/runtime and canonical parser, relevant database migrations, account deletion, and public-link behavior. No production credentials, customer data, provider dashboards, or remote configuration were inspected. Prior release records establish Resend SMTP and the Supabase database region; production settings need owner reconfirmation before publication/submission. No signed Build 2 artifact exists in this audit.

## Approved Build 2 answers

All **Yes** rows below are **linked to the user**, used for **App Functionality**, and **not used for tracking**, for this release. Provider logging details have not been independently inspected in production. No advertising, marketing, behavioral analytics, or recommendation-personalization purpose is evidenced in Mobile. Restoring user-chosen settings is functional state restoration.

| Apple category | Recommendation | Repository/data-flow basis |
| --- | --- | --- |
| Contact Info → Email Address | **Yes** | Supabase email magic links and Resend authentication delivery. |
| Identifiers → User ID | **Yes** | Supabase Auth UUID on cloud rows and authenticated API requests; also sent for legacy RevenueCat deletion. |
| Identifiers → Device ID | **Yes** | Persistent random per-account installation identifier leaves the device as `p_device_id` and is stored in `devices`, sessions, and mutation records. Detailed trace below. |
| User Content → Other User Content | **Yes** | Task/habit/First Move text, manual plans, Focus labels, Journal text and preferences synchronize. |
| User Content → Gameplay Content | **No** | Cat/reward/inventory/furniture/point/progression records are Product Interaction in this productivity app. |
| Usage Data → Product Interaction | **Yes** | Task/habit completions, Focus activity/durations, active dates, rewards, item spending/consumption and account activity are retained functional usage. No general tap/scroll analytics stream. |
| Health & Fitness → Health | **Yes** | Optional structured Mood/Energy ratings (1–5) are cloud synced for authenticated accounts and used for App Functionality. No diagnosis, treatment or mental-health assessment. |
| User Content → Customer Support | **No** | The iOS app opens an external support page/mail client; no in-app support submission or automatic attachment upload. Separately received email correspondence remains described publicly. |
| User Content → Photos or Videos | **No** | No Mobile selection/capture/upload/verification path or associated native permissions/modules. Historical Morning metadata and bundled artwork are not user photos. |
| Purchases → Purchase History | **No** | No Mobile IAP, subscriptions, receipts or transaction collection. Earned-point redemption is Product Interaction, not monetary Purchase History. |
| Diagnostics → Other Diagnostic Data | **Yes** | Ordinary retained infrastructure request/error/observability logging by providers such as Supabase and Vercel supports App Functionality. Exact production log fields and retention are not asserted. |
| Diagnostics → Crash Data | **No** | No client crash-reporting SDK or crash-upload path. Ordinary provider request/error logging is covered as Other Diagnostic Data. |
| Diagnostics → Performance Data | **No** | No client app-performance telemetry. Backend/server request duration is not classified as client App Performance Data. |
| Financial Info → Payment Info, Credit Info, Other Financial Info | **No** | No payment details or financial account data requested; virtual points have no monetary value. |
| Location → Precise / Coarse Location | **No location feature found** | No geolocation module or location field. IANA time zone is used for day boundaries, not location inference. Reassess if provider IP addresses are used to derive/store location. |
| Health & Fitness → Fitness | **No dedicated fitness collection found** | Generic Focus categories can include Exercise & Movement, but no workout/step/body metric collection or fitness integration. Generic task text remains Other User Content; review if structured exercise tracking is later added. |
| Sensitive Info | **No specifically requested category found** | No racial, religious, biometric, disability, or other such structured fields. Free-form Journal text is not a reason to declare every possible topic; structured mood/energy is considered separately above. |
| Name, Phone Number, Physical Address, Other User Contact Info | **No structured collection found** | Account signup asks for email only. Support may contain voluntarily supplied details; review the operator's actual support workflow. |
| Contacts, Emails or Text Messages, Audio Data | **No app collection found** | No address book, inbox, messaging, microphone, or audio-upload access. Outgoing authentication email is not access to users' email contents. Support email is sent externally, outside the iOS collection flow. |
| Browsing History, Search History, Advertising Data | **No** | No browsing-history upload or ads. Local task/habit selectors do not upload search terms. Legal links open externally with `Linking.openURL`. |
| Other Usage Data | **No additional category identified** | Retained functional activity is described under Product Interaction. |
| Environment Scanning, Hands, Head | **No** | No camera/environment/body capture path. |
| Other Data Types | **No additional category identified in app code** | Time-zone preferences and account operational metadata are accounted for above; do not assume provider metadata is absent without checking it. |
| Tracking | **No** | No ads, IDFA/ATT integration, data-broker sharing or cross-company advertising linkage found. Functional IDs do not imply tracking. |

Do not mark the whole app “Data Not Collected.” Guest Mode and optional account sync have different collection behavior.

## Device ID: complete trace and conclusion

1. `mobile/src/domain/ids.ts:createUuidV4` first uses `globalThis.crypto.randomUUID`, then random bytes from `getRandomValues`, with a `Math.random` fallback. The UUID contains no hardware, Apple, advertising, vendor, phone, or network identifier.
2. `mobile/src/cloud/sync-queue.ts:emptyRecord` creates `deviceId` when there is no existing account queue record. `createMobileSyncQueue` loads/saves it under `first-move:mobile:cloud-sync:v1:<Supabase UUID>`.
3. `mobile/src/app-state/app-provider.tsx` supplies AsyncStorage. `mobile/src/cloud/sync-runtime.ts:start` saves the loaded/new record. It persists across launches; accounts on the same installation have different records and identifiers. Signing out retains the record, so signing back into the same account reuses it. A clean uninstall/reinstall removes this app-container record and creates a new value; offloading can retain it. The installed iOS AsyncStorage implementation excludes its storage from backup by default, with no app override found. Clearing the record also allows a new value. It is not an immutable or globally reliable physical-device identity.
4. `startFresh` sends it to `initialize_cloud_workspace_v2` as `p_device_id`. `flushPending` sends the same field with `sync_cloud_workspace_v1`, the current authenticated account, a mutation UUID, time zone and workspace payload.
5. `supabase/migrations/20260731180000_continuous_cloud_sync.sql` verifies ownership, upserts `devices(id, user_id, platform, last_seen_at)`, associates sessions with the device, and stores `(user_id, device_id, mutation_id)` for idempotency. The inherited RPC hardcodes the platform label `web` even for Mobile; this does not prevent collection of the installation ID. No schema change is made here.
6. The initial-schema foreign keys link these rows to the account. Mobile deletion removes the account-scoped queue/cache; server account deletion cascades owner rows. Signing out is not equivalent to deleting this state. No claim is made about backup purge timing.

**Declare Device ID = Yes, linked, App Functionality, Tracking = No.** Although it is generated per account/installation rather than read from physical hardware, it distinguishes a persistent installation and is stored off-device for device-associated sync/session behavior. Calling it merely a User ID would omit that distinct role. This approved classification is an interpretation of Apple's device-level identifier category supported by the actual use, not by the field name alone.

## Cat, rewards and activity: complete trace and classification

- `mobile/src/domain/models.ts` holds `inventory.items`, quantities, selected furniture, reward events, points, active dates and milestones. `mobile/src/domain/cat.ts` derives display/progression and handles the Guest economy. Guest saves remain local.
- Authenticated item spending and food consumption use `SyncEconomicCommands` in `mobile/src/cloud/sync-queue.ts`; `mobile/src/cloud/sync-runtime.ts` sends them with the workspace. The continuous-sync migration calls `purchase_inventory_item`, adjusts inventory, records consumption, stores selected furniture and grants earned milestones. The server, not Mobile, controls authenticated balances and rewards.
- `mobile/src/cloud/canonical-workspace.ts` hydrates `reward_ledger`, `inventory_events`, `inventory_balances`, `milestone_grants`, selected furniture and verified points. These persisted records restore Cat/reward progress and are classified as **Product Interaction**, not Gameplay Content or Purchase History. They are not uncollected just because a Cat display is calculated locally.
- Task/habit completion dates, session durations, reward sources, item acquisition and consumption are **Product Interaction** for functional history/economy. This purpose is not automatically Analytics; no behavioral analytics SDK or evaluation stream is present.
- User-written task, habit, First Move, plan and session labels and Journal text are **Other User Content**. Structured Mood/Energy ratings are separately classified as Health.
- `mobile/src/app/(tabs)/cat.tsx` and `mobile/src/domain/cat-interactions.ts` keep animation position, facing, toy targets, idle timers and gesture sequences in component/runtime state. No upload of each petting/play gesture is present. Feeding changes inventory and selecting furniture changes saved settings, so those effects do sync. Do not claim every Cat interaction is uploaded or that all Cat data stays local.

**Approved classification:** Gameplay Content = No; Purchase History = No. Earned points cannot be bought, cashed out or used for monetary transactions. Item redemption, inventory, furniture, rewards and progression are Product Interaction for this productivity app. There is no Mobile receipt or monetary transaction collection.

## Structured reflection and diagnostics findings

`mobile/src/components/reflection-editor.tsx` offers separate optional Mood and Energy controls, each rated 1–5. Authenticated values are stored in `journal_entries.mood` and `.energy` and restored by the canonical parser. These fields remain in Build 2 and are classified **Health = Yes**, linked to the account, for **App Functionality**. They support saving and displaying personal reflections, not diagnosis, medical treatment or mental-health assessment. Generic free text remains Other User Content; Guest reflections remain local.

`mobile/src/cloud/sync-runtime.ts` exposes safe sync diagnostics locally without a telemetry uploader. The account-deletion migrations retain functional status, bounded failure categories, retries and timestamps to complete/recover deletion. These workflow records alone are not the rationale for the diagnostic classification.

**Other Diagnostic Data = Yes**, for App Functionality, covers ordinary retained infrastructure request/error/observability logging from providers such as Supabase and Vercel. [Supabase Auth audit logs](https://supabase.com/docs/guides/auth/audit-logs) and [Vercel runtime logs](https://vercel.com/docs/logs/runtime) describe provider logging capabilities. Exact production log fields, exports and retention have not been inspected and are not asserted here. Treat account-associated diagnostic processing as linked to the user; do not infer that every log entry contains an account identifier.

**Crash Data = No; Performance Data = No.** No client crash-reporting SDK or app-performance telemetry exists in the audited Mobile implementation. Backend/server request duration is not client App Performance Data. Provider request/error logs are represented by Other Diagnostic Data, not a claim that the app uploads crash reports or launch/hang/energy metrics. For any retained IP addresses, classification depends on actual use; logging does not itself establish tracking or location inference.

## Providers and boundary with Web

- **Supabase:** email Auth, account IDs, content, structured reflection, functional activity, sync IDs and operational records. Previously documented primary database: Stockholm, Sweden. Confirm production facts without exposing keys.
- **Resend:** SMTP authentication delivery, recipient email and delivery metadata. Keep the prior verified production disclosure; no new configuration was made.
- **Vercel:** website and API hosting, including account-deletion requests. The old precise `iad1` statement was not backed by a repository region setting; public wording now describes international processing without promising a fixed function region.
- **Apple:** independent app distribution, USD $2.99 upfront purchase, payment/refund handling. Mobile has no receipt or purchase-history collection.
- **RevenueCat for iOS deletion:** `src/lib/account-deletion-worker.ts:requestRevenueCatCustomerDeletion` sends the account UUID with DELETE, checks HTTP 200/404 and never reads the body. It runs for new accounts too, to ensure a legacy record is absent. This is not a current purchase system. Existing completion constraints require the step; retain the server credential and worker unchanged.
- **Separate Web behavior:** `src/app/auth-settings.tsx` loads access status, `src/lib/ai-access.ts` can GET RevenueCat subscriber data, and Web planning/toothbrush routes can call OpenAI under server live flags. Production flag values were not inspected. Therefore Privacy retains a clearly scoped Web disclosure; claiming RevenueCat exists only for deletion across the entire service would be false. Mobile has no client path to these endpoints. Do not transplant Web-only AI/image/access data into the iOS label merely because the backend is shared.

## Legal audit and publication status

The three unauthenticated public routes render `docs/legal/*.md` through `src/app/legal-page.tsx`. The internal checklist has no public route. Mobile links remain in both Guest and account Settings. This task changes document sources, not routes, app behavior, backend, or configuration.

| Prior public source | Obsolete Build 1 statements removed/replaced |
| --- | --- |
| `docs/legal/privacy-policy.md` | Intro presented iOS AI/subscriptions; sections 4–5 listed Plan my day/toothbrush, photo processing and introductory/Pro quotas; section 6 promised auto-renewal, $4.99/month and $39.99/year; provider/purpose/retention text described active Mobile RevenueCat purchases; deletion instructed subscription management. Replaced with paid iOS scope, actual sync/reflection/reward/operational data and narrowly separated Web/legacy processing. |
| `docs/legal/terms-of-use.md` | Removed iOS AI benefits and allowances, Pro-plan purchase/renewal/cancellation sections, monthly/annual prices, restore/management instructions, subscription-dependent service obligations and billing warning on account deletion. Retained account/security/content/consumer-rights clauses and Apple's transaction/refund role. |
| `docs/legal/support.md` | Removed Pro/restore/manage-subscription help, cancellation warning and AI/photo troubleshooting. Added paid-download, Guest/Start fresh, sync and current deletion help. |

No invented postal address or provider retention period is supplied. The prior “address available upon request” assertion is removed because no address/publication process was supplied in this task. Public text contains no internal checklist, citations, unresolved drafting notes or release-audit references.

Historical source passages and prior validation remain in `ios-1.0-paid-upfront-audit.md`, explicitly dated as the 2026-10-13 record. Current Build 2 release docs now distinguish locally revised sources from the still-pending deployment. No claim is made that the live pages changed.

## Human decisions before publication/submission

1. Approve the public wording and effective date for the actual publication date; reconfirm operator/provider facts and any jurisdiction-specific address or international-transfer disclosures required for US, CA, CH, AU, NZ and SG. No new postal address, transfer safeguard or legal guarantee has been invented.
2. Enter the approved matrix above in App Store Connect under separate authorization. The classifications are resolved for Build 2. Reconfirm provider practices before publication without claiming unverified log fields or retention; reassess if the actual data flows change.
3. Confirm whether Web live features remain enabled. Existing disclosure truthfully covers their conditional behavior; if Web is separately retired, change its implementation and policy together in another authorized task.
4. Publish the reviewed pages only under separate authorization, then check their unauthenticated URLs. Keep Apple's Standard EULA. Set App Store price and privacy answers manually, and confirm the signed Build 2/native dependencies before submission. No App Store setting is changed here.

## Eventual public URLs

- Privacy Policy: https://firstmovestartsmall.com/privacy
- Terms of Use: https://firstmovestartsmall.com/terms
- Support and User Privacy Choices: https://firstmovestartsmall.com/support

## Validation for this local documentation update

The results below record the 2026-10-14 legal update. The 2026-10-16 classification-only correction is validated separately below.

- Focused public legal-route tests: **3 passed**.
- Full Web tests: **273 passed, 1 failed (274 total)**. The existing `src/lib/cat-interactions.test.ts` parity test fails because Mobile has the `perch-nap` caption absent from Web. The test and both compared implementation files were verified byte-for-byte identical to HEAD `e723e8b3`; no Cat/UI fix is included in this documentation task.
- Root strict TypeScript and ESLint: **passed**.
- Local Next production build: **passed**, with `/privacy`, `/terms` and `/support` statically generated. Initial sandbox attempt failed because Turbopack could not bind a local worker port; the authorized retry outside the sandbox succeeded. This is local Web validation, not an EAS or signed iOS build.
- Generated-page inspection: **passed for all three routes**. Every nonempty public source line appears in the generated main content; legal navigation and email links are intact; old Pro/pricing/restore/management copy and internal audit material are absent.
- `git diff --check`: **passed**.
- Mobile checks not rerun: no Mobile/shared implementation changed. Previous Mobile verification remains in the dated implementation audit.
- Only ten Markdown files changed: the three public legal documents, this checklist, `PRD.md`, `TASKS.md`, `docs/IOS_APPSTORE_R1_RELEASE.md`, `docs/MOBILE_V1_HANDOFF.md`, `mobile/README.md`, and the historical audit's status note. No new/untracked deliverable or implementation file was added.
- Local validation updated ignored `.next`/TypeScript cache output and wrote temporary logs under `/tmp`. No global environment changes, EAS production build, submission, deployment, commit, push, production environment change, App Store Connect action, or remote database change occurred.

### Final classification correction — 2026-10-16

- Applied the owner-approved Build 2 matrix; no implementation, configuration, legal routes or historical audit evidence changed.
- Legal-route tests: **3 passed**. Root strict TypeScript and ESLint: **passed**. Next production build: **passed**, including static Privacy/Terms/Support routes. `git diff --check`: **passed**.
- Reviewed all three public sources: OpenAI/toothbrush processing is expressly Web-only; RevenueCat is limited to Web access checks and legacy server deletion. No current iOS Pro, monthly/annual subscriptions, restore, cancellation/renewal or active RevenueCat payment-provider claim remains.
- Public Privacy wording clarifies optional 1–5 reflections, absence of diagnosis/treatment/mental-health assessment, provider request/error logging and absence of client performance telemetry. Terms/Support needed no further correction.
- The same ten Markdown files remain unstaged. No deployment, commit, push, EAS build or App Store Connect change occurred. Ignored local build/cache output and a temporary editing helper under `/tmp` are the only validation/editing artifacts.
