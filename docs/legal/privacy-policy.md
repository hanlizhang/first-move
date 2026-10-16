# Privacy Policy — First Move: Start Small

**Effective date: October 14, 2026**

First Move: Start Small (“First Move”) is operated by **Hanli Zhang**, an individual operator based in Switzerland.

**Privacy and support contact:** support@firstmovestartsmall.com

This Policy explains how First Move handles personal information in the iOS app, on the website, and through optional accounts and cloud synchronization.

The iOS 1.0 app is a one-time paid App Store download. It has no In-App Purchases, subscriptions, or user-facing AI features. It does not capture or upload your photos. The separate Web app has different optional features, described in section 6.

## 1. Guest Mode

You can use the iOS app in **Guest Mode without creating an account**. Your Guest workspace stays in local storage on your device and is not uploaded to First Move's cloud service.

Guest data can include tasks, habits, First Moves, daily plans, Focus sessions, Journal entries, points, rewards, and Cat progress and inventory.

Signing in does not automatically upload or merge Guest data. A new account can choose **Start fresh** to create an empty cloud workspace while preserving the separate Guest workspace on that device.

Local data may be lost if you uninstall the app, clear local storage, reset your device, or lose access to it. Device and system backups operate independently of First Move. Opening website links or contacting support involves the separate website or support processing described below.

## 2. Accounts and authentication

Accounts are optional. First Move uses **Supabase Auth** for passwordless email magic-link authentication.

For an account, First Move processes your email address, account identifier, authentication and session information, time-zone settings, and operational information needed to secure and manage access.

**Resend** delivers authentication emails through First Move's SMTP configuration. It processes the recipient address, authentication email, and related delivery information for that purpose.

The iOS app stores authentication sessions using platform-protected storage. Do not share magic links or authentication tokens with anyone, including support.

## 3. Cloud content and activity

When you use an authenticated cloud workspace, supported account data is sent to First Move's Supabase-backed service and linked to your account. This includes:

- task and habit text, schedules, and completion records;
- First Moves, manual daily plans, and Focus session labels, durations, dates, and linked tasks or habits;
- Journal and reflection text, including optional mood and energy ratings from 1 to 5;
- activity history, points, reward records, active-day progress, and milestones;
- Cat inventory, item spending and consumption records, and selected furniture; and
- account settings and technical synchronization records.

Cat items use earned virtual points, not money. Saved inventory and progress allow the app to restore your Cat and rewards across devices. Temporary Cat animation positions and individual play gestures are not uploaded as an interaction recording.

Mood and energy ratings let you record and revisit your own reflections. They are not used for diagnosis, medical treatment, or mental-health assessment.

Your Journal is private account content. First Move does not automatically send Journal entries to AI, analytics, or notifications. Avoid entering information you do not want stored in your account.

Existing accounts may also contain records created through earlier versions or the Web app, such as Morning Start completion and reward records. These can continue to synchronize; they do not contain the original verification photo.

Removing content from the active view may mark it as deleted while retaining records needed for synchronization or activity and reward history. Full account deletion is described in section 10.

## 4. Synchronization identifiers and operational information

For each account used on an app installation, First Move generates and stores a random synchronization identifier. It is sent with account setup and synchronization requests and stored with your account to distinguish installations, associate sessions, and prevent duplicate processing. It is not a hardware serial number or advertising identifier.

First Move also processes request and mutation identifiers, dates, time zones, synchronization status, and account-deletion status and retry records to operate the service reliably.

Authentication, email, and hosting providers process and may retain technical connection, delivery, request, and error logs, which may include IP addresses, request times, response status, and error information, for service delivery, security, and troubleshooting. First Move does not include a separate advertising, behavioral analytics, or crash-reporting SDK in the iOS app, and does not upload client app-performance telemetry. Functional activity records are still collected when you synchronize an account.

## 5. App Store purchase

Apple distributes the iOS app and handles its one-time upfront purchase. After purchase and installation, all included functionality is available without another payment.

The iOS app does not read App Store receipts, collect App Store purchase history, or request payment-card information. Apple handles App Store transaction and refund requests under its own terms and privacy practices.

## 6. Separate Web features and legacy records

The Web app can offer optional day-planning and toothbrush-verification requests. These are not features of the iOS 1.0 app.

If you expressly submit a Web planning request, the submitted brain-dump text is sent to First Move's server. If you expressly request Web toothbrush verification, the selected image is sent to that server. When live processing is enabled, the submitted text or image is passed to **OpenAI** for that request. Selecting a photo alone does not upload it. Journal entries and unrelated workspace content are not automatically included.

