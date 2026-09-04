# First Move — Delivery Plan

> The Next.js Web app and the independent Expo Mobile app are implemented through the current Mobile v1 Focus, Tasks/Habits, authenticated sync, and Today v1 increments. Remaining work is tracked explicitly below and in the release backlog.

## Current implementation status

- [x] Mobile M0 auth/development foundation: Expo Router shell, Guest Mode, Supabase Auth magic links, secure session storage, owner separation, and initialized-account canonical hydration; callback/sign-in/restart persistence/hydration manually verified on iOS Simulator.
- [x] M1A First Move / `ActivityIntent`: local I’m Stuck flow with one validated pending Intent and Focus handoff.
- [x] M1B persisted countdown `ActivitySession` engine: timestamp-based countdown, pause/resume, restart recovery, completion, stop, and cancellation.
- [x] M1C standalone Countdown + Stopwatch + Focus linking: shared Session semantics, 2/5/10/25/50 presets, validated custom duration, optional title/direction, and optional eligible Task/Habit link.
- [x] Mobile Tasks/Habits CRUD: owner-local create, edit, current-date completion/check-in, schedules, active-list deletion, and Focus link selection.
- [x] Authenticated Mobile writes using existing Web Sync v1 contracts for Task, Habit/check-in, ActivityIntent, and ActivitySession mutations.
- [x] Web/Mobile Focus link eligibility parity for new sessions, with historical relationships preserved after completion, check-in, or deletion.
- [x] Mobile → Web and Web → Mobile canonical sync through owner-scoped queued snapshots and validated canonical replacement.
- [x] Mobile Today v1: Tasks, Habits, closed Focus Sessions, current points, five-direction focused-time summary, activity timeline, and editable private Reflection / Mini Journal with captured local-date and timezone semantics.

The implementation is complete for the checked items above. Recorded Mobile manual acceptance remains a release gate where noted; the unchecked release backlog is intentionally deferred.

## TASK-01: Local data foundation, manual tasks, habits, and local First Move templates

- [x] Define a versioned local schema for daily records, five directions, stuck states, First Moves, tasks, habits, weekday schedules, sessions, and preferences.
- [x] Implement validation, migrations, safe defaults, reset handling, local-day rollover, and idempotent writes.
- [x] Build editable manual tasks and lightweight daily/selected-weekday habits.
- [x] Bundle non-AI First Move templates mapped to stuck state, direction, and 2/5/10/25 minute duration; support manual entry and wording edits.
- [x] Unit-test persistence recovery, rollover, weekday visibility, direction validation, and template selection.

### Acceptance criteria

- Core state survives reload and malformed stored data recovers without losing valid data.
- Tasks are fully editable; habits appear only on scheduled weekdays; both use exactly the five PRD directions.
- Every stuck state and direction has a useful local template path, available offline and without AI.
- A user can replace, edit, or manually enter a First Move before starting.

**Status:** Complete. Verified with project tests, lint, strict type-check, and production build.

## TASK-02: I'm Stuck flow, intentional direction selection, and bounded sessions

- [x] Add a prominent “I'm Stuck” entry available without Morning Start.
- [x] Build optional stuck-state selection for all six PRD states, followed by one of five intentional directions.
- [x] Present one local First Move at a time with choose-another, edit, manual, and shorter-session controls.
- [ ] Build the session flow around 2, 5, 10, and 25 minute bounds and the post-session choices: continue, rest, intentional entertainment, or finish.
- [ ] Add neutral cancellation, incomplete-session, and unsure-state paths.

### Acceptance criteria

- Any listed stuck state reaches a First Move and session without requiring AI, Morning Start, or explanatory text.
- “Unsure what is needed” remains actionable with low decision load.
- The user can change direction, choose a different/local/manual move, shorten the session, or exit at every appropriate step.
- Completion, early stop, and cancellation use non-punitive language and never remove progress.

**Status:** Intent-building portion complete. A validated pending `ActivityIntent`, optional Task/Habit linking, Focus handoff, and neutral pre-session cancellation are implemented. The shared running-session engine is complete under TASK-03A; post-session choices and broader outcomes remain in TASK-03.

## TASK-03A: Countdown timers, stopwatch tracking, and persisted ActivitySessions

