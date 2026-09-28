# First Move iOS 1.0 — App Store Privacy Checklist

**INTERNAL ONLY — DO NOT PUBLISH**

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
| Identifiers → User ID | Yes | App Functionality | Yes | No | Supabase account UUID; First Move API/database; RevenueCat |
| User Content → Other User Content | Yes | App Functionality; Product Personalization for explicitly submitted Plan my day content | Yes | No | Tasks, habits, First Moves, plans, Journal, Focus-related user content in Supabase; explicit Plan my day submission through Vercel/OpenAI |
| User Content → Photos or Videos | Yes | App Functionality | Yes | No | Explicit toothbrush verification through Vercel/OpenAI; First Move does not store the image |
| Purchases → Purchase History | Yes | App Functionality; Analytics | Yes | No | Apple subscription state; RevenueCat entitlement/customer state |
| Usage Data → Product Interaction | Yes | App Functionality | Yes | No | AI usage/quota records; completion/activity state; functional usage records needed to operate First Move |
| Payment Info | No | — | — | — | Complete payment credentials are handled by Apple |
| Device ID | No based on current R1 implementation | — | — | — | RevenueCat uses the Supabase UUID as the configured App User ID |
| Precise Location | No | — | — | — | Not used |
| Coarse Location | No | — | — | — | Not used |
| Health | No | — | — | — | Toothbrush verification is not a health or dental assessment |
| Fitness | No | — | — | — | Not used |
| Sensitive Info | No as a separately requested category | — | — | — | Generic free-form user entries are disclosed as Other User Content |
| Contacts | No | — | — | — | Not used |
| Crash Data | No based on current R1 implementation | — | — | — | No standalone crash-reporting SDK identified |
| Performance Data | No based on current R1 implementation | — | — | — | No standalone performance-monitoring SDK identified |
| Advertising Data | No | — | — | — | No advertising in R1 |

## Tracking

Set **Tracking = No** for all R1 data categories.

Current R1 does not use First Move data for cross-context behavioral advertising, advertising measurement, or data-broker activity.

Do not add App Tracking Transparency permission solely because RevenueCat is present.

## Third-party processing to account for

### Supabase
- Email authentication
- Account UUID
- Auth/session state
- Cloud-synced First Move account data
- AI usage records and server-side account controls
- Production primary database region: Stockholm, Sweden (`eu-north-1`)

### Resend
- Recipient email address
- Authentication email content and transactional delivery metadata required to send Supabase magic-link email
- Default commercial configuration
- Do not state a retention period or processing location that has not been confirmed

### Vercel
- Website and API hosting
- Server-side functions configured in `iad1` / US East
- Handles authenticated API traffic and routes explicit AI requests
- Default commercial configuration

### OpenAI
- Explicit authenticated live AI requests only
- Plan my day submitted text
- Explicit toothbrush verification image
- Default API configuration
- Do not claim zero provider-side retention
- Journal content is not automatically sent to OpenAI

### RevenueCat
- Supabase UUID used as App User ID
- Subscription entitlement/customer state
- Purchase/subscription history needed for Pro access
- Customer deletion requested during First Move account deletion
- Default commercial configuration

### Apple
- App distribution
- App Store purchases/subscriptions
- Payment processing
- Subscription management
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
- Account deletion does not cancel Apple billing
- Do not claim every third-party system completes physical deletion instantaneously
- Do not invent provider retention periods

## App Store Connect URLs

**Privacy Policy URL**  
https://firstmovestartsmall.com/privacy

**User Privacy Choices URL**  
https://firstmovestartsmall.com/support

**Support URL**  
https://firstmovestartsmall.com/support

**Terms of Use URL used in app/paywall/subscription presentation**  
https://firstmovestartsmall.com/terms

## EULA

Keep the **Apple Standard EULA**.

Do not create a custom App Store license agreement for R1 unless a later legal review specifically requires one.

The website Terms of Use should remain separate from Apple's Standard EULA.

## Subscription disclosure checks before submission

Confirm the production paywall visibly and accurately shows:

- First Move Pro
- Monthly duration
- Annual duration
- US price of $4.99/month
- US price of $39.99/year
- localized storefront prices elsewhere
- auto-renewal
- cancellation through Apple
- Restore purchases
- Privacy Policy link
- Terms of Use link
- only benefits actually shipping in iOS 1.0

Do not advertise Make Smaller AI in R1.

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