Verification images are not saved in First Move's account database, Journal, synchronization queue, or file storage. Providers still process the request and may retain operational information under their own practices; this is not a promise of zero provider retention.

For Web access checks, First Move's server can send the account identifier to **RevenueCat** and read existing entitlement information. Web AI authorization records can include the account and request identifiers, feature, a fingerprint of the submitted request, access decision, provider and model metadata, dates, time zone, region, and dispatch timestamps. These records support access limits, security, and duplicate-request prevention; they do not contain the original submitted text, image, or generated response.

Separately, the account-deletion service sends an account identifier to RevenueCat to request removal of any legacy customer record, including records created during testing. It does this even if no matching customer exists. It checks the deletion response status without reading purchase history. The iOS app does not initialize RevenueCat, identify users to its SDK, or use it for purchases or feature access.

## 7. Service providers and purposes

First Move uses:

- **Supabase** for authentication, account data, and cloud synchronization;
- **Resend** for transactional authentication email;
- **Vercel** for website and server API hosting;
- **Apple** for iOS distribution and the upfront App Store transaction; and
- **OpenAI and RevenueCat** only for the separate Web or legacy processing described in section 6, not for iOS purchase or AI features.

First Move processes information to provide requested features, authenticate accounts, synchronize content and progress, prevent duplicate or unauthorized activity, secure and troubleshoot the service, respond to support and privacy requests, complete account deletion, and meet applicable legal obligations.

If you contact support, First Move receives your contact details and the message and other information you choose to provide. Include only what is needed to address your request.

First Move does not sell account or workspace data, operate an advertising network, or use this information for cross-context behavioral advertising. The iOS app does not use information for advertising tracking.

Where applicable law requires a legal basis, processing may rely on performing the service or contract you request, consent where required, legitimate interests in securely operating and protecting the service where those interests are not overridden by your rights, or compliance with legal obligations.

## 8. International processing

First Move is operated from Switzerland and uses providers that operate across borders. Personal information may be processed outside Switzerland and the country where you live.

The production Supabase database is located in Stockholm, Sweden. Website, server, authentication email, and other provider processing may occur in other countries, including the United States. First Move does not promise that all processing remains in the database's region.

Contact support@firstmovestartsmall.com for information about international processing arrangements.

## 9. Retention

There is no single retention period for every category of information. Account and cloud records are kept as needed to provide the features you use and support synchronization, security, and account operations, subject to deletion requests and applicable law.

Support correspondence, authentication and delivery records, historical Web access records, and limited deletion status and retry information may be retained as needed to resolve requests, prevent abuse, complete deletion, handle disputes, or meet legal obligations.

Providers may retain information under their own service, security, legal, or backup requirements. First Move does not promise a provider retention period or deletion completion time it does not control.

## 10. Account deletion

Authenticated iOS users can request full account deletion from **Settings → Delete account**. First Move requires fresh email magic-link authentication and the exact confirmation phrase **DELETE MY ACCOUNT**.

After the request is accepted:

- further account cloud writes are blocked;
- the server workflow requests removal of any legacy RevenueCat customer record, then deletes the Supabase Auth account and its associated owner-scoped cloud records;
- temporary provider failures are retried; and
- the current iOS app clears that account's local workspace, cloud cache, pending synchronization state, and related account queues, then signs out locally.

Guest data and other accounts' local data remain separate. Signing out alone is not account deletion. Deletion cannot automatically remove independent device backups or copies stored solely on another device outside First Move's control.

Some steps take additional processing time. Limited operational records may remain to complete or retry deletion or meet legal requirements. Account deletion is separate from an App Store refund request, which is handled by Apple.

## 11. Your rights and security

Depending on applicable law, you may have rights to information, access, correction, deletion, portability, restriction, objection, or withdrawal of consent where processing relies on consent. Contact **support@firstmovestartsmall.com** to make a request. First Move may need to verify your identity. You may also have a right to complain to the relevant data-protection authority.

First Move uses authenticated account access, owner-scoped cloud controls, platform-protected session storage, and server-side deletion controls to protect information. No internet-connected system can be guaranteed completely secure.

## 12. Changes and contact

First Move may update this Policy when the service, providers, or legal requirements change. The effective date will change, and additional notice will be given where applicable law requires it.

**Operator / data controller:** Hanli Zhang
**Operator type:** Individual
**Country:** Switzerland
**Privacy, support, data-rights requests, and complaints:** support@firstmovestartsmall.com
