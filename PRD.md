# First Move — MVP Product Requirements

## Product premise

First Move is a gentle cross-platform product for Web and native Mobile, built for a specific moment: the user is trapped in passive scrolling or inactivity and has difficulty switching into an intentional state, even when the current behavior is causing distress.

The app helps the user notice the moment, choose a direction, take one very small action, and reassess without shame. It is inspired by behavioral activation and intentional-use design, but it is not medical treatment. It does not diagnose a condition or claim to stimulate, repair, or otherwise change the prefrontal cortex.

## Goals

- Make help reachable while the user is stuck, with minimal reading and decision load.
- Turn vague intention into one concrete, very small First Move and a bounded session.
- Treat intentional rest and entertainment as valid choices rather than failures.
- Provide a useful local experience without an account, network, or AI.
- Reinforce effort gently through visible progress and virtual-cat rewards.

## Non-goals

No social features, advertising, consumable real-money purchases, system alarms, app/site blocking, medical treatment, diagnosis, crisis intervention, or claims about repairing or stimulating the brain. Daily Reflection is private journaling, not clinical assessment; there is no AI sentiment analysis or mental-health diagnosis. Mainland China is not part of the initial production launch.

## Core loop

1. Notice or declare being stuck.
2. Choose an intentional direction.
3. Receive or manually choose one very small First Move.
4. Complete a bounded assisted session or a normal Focus Countdown/Stopwatch session.
5. Choose whether to continue, rest, use entertainment intentionally, or finish.
6. Receive gentle progress feedback and cat rewards.
7. Reflect briefly on what helped.

Stopping, changing direction, or not completing a session never produces punishment. The app offers a smaller next step or a neutral exit.

## Entry points

### Morning Start

1. Capture or select a toothbrush photo and explicitly verify it.
2. On the first successful check that day, feed the cat, award points, and record the activity.
3. Choose an intentional direction and begin a First Move.

The toothbrush check is fixed and non-editable. Images are compressed locally, discarded after confirmation or cancellation, and never used for dental diagnosis. Mock verification is the default and sends nothing externally; when live vision is explicitly enabled by the deployer, a photo is sent to OpenAI only after the user clicks Verify photo. If camera/file access is unavailable, provide a clearly labeled manual fallback.

### I'm Stuck

- Keep an “I'm Stuck” action visible and available at any time, without requiring Morning Start or any previous setup.
- Let the user optionally identify the current state:
  - scrolling and unable to stop
  - in bed and unable to get up
  - knows what to do but cannot start
  - overwhelmed by a large task
  - needs intentional rest
  - unsure what is needed
- Do not require the user to explain or justify the state. “Unsure” must lead directly to useful choices.

## Intentional directions

Use exactly five directions across First Moves, tasks, habits, and AI proposals:

- Work & Study
- Daily Life
- Exercise & Movement
- Intentional Entertainment
- Rest

Each direction uses neutral language and can be changed before or after a session.

## First Move system

### Local templates

- Bundle a non-AI library of very small First Move templates indexed by stuck state, direction, and suitable duration.
- Examples include opening one document, putting both feet on the floor, placing one item away, stretching beside the bed, choosing one video intentionally, or setting up a rest space.
- Present one suggestion with controls to choose another, make a manual First Move, or shorten the duration.
- Keep templates editable in wording before starting and fully available offline.
- Avoid promises of outcomes; templates should describe observable actions that can begin immediately.

### Optional AI adaptation

- Let the user explicitly request “Make It Smaller” or adapt a First Move using only text they choose to submit.
- Return one concise, concrete proposal with a valid direction and bounded duration; never start or apply it automatically.
- Local templates and manual entry provide the complete fallback when AI is unavailable or declined.
- Live AI uses `gpt-5.6-luna` through a trusted server, short structured outputs, and no automatic retries. Availability depends on account quota and supported launch region.

## Bounded sessions and return choice

### Focus

- Normal Focus on both Web and Mobile supports standalone Countdown with 2, 5, 10, 25, or 50 minute presets, a validated custom duration, and standalone Stopwatch.
- Each normal Focus session accepts an optional activity title, one of the five directions, and an optional eligible Task or Habit link; no linked item is valid.
- Assisted Focus remains `I'm Stuck → pending First Move → Focus`.
- Assisted and standalone paths reuse the same `ActivitySession` semantics.
- Use timestamp-based timing so tab throttling and reload recovery do not corrupt remaining time.

### Focus link eligibility

- For new Focus sessions, active incomplete Tasks are selectable; completed or deleted Tasks are not.
- Active Habits that have not been checked for the current local date are selectable; Habits already checked today are not.
- Deleted or inactive Habits are not selectable.
- Historical `ActivitySession` relationships remain valid after a linked Task is completed or deleted, or a linked Habit is checked or deleted.