> **Cross-platform Focus rule:** Focus can be entered directly without “I'm Stuck.” Quick Countdown and Stopwatch remain normal standalone tools with an optional title, one of five directions, and an optional existing Task or Habit link, even when “I'm Stuck” has supplied a separate prefilled pending First Move card. Ordinary Focus does not create an `ActivityIntent`. Selecting Intentional Entertainment as the direction does not narrow normal standalone Focus durations; only the dedicated Intentional Entertainment flow is limited to 5/10 minutes.

- [x] Start a timestamp-based Quick Countdown with 2/5/10/25/50-minute presets or a validated custom duration, or start the pending First Move at its intended duration.
- [x] Add an independent stopwatch with an optional Task or Habit link, or no link, and editable inherited direction.
- [x] Start the separate pending First Move through the shared countdown engine while retaining its historical Intent and existing Task/Habit relationship.
- [x] Persist running and paused ActivitySessions with refresh-safe elapsed-time recovery.
- [x] Support pause, resume, cancel, stop early, and idempotent completion while saving actual elapsed time.
- [x] Clear only the matching active pending Intent after completion or intentional stop; keep it ready after Session cancellation.
- [x] Add neutral unfinished feedback plus tests for recovery, inheritance, malformed data, and duplicate prevention.

### Acceptance criteria

- Refreshing cannot reset a running timer because elapsed time is derived from persisted timestamps.
- A standalone session may link to one Task or Habit or remain unlinked; an assisted countdown retains its pending ActivityIntent link and inherits its prefilled values.
- A pending First Move never hides or preselects Quick Countdown, and its historical Intent relationship remains after the active pending state is cleared.
- Completing or starting repeatedly cannot create duplicate completed or simultaneously open sessions.
- Early stop saves actual elapsed time without failure or penalty. Current product/server semantics may award the documented reduced stopped-Session rate; M1B itself did not introduce client-authoritative reward or history behavior.

**Status:** Complete. TASK-03 remains open only for intentional-entertainment outcomes and optional completion-feedback controls beyond the saved Session result.

## TASK-03B: Post-session review, Today timeline, rewards, and daily summaries

- [x] Persist completed and intentionally stopped Sessions immediately, show the saved result without confirmation, and offer optional `Edit details` for title, category, and Task/Habit link while retaining assisted ActivityIntent relationships.
- [x] Keep sessions standalone by default and support linking, relinking, or removing a Task/Habit link without creating either item.
- [x] Add duplicate-safe session rewards at 0.1 point per completed minute and 30% of that rate when intentionally stopped; sessions under one minute receive no time reward.
- [x] Show Today tracked-time totals, five-category totals, and a chronological timeline of sessions, task completions, and habit check-ins.
- [x] Show total tracked time per Task while retaining every linked Session as a separate record.

### Acceptance criteria

- A closed Session is already saved without review or a Task, including a neutral stopped-early outcome and actual duration; optional edits persist through `reviewSession`.
- Today totals derive from persisted closed Sessions; timeline entries remain distinct and have clear empty states.
- Each Session creates at most one reward rounded to one decimal; less than 60 seconds earns zero time points.
- Linking changes only Session metadata and never creates, completes, or merges Tasks.

**Status:** Complete. TASK-03 remains open for intentional-entertainment outcomes and optional completion-feedback controls.

## TASK-03C: Trends and Calendar history

- [x] Add Today, Trends, and Calendar as secondary tabs inside the existing Today area.
- [x] Aggregate closed-session time into local-date 7-day and 30-day trends, category composition, and neutral summary metrics.
- [x] Add accessible, dependency-free SVG line and donut charts with textual values and empty states.
- [x] Add a navigable local monthly calendar with active-day/intensity markers and selectable day history.
- [x] Show read-only daily sessions, task completions, habit check-ins, category totals, and Mini Journal content, with edit links for today.

### Acceptance criteria

- Trends use actual duration from completed and intentionally stopped sessions; running and paused sessions are excluded.
- Local date boundaries, period lengths, category totals, month boundaries, empty data, and day details are covered by tests.
- Rest and Intentional Entertainment are ordinary categories, and the interface does not rank directions or equate more time with success.
- History reads existing local records without changing rewards, persistence, or stored activity.

**Status:** Complete. TASK-03 remains open for intentional-entertainment outcomes and optional completion feedback controls.

