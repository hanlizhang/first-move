# First Move iOS 1.0 — App Store Privacy Checklist

**INTERNAL ONLY — DO NOT PUBLISH**

Updated 2026-10-13 for the paid-upfront iOS 1.0 / Build 2 implementation. These are repository recommendations; no App Store Connect answers have been changed. The app is USD $2.99 paid before download with no IAP, subscriptions, Pro, receipt validation, or user-facing AI. The approved public legal pages require a separate update; see [exact passage audit](ios-1.0-paid-upfront-audit.md).

The code audit, dependency removal, Expo iOS introspection, native autolinking, and production export support **Photos or Videos = No**, **Purchases / Purchase History = No**, and **Tracking = No** for this iOS client. Apple handles the upfront transaction outside the app; Mobile sends no receipt, reads no purchase history, and runs no RevenueCat client. The deletion server still sends the account UUID to RevenueCat only to delete any legacy customer record; its DELETE response body is never read. Web AI/entitlement behavior is unchanged and must not be misrepresented as removed from the whole service.

Basis: [Apple App Privacy details](https://developer.apple.com/app-store/app-privacy-details/) (checked 2026-10-13): disclose data collected by the app and its integrated partners; Apple's own independent collection is not the developer's disclosure. Review the final signed artifact and real production data flows before submitting these answers.

## R1 storefront scope

- United States
- Canada
- Switzerland
- Australia
- New Zealand
- Singapore

The United Kingdom and Japan are not part of the iOS 1.0 launch scope.

## App Store Connect privacy disclosures

| App Store data type | Collected? | Purposes | Linked to identity? | Tracking? | Relevant processing |
| --- | --- | --- | --- | --- | --- |
| Contact Info → Email Address | Yes | App Functionality | Yes | No | Supabase Auth; Resend transactional authentication email |
| Identifiers → User ID | Yes | App Functionality | Yes | No | Supabase account UUID; First Move API/database; legacy server-side RevenueCat DELETE during account deletion only |
| User Content → Other User Content | Yes | App Functionality | Yes | No | Tasks, habits, First Moves, manual plans, Journal, Focus-related user content in Supabase; no Mobile OpenAI submission |
| User Content → Photos or Videos | No | — | — | No | Photo capture/selection/upload and related modules/permissions removed |
| Purchases → Purchase History | No | — | — | No | No IAP, receipt handling, purchase history, entitlement lookup, or purchase SDK in Mobile; upfront purchase handled by Apple |
| Usage Data → Product Interaction | Yes | App Functionality | Yes | No | Completion/activity and virtual Cat economy state; functional usage needed to operate First Move; no Mobile AI usage/quota requests |
| Payment Info | No | — | — | — | Complete payment credentials are handled by Apple |
| Device ID | Review existing sync identifier before submission | App Functionality | Yes if categorized as Device ID | No | Mobile persists an account-scoped device UUID and sends `p_device_id` during setup/sync; RevenueCat removal does not remove this identifier |
| Precise Location | No | — | — | — | Not used |
| Coarse Location | No | — | — | — | Not used |
| Health | No | — | — | — | No medical or dental assessment; no photo verification |
| Fitness | No | — | — | — | Not used |
| Sensitive Info | No as a separately requested category | — | — | — | Generic free-form user entries are disclosed as Other User Content |
| Contacts | No | — | — | — | Not used |
| Crash Data | No based on current R1 implementation | — | — | — | No standalone crash-reporting SDK identified |
| Performance Data | No based on current R1 implementation | — | — | — | No standalone performance-monitoring SDK identified |
| Advertising Data | No | — | — | — | No advertising in R1 |

## Tracking

Set **Tracking = No** for all R1 data categories.

Current R1 does not use First Move data for cross-context behavioral advertising, advertising measurement, or data-broker activity.

No advertising/tracking SDK or App Tracking Transparency permission is present. A functional sync identifier does not by itself imply advertising tracking.

## Third-party processing to account for

### Supabase
- Email authentication
- Account UUID
- Auth/session state
- Cloud-synced First Move account data
- Server-side account controls; historical Web AI records may remain on shared accounts, but Mobile neither reads quota nor creates AI usage
- Production primary database region: Stockholm, Sweden (`eu-north-1`)

### Resend
- Recipient email address
- Authentication email content and transactional delivery metadata required to send Supabase magic-link email
- Default commercial configuration
- Do not state a retention period or processing location that has not been confirmed

### Vercel
- Website and API hosting
- Server-side functions configured in `iad1` / US East
- Handles authenticated account-deletion API traffic; Mobile no longer routes AI requests
- Default commercial configuration

### OpenAI
- No iOS 1.0 client feature sends text/images to OpenAI or calls an AI endpoint.
- Unchanged Web/server AI routes remain outside this Mobile release. Legal text must distinguish their scope and historical records.

### RevenueCat
- No Mobile SDK, identification, analytics, paywall, receipt, purchase, or entitlement flow.
- Existing server deletion worker sends the authenticated Supabase UUID to DELETE a legacy/test customer.
- HTTP 200/404 satisfies cleanup; response bodies and purchase history are not read.
- Preserve an accurate legacy-deletion disclosure and the existing server credential until separately migrating that workflow.

### Apple
- App distribution
- Upfront paid-app purchase before download
- Payment processing
- Apple-controlled billing/refund flow

## Account deletion disclosure

Current production behavior accepted for R1:

- Settings contains a discoverable Delete account action
- Fresh email magic-link reauthentication is required
- Server accepts only recent interactive authentication
- User must enter `DELETE MY ACCOUNT`
- Accepted request immediately blocks further owner-scoped writes
- Trusted server worker processes deletion
- Owner-scoped Supabase cloud rows are removed through the tested cascade
- Supabase Auth user is hard-deleted
- RevenueCat customer deletion is requested
- Temporary provider failures are retried
- No recurring Apple billing is offered by this release; any genuine historical billing obligations need separately scoped legal/support wording
- Do not claim every third-party system completes physical deletion instantaneously
- Do not invent provider retention periods

## App Store Connect URLs

**Privacy Policy URL**  
https://firstmovestartsmall.com/privacy

**User Privacy Choices URL**  
https://firstmovestartsmall.com/support

**Support URL**  
https://firstmovestartsmall.com/support

**Terms of Use URL used in Settings**
https://firstmovestartsmall.com/terms

## EULA

Keep the **Apple Standard EULA**.

Do not create a custom App Store license agreement for R1 unless a later legal review specifically requires one.

The website Terms of Use should remain separate from Apple's Standard EULA.

## Paid-app checks before submission

- Owner manually sets USD $2.99 as the app's one-time upfront price.
- No IAP/subscription is attached to this app version for submission.
- Listing, screenshots, review notes, and all three legal pages reflect the included manual features.
- No purchase/restore/upgrade/AI/quota/photo capture controls appear in Guest or authenticated Settings/Today.
- Expo iOS introspection and the signed native artifact have no photo/camera permissions or removed modules.
- Privacy/Terms/Support links remain public and available in both Guest and authenticated modes.
- Do not relabel the entire app “Data Not Collected”: optional cloud accounts still collect email, account ID, content, and functional activity.

## Other existing privacy classifications to review

- `mobile/src/cloud/sync-queue.ts` generates/stores a device UUID per account, and `mobile/src/cloud/sync-runtime.ts` sends it as `p_device_id`. Review the existing Device ID answer against Apple's definition; the old “No because RevenueCat uses only the account UUID” rationale is incomplete.
- Cat progress, inventory, rewards, and interactions still sync. Review whether Gameplay Content should accompany Other User Content/Product Interaction under Apple's game-save guidance. These are existing retained data flows, not new collection introduced by this task.
- Retained virtual point spending does not represent a cash/IAP purchase. Describe it as functional Cat/reward activity; Apple alone handles the upfront app payment.

## Public legal pages

Publish:

- `/privacy` → `privacy-policy.md`
- `/terms` → `terms-of-use.md`
- `/support` → `support.md`

Ensure these are publicly accessible without sign-in before App Review.

## Future expansion only — not R1 blockers

If First Move later launches in the United Kingdom, review whether a UK representative is required before enabling that storefront.

If First Move later launches in Japan, review APPI operator-information and address disclosure requirements for a foreign individual operator before enabling that storefront.

These are future storefront considerations and are not part of the current R1 launch scope.