### Session lifecycle

- Completed and intentionally stopped Sessions persist automatically.
- A second `Save session` action is not required; `Edit details` is optional review.
- Cancellation removes the open Session and does not create a completed or stopped result.
- Completing or intentionally stopping the linked First Move clears only its active pending state while the Session retains the historical Intent relationship; cancelling the Session keeps the pending First Move ready.

### Cross-device running timer boundary

- Do not promise realtime cross-device timer takeover.
- A running timer is owned by the device that started it. Persisted Session state converges through normal sync.

- “I'm Stuck” remains the prominent assisted-start path. It creates one pending `ActivityIntent` shown as its own optional prefilled First Move card; Quick Countdown and Stopwatch remain independently available, and ordinary standalone Focus never creates a placeholder or fake intent.
- At completion or early stop, present neutral choices: continue, rest, intentional entertainment, or finish.
- Use an in-page visual completion state and optional sound/vibration where supported; do not promise system alarms.

### Intentional Entertainment

- The dedicated Intentional Entertainment flow supports only a bounded 5 or 10 minute session in the MVP.
- Normal standalone Focus keeps its 2/5/10/25/50-minute Countdown presets, validated custom duration, and Stopwatch when Intentional Entertainment is selected as the direction.
- Ask the user to name or choose the intended activity before starting.
- When time ends, offer the same neutral return choice: continue intentionally, choose another direction, rest, or finish.
- Using entertainment intentionally is a valid direction and is never labeled as failure, relapse, or lost progress.

## Supporting features

### Manual tasks and habits

- Create, edit, delete, reorder, categorize, and complete manual tasks.
- Create lightweight habits scheduled daily or on selected weekdays.
- Allow a task or habit to become the source of a smaller First Move without changing the original item.
- Award configured points once per eligible completion per local day.

### Optional AI task organization

- Let the user explicitly submit a daily text brain dump for optional GPT-5.6 organization.
- Propose reviewable tasks with titles, one of the five directions, order, and optional session duration.
- Never apply proposals automatically. Manual task entry and organization remain complete alternatives.
- Exclude reflections, toothbrush images, history, habits, cat state, and unrelated local data from AI requests.
- Offer Plan my day after Morning Start and inside Today. Submit only an explicitly entered brain dump (maximum 2,000 characters), return one First Move plus up to three priority and three optional tasks, and require editable confirmation before saving.
- Keep mock planning as the safe default. Live planning uses one non-retried Responses API request only after the user clicks Organize with AI; local manual planning and ordinary task creation remain available at all times.
- Pro permits one AI daily-plan request per local day. A Free account may use one of its five lifetime introductory AI actions.

### Rewards and activity timeline

- Store a local points ledger with fixed, idempotent rewards for meaningful actions.
- Award completed sessions 0.1 point per actual tracked minute and intentionally stopped sessions 30% of that rate. Sessions under 60 seconds earn no points; round session rewards to one decimal place.
- Show a chronological Today timeline for Morning Start, First Moves, bounded sessions, tasks, habits, reflection, and relevant cat/store activity.
- Record readable labels, local timestamps, event types, and point changes where applicable.
- Give feedback for showing up and choosing intentionally, not for maintaining a perfect streak.

### Virtual cat

- Provide a forgiving Cat Store with a compact reward shelf for Food, Treats, Toys, and Tricks, plus a small global kitten companion that gives transient, non-punitive feedback without changing rewards.
- Use a compact original local pixel kitten with coherent full-body sitting, two-frame walking, sleeping, eating, playing, and happy poses on one floor baseline. Wait five minutes before the first automatic idle action, then 5–10 randomized minutes between brief walk, sleep, or blink actions; reduced motion disables automatic changes and walking translation.
- Let users spend local points, manage inventory, feed and play with the cat, and trigger a simple trick; furniture customization is deferred.
- Use a staged local store: milk on active day 1; yarn on day 3; teaser wand on day 7; cat food plus 10 free servings on day 21; treats plus 10 free servings and high-five on day 50; and paw shake, a free outdoor garden, and butterfly play on day 100. Milestone grants are idempotent and depend on lifetime active days, never a perfect streak.
- Give milk, kibble, treats, yarn, wand play, high-five, paw shake, and butterfly exploration distinct visual interactions. Food remains consumable; toys, tricks, scenes, and milestone interactions are durable.
- Morning Start feeds the cat once per day without spending points.
- Missed days, cancelled sessions, and incomplete actions never harm the cat or remove points, inventory, milestones, or progress.
- Welcome returning users with gentle, non-judgmental messages.
- Count each local date once when it contains a completed task, habit check-in, session of at least one minute, Morning Check, or Daily Reflection. Track first use, last activity, journey day, total active days, and a gentle current streak without reducing lifetime progress after absences.
- Keep the cat kitten-like while labeling stages as New kitten on active days 1–7, Settling in on 8–21, Curious kitten on 22–50, Adventurous kitten from 51 until the 100th active day, and Companion from day 100 onward. Retain milestones at 21, 50, and 100 active days.
- Keep the existing core cat experience Free. Pro may add premium cat content without removing, degrading, or confiscating Free or previously earned core items.

