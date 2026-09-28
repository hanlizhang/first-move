# First public iOS release audit

Status: local release preparation on `release/ios-appstore-r1`, updated 2026-09-28. This is not a claim that an EAS production build exists, that Apple accepted a build or subscription, or that the app is publicly released. No Apple, RevenueCat, EAS, Supabase, or other remote configuration was changed.

## Existing release work found

- The active worktree is `release/ios-appstore-r1` at `2238209`, two commits ahead of `origin/release/ios-appstore-r1`, with the final local release-gate changes uncommitted. No branch, commit, remote, or history operation was performed during this work.
- Git still registers the older `release/ios-production-r1` worktree at `/private/tmp/first-move-ios-r1.f0Ddf9`, but its directory is now missing and Git marks it prunable. The registration and earlier handoff were inspected; the worktree and registration were left untouched.
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
| Devices | Portrait, iPhone-only R1 with `ios.supportsTablet: false`; no iPad layout or screenshot matrix is declared for this version. |
| Native purchases | `react-native-purchases` and `react-native-purchases-ui` are installed and auto-linked in a native build. Expo introspection has no IAP entitlement entry; Apple states that In-App Purchase is enabled by default for an explicit App ID, but the exact App ID/capability and signed provisioning result still require confirmation during the production build. |
| RevenueCat key | Release iOS requires the Apple public SDK key and ignores the Test Store key. The owner reports the EAS production public variables are configured; their values were not remotely inspected, and no public SDK value or secret was written to Git. |
| Permissions | Camera and selected-photo permission copy names the app, says the photo is for a toothbrush check, and says it is not kept. Microphone permission is disabled. |
| Encryption | `usesNonExemptEncryption: false` remains configured; the release owner must ensure the App Store export-compliance answer matches the actual app and SDK behavior. |
| Artwork | No repository-owned Mobile app icon, App Store screenshots, or approved launch artwork exists. Expo defaults must not be treated as release assets. |

## Account, legal, and subscription paths

Implemented paths:

- optional email magic-link account sign-in, secure session persistence, and sign out;
- complete Guest Mode without an account;
- signed-in RevenueCat paywall launch and restore;
- local Free/Pro presentation and server-authoritative AI allowance presentation;
- privacy-focused inline copy for secrets, Journal data, and toothbrush photos;
- authenticated Settings account deletion with fresh email-link guidance, exact confirmation, Apple billing warning, Apple subscription management, and owner-scoped device cleanup after accepted initiation.

App Review blockers:

1. **Account deletion production readiness:** Phases 1B–1E locally define persistent state, recent-auth/exact-confirmation initiation, pending-deletion write gates, the trusted worker, protected retry boundary, authenticated Mobile UI, Apple warning/manage link, UUID-scoped cleanup, and one once-daily Vercel Cron invocation. The complete migration chain and pgTAP `0001`–`0012` pass in a disposable local environment. None of the three migrations, server routes, or cron is remotely deployed; the initiation gate is disabled; production `CRON_SECRET`/monitoring and the deployed RevenueCat secret's customer-delete permission are unverified. No real provider/Auth deletion or disposable-account end-to-end acceptance has run. The local feature is implemented, but the undeployed path remains an App Review blocker while account creation is enabled.
2. **Privacy Policy:** there is no published Privacy Policy route/URL and no accessible in-app link. Inline privacy copy is not a policy.
3. **Terms of Use:** there is no published Terms route/URL and no accessible in-app link.
4. **Subscription disclosure:** the production RevenueCat Offering/paywall cannot be verified from the repository. Before review, verify that it contains both Apple products, localized price and duration, auto-renewal/cancellation disclosure, benefits that are actually available, restore, and Privacy Policy/Terms links. Authenticated Settings now provides Apple's subscription-management path within the deletion disclosure.

The earlier Mobile-only new-account blocker is resolved locally: an empty authenticated account now offers explicit Start fresh, sends no Guest data, validates the returned empty canonical workspace, and activates the existing UUID-scoped runtime. Import this device remains explicitly deferred. True-device acceptance is still required and no production backend deployment is implied.

These blockers are intentionally not papered over with placeholder URLs, incomplete deletion UI, or invented legal text.

## Account deletion Phases 1B–1E: local state, worker, and Mobile release path

