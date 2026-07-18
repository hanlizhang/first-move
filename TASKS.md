# First Move — Delivery Plan

> Foundation completed on 2026-07-18: Next.js App Router, TypeScript, Tailwind CSS, ESLint, npm scripts, and the responsive Morning, Today, Focus, and Cat shell. Feature behavior remains to be implemented.

## TASK-01: Local data foundation, tasks, and habits

- [ ] Define strict types for versioned app state, daily records, tasks, habits, weekday schedules, the five fixed categories, and preferences.
- [ ] Implement validated local persistence, migrations, safe defaults, reset handling, local-date rollover, and seeded editable examples.
- [ ] Build manual task create, edit, delete, reorder, categorize, and complete flows.
- [ ] Build habit create, edit, delete, daily/selected-weekday scheduling, and completion flows.
- [ ] Add unit tests for schema recovery, migration, local-day rollover, category validation, weekday visibility, and duplicate completion handling.

### Acceptance criteria

- State survives reloads, malformed stored data recovers safely, and a new local day rolls over without losing history.
- Tasks support all manual editing actions and use exactly the five PRD categories.
- Habits can run daily or on selected weekdays, and only scheduled habits appear for today.
- A task or habit cannot receive the same daily completion reward twice.

## TASK-02: Focus timer, rewards, and Today timeline

- [ ] Centralize reward amounts and implement an idempotent local points ledger.
- [ ] Build 2, 10, and 25 minute presets plus validated 1–120 minute custom duration.
- [ ] Implement timestamp-based start, pause, resume, cancel, reload recovery, and completion behavior.
- [ ] Add visual completion and optional in-page sound/vibration controls.
- [ ] Build the chronological Today timeline for morning, task, habit, focus, reflection, cat, and purchase activity.

### Acceptance criteria

- Timer presets and custom durations work through every state and remain accurate after tab throttling or reload.
- Completed eligible actions change points exactly once and produce one correctly timestamped timeline event.
- Cancelled focus sessions award nothing, and unsupported sound/vibration does not block visual completion.
- The Today timeline is readable, chronological, and distinguishes event types and point changes without relying on color alone.

## TASK-03: Daily Reflection

- [ ] Add one optional reflection per local day with optional mood 1–5, energy 1–5, one thing completed, what felt difficult, one small next step, and optional free text.
- [ ] Support save, reopen, edit, field validation, and an easy skip path.
- [ ] Keep reflection data local and separate from all AI inputs.
- [ ] Add reflection completion to the Today timeline without analyzing its content.

### Acceptance criteria

- Any subset of valid fields can be saved and edited for the same local day; mood and energy accept only 1–5 or empty.
- Reflection text never leaves the device or enters the AI organization request.
- The UI describes reflection as private and non-diagnostic and performs no sentiment analysis, scoring, or mental-health inference.
- Saving produces at most one reflection-completion timeline event per day.

## TASK-04: Cat room, store, return flow, and milestones

- [ ] Define persistent cat status, inventory, store catalog, total active days, and milestone records.
- [ ] Build the cat room and store with food, treats, one toy, furniture, prices, ownership, and balance checks.
- [ ] Implement feeding, treats, toy interaction, furniture selection/placement, and a small set of simple tricks.
- [ ] Implement gentle return messages after absent calendar days with no penalty or streak shame.
- [ ] Count unique active days and unlock persistent milestones once at 21, 50, and 100 total active days.

### Acceptance criteria

- Purchases cannot create a negative balance, inventory persists, and cat interactions behave consistently after reload.
- The required item types and simple tricks are available, keyboard accessible, and reduced-motion safe.
- Returning after missed days shows gentle copy and never removes points, inventory, milestones, or cat progress.
- Each local calendar day counts at most once; the 21-, 50-, and 100-day milestones unlock once and remain visible.

## TASK-05: Morning toothbrush image verification

- [ ] Add the fixed, non-editable morning check with camera capture and image-file selection.
- [ ] Add permission guidance, preview, explicit user confirmation, cancellation, retry, and a distinct manual fallback when image access is unavailable.
- [ ] Dispose of image data after confirmation or cancellation; do not persist or upload it.
- [ ] On the first successful daily check, feed the cat, award points, count activity, and create one Today timeline event atomically.

### Acceptance criteria

- The morning check cannot be deleted or converted into a normal task and resets by local calendar date.
- Camera/file success and the unavailable-access fallback have understandable, accessible paths.
- Captured images are not stored or sent to AI, and the UI makes no dental or diagnostic claim.
- Repeating or reloading the check cannot feed the cat, award points, count the active day, or add the success event more than once per day.

## TASK-06: Optional AI daily task organization

- [ ] Add an opt-in daily text brain dump and explicit organize action.
- [ ] Add a server-only OpenAI client using GPT-5.6 with validated structured output for task title, order, one fixed category, and optional focus duration.
- [ ] Build proposal review, edit/apply/cancel, loading, missing-key, offline, rejected, and malformed-response states.
- [ ] Limit requests to the submitted brain dump and ensure manual task organization provides the full fallback.

### Acceptance criteria

- No request occurs until the user explicitly submits the brain dump, and no proposal is applied without review.
- Only submitted brain-dump text is sent; reflections, images, habits, history, cat state, and unrelated local data are excluded.
- Responses outside the five categories or expected schema are rejected safely.
- Missing AI configuration or network failure never blocks manual task creation, categorization, ordering, editing, or timer selection.

## TASK-07: Accessibility, mobile polish, testing, and submission preparation

- [ ] Add the project-local unit/integration test setup and test script.
- [ ] Test primary, empty, error, permission, offline, absent-day, rollover, reload, and insufficient-points flows.
- [ ] Verify keyboard navigation, focus management, semantics, labels, contrast, reduced motion, touch targets, and non-color cues.
- [ ] Review and polish phone, tablet, and desktop layouts, including safe areas and long content.
- [ ] Run lint, type checks, tests, and production build; resolve every failure.
- [ ] Update README with setup, privacy, AI configuration, limitations, test commands, and demo flow; prepare submission assets.

### Acceptance criteria

- Core flows pass automated tests and manual checks at representative phone, tablet, and desktop widths.
- The app is usable with keyboard and screen-reader semantics, respects reduced motion, and communicates status without color alone.
- Toothbrush images and reflection content remain private; AI input boundaries and local-data limitations are documented.
- Lint, type checks, tests, and the production build pass, and submission documentation matches the implemented MVP.

## Explicitly excluded

- Authentication or accounts
- Server/database persistence or sync
- Payments or monetization
- Native iOS/Android code
- System alarms or guaranteed background alerts
- App/site blocking
- AI sentiment analysis or mental-health diagnosis