## TASK-03: Timer, rewards, activity timeline, and intentional entertainment

- [x] Implement timestamp-based start, pause, resume, cancel, finish, tab-throttling correction, and reload recovery.
- [x] Centralize fixed reward values and build an idempotent local points ledger.
- [x] Build the chronological Today timeline for stuck declarations, First Moves, sessions, tasks, habits, Morning Start, reflection, and cat activity.
- [ ] Implement the dedicated Intentional Entertainment flow with an activity choice, 5/10 minute bounds, and neutral return choice; normal standalone Focus retains its existing duration rules when Intentional Entertainment is the selected direction.
- [ ] Add visual completion plus optional in-page sound/vibration controls.

### Acceptance criteria

- All bounded sessions remain accurate across pause, backgrounding, and reload; cancelled sessions do not receive completion rewards.
- Each eligible action changes points and creates its intended timeline event at most once.
- The dedicated Intentional Entertainment flow permits only 5 or 10 minutes and is never labeled as failure; normal standalone Focus is not subject to that duration restriction.
- Every entertainment session ends with continue intentionally, another direction, rest, or finish.

## TASK-04: Cat room, store, return flow, and milestones

- [x] Build persistent cat progress, inventory, and a compact four-category reward shelf with centralized prices, active-day unlocks, and balance checks.
- [x] Implement a recognizable original pixel kitten with sitting, walking, sleeping, eating, playing, and happy poses plus reduced-motion-safe idle behavior.
- [x] Refine every pose as a compact full-body SVG composition on one floor line, with a fixed-bowl eating pose and synchronized stepped two-frame walk.
- [x] Delay idle behavior for five minutes, randomize later actions at 5–10 minute intervals, return reactions to sitting, and expose non-persistent development-only pose controls.
- [x] Add a guarded food/treat sequence (eat, belly-roll, sit), pose-matched messages, and a reduced-motion-safe three-frame happy roll.
- [x] Support repeatable consumable food and one-time durable purchases without hunger or upkeep mechanics.
- [x] Add non-judgmental exploring messages after absent days.
- [x] Count unique qualifying active days, journey progress, gentle streaks, kitten stages, and persistent milestones at 21, 50, and 100 days.

### Acceptance criteria

- Purchases cannot create a negative balance; inventory and room state survive reload.
- Food, toys, furniture, and tricks are keyboard accessible and do not depend on motion.
- Missed days and failed/cancelled sessions never harm the cat or remove points, items, milestones, or progress.
- Each day counts at most once, and every milestone unlocks once and remains visible.
- Store items unlock at their configured active-day boundaries; hidden legacy furniture inventory remains loadable but is not part of the current Cat Room UI.
- Idle and action timers clean up on unmount; reduced motion disables automatic idle changes and walking translation.

**Status:** Complete for the current core Cat/store baseline. Further interaction polish is intentionally deferred to the release backlog. Morning Check and Daily Reflection qualify through their reserved local records.

## TASK-05: Daily Reflection

- [x] Add one optional, editable local reflection per day with one thing completed, what felt difficult, one small next step, and optional mood, energy, and notes.
- [x] Make reflection available from Today with an easy skip path.
- [x] Record reflection completion in the Today timeline without analyzing content.
- [x] Keep reflection storage and data flow separate from AI requests.

### Acceptance criteria

- Any subset of fields can be saved and reopened; mood and energy accept only 1–5 or empty.
- Reflection is described as private and non-diagnostic and performs no scoring, sentiment analysis, or mental-health inference.
- Reflection text remains on-device in guest mode, is private under authenticated sync, and never enters organization or First Move AI requests.
- Repeated edits do not duplicate the daily timeline completion event.

**Status:** Complete. A stable date-based reward record prevents repeat rewards after edits, deletion, or recreation.

## TASK-06: Optional AI organization and Make It Smaller

- [x] Add explicit, opt-in GPT-5.6 organization for a user-submitted daily text brain dump.
- [x] Add local “Make this smaller” adaptation for one selected reviewed item.
- [x] Validate structured output against the five directions, concrete action rules, item-count limits, and 2/5/10/25 minute bounds.
- [x] Build review/edit/delete/reorder/recategorize/add/confirm/cancel, loading, missing-key, offline, rejection, and malformed-response states.
- [x] Restrict each request to the text and context the user explicitly submits.

