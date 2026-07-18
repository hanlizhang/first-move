# First Move — Delivery Plan

> The Next.js, TypeScript, Tailwind CSS, ESLint, and responsive shell foundation exists. Implementation now centers the always-available “I'm Stuck” loop; feature behavior remains to be built.

## TASK-01: Local data foundation, manual tasks, habits, and local First Move templates

- [ ] Define a versioned local schema for daily records, five directions, stuck states, First Moves, tasks, habits, weekday schedules, sessions, and preferences.
- [ ] Implement validation, migrations, safe defaults, reset handling, local-day rollover, and idempotent writes.
- [ ] Build editable manual tasks and lightweight daily/selected-weekday habits.
- [ ] Bundle non-AI First Move templates mapped to stuck state, direction, and 2/5/10/25 minute duration; support manual entry and wording edits.
- [ ] Unit-test persistence recovery, rollover, weekday visibility, direction validation, and template selection.

### Acceptance criteria

- Core state survives reload and malformed stored data recovers without losing valid data.
- Tasks are fully editable; habits appear only on scheduled weekdays; both use exactly the five PRD directions.
- Every stuck state and direction has a useful local template path, available offline and without AI.
- A user can replace, edit, or manually enter a First Move before starting.

## TASK-02: I'm Stuck flow, intentional direction selection, and bounded sessions

- [ ] Add a prominent “I'm Stuck” entry available without Morning Start.
- [ ] Build optional stuck-state selection for all six PRD states, followed by one of five intentional directions.
- [ ] Present one local First Move at a time with choose-another, edit, manual, and shorter-session controls.
- [ ] Build the session flow around 2, 5, 10, and 25 minute bounds and the post-session choices: continue, rest, intentional entertainment, or finish.
- [ ] Add neutral cancellation, incomplete-session, and unsure-state paths.

### Acceptance criteria

- Any listed stuck state reaches a First Move and session without requiring AI, Morning Start, or explanatory text.
- “Unsure what is needed” remains actionable with low decision load.
- The user can change direction, choose a different/local/manual move, shorten the session, or exit at every appropriate step.
- Completion, early stop, and cancellation use non-punitive language and never remove progress.

## TASK-03: Timer, rewards, activity timeline, and intentional entertainment

- [ ] Implement timestamp-based start, pause, resume, cancel, finish, tab-throttling correction, and reload recovery.
- [ ] Centralize fixed reward values and build an idempotent local points ledger.
- [ ] Build the chronological Today timeline for stuck declarations, First Moves, sessions, tasks, habits, Morning Start, reflection, and cat activity.
- [ ] Implement Intentional Entertainment with an activity choice, 5/10 minute bounds, and neutral return choice.
- [ ] Add visual completion plus optional in-page sound/vibration controls.

### Acceptance criteria

- All bounded sessions remain accurate across pause, backgrounding, and reload; cancelled sessions do not receive completion rewards.
- Each eligible action changes points and creates its intended timeline event at most once.
- Intentional Entertainment permits only 5 or 10 minutes and is never labeled as failure.
- Every entertainment session ends with continue intentionally, another direction, rest, or finish.

## TASK-04: Cat room, store, return flow, and milestones

- [ ] Build persistent cat status, inventory, and a store with food, toys, furniture, prices, and balance checks.
- [ ] Implement feeding, play, furniture selection/placement, and simple tricks with reduced-motion-safe reactions.
- [ ] Connect gentle session progress and Morning Start rewards to cat feedback without punishment mechanics.
- [ ] Add non-judgmental return messages after absent days.
- [ ] Count unique active days and unlock persistent milestones once at 21, 50, and 100 days.

### Acceptance criteria

- Purchases cannot create a negative balance; inventory and room state survive reload.
- Food, toys, furniture, and tricks are keyboard accessible and do not depend on motion.
- Missed days and failed/cancelled sessions never harm the cat or remove points, items, milestones, or progress.
- Each day counts at most once, and every milestone unlocks once and remains visible.

