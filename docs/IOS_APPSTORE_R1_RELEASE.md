# First public iOS release audit

Status: local release preparation on `release/ios-appstore-r1`, 2026-09-27. This is not a claim that an EAS production build exists, that Apple accepted a build or subscription, or that the app is publicly released. No Apple, RevenueCat, EAS, Supabase, or other remote configuration was changed.

## Existing release work found

- The requested branch started clean at the same commit as `main` and `origin/release/ios-appstore-r1`; it had no branch-only commits.
- A separate `release/ios-production-r1` worktree contains uncommitted earlier release work: a production EAS build profile, a focused release-config test, and an audit. That worktree predates the current Mobile AI and camera flow. It was inspected and left untouched; its still-valid EAS approach was reused here instead of being recreated independently.
- Current Mobile already has RevenueCat R1/R2: the Supabase Auth UUID is the App User ID, the exact entitlement is `pro`, the current/default dashboard Offering supplies products and localized prices, restore is implemented, Guest does not configure RevenueCat, and Test Store purchase/restore was previously accepted on iOS Simulator.
- Release key selection is already safe: development selects only `EXPO_PUBLIC_REVENUECAT_TEST_API_KEY`; an iOS release selects only `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` and never falls back to Test Store.
- Current Mobile already has the camera/photo picker permission flow, local image resizing, transient-file cleanup, and no persisted toothbrush images. The generated native project remains intentionally uncommitted.
- Web PWA icons exist for the separate Web experience. They are code-generated Web assets, not approved native App Store artwork, and were not reused as a Mobile app icon.

## Confirmed Apple and RevenueCat state

The following state was supplied for this release and recorded locally without remote inspection or mutation:

| Item | Confirmed state |
| --- | --- |
| Apple app name | `First Move: Start Small` |
| Bundle ID | `app.firstmove.mobile` |
| Monthly product | `app.firstmove.mobile.pro.monthly`, single-seat, $4.99 US |
| Annual product | `app.firstmove.mobile.pro.annual`, single-seat, $39.99 US |
| RevenueCat | Both Apple products imported into the existing project and associated with entitlement `pro` |
| Review state | Annual is Ready for Review; the first subscriptions must be submitted with the app version |
| Initial storefronts | US, CA, UK, CH, AU, NZ, SG, JP |

Neither subscription is documented as approved. No production build is documented as accepted. No public release is documented.

## Local release configuration

| Area | Repository state |
| --- | --- |
| Public identity | Expo display name `First Move: Start Small`; bundle ID `app.firstmove.mobile`; internal slug `first-move-mobile`; URL scheme `firstmove`. Internal identifiers and the RevenueCat entitlement remain unchanged. |
| Versioning | App Store version `1.0.0`, iOS build number `1`, and EAS `appVersionSource: local`. A later upload must increment `ios.buildNumber`. |
| EAS | `development-simulator` is unchanged. `production` is a non-simulator store build using the named EAS `production` environment. `submit.production` is present but deliberately contains no invented Apple account, team, or App Store Connect ID. |
| Devices | Portrait with `ios.supportsTablet: true`; iPad is therefore part of the release acceptance and screenshot matrix. |
| Native purchases | `react-native-purchases` and `react-native-purchases-ui` are installed and auto-linked in a native build. Expo introspection has no IAP entitlement entry; Apple states that In-App Purchase is enabled by default for an explicit App ID, but the exact App ID/capability and signed provisioning result still require confirmation during the production build. |
| RevenueCat key | Release iOS requires the Apple public SDK key and ignores the Test Store key. The local ignored development environment currently has no production iOS key. No public SDK value or secret was written to Git. |
| Permissions | Camera and selected-photo permission copy names the app, says the photo is for a toothbrush check, and says it is not kept. Microphone permission is disabled. |
| Encryption | `usesNonExemptEncryption: false` remains configured; the release owner must ensure the App Store export-compliance answer matches the actual app and SDK behavior. |
| Artwork | No repository-owned Mobile app icon, App Store screenshots, or approved launch artwork exists. Expo defaults must not be treated as release assets. |

## Account, legal, and subscription paths

Implemented paths:

- optional email magic-link account sign-in, secure session persistence, and sign out;
- complete Guest Mode without an account;
- signed-in RevenueCat paywall launch and restore;
- local Free/Pro presentation and server-authoritative AI allowance presentation;
- privacy-focused inline copy for secrets, Journal data, and toothbrush photos.

App Review blockers:

1. **Account deletion:** there is no in-app deletion initiation, trusted deletion endpoint, recent-auth confirmation, export-before-delete flow, or subscription-cancellation warning. Sign out is not account deletion. This is a blocker while the app supports account creation.
2. **Privacy Policy:** there is no published Privacy Policy route/URL and no accessible in-app link. Inline privacy copy is not a policy.
3. **Terms of Use:** there is no published Terms route/URL and no accessible in-app link.
4. **Subscription disclosure and management:** the production RevenueCat Offering/paywall cannot be verified from the repository. Before review, verify that it contains both Apple products, localized price and duration, auto-renewal/cancellation disclosure, benefits that are actually available, restore, and Privacy Policy/Terms links. The app has restore but no manage-subscription path.
5. **New account flow:** a newly created Mobile-only account remains uninitialized and cloud-write-disabled. Existing initialized accounts work, and Guest Mode works, but this incomplete signed-in first-run path requires resolution or an explicitly accepted release decision before review.

These blockers are intentionally not papered over with placeholder URLs, incomplete deletion UI, or invented legal text.

## Other release blockers and acceptance gates

- Supply approved native icon artwork and App Store screenshots for every required iPhone and supported iPad size; finish listing copy, support URL, age rating, export compliance, and App Privacy answers. Do not reuse the Web PWA art without an explicit design decision.
- Verify the production RevenueCat current Offering/paywall includes the confirmed monthly and annual Apple products and that the Apple public SDK key belongs to the `app.firstmove.mobile` RevenueCat app. Do not use the Test Store key.
- Confirm the explicit Apple App ID has In-App Purchase available and the EAS-generated signed provisioning/build contains the expected native RevenueCat modules. No artificial entitlement key should be added to `app.json`.
- Complete true-device iPhone and supported-iPad acceptance for email handoff/deep link, account switching, secure-session restart, offline/retry sync, camera/photo privacy, AI manual fallbacks, Apple sandbox purchase, restore, renewal/expiry/refund/grace behavior, and server/RevenueCat outages.
- Configure and verify the production First Move server, including the supported-region allowlist and abuse/rate limits, before enabling live AI. Manual planning and Skip remain required fallbacks.
- Ensure App Store Connect agreements, tax/banking, app metadata, review contact/demo access, and subscription review information are complete. This repository does not verify those remote states.

## Required EAS production environment variables

These four values are public client configuration and must exist in the EAS `production` environment:

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Public Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public RLS-protected Supabase client key |
| `EXPO_PUBLIC_FIRST_MOVE_API_BASE_URL` | Public HTTPS origin of the deployed First Move server |
| `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` | RevenueCat Apple public SDK key for the existing iOS app |

Do not add `EXPO_PUBLIC_REVENUECAT_TEST_API_KEY` to the production profile. `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `REVENUECAT_SECRET_API_KEY` are server secrets and must remain only in the protected server deployment. The production EAS profile embeds no values in Git.

## Exact build and submit sequence

Only after the blockers above and the production EAS variables are resolved, create the store build and record the returned EAS build ID:

```sh
cd mobile
npx eas-cli@latest build --platform ios --profile production
```

Upload that exact build to App Store Connect/TestFlight; replace the placeholder with the ID returned by the build command:

```sh
cd mobile
npx eas-cli@latest submit --platform ios --profile production --id BUILD_ID_FROM_THE_PREVIOUS_COMMAND
```

After processing, install this same build from TestFlight and complete the true-device and Apple sandbox matrix. EAS Submit does not itself release publicly or submit the version for App Review. If the build is accepted, select it and both first-subscription products on App Store Connect version `1.0.0`, complete the remaining metadata and review information, and only then submit that version and its subscriptions together for review.

## Local verification

Results on 2026-09-27:

- Mobile tests: 229 passed, 0 failed.
- Strict TypeScript: passed.
- Expo lint: passed.
- Expo Doctor: 21/21 checks passed.
- Expo dependency check: dependencies up to date against the installed SDK map; the check reported that online version validation was unavailable in its sandboxed run.
- iOS export: passed; generated in a temporary directory outside the repository.
- Expo introspection: display name `First Move: Start Small`, bundle ID `app.firstmove.mobile`, version/build `1.0.0` / `1`, expected camera/photo usage descriptions, and no fabricated IAP entitlement.
- `git diff --check`: passed, including the two new untracked files.

A local Expo export validates JavaScript/native configuration generation but is not a signed `.ipa`, TestFlight acceptance, Apple sandbox acceptance, or App Review acceptance.