### Acceptance criteria

- No AI request occurs or applies changes without an explicit action and review.
- AI task proposals and adapted moves are concise, valid, bounded, and safely rejected when malformed.
- Reflections, images, habits, history, cat state, and unrelated local data are never sent.
- Missing or failed AI never blocks local templates, manual First Moves, manual tasks, or sessions.

**Status:** Complete. Mock planning is the safe default; live planning requires explicit server configuration and a user click. Suggestions remain transient until the editable review is confirmed.

## TASK-07: Toothbrush image verification

- [x] Build the fixed Morning Start check with camera capture, image-file selection, permission guidance, preview, confirmation, retry, and skip states.
- [x] Compress images locally to JPEG at a maximum 768 px and dispose of them after retake, skip, success, or unmount; never persist them.
- [x] Add the default no-network mock verifier and development pass/fail controls behind the `OPENAI_LIVE_VISION` mode boundary.
- [x] Atomically trigger the cat reaction, award points, count activity, and add one timeline event on the first successful daily check.
- [x] Continue from successful Morning Start into the existing First Move selection.
- [x] Connect live image verification through a bounded server route without persisting images or exposing credentials.

### Acceptance criteria

- The check cannot be deleted or converted into a task and resets by local calendar date.
- Camera/file and unavailable-access fallback paths are clear and accessible, with no dental or diagnostic claim.
- Repeating or reloading cannot duplicate feeding, rewards, active-day counting, or the timeline event.
- Morning Start leads into the same First Move flow while “I'm Stuck” remains independently available.

**Status:** Complete. Mock remains the default; live verification requires explicit server configuration and a user click, uses one non-retried low-detail Responses API request, and preserves the three-attempt daily limit.

## TASK-08: Web polish, Build Week deployment, and submission

- [x] TASK-08A: Polish the 375–1440 px responsive shell, cards, forms, charts, calendar, Cat Room, and compact scrollable navigation at 100% browser zoom.
- [x] TASK-08B: Add distinct kitten food/toy/trick interactions, the simplified four-category store, idempotent 21/50/100 active-day grants, milestone cards, and the day-100 garden.
- [x] TASK-08C: Prepare Build Week README and Devpost submission documentation, including privacy, GPT-5.6 Luna, Codex collaboration, cost controls, deployment, limitations, and a sub-three-minute demo plan.
- [x] Add the persistent, reduced-motion-aware global kitten companion, transient completion feedback, and user-facing Cat Store naming without changing rewards or stored records.
- [ ] Add project-local unit/integration test tooling and cover persistence, core loop, timing, rewards, privacy boundaries, rollover, and error states.
- [ ] Verify keyboard navigation, focus management, semantics, labels, contrast, reduced motion, touch targets, and non-color cues.
- [ ] Polish phone, tablet, and desktop layouts for one-decision-at-a-time stuck use, safe areas, long content, and interrupted sessions.
- [x] Run lint, type checks, tests, and production build; fix every failure.
- [x] Document setup, privacy, AI configuration, behavioral inspiration, medical limitations, testing, and demo flow.
- [x] Prepare deployment and submission documentation without committing or pushing automatically.

### Acceptance criteria

- Core Morning Start and “I'm Stuck” paths pass automated and manual checks at representative viewport sizes.
- The app is usable by keyboard and assistive technology, respects reduced motion, and never relies on color alone.
- Tests confirm no punishment for missed/failed sessions, no persisted toothbrush images, and no reflection leakage to AI.
- Lint, type checks, tests, and production build pass; deployed behavior and submission documentation match the PRD.

**Status:** This is the historical Web/Build Week polish task. It is not the native Mobile release task; current Mobile release work remains under TASK-12 and the release backlog.

## TASK-09: Optional account and cross-device sync foundation