## TASK-05: Daily Reflection

- [ ] Add one optional, editable local reflection per day with what helped, one thing completed, what felt difficult, one small next step, and optional mood, energy, and free text.
- [ ] Make reflection available after a session and from Today, with an easy skip path.
- [ ] Record reflection completion in the Today timeline without analyzing content.
- [ ] Keep reflection storage and data flow separate from AI requests.

### Acceptance criteria

- Any subset of fields can be saved and reopened; mood and energy accept only 1–5 or empty.
- Reflection is described as private and non-diagnostic and performs no scoring, sentiment analysis, or mental-health inference.
- Reflection text remains on-device and never enters organization or First Move AI requests.
- Repeated edits do not duplicate the daily timeline completion event.

## TASK-06: Optional AI organization and Make It Smaller

- [ ] Add explicit, opt-in GPT-5.6 organization for a user-submitted daily text brain dump.
- [ ] Add explicit “Make It Smaller” and optional First Move adaptation for user-selected text.
- [ ] Validate structured output against the five directions, concrete action rules, and 2/5/10/25 minute bounds.
- [ ] Build review/edit/apply/cancel, loading, missing-key, offline, rejection, and malformed-response states.
- [ ] Restrict each request to the text and context the user explicitly submits.

### Acceptance criteria

- No AI request occurs or applies changes without an explicit action and review.
- AI task proposals and adapted moves are concise, valid, bounded, and safely rejected when malformed.
- Reflections, images, habits, history, cat state, and unrelated local data are never sent.
- Missing or failed AI never blocks local templates, manual First Moves, manual tasks, or sessions.

## TASK-07: Toothbrush image verification

- [ ] Build the fixed Morning Start check with camera capture, image-file selection, permission guidance, preview, confirmation, retry, cancellation, and distinct manual fallback.
- [ ] Dispose of image data after confirmation or cancellation; never persist, upload, or send it to AI.
- [ ] Atomically feed the cat, award points, count activity, and add one timeline event on the first successful daily check.
- [ ] Continue from successful Morning Start into intentional direction and First Move selection.

### Acceptance criteria

- The check cannot be deleted or converted into a task and resets by local calendar date.
- Camera/file and unavailable-access fallback paths are clear and accessible, with no dental or diagnostic claim.
- Repeating or reloading cannot duplicate feeding, rewards, active-day counting, or the timeline event.
- Morning Start leads into the same First Move flow while “I'm Stuck” remains independently available.

## TASK-08: Mobile polish, testing, deployment, and submission

- [ ] Add project-local unit/integration test tooling and cover persistence, core loop, timing, rewards, privacy boundaries, rollover, and error states.
- [ ] Verify keyboard navigation, focus management, semantics, labels, contrast, reduced motion, touch targets, and non-color cues.
- [ ] Polish phone, tablet, and desktop layouts for one-decision-at-a-time stuck use, safe areas, long content, and interrupted sessions.
- [ ] Run lint, type checks, tests, and production build; fix every failure.
- [ ] Document setup, privacy, AI configuration, behavioral inspiration, medical limitations, testing, and demo flow.
- [ ] Prepare deployment and submission assets without committing or pushing automatically.

### Acceptance criteria

- Core Morning Start and “I'm Stuck” paths pass automated and manual checks at representative viewport sizes.
- The app is usable by keyboard and assistive technology, respects reduced motion, and never relies on color alone.
- Tests confirm no punishment for missed/failed sessions, no persisted toothbrush images, and no reflection leakage to AI.
- Lint, type checks, tests, and production build pass; deployed behavior and submission documentation match the PRD.

## Explicitly excluded

- Authentication, accounts, server/database persistence, or sync
- Payments or monetization
- Native iOS/Android code
- System alarms or guaranteed background alerts
- App/site blocking
- Medical treatment, diagnosis, crisis intervention, or brain-stimulation/repair claims
- AI sentiment analysis or mental-health diagnosis
