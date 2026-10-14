# First public iOS release — paid-upfront 1.0 / Build 2

Updated 2026-10-13 after the release-simplification decision. This is a local release candidate, not a signed archive or an Apple acceptance claim. The previous subscription release plan is superseded.

## Product and identity

First Move is **USD $2.99 paid upfront once through the App Store**. Apple authorizes purchase/download before installation. All included functionality is available after installation without another purchase. No IAP, subscription, Pro tier, paywall, restore, StoreKit payment code, receipt validation, or user-facing AI is included.

| Field | Release value |
| --- | --- |
| Name | First Move: Start Small |
| Bundle ID | `app.firstmove.mobile` |
| Scheme / slug | `firstmove` / `first-move-mobile` |
| Version / local iOS build number | `1.0.0` / `2` |
| Devices | iPhone-only; `ios.supportsTablet=false`; portrait |
| Icon | Existing approved `mobile/assets/images/icon.png`, unchanged |
| Production domain | `https://firstmovestartsmall.com` |
| Existing storefront scope | US, CA, CH, AU, NZ, SG; UK/JP deferred |
| EAS | Existing store/non-simulator production profile, local version source; simulator profile unchanged |

Preserved: First Moves, Today, Focus, Cat, current interactions/points/inventory/rewards, Guest Mode, optional secure account/cloud sync, Start fresh, account deletion, all three legal links, and manual day planning. No Hearts/Bond or other new features.

Removed: AI status/quota/refresh, live Plan my day and brain dump, toothbrush verification and photo capture/preparation, all Mobile RevenueCat SDK/startup/identity/entitlement/Offering/paywall/restore code, Pro/subscription UI, recurring-billing warning, and Apple subscription-management action. Make Smaller AI was not implemented and remains absent. Existing historical Morning data/rewards still hydrate through the unchanged schema.

## Account deletion compatibility

The Mobile client still requires a current Supabase session, a fresh email-link reauthentication, and exact `DELETE MY ACCOUNT` confirmation. Accepted initiation stops account work, quarantines the UUID, purges only that account's local workspace/cache/queue/legacy Morning-skip/recent-template keys, and signs out locally. Guest and other-account data remain. No Mobile RevenueCat identity callback is needed.

The existing backend and all three deletion migrations remain unchanged. The worker first requests RevenueCat customer DELETE for the trusted Supabase UUID; HTTP 200 (accepted/queued) or 404 (absent) satisfies its provider step. It does not GET a subscriber or read/store response bodies. Existing completion constraints require `deletion_satisfied`, then read-only Storage preflight and Supabase Auth hard deletion. Transient/permission failures remain retryable. Do not remove its private RevenueCat credential as part of Mobile SDK removal. Historical/test customer cleanup is still supported, including no-customer 404 for a new paid-app account.

The previous release audit recorded a passing production disposable-account deletion test and verified Resend SMTP. This task reruns local mocked deletion coverage only; it does not repeat destructive production acceptance or inspect/change production secrets. The existing worker/retry deployment remains required.

## Required public Mobile configuration

| Name | Purpose |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Optional account Auth/cloud endpoint |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public RLS-protected account client key |
| `EXPO_PUBLIC_FIRST_MOVE_API_BASE_URL` | `https://firstmovestartsmall.com`, used by account deletion |

No RevenueCat public key is read by the app. Guest startup requires none of these account settings. No remote environment was changed. All existing service-role, worker, RevenueCat, and OpenAI secrets stay on the server; the unchanged Web/server AI implementation is outside this Mobile release scope.

## Legal and App Privacy gates

The public Privacy, Terms, and Support pages were fetched successfully on 2026-10-13 and match the checked-in approved sources after HTML formatting. They still promise iOS AI, Pro subscriptions, recurring prices, restore/management controls, and photo processing. They require a separately approved update and publication before this release is presented to App Review. Their source text is intentionally unchanged.

See the [exact passage audit](release/ios-1.0-paid-upfront-audit.md) and [internal privacy checklist](release/app-store-privacy-checklist.md). Code supports Photos or Videos = No, real-money Purchase History = No, and Tracking = No. Account/cloud content and functional activity still require disclosure. Legacy deletion-provider processing must still be described accurately. App Store Connect itself is untouched.

## Local verification

Commands run from `/mobile`: focused release/retained-feature tests, full `npm test`, `npm run type-check`, `npm run lint`, `npm run validate:release-config`, and local iOS production export. The config validator checks Expo public config and iOS introspection with dotenv disabled, including identity, build 2, iPhone-only, and no photo/purchase permissions or plugins. Native autolinking and the exported dependency graph are also audited.

Exact counts, export evidence, limitations, and changed files are recorded in the [release audit](release/ios-1.0-paid-upfront-audit.md). No Web/shared implementation or legal source was changed, so a full Web suite/Next build is not required for this Mobile change; server deletion regression tests are still run because that boundary is retained.

## Remaining steps before Build 2 delivery

1. Review/approve the separate legal corrections and publish the three accurate public pages. This task does not rewrite approved legal copy or deploy Vercel.
2. Manually configure paid-app USD $2.99 pricing in App Store Connect; detach the old subscription products from this version's submission and reconcile any existing test/legacy product state. No IAP replaces them. Update screenshots, description, review notes, privacy answers, support URLs, and review access for the shipping features.
3. Read-only verify the existing production public Supabase/server-origin settings and the functioning deletion worker/retry configuration. Do not disable the server's legacy RevenueCat cleanup credential. No EAS RevenueCat key is required.
4. Separately authorize a fresh native production Build 2 from the final reviewed source. This checkout has no generated native directories; generate them from the reduced dependency/config state. Local Expo export does not produce a signed `.ipa`.
5. Accept the exact TestFlight build on iPhone: Guest/offline/restart, manual planner and Focus handoff, Task/Habit/Journal, current Cat/rewards, secure Auth/deep link/account switch, Start fresh without Guest loss, sync/retry, authorized disposable-account deletion, legal links, reduced motion, accessibility, and absence of purchase/AI/photo-permission surfaces.
6. Only after those gates and separate approval, upload/submit the paid app version without IAP/subscriptions. No EAS production build, submission, App Store modification, migration, deployment, commit, or push occurs in this task.