- [x] Add email OTP under **Sync across devices** while preserving complete guest mode.
- [x] Implement the smallest continuous-sync MVP: normalized owner-scoped database records, UUIDs, tombstones, canonical startup/focus/manual hydration, a durable local retry queue, idempotent economic commands, and automated second-client hydration coverage.
- [ ] Replace the MVP full-snapshot queue with the planned normalized IndexedDB cache/outbox, change cursor, and long-offline conflict recovery before a broad production rollout.
- [x] Implement development-gated Phase B2 Start fresh, Import this device, immutable local backup, retry-safe UUID mapping, and canonical initial hydration without automatic local deletion.
- [x] Add sign out while retaining local data.
- [x] Protect and continuously synchronize private Mini Journal rows without sending their content to AI or logs.
- [ ] Add export, logout cache choice, account deletion, and explicit backup/cache management.
- [ ] Complete true-device iOS/Android identity and secure token-storage acceptance; iOS Simulator authentication and restart persistence are verified under TASK-12 M0.
- [x] Apply `20260731180000_continuous_cloud_sync.sql` remotely and manually verify two-browser task creation, task updates, and habits.
- [x] Verify owner isolation through automated database RLS and cross-user tests.
- [ ] Manually verify Start fresh with a second empty account, offline edit/retry/second-browser convergence, and a remote user-A/user-B isolation smoke test.

**Cloud-sync status:** Frozen Web Sync v1 MVP checkpoint. All migrations are remotely applied; Phase B2 setup/import/hydration and core two-browser task/habit convergence are manually verified. Automated application/database suites, including RLS isolation, are recorded as passing. The three remaining manual smoke checks are tracked above and do not block the current Mobile v1 implementation, but Web Sync v1 is not production-perfect or fully QA-complete.

## TASK-10: RevenueCat subscriptions and product access

- [ ] Configure RevenueCat `pro` entitlement with Supabase Auth UUID as App User ID.
- [ ] Implement purchase, restore, account switch, downgrade/expiry/refund, grace-period, and webhook/read-model behavior.
- [ ] Add transparent Free/Pro comparison, usage display, manage-subscription flow, and non-destructive feature gates.
- [ ] Keep cross-device sync and all core non-AI productivity features Free.
- [ ] Define advanced-history and premium-cat scope without degrading Free data or earned items.

## TASK-11: Server AI gateway, quotas, and regional providers

- [ ] Define provider contracts for daily plan, toothbrush verification, and Make this smaller, with OpenAI, manual/local, and fake future regional implementations.
- [ ] Before dispatch, verify authenticated user, supported region, RevenueCat Pro or remaining introductory credit, feature daily quota, and server rate limit.
- [ ] Add append-only, idempotent server-side AI usage events; enforce 5 lifetime actions for authenticated Free users and Pro limits of 1/3/5 per local day under concurrency.
- [ ] Design a durable server-side Guest identity and enforcement model so Guest can receive its intended 5 introductory actions without trusting a client-resettable counter.
- [ ] Use `gpt-5.6-luna`, short validated structured outputs, bounded inputs/outputs, explicit user action, timeouts, and no automatic retries.
- [ ] Preserve manual fallback for every AI feature and consume no usage when rejected before provider dispatch.
- [ ] Launch only in an approved supported-international-market allowlist; exclude Mainland China initially.
- [ ] Test entitlement forgery, quota races, timezone abuse, provider/RevenueCat outages, privacy boundaries, and absence of secrets from clients.

## TASK-12: Mobile v1

### M0 — Expo foundation and authentication

- [x] Create an independent Expo React Native/TypeScript project under `/mobile` without moving Web or creating a workspace.
- [x] Add basic mobile design tokens and Expo Router placeholders for First Moves, Today, Focus, Cat, and Settings.
- [x] Implement loading, signed-out, Guest Mode, authenticated, and privacy-safe error states.
- [x] Add public Expo Supabase configuration, email magic links, and the `firstmove://auth/callback` development route.
- [x] Persist Supabase sessions through a chunked Keychain/Keystore-backed Expo SecureStore adapter.
- [x] Keep schema-v8 guest storage separate from account-scoped validated cloud caches; sign out deletes neither.
- [x] Detect existing workspaces with `cloud_workspace_status` and hydrate them read-only with `get_cloud_workspace_v2`.
- [x] Stop empty accounts before any setup write and show that cloud setup is unavailable until M1.
- [x] Cover config, auth transitions, callback handling, session restore, secure storage, local separation, and read-only hydration with focused tests.
- [x] Manually verify `firstmove://auth/callback`, magic-link sign-in, authenticated session persistence across restart, and canonical initialized-workspace hydration on iOS Simulator.
- [ ] Complete true-device iOS/Android M0 acceptance; the simulator result does not close the device release gate.