Migration `20260927120000_account_deletion_requests.sql` adds one server-only outbox table. Its UUID is database-generated; `user_id` is the authenticated Supabase UUID that a later trusted endpoint must derive from a verified bearer rather than accept from a request body. A partial unique index permits at most one unfinished request for a user. Separate `revenuecat_status` and `supabase_status` fields record cross-service progress, while a bounded failure category, retry counter, next-attempt time, and expiring lease support safe recovery after process interruption.

The table deliberately has no foreign key to `auth.users`, so the row survives final Auth deletion. Anonymous and ordinary authenticated roles have no table privileges or policies; only the service role can create, inspect, claim, advance, complete, or purge it. It contains no email, token, credential, user content, prompt, photo, receipt, or raw external error. Completed operational rows are retained for 30 days, then must be purged by trusted cleanup.

Migration `20260927130000_account_deletion_initiation.sql` adds a service-role-only idempotent initiation RPC and a shared pending-deletion check. The check and initiation take the same per-user advisory transaction lock, so a write serialized before initiation may finish but a write that follows committed initiation must recheck and fail. Before-insert/update triggers cover all 23 owner-scoped tables, including writes made by the authenticated setup/import, continuous-sync, reward, inventory, and settings paths; authenticated direct deletes remain denied by existing grants and RLS. The service-role AI flow checks before RevenueCat subscriber lookup and the quota reservation checks again before OpenAI dispatch. Trusted service-role maintenance and deletion/cascade operations remain possible.

`POST /api/account-deletion/initiate` is non-destructive. It validates the bearer through Supabase Auth, matches signed claims to the current non-anonymous user, derives only that UUID, and requires a timestamped `magiclink`, `otp`, or `email/signup` AMR event no more than five minutes old. A refreshed token, `token_refresh`, string-only AMR, and JWT issuance time do not prove reauthentication. The exact confirmation is `DELETE MY ACCOUNT`; client-supplied target IDs do not affect the target. New and repeated requests both return the same no-store in-progress status. Failures expose only denial, reauthentication-required, confirmation-required, or temporarily unavailable states.

The route is fail-closed unless the private server variable `ACCOUNT_DELETION_INITIATION_ENABLED` equals `phase-1c-verified`. No enabling configuration was added or remotely inspected in this phase, and the route is not deployed. Before enabling it, reproduce the final migration set and database regression suite in an isolated environment, apply all three deletion migrations in order to the intended environment, perform read-only post-migration verification of the write triggers/RPC grants there, deploy the server with the gate still disabled, and manually verify the recent-auth flow with disposable accounts. This server variable is not an EAS public variable.

Migration `20260928120000_account_deletion_worker.sql` adds only service-role worker primitives: atomic claim with `FOR UPDATE SKIP LOCKED`, lease-checked RevenueCat progress, bounded retry, terminal completion, and a read-only `storage.objects.owner_id` ownership preflight. Active leases cannot be stolen; expired processing leases are reclaimable. Database time owns lease and retry scheduling.

The worker calls RevenueCat v1 DELETE only for the trusted Supabase UUID. HTTP 200 (deletion accepted and queued asynchronously) and HTTP 404 (already absent) both record `deletion_satisfied`, which is terminal for this workflow's RevenueCat step. HTTP 200 is not described as proof that RevenueCat's asynchronous physical deletion finished. Subscriber GET is never called because it can create a missing customer, response bodies are never read or stored, and DELETE is not repeatedly polled solely to obtain 404. Permission errors use `revenuecat_permission`; network/5xx/provider errors use `revenuecat_transient`. Retry delay grows exponentially from 30 seconds for transient failures or 15 minutes for permission/Storage blocks, capped at six hours.

After the RevenueCat step is satisfied, the worker checks only whether `storage.objects.owner_id` contains the trusted UUID. Any owned object records `supabase_storage` and prevents Auth deletion; a preflight error records `supabase_transient`. The worker never edits Storage metadata or deletes buckets/files. With no owned objects, it uses server-only Supabase admin hard deletion for the request UUID. Successful and documented already-missing results are idempotent success; other Auth failures retry as `supabase_transient`. The database marks completion only with RevenueCat `deletion_satisfied` and Supabase `deleted`, and the outbox survives Auth deletion. Completed tombstone cleanup remains deferred for 30 days.

