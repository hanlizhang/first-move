# Privacy Policy — First Move: Start Small

**Effective date: September 28, 2026**

First Move: Start Small (“First Move”) is operated by **Hanli Zhang**, an individual operator based in Switzerland.

**Privacy and support contact:** support@firstmovestartsmall.com  
**Postal address:** Available upon request by contacting support@firstmovestartsmall.com.

This Privacy Policy explains how First Move handles personal information when you use the First Move iOS app, website, account features, cloud synchronization, subscriptions, and optional AI features.

## 1. Guest Mode

You can use First Move in **Guest Mode without creating an account**.

Guest Mode is local-only. Data you create in Guest Mode stays in local storage on the device or browser you use and is not automatically uploaded to a First Move account or cloud workspace.

Guest data may include tasks, habits, First Moves, daily plans, Focus sessions and history, Journal content, rewards, and cat progress.

Signing in does not automatically upload, merge, or replace your Guest data. A newly authenticated mobile account can choose **Start fresh** without sending Guest data to the cloud.

Local data may be lost if you uninstall the app, clear browser or device storage, reset the device, or otherwise remove local application data. Device or system backups may operate independently of First Move.

## 2. Accounts and authentication

If you choose to create an account, First Move uses **Supabase Auth** for email-based authentication.

For an authenticated account, First Move processes information such as:

- your email address;
- your Supabase account identifier;
- authentication and session information;
- account preferences such as your configured time zone; and
- information necessary to secure and operate the account.

Production authentication email is delivered through **Resend** using First Move's verified SMTP configuration. Resend therefore processes the recipient email address and the transactional authentication email and related delivery information as needed to send the message.

Do not share authentication links, passwords, tokens, or other account credentials with anyone.

## 3. Cloud-synced First Move data

Authenticated users can choose to use First Move's cloud synchronization features.

Depending on the features you use, supported account data may include:

- tasks and habits;
- First Moves and daily plans;
- Focus sessions and history;
- Journal or reflection content;
- completion and activity records;
- rewards and point-related records;
- cat progress, interactions, and inventory;
- Morning Start or toothbrush-check completion records;
- settings and time-zone information; and
- technical synchronization state needed to keep the account consistent.

This information is associated with your authenticated account and is stored through First Move's Supabase-backed cloud service.

Your **Journal is private cloud content**. First Move does not automatically send Journal entries to its live AI features.

You control the text that you enter into tasks, plans, Journal entries, and similar free-form fields. Because these fields are open-ended, you should avoid entering information that you do not want stored in your account.

## 4. Optional live AI

Live AI is optional. It is available only to authenticated users and runs only after you explicitly request an AI action.

The iOS 1.0 live AI features are:

- **Plan my day**; and
- **toothbrush verification**.

**Make Smaller AI is not part of iOS 1.0.**

First Move uses the **OpenAI API** to process these explicit AI requests.

### Plan my day

When you choose to use Plan my day, First Move sends the brain-dump text that you explicitly submit to the OpenAI API so that a suggested plan can be generated.

First Move does not automatically include your Journal, complete task history, cat data, rewards, or unrelated cloud workspace information in the AI request.

You can review and edit the proposed plan before saving it.

### Toothbrush verification

When you choose the optional toothbrush verification feature, you can take or select a photo. Selecting or taking a photo by itself does not upload the image.

The image is processed only after you explicitly request verification.

First Move prepares a temporary image for the request and sends it through First Move's server to OpenAI for verification.

First Move does **not** store the toothbrush image in:

- your First Move cloud workspace;
- the First Move account database;
- your Journal;
- Supabase Storage; or
- the First Move synchronization queue.

First Move's production Supabase Storage currently contains no First Move user-file buckets.

Temporary application copies of a toothbrush image are removed through the app's image-clear and screen-exit handling. If you selected an existing photo from your photo library, First Move does not delete the original photo from your device.

“Not stored by First Move” does not mean that no technical processing occurs outside First Move. OpenAI and infrastructure providers necessarily process data involved in delivering the requested AI operation and may apply their own service-side retention or operational practices. First Move does not represent that OpenAI or another provider has zero retention merely because First Move uses an API configuration requesting that the generated interaction not be stored as application content.

## 5. AI usage records and limits

First Move maintains limited account-linked records needed to enforce AI allowances and prevent duplicate or unauthorized requests.

These records may include:

- your First Move account identifier;
- the AI feature used;
- whether the request was authorized under introductory or Pro access;
- a request identifier;
- a cryptographic request fingerprint rather than the original submitted content;
- the AI provider and model metadata;
- local date and configured time zone;
- server-region metadata; and
- request authorization and dispatch timestamps.

These usage records do not contain the original Plan my day brain dump, toothbrush image, or generated AI response.

Free authenticated accounts receive **five lifetime introductory live AI requests**, shared across the live AI features available to that account.

For iOS 1.0, Pro includes:

- one Plan my day AI action per day; and
- three toothbrush-verification attempts per day.

An AI allowance is reserved before the provider request is dispatched. A provider failure occurring after that reservation may therefore consume the applicable allowance.

## 6. Subscriptions and purchases

First Move Pro is offered through Apple's App Store as an auto-renewing subscription.

Apple handles App Store payment processing. First Move does not receive your complete payment-card details from Apple.

First Move uses **RevenueCat** to manage subscription entitlement and customer state. For an authenticated account, the First Move Supabase account UUID is used as the RevenueCat App User ID. First Move does not use your email address as the RevenueCat App User ID.

RevenueCat may process information including the First Move account identifier, purchase or subscription history, product information, entitlement status, and technical information involved in operating subscription services.

The U.S. launch prices are US$4.99 per month and US$39.99 per year. Apple displays localized prices in the other supported launch storefronts.