### Daily Reflection

- Offer a short, optional reflection after a session or from Today:
  - one thing I did today
  - what felt difficult
  - one small next step
  - optional mood 1–5, energy 1–5, and free text
- Save at most one editable reflection per local day, with every field optional.
- Award 2 local points on the first save for a date; edits and deletion followed by recreation never award that date again.
- Keep reflections on-device in guest mode and under private per-user access controls when the user enables cloud sync. Keep them outside all AI requests. Never score, diagnose, infer sentiment, or produce mental-health conclusions.

## Navigation and experience

- Make “I'm Stuck” the most prominent action throughout the responsive app.
- Morning contains Morning Start and its toothbrush check.
- Today contains the stuck entry, tasks, scheduled habits, reflection, points, and activity timeline.
- Focus/session UI keeps Quick Countdown and Stopwatch available beside an optional pending First Move card, then provides the shared timer, saved result, optional details edit, and neutral return choice.
- Cat Store contains status, room, store, inventory, tricks, and milestones; the global companion links there from every other main view.
- Minimize required typing and show one decision at a time during the stuck flow.
- Use large touch targets, semantic controls, keyboard support, visible focus, reduced-motion support, sufficient contrast, and non-color status cues.

## Local data and privacy

- Use a versioned, validated local schema with migrations, safe defaults, local-day rollover, and an explicit reset path.
- Persist tasks, habits, templates/preferences, stuck-flow choices, session state, points, timeline, reflections, cat state, inventory, and milestones.
- Do not persist toothbrush images. Send one only for an explicit live verification action when live vision is configured; mock mode remains entirely local and makes no paid request.
- Explain the platform-specific local-storage boundary: clearing browser site data can remove unsynced Web progress, while Mobile local progress lives in app/device-local storage and can be removed when that storage is cleared. Consider export/import only after the core MVP works.
- Guest mode remains local and complete. Authenticated users may choose **Sync across devices** using email OTP and Supabase. On Web, first login offers Start fresh or Import local data and never automatically deletes local data; Mobile empty-account setup/import remains deferred.
- Cloud setup and the continuous-sync MVP are development-gated by `NEXT_PUBLIC_CLOUD_SETUP_ENABLED`. After verified hydration activates cloud mode, Supabase is canonical, localStorage is an immediate cache, failed writes remain in a small durable retry queue, and the UI says Synced only after a successful cloud operation.
- Cross-device sync is included in Free and Pro. Mini Journal is private user data protected by per-user access controls and excluded from AI requests and telemetry payloads.
- RevenueCat is authoritative for the `pro` entitlement, using the Supabase Auth UUID as RevenueCat App User ID. Clients cannot authorize paid AI calls.
- OpenAI keys and other secret credentials remain server-side. Toothbrush photos are never persisted.

### Web Sync v1 implementation status

Web Sync v1 is implemented behind `NEXT_PUBLIC_CLOUD_SETUP_ENABLED`. Email magic-link authentication, immutable guest backup, Import this device, Start fresh, Use cloud progress, canonical startup/focus/manual hydration, authenticated continuous writes, soft deletion, a durable local retry queue, and server-authoritative economic commands are present. All repository migrations, including `20260731180000_continuous_cloud_sync.sql`, are applied remotely. Phase B2 setup/import/hydration and two-browser task creation, task update, and habit convergence are manually verified. Start fresh with a second empty account, offline edit/retry convergence, and a remote user-A/user-B isolation smoke test remain pending; automated coverage exists for these boundaries, including database RLS isolation.

The v1 runtime sends complete validated schema-v8 workspace snapshots through an idempotent authenticated RPC. Supabase is authoritative after activation, while localStorage remains the immediate UI cache and durable small retry queue. This is deliberately smaller than the designed normalized IndexedDB outbox/change-cursor architecture, realtime, and long-offline conflict recovery, which remain deferred.

This is a frozen Web Sync v1 MVP checkpoint with documented pending smoke tests, not a claim of production-perfect or fully QA-complete synchronization. The remaining Web manual checks do not block the current Mobile v1 implementation.

