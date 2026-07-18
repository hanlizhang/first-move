# First Move — Delivery Plan

> Application initialization completed on 2026-07-18. This checklist tracks the remaining MVP work.

## 0. Prerequisites and setup

- [x] Install Node.js 26.5.0 with npm 11.17.0 and verify versions.
- [x] Initialize Next.js with App Router, TypeScript, Tailwind CSS, ESLint, npm, and a `src/` directory.
- [x] Add scripts for lint, type-check, and production build.
- [ ] Add the unit test setup and test script before domain implementation.
- [x] Establish initial design tokens and a responsive, accessible application shell with Morning, Today, Focus, and Cat navigation.

## 1. Local domain and persistence

- [ ] Define strict types for daily records, tasks, habits, timer sessions, rewards, inventory, cat state, and preferences.
- [ ] Implement a versioned local-storage repository with validation, migrations, first-use seed data, and reset handling.
- [ ] Implement local-date rollover and duplicate-reward protection.
- [ ] Centralize reward values and the static food/toy/furniture catalog.
- [ ] Unit-test rollover, persistence recovery, points, purchases, and reward idempotency.

## 2. Today experience

- [ ] Build the responsive dashboard and daily progress summary.
- [ ] Add toothbrush camera/file capture, preview, confirm/cancel, permission errors, image disposal, and manual fallback.
- [ ] Add task create/edit/delete/reorder/complete interactions.
- [ ] Add daily habit create/edit/delete/complete interactions.
- [ ] Connect completions to local points with accessible feedback.

## 3. Focus experience

- [ ] Build 2, 10, and 25 minute presets and a validated 1–120 minute custom input.
- [ ] Implement timestamp-based start, pause, resume, cancel, and finish logic.
- [ ] Add visual completion plus optional in-page sound/vibration controls.
- [ ] Award completion points once and test clock drift, reload, and background-tab recovery.

## 4. Cat and rewards

- [ ] Build the cat room/status view and a small bundled item catalog.
- [ ] Implement purchases with balance checks and persistent inventory.
- [ ] Implement feeding, playing, and furniture selection/placement.
- [ ] Add lightweight, reduced-motion-safe reactions and forgiving need-state rules.

## 5. Optional GPT-5.6 organization

- [ ] Add a server-only OpenAI client and documented optional environment variable.
- [ ] Define and validate structured organization input/output; send only user-selected task text.
- [ ] Build opt-in selection, proposal review, apply/cancel, loading, unavailable, and error states.
- [ ] Ensure manual reorder/edit/label/focus-duration controls provide equivalent completion paths.
- [ ] Test missing-key, offline, malformed-response, and rejected-proposal cases.

## 6. Quality and release readiness

- [ ] Test primary flows at phone, tablet, and desktop widths.
- [ ] Verify keyboard navigation, focus management, contrast, labels, reduced motion, and non-color cues.
- [ ] Verify data survives reload, daily rollover works, and images are not retained.
- [ ] Run lint, type checks, unit/integration tests, and a production build.
- [ ] Add a concise README with setup, privacy behavior, AI configuration, limitations, and demo flow.
- [ ] Consider JSON export/import only after all core acceptance criteria pass.

## Completed foundation verification

- [x] Run the initial npm install, lint, type-check, and production build after shell implementation.
- [ ] Review the shell at representative phone, tablet, and desktop widths during feature implementation.

## Explicitly excluded

- Authentication or accounts
- Server/database persistence or sync
- Payments or monetization
- Native iOS/Android code
- System alarms or guaranteed background alerts
- App/site blocking