Deleting your First Move account does **not** cancel an Apple subscription. Apple may continue billing an active subscription until you cancel it through your Apple Account.

## 7. Service providers

First Move uses third-party service providers for limited functions needed to operate the service:

**Supabase** provides authentication and cloud database/synchronization infrastructure.

**Resend** delivers transactional authentication email and processes recipient email addresses and related email content and delivery information for that purpose.

**Vercel** hosts First Move's website and server-side API functions.

**OpenAI** processes content submitted through optional, explicit live AI requests.

**RevenueCat** manages App Store subscription entitlement and customer state.

**Apple** distributes the iOS app, processes App Store purchases and subscriptions, provides device permission frameworks, and operates Apple subscription management.

First Move uses these providers for the functions described in this Policy. First Move does not sell First Move account or workspace data, does not operate an advertising network, and does not use First Move data for cross-context behavioral advertising.

First Move iOS 1.0 does not use personal information for advertising tracking.

Providers may have their own independent obligations and processing practices. First Move does not make unsupported promises about a provider's retention periods, certifications, physical processing locations, or deletion completion times.

## 8. Purposes of processing

First Move processes personal information as necessary to:

- create, authenticate, and secure accounts;
- provide optional cloud synchronization;
- save and display the content and progress you choose to store;
- provide First Move functionality;
- process optional AI requests that you initiate;
- enforce Free and Pro AI allowances;
- operate subscriptions and restore purchased entitlements;
- prevent abuse, duplicate requests, or unauthorized access;
- operate, secure, troubleshoot, and maintain the service;
- process account deletion and privacy requests; and
- comply with applicable legal obligations.

Where applicable data-protection law requires a legal basis, processing may be based on performing the service you request or a contract with you, your consent where consent is required, First Move's legitimate interests in securely operating and protecting the service where those interests are not overridden by your rights, or compliance with legal obligations.

## 9. International processing

First Move is operated from Switzerland, but its infrastructure and service providers operate across borders.

The production Supabase project's primary database region is **North EU (Stockholm, Sweden), AWS eu-north-1**.

First Move's server-side Vercel Functions are configured in **iad1, United States (Washington, D.C./US East)**.

OpenAI, RevenueCat, Resend, and Vercel are used under their standard commercial configurations. First Move has not configured custom data residency for these services and has not negotiated a custom data-residency or transfer arrangement with them.

As a result, personal information may be processed outside Switzerland and outside the country where you live. Provider processing locations can depend on the provider's infrastructure and standard service arrangements.

You may contact support@firstmovestartsmall.com for current information about First Move's international processing arrangements.

## 10. Retention

First Move does not apply one universal retention period to every category of information.

Account and cloud data are retained while needed to provide the account and features you use, unless you delete particular content or request account deletion.

AI usage records are retained as needed to operate account allowances, duplicate-request protection, security, and service integrity.

Authentication, subscription, infrastructure, and transactional records may also be retained where necessary for service operation, security, legal compliance, dispute handling, or completion of a requested deletion process.

Third-party providers may maintain information under their own applicable service, security, legal, backup, or retention requirements. First Move does not promise a provider retention period that First Move does not control.

## 11. Account deletion

Authenticated iOS users can initiate full account deletion from the **Delete account** control in First Move Settings.

To protect against unauthorized deletion:

1. First Move requires a fresh email magic-link authentication.
2. The server accepts only recent interactive authentication.
3. You must explicitly enter **DELETE MY ACCOUNT** before the request is accepted.

Once the deletion request is accepted:

- further owner-scoped cloud writes for the account are blocked;
- First Move's trusted server deletion workflow begins;
- associated First Move owner-scoped cloud records are deleted through the tested Supabase account cascade;
- the Supabase Auth account is hard-deleted;
- deletion of the associated RevenueCat customer record is requested;
- temporary provider failures are retried; and
- the current iOS app removes the deleted account's local workspace, cloud cache, pending synchronization state, and related account-scoped queues after the deletion request is accepted.

Some deletion steps may require additional processing time. First Move does not represent that every third-party system physically completes deletion at the same instant.

Deleting your First Move account does not cancel an active Apple subscription. Use First Move's **Manage Apple subscription** control or Apple's subscription management to stop future renewal.

Account deletion also cannot automatically remove copies that exist solely in independent device backups, system backups, or local data on another device outside First Move's control.

Limited operational information may be retained where necessary to complete or retry the deletion process or where retention is legally required.

## 12. Your privacy rights

Depending on the law that applies to you, you may have rights to request information about personal data First Move processes about you, request access or a copy, request correction, request deletion, object to or restrict certain processing, request portability where applicable, or withdraw consent where processing depends on consent.

You can delete an authenticated First Move account directly in the iOS app.

For other privacy or data-rights requests, contact:

**support@firstmovestartsmall.com**

First Move may need to verify your identity before acting on a request.

You may also have a right to complain to the relevant data-protection authority in your jurisdiction.

## 13. Security

First Move uses technical and organizational measures intended to protect account information and cloud data against unauthorized access, loss, alteration, or disclosure.

For example, authentication credentials and server secrets are not embedded as private credentials in the public mobile application, account access is authenticated through Supabase, and account-deletion operations use authenticated server-side controls.

No internet-connected system can be guaranteed to be completely secure.

## 14. Changes to this Policy

First Move may update this Privacy Policy when the service, providers, or legal requirements change.

When the Policy is updated, the effective date at the top will be changed and additional notice will be provided where required by applicable law.

## 15. Contact

**Operator / data controller:** Hanli Zhang  
**Operator type:** Individual operator  
**Country:** Switzerland  
**Email for privacy, support, data-rights requests, and complaints:** support@firstmovestartsmall.com  
**Postal address:** Available upon request by contacting support@firstmovestartsmall.com.