**M0 status:** Implementation and automated checks are complete in the current `/mobile` tree. The callback, magic-link sign-in, authenticated restart persistence, and canonical initialized-workspace hydration are manually verified on iOS Simulator. True-device iOS/Android acceptance remains pending.

### M1A — Local I’m Stuck intent builder

- [x] Normalize and migrate schema-v8-compatible guest state through the existing Mobile AsyncStorage repository.
- [x] Port all six stuck states, the exact five PRD directions, and the existing offline First Move template matrix.
- [x] Support another suggestion, editable wording, manual entry, and 2/5/10/25-minute shortening before saving.
- [x] Create at most one validated pending `ActivityIntent` and show it in Focus without starting a timer.
- [x] Keep authenticated cloud data read-only and Guest Mode fully local; add focused domain, migration, and serialized-write tests.

**M1A status:** Implemented in the current `/mobile` tree; automated checks pass. Running timers are tracked separately in M1B below; Tasks/Habits UI, cloud business-data writes, Cat, Morning Start, and AI remain outside M1A.

### M1B — Local Focus countdown

- [x] Separate Guest local state from per-Supabase-UUID local state while retaining both and keeping the canonical cloud cache independent.
- [x] Start the pending `ActivityIntent` as one local schema-v8 countdown `ActivitySession` restricted to 2/5/10/25 minutes.
- [x] Derive elapsed and remaining time from persisted timestamps; restore running/paused state and reconcile elapsed countdowns after restart.
- [x] Add pause, resume, automatic completion, neutral early stop, and cancellation without client-authoritative reward/history behavior or punishment.
- [x] Persist actual elapsed time and prevent duplicate open sessions or duplicate completion.
- [x] Add Focus ready, running, paused, completed, and stopped states with focused ownership/timing/persistence tests.

**M1B status:** Implemented in the current `/mobile` tree; focused and full Mobile tests, lint, strict TypeScript, Expo dependency validation, and iOS/Android exports pass. M1B itself did not introduce client-authoritative rewards or history presentation; current authenticated server semantics may derive the documented reduced reward for stopped Sessions. Post-session choices, Today/history presentation, notifications/background services, and later M1 features remain out of scope for this increment.

### M1C — Complete local Focus

- [x] Keep the pending First Move as a separate prominent card while leaving standalone Countdown and Stopwatch independently available.
- [x] Add standalone 2/5/10/25/50-minute Countdown presets plus validated 1–720 custom minutes, optional title, one of five directions, and an optional existing Task or Habit link.
- [x] Add standalone Stopwatch start, pause, resume, stop, cancellation, optional title, one of five directions, and an optional existing Task or Habit link through the M1B Session engine.
- [x] Persist completed and intentionally stopped Sessions immediately, then show the saved result with optional title, direction, and Task/Habit review edits.
- [x] Mark only the matching pending Intent consumed after completion/stop, retain its full historical record and relationship, and keep it pending after Session cancellation.
- [x] Reuse active local parents plus active Tasks/Habits from the current authenticated UUID’s validated read-only canonical cache without copying or creating parent records.
- [x] Preserve Guest/account-local namespaces, canonical-cache isolation, actual elapsed time, restart recovery, duplicate prevention, and the no-cloud-business-write boundary.

**M1C status:** Implemented in the current `/mobile` tree. Mobile Focus matches the current cross-platform Focus entry and review contract; authenticated writes are now enabled by M1E without changing the Focus domain contract or adding SQL/RPC architecture.

### M1D — Local Tasks and Habits

- [x] Reuse the schema-v8 Task/Habit models and add UUID-v4 local creation, title/direction editing, local-date completion toggles, active-list soft deletion, and daily/selected-weekday Habit schedules.
- [x] Add dedicated Mobile Tasks and Habits screens reachable from Today, with accessible current-date completion controls and deletion confirmation.
- [x] Keep Guest and per-Supabase-UUID account-local writes serialized through the existing AsyncStorage repository without merging namespaces.
- [x] Show current-owner canonical Tasks/Habits separately as read-only, preserve their stable UUIDs, and never copy them into editable local state.
- [x] Replace each long inline Focus parent list with one compact field and a searchable modal containing No linked item, Tasks, Habits, source labels, and an explicit selected state.
- [x] Preserve existing `linkedTaskId` / `linkedHabitId` relationships and add no cloud business writes, rewards/history, dependencies, SQL, or RPCs.