After durable initiation, the same request makes one best-effort worker attempt filtered by the bearer-verified UUID; no client-supplied UUID reaches the claim. Failures remain in the outbox. `GET` and `POST /api/internal/account-deletion-worker` accept no target and make one queue attempt only when the server-only bearer matches `CRON_SECRET`; the legacy `ACCOUNT_DELETION_WORKER_SECRET` remains a fallback only when `CRON_SECRET` is absent. `vercel.json` declares one production cron request daily at `03:00` UTC, which is compatible with Vercel's once-daily Hobby minimum and may execute within that hour on Hobby. The declaration is local only: production still needs `CRON_SECRET`, deployment, log/alert review for permission/Storage retry categories, and confirmation that the cron appears in the intended Vercel project.

The Mobile Settings panel renders only for an authenticated account. It explains permanent account/cloud erasure, guides a fresh magic-link flow, requires exact `DELETE MY ACCOUNT`, warns that deletion does not cancel Apple billing, and opens `https://apps.apple.com/account/subscriptions`. On HTTP 202 accepted initiation, Mobile first stops owner sync/in-memory work, persists a UUID quarantine, removes only that UUID's account-local workspace, cloud cache, pending sync/economic queue, and Morning skip, logs RevenueCat out only when its current App User ID matches, and clears the local Supabase session. Guest workspace/daily plans/Morning state and other UUID namespaces remain. Live Auth validation precedes RevenueCat identification at restore, and every sync dispatch validates the current live user. A quarantine or explicit Auth `user_not_found` repeats UUID cleanup; generic invalid/expired sessions fail closed without erasing account data.

The production RevenueCat v1 secret's delete permission is still unverified. The production Storage dashboard's owner-verified empty-bucket observation remains a prerequisite observation, not runtime proof. All provider/Auth behavior is mocked locally, no real deletion has occurred, and Web deletion UI/local cleanup remains unimplemented.

The later implementation must follow this order:

1. Review the already-passing isolated regression result, apply all three deletion migrations in order, perform read-only post-migration verification in the target environment, and deploy the server/Mobile changes with `ACCOUNT_DELETION_INITIATION_ENABLED` absent.
2. Configure a strong server-only `CRON_SECRET` (at least 16 random characters), deploy the once-daily Vercel Cron and target-free GET route, confirm the cron is active only on the production deployment, and verify bounded retry/log/alert behavior without enabling client initiation. Remove or leave absent the fallback `ACCOUNT_DELETION_WORKER_SECRET` once `CRON_SECRET` is in use.
3. Verify the deployed RevenueCat v1 secret can call customer DELETE, then exercise 200, 404, permission, transient, Storage-blocked, Auth-success/already-missing, and process-interruption behavior with disposable accounts only. Confirm the owner-verified empty Storage state again.
4. Run true-device iPhone acceptance for the magic-link five-minute AMR flow, exact confirmation, Apple management link, immediate UUID cleanup, stale second-device session, offline queue rejection, Guest/other-account preservation, and failure recovery.
5. Enable `ACCOUNT_DELETION_INITIATION_ENABLED=phase-1c-verified` only after those checks pass. Separately implement Web deletion/local cleanup and the trusted 30-day tombstone purge.

RevenueCat customer deletion does not cancel an Apple subscription. The Mobile UI now warns about continuing Apple billing and offers Apple's management path without blocking immediate account deletion. The production Supabase Storage dashboard showed no buckets based on owner verification; that is a prerequisite observation, not proof that every production deletion path has been tested.

## Mobile new-account Start fresh

When `cloud_workspace_status` reports no initialized workspace, authenticated Mobile Settings now presents **Start fresh** as an explicit choice alongside **Continue as guest**. The action calls the existing `initialize_cloud_workspace_v2` contract with the current verified Supabase session, the UUID-scoped Mobile device identity, schema version 8, current IANA timezone, and `p_payload: {}`. Its stable snapshot digest is the SHA-256 of that intentionally empty JSON payload, not a digest or upload of Guest state.

