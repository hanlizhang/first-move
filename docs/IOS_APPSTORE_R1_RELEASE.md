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

1. **Account deletion:** Phases 1B/1C locally define persistent state, a recent-auth/exact-confirmation initiation route, and pending-deletion write gates. Neither migration is remotely applied, the route's release gate is disabled by default, and there is still no in-app initiation/reauthentication UI, destructive worker, verified RevenueCat delete permission, export-before-delete flow, account-specific local cleanup, or active-subscription warning/manage link. Sign out is not account deletion. This remains a blocker while the app supports account creation.
2. **Privacy Policy:** there is no published Privacy Policy route/URL and no accessible in-app link. Inline privacy copy is not a policy.
3. **Terms of Use:** there is no published Terms route/URL and no accessible in-app link.
4. **Subscription disclosure and management:** the production RevenueCat Offering/paywall cannot be verified from the repository. Before review, verify that it contains both Apple products, localized price and duration, auto-renewal/cancellation disclosure, benefits that are actually available, restore, and Privacy Policy/Terms links. The app has restore but no manage-subscription path.
5. **New account flow:** a newly created Mobile-only account remains uninitialized and cloud-write-disabled. Existing initialized accounts work, and Guest Mode works, but this incomplete signed-in first-run path requires resolution or an explicitly accepted release decision before review.

These blockers are intentionally not papered over with placeholder URLs, incomplete deletion UI, or invented legal text.

## Account deletion Phases 1B/1C: local initiation and write protection only

Migration `20260927120000_account_deletion_requests.sql` adds one server-only outbox table. Its UUID is database-generated; `user_id` is the authenticated Supabase UUID that a later trusted endpoint must derive from a verified bearer rather than accept from a request body. A partial unique index permits at most one unfinished request for a user. Separate `revenuecat_status` and `supabase_status` fields record cross-service progress, while a bounded failure category, retry counter, next-attempt time, and expiring lease support safe recovery after process interruption.

The table deliberately has no foreign key to `auth.users`, so the row survives final Auth deletion. Anonymous and ordinary authenticated roles have no table privileges or policies; only the service role can create, inspect, claim, advance, complete, or purge it. It contains no email, token, credential, user content, prompt, photo, receipt, or raw external error. Completed operational rows are retained for 30 days, then must be purged by trusted cleanup.

Migration `20260927130000_account_deletion_initiation.sql` adds a service-role-only idempotent initiation RPC and a shared pending-deletion check. The check and initiation take the same per-user advisory transaction lock, so a write serialized before initiation may finish but a write that follows committed initiation must recheck and fail. Before-insert/update triggers cover all 23 owner-scoped tables, including writes made by the authenticated setup/import, continuous-sync, reward, inventory, and settings paths; authenticated direct deletes remain denied by existing grants and RLS. The service-role AI flow checks before RevenueCat subscriber lookup and the quota reservation checks again before OpenAI dispatch. Trusted service-role maintenance and deletion/cascade operations remain possible.

`POST /api/account-deletion/initiate` is non-destructive. It validates the bearer through Supabase Auth, matches signed claims to the current non-anonymous user, derives only that UUID, and requires a timestamped `magiclink`, `otp`, or `email/signup` AMR event no more than five minutes old. A refreshed token, `token_refresh`, string-only AMR, and JWT issuance time do not prove reauthentication. The exact confirmation is `DELETE MY ACCOUNT`; client-supplied target IDs do not affect the target. New and repeated requests both return the same no-store in-progress status. Failures expose only denial, reauthentication-required, confirmation-required, or temporarily unavailable states.

The route is fail-closed unless the private server variable `ACCOUNT_DELETION_INITIATION_ENABLED` equals `phase-1c-verified`. No enabling configuration was added or remotely inspected in this phase, and the route is not deployed. Before enabling it, apply both deletion migrations in order to the intended environment, run the database regression suite there, verify the write triggers/RPC grants, deploy the server with the gate still disabled, and manually verify the recent-auth flow with disposable accounts. This server variable is not an EAS public variable.

The later implementation must follow this order:

1. Add Mobile/Web UI that obtains a new email magic-link/OTP proof, explains permanent erasure, active Apple billing, and data export, and sends the exact confirmation to the locally implemented route.
2. Deploy and verify both migrations and the disabled route, then enable the private release gate only after the complete initiation UI/manual acceptance is ready. The implemented database gate rejects new cloud writes while an unfinished request exists; clients must also stop and quarantine stale offline queues.
3. Claim the row with an expiring lease. Call RevenueCat v1 using the server-only secret and the Supabase UUID. HTTP 200 records only `deletion_requested` and schedules a later authoritative absence check; it is not completion. A documented not-found result may record `absence_confirmed`; permission and transient failures move to bounded retry state.
4. Only after RevenueCat absence is confirmed, verify the owner-confirmed empty Storage prerequisite and use supported Supabase admin Auth deletion. The 23 application-owned tables then rely on their tested direct cascades. Record Supabase deletion only after confirmed success/not-found handling.
5. Mark the request complete only when RevenueCat is `absence_confirmed` and Supabase is `deleted`. Then clear only that account's Web/Mobile cache, queues, daily plans, RevenueCat identity, and secure session, preserving Guest and other-account namespaces.

RevenueCat customer deletion does not cancel an Apple subscription. The later Mobile UI must warn about continuing Apple billing and offer Apple's subscription-management path without blocking account deletion. The production Supabase Storage dashboard showed no buckets based on owner verification; that is a prerequisite observation, not proof that every production deletion path has been tested.

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

Do not add `EXPO_PUBLIC_REVENUECAT_TEST_API_KEY` to the production profile. `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `REVENUECAT_SECRET_API_KEY` are server secrets and must remain only in the protected server deployment. `ACCOUNT_DELETION_INITIATION_ENABLED` is also server-only and must remain absent/disabled until both deletion migrations and write gates are deployed and verified; its later reviewed enable value is `phase-1c-verified`. The production EAS profile embeds no values in Git.

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
- Phase 1C Web application tests: 247 passed, 0 failed; strict TypeScript, lint, and the local production build passed.
- Isolated disposable database tests: `0009` 54/54, `0010` 37/37, and `0011` 44/44 passed; the disposable database was dropped and no development or remote database was migrated.
- `git diff --check`: passed for tracked changes and each untracked file.

A local Expo export validates JavaScript/native configuration generation but is not a signed `.ipa`, TestFlight acceptance, Apple sandbox acceptance, or App Review acceptance.
