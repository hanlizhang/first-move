# First public iOS release — paid-upfront 1.0 / Build 2

Updated 2026-10-14 after the local legal/publication audit. Build 1 was submitted/reviewed under the prior subscription model; its historical records remain intact. Build 2 is the new paid-upfront candidate, not a signed archive or an Apple acceptance claim.

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

The Privacy, Terms, and Support sources were updated locally on 2026-10-14 for the paid-upfront release. They describe Guest Mode, optional accounts/sync, current deletion, the upfront Apple transaction, and actual functional data. Public AI/subscription claims for iOS are removed. Privacy separately scopes retained Web AI/access processing and legacy RevenueCat deletion; neither is an iOS purchase or AI feature. The live pages have not been updated by this task.

See the [historical passage audit](release/ios-1.0-paid-upfront-audit.md) and [current internal privacy checklist](release/app-store-privacy-checklist.md). Final owner-approved classifications (2026-10-16): Email Address, User ID, Device ID, Other User Content, Health, Product Interaction and Other Diagnostic Data = Yes, linked, App Functionality. Gameplay Content, Customer Support, Purchase History, Photos or Videos, Crash Data, Performance Data and Tracking = No. The account-scoped installation UUID supports sync origin/deduplication; structured Mood/Energy remains in Build 2. Cat/reward/earned-point spending is Product Interaction. Other Diagnostic Data covers provider request/error/observability logs, without asserting exact retained fields or client crash/performance telemetry. App Store Connect is untouched.

## Local verification

Implementation validation on 2026-10-13 ran from `/mobile`: focused release/retained-feature tests, full `npm test`, `npm run type-check`, `npm run lint`, `npm run validate:release-config`, and local iOS production export. The config validator checks Expo public config and iOS introspection with dotenv disabled, including identity, build 2, iPhone-only, and no photo/purchase permissions or plugins. Native autolinking and the exported dependency graph are also audited.

The 2026-10-13 implementation counts, export evidence and limitations remain in the [release audit](release/ios-1.0-paid-upfront-audit.md). The separate 2026-10-14 documentation validation is recorded in the [privacy checklist](release/app-store-privacy-checklist.md#validation-for-this-local-documentation-update). No Mobile/shared implementation or deletion backend is changed by that update.

## Remaining steps before Build 2 delivery

1. Review the locally revised legal sources and privacy classifications, reconfirm documented production-provider facts, and separately authorize publication of all three pages. Local revision does not mean deployment has occurred.
2. Manually configure paid-app USD $2.99 pricing in App Store Connect; detach the old subscription products from this version's submission and reconcile any existing test/legacy product state. No IAP replaces them. Update screenshots, description, review notes, privacy answers, support URLs, and review access for the shipping features.
3. Read-only verify the existing production public Supabase/server-origin settings and the functioning deletion worker/retry configuration. Do not disable the server's legacy RevenueCat cleanup credential. No EAS RevenueCat key is required.
4. Separately authorize a fresh native production Build 2 from the final reviewed source. This checkout has no generated native directories; generate them from the reduced dependency/config state. Local Expo export does not produce a signed `.ipa`.
5. Accept the exact TestFlight build on iPhone: Guest/offline/restart, manual planner and Focus handoff, Task/Habit/Journal, current Cat/rewards, secure Auth/deep link/account switch, Start fresh without Guest loss, sync/retry, authorized disposable-account deletion, legal links, reduced motion, accessibility, and absence of purchase/AI/photo-permission surfaces.
6. Only after those gates and separate approval, upload/submit the paid app version without IAP/subscriptions. No EAS production build, submission, App Store modification, migration, deployment, commit, or push occurs in this task.