**M1D status:** Implemented in the current `/mobile` tree. Focus and local Task/Habit CRUD remain schema-v8 compatible; M1E now enables authenticated writes for these mutations through the existing canonical contract.

### M1E — Authenticated Mobile cloud writes

- [x] Reuse `cloud_workspace_status`, `get_cloud_workspace_v2`, and `sync_cloud_workspace_v1` without SQL, RPC, RLS, Auth, or Web Sync redesign.
- [x] Make a successfully hydrated initialized account’s canonical schema-v8 workspace the editable UUID-scoped Mobile working/cache copy without merging Guest or pre-sync account-local rows.
- [x] Add an AsyncStorage-backed per-user device identity and ordered full-snapshot retry queue with UUID mutation identities, pending-only Intent serialization, canonical daily-plan passthrough, and empty economic commands.
- [x] Save each authenticated Task, Habit/check-in, pending Intent, and Session lifecycle/review mutation to the durable queue before dispatch; preserve UI-local state and the queue on offline/failure/restart.
- [x] Revalidate the current Supabase UUID before every dispatch, guard stale responses, isolate account A/account B/Guest queues, and flush pending writes before startup/foreground/manual reads.
- [x] Validate every successful canonical response before it replaces the working/cache copy; show Loading, Pending, Syncing, Synced, Offline/retry-pending, Sync error, Guest-local, and uninitialized write-disabled states honestly.
- [x] Keep Task/Habit/Session reward authority on the existing server contract and leave empty-account Start fresh / Import this device outside M1E.
- [x] Cover hydration, all scoped mutation families, restart/offline/idempotent retry, flush-before-read, owner isolation, Guest/no-write, uninitialized, invalid/stale responses, UUIDs, passthrough state, and no-private-logging boundaries.

**M1E status:** Implemented in the current `/mobile` tree; automated Mobile checks pass. Manual same-account Mobile↔Web, offline/restart, and account-switch acceptance remains required before release. No backend or native dependency change was made.

### Mobile Today v1

- [x] Show current active Tasks and scheduled Habits with current-date completion/check-in controls through the existing owner-scoped mutation path.
- [x] Show completed and intentionally stopped Focus Sessions for the captured local date, including actual elapsed time, direction, and available linked Task/Habit/First Move labels.
- [x] Show the current canonical or Guest-local point balance without calculating or mutating authenticated authoritative points on Mobile.
- [x] Show total focused time and all five direction totals using compact React Native primitives without a chart dependency.
- [x] Show today's Task completions, Habit check-ins, and closed Sessions in an activity timeline with available captured times, directions/types, and point changes.
- [x] Support current-day private Reflection / Mini Journal create, edit, and delete; Guest remains local, while authenticated writes use the existing durable Mobile full-snapshot sync path and server-authoritative first-save reward.
- [x] Preserve captured local-date and IANA-timezone facts instead of deriving historical day membership from the viewer's current timezone.

**Mobile Today v1 status:** Implemented on `main`. Reflection content remains excluded from AI, logs, analytics, and notifications; no SQL, RPC, RLS, product-rule, or native dependency change was introduced.

## Release backlog

These items are intentionally deferred and are not implemented:

1. Mobile Trends and Calendar history parity.
2. Cat interaction/store work:
   - purchased toys must be visibly usable;
   - the laser pointer should create a visible target;
   - the cat should turn/move toward it and occasionally pounce/reach;
   - toy/equipped state should persist;
   - purchases must remain server-authoritative/idempotent.
3. Release UI polish:
   - remove developer-facing `Storage boundary` / architecture explanations;
   - replace them with simple user-facing Local / Pending / Synced / Offline states;
   - consider dedicated/full-screen active Focus session UI.
4. RevenueCat Pro entitlement.
5. Server-controlled AI quota.
6. True-device iOS/Android testing.
7. App Store / Google Play release requirements.

## Explicitly excluded

- Advertising or consumable real-money purchases
- System alarms or guaranteed background alerts
- App/site blocking
- Social features
- Medical treatment, diagnosis, crisis intervention, or brain-stimulation/repair claims
- AI sentiment analysis or mental-health diagnosis
- OpenAI-backed features in unsupported regions; Mainland China in the initial production launch