Mobile validates the complete canonical response before making the account editable, saves it only to that Supabase UUID's cache/working namespace, and activates the existing ordered sync runtime. A response interruption is recovered through `cloud_workspace_status` plus canonical readback; repeating the action on an active account reads the existing canonical workspace rather than issuing another initialization. Failed or invalid responses never apply unverified state and leave Guest progress untouched. Start fresh creates no fake Tasks, Habits, Intents, Sessions, Daily Plans, Journal records, rewards, points, inventory, or milestones. **Import this device** remains explicitly deferred for iOS 1.0 and no Guest data is automatically read, merged, uploaded, or deleted.

## Other release blockers and acceptance gates

- Supply approved native icon artwork and App Store screenshots for required iPhone sizes; finish listing copy, support URL, age rating, export compliance, and App Privacy answers. Do not reuse the Web PWA art without an explicit design decision.
- Verify the production RevenueCat current Offering/paywall includes the confirmed monthly and annual Apple products and that the Apple public SDK key belongs to the `app.firstmove.mobile` RevenueCat app. Do not use the Test Store key.
- Confirm the explicit Apple App ID has In-App Purchase available and the EAS-generated signed provisioning/build contains the expected native RevenueCat modules. No artificial entitlement key should be added to `app.json`.
- Complete true-device iPhone acceptance for email handoff/deep link, explicit empty-account Start fresh and Guest preservation, account deletion, account switching, secure-session restart, offline/retry sync, camera/photo privacy, AI manual fallbacks, Apple sandbox purchase, restore, renewal/expiry/refund/grace behavior, and server/RevenueCat outages.
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

Do not add `EXPO_PUBLIC_REVENUECAT_TEST_API_KEY` to the production profile. `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `REVENUECAT_SECRET_API_KEY`, and `CRON_SECRET` are server secrets and must remain only in the protected server deployment; `ACCOUNT_DELETION_WORKER_SECRET` is only the undeployed fallback boundary and is unnecessary when `CRON_SECRET` is configured. `ACCOUNT_DELETION_INITIATION_ENABLED` is also server-only and must remain absent/disabled until all three deletion migrations, the worker/retry invocation, write gates, and end-to-end recovery behavior are deployed and verified; its later reviewed enable value is `phase-1c-verified`. The production EAS profile embeds no values in Git.

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

Results through 2026-09-28:

- Mobile tests: 249 passed, 0 failed; strict TypeScript and Expo lint passed. The new coverage verifies explicit empty-account Start fresh, empty `{}` RPC input, no Guest upload, Guest preservation, canonical activation, response-loss recovery, idempotent repeat, and safe failure/retry.
- Web application tests: 271 passed, 0 failed; strict TypeScript, ESLint, and the local Next.js production build passed. Focused deletion tests additionally exercised both RevenueCat terminal results, permission/transient failures, recent authentication, verified-user targeting, one-attempt invocation, `CRON_SECRET` protection, the single daily Vercel declaration, safe recovery, and privacy-safe statuses.
- Expo introspection passed: display name `First Move: Start Small`, bundle ID `app.firstmove.mobile`, version/build `1.0.0` / `1`, `supportsTablet: false`, expected camera/photo usage descriptions, and no fabricated IAP entitlement.
- Expo dependency validation passed against the installed SDK map in offline mode, with Expo's warning that offline validation is less reliable. Expo Doctor was not available from project-local dependencies; a no-install attempt did not complete and was stopped without downloading or changing the environment. The prior recorded run before this increment passed 21/21, but it is not presented as a current rerun.
- iOS export passed with the Test Store variable explicitly empty; output was generated in a temporary directory outside the repository. This was not an EAS build or signed archive.
- A fresh disposable local Supabase environment applied every repository migration through `20260928120000_account_deletion_worker.sql`, then passed pgTAP `0001`–`0012`: 12 files and 387 tests, including deletion suites `0009`–`0012`. The already-applied initial migration remains identical to its repository version: a follow-up disposable run applied the complete chain without broad historical `service_role` grants and passed focused initiation suite `0011` (44 tests) using only a rollback-scoped harness grant for the platform-default task privileges it exercises. Project-independent dblink targets keep the concurrency tests portable. Both disposable databases and temporary files were removed afterward; the regular development database was not reset, migrated, or overwritten.
- `git diff --check` passed for tracked changes. The new `vercel.json` also passed its JSON/config behavior test and a separate no-index whitespace check.

A local Expo export validates JavaScript/native configuration generation but is not a signed `.ipa`, TestFlight acceptance, Apple sandbox acceptance, or App Review acceptance.