Mobile now reuses that frozen contract for already-initialized accounts only. Web and Mobile restore the same Supabase Auth UUID; Mobile canonical schema-v8 hydration becomes that UUID's editable working copy, and authenticated Task/Habit/ActivityIntent/ActivitySession mutations enter an ordered durable AsyncStorage queue before dispatch. Pending writes flush before reads, and validated canonical responses remain authoritative. Guest Mode stays local-only and empty-account setup/import remains write-disabled. Running timers remain device-owned rather than realtime-synchronized. No SQL, RPC, RLS, Auth, reward-authority, or Web Sync v1 behavior changed; manual Mobile↔Web/offline/restart/account-switch acceptance remains a release gate.

## Free and Pro

| Capability | Free | Pro |
| --- | --- | --- |
| Core non-AI productivity | Included | Included |
| Manual daily planning and local First Move templates | Included | Included |
| Tasks, habits, timers, Mini Journal, core cat, and cross-device sync | Included | Included |
| Introductory AI | Authenticated Free: 5 lifetime actions per account. Guest: 5 intended actions, with durable identity/enforcement unresolved. | Unused introductory credits remain if Pro later lapses |
| AI daily plan | Uses an introductory action | 1 per local day |
| AI toothbrush verification | Uses an introductory action | Up to 3 per local day |
| AI Make this smaller | Uses an introductory action | Up to 5 per local day |
| Advanced history | Not included | Included |
| Premium cat content | Not included | Included |

One AI action means one paid provider request dispatched by the server. Manual/local fallbacks and requests rejected before provider dispatch do not consume quota. The product decision gives authenticated Free users five lifetime actions and intends the same five-action allowance for Guest. Durable server-side Guest identity and enforcement remain unresolved in TASK-11. Pro limits remain 9 paid calls per local day across the documented feature quotas. This quota system is not yet implemented.

Before production paid OpenAI dispatch, the server must verify the authenticated Supabase user or future durable Guest identity, RevenueCat `pro` entitlement or remaining introductory credit, feature-specific local-day quota, supported region, and server-side rate limit, then record one idempotent usage event. Client counters and entitlement claims must not be trusted.

## Regional AI strategy

Initial production launch targets supported international markets and does not offer OpenAI-backed features in unsupported regions. Mainland China is excluded initially. A common trusted-server provider interface supports OpenAI (`gpt-5.6-luna`) for approved markets, manual/local behavior, and a possible future region-specific provider after legal, privacy, residency, safety, and quality review. Every AI feature retains a manual fallback.

## Success criteria

- From any screen, a user can declare being stuck and begin a local-template or manual First Move without AI or Morning Start.
- Each listed stuck state reaches a valid direction, very small action, and bounded session with low decision load.
- After a session, the user can continue, rest, choose intentional entertainment, or finish without punitive language or lost rewards.
- The dedicated Intentional Entertainment flow runs for 5 or 10 minutes and ends in a neutral return choice; normal standalone Focus retains its ordinary duration rules when its direction is Intentional Entertainment.
- Morning Start verifies a toothbrush image locally, feeds the cat, and awards its daily reward exactly once.
- Tasks, habits, points, timeline, cat progress, reflection, and active-day milestones survive reload and local-day rollover.
- AI failure never blocks local templates, manual First Moves, manual tasks, or timing.
- The experience clearly states its behavioral inspiration and medical limitations.

## MVP decisions

- Guest mode is a complete local profile. Optional email-OTP accounts add Free cross-device sync.
- “I'm Stuck” works independently and is the primary product path; Morning Start is a complementary entry.
- Five fixed directions organize local templates, tasks, habits, and AI output.
- Assisted First Moves choose and display an intended duration from fixed 2, 5, 10, or 25 minute bounds. Normal Focus on Web and Mobile supports 2/5/10/25/50-minute Countdown presets, validated custom duration, and Stopwatch even when its direction is Intentional Entertainment; only the dedicated Intentional Entertainment flow is limited to 5/10 minutes.
- Effort receives gentle feedback, while missed days and failed or cancelled sessions receive no punishment.
- AI is optional and user-initiated; local templates and manual controls are always available.
- RevenueCat is authoritative for Pro; Supabase Auth UUID is its App User ID.
- Authenticated Free users receive 5 lifetime introductory AI actions. Guest is also intended to receive 5, but durable server-side Guest identity/enforcement remains an unresolved TASK-11 design item. The quota system is not implemented; Pro product limits remain 1 plan, 3 toothbrush verifications, and 5 Make this smaller requests per local day.
- OpenAI-backed features launch only in supported international markets, use `gpt-5.6-luna` with short structured outputs and no automatic retries, and keep credentials server-side.
