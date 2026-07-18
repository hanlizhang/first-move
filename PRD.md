# First Move — MVP Product Requirements

## Summary

First Move is a cheerful, mobile-first web app for making a gentle start. A user completes a fixed morning toothbrush image check, shapes the day with tasks and habits, uses short focus timers, reflects privately, earns local rewards, and cares for a virtual cat.

## Goals

- Make the first useful action of the day obvious and quick.
- Turn a lightweight daily plan into visible progress and playful rewards.
- Work fully without an account or AI.
- Feel complete on phones, tablets, and desktops.

## Non-goals

No authentication, server database, payments, native app, system alarms, app/site blocking, social features, or cross-device sync. Toothbrush checking is not dental diagnosis. Daily Reflection is a private journal, not a medical or diagnostic tool; the MVP does not use AI sentiment analysis or provide mental-health diagnosis.

## Primary flow

1. Open the app and see a gentle return message if one or more calendar days were missed.
2. Complete the fixed morning toothbrush image check. A successful once-daily check awards points and feeds the cat.
3. Review editable manual tasks and habits scheduled for today, organized into five categories.
4. Optionally enter a daily text brain dump and ask AI to propose organized tasks; review before applying, or organize everything manually.
5. Use a 2, 10, 25, or custom minute focus timer and see completed, rewarded activity in the Today timeline.
6. Optionally complete Daily Reflection, then spend points on the cat and view active-day milestones.

## MVP requirements

### Morning toothbrush image check

- Keep the morning check fixed and non-editable so it cannot be deleted or replaced by a normal task.
- Support camera capture where available and image-file selection elsewhere, with preview and explicit confirmation that the image shows the user's toothbrush.
- A successful check can occur once per local calendar day; it awards points, feeds the cat, and creates one Today timeline event without duplicate rewards.
- Keep processing in the browser and discard the image after confirmation or cancellation. Do not persist it, send it to AI, or claim dental validation.
- Explain camera/file permissions and provide a clear retry or manual completion fallback when image access is unavailable. Label fallback completion distinctly in the timeline.

### Tasks, habits, and categories

- Create, edit, delete, reorder, categorize, and complete manual daily tasks.
- Create, edit, delete, and complete habits scheduled either every day or on selected weekdays.
- Use exactly five categories across tasks and habits:
  - Work & Study
  - Daily Life
  - Exercise
  - Intentional Entertainment
  - Rest
- Show only habits scheduled for the current local weekday while retaining their recurrence settings.
- Award configured points once per task or habit completion per local day and prevent duplicate rewards.

### Optional AI daily organization

- Provide an opt-in text brain dump for the current day and send it only when the user explicitly requests organization.
- Use GPT-5.6 to propose structured tasks with titles, one of the five categories, order, and optional focus-duration suggestions.
- Show a review screen and never apply proposed tasks automatically.
- Manual task creation, editing, categorization, reordering, and timer selection remain a complete fallback when AI is unavailable, rejected, or not configured.
- Keep API credentials server-side and never include reflections, images, habits, timeline history, cat state, or unrelated local data in the AI request.

### Focus timer

- Offer 2, 10, and 25 minute presets plus a validated custom duration from 1–120 minutes.
- Support start, pause, resume, cancel, and completion states.
- Calculate remaining time from timestamps so background-tab throttling or reload recovery does not corrupt the timer.
- Use visual completion and optional in-page sound/vibration where supported; do not promise a system alarm or background notification.

### Rewards and Today timeline

- Store points locally and centralize fixed reward values for the morning check, tasks, habits, focus sessions, and any other rewarded action.
- Show a chronological Today timeline for meaningful daily activity, including the morning result, completed tasks/habits, completed focus sessions, reflection completion, cat interactions, and purchases where useful.
- Each event records a local timestamp, readable label, event type, and points change when applicable.
- Derive rewards and timeline entries from idempotent actions so reloads or repeated clicks cannot duplicate them.

### Daily Reflection

- Provide a private, optional daily reflection with:
  - optional mood from 1 to 5
  - optional energy from 1 to 5
  - one thing completed
  - what felt difficult
  - one small next step
  - optional free text
- Allow saving, reopening, and editing one reflection per local day.
- Treat every field as optional and make skipping easy; never score, diagnose, infer sentiment, or provide mental-health conclusions.
- Keep reflection content on-device and exclude it from AI organization.

### Virtual cat, store, return flow, and milestones

- Provide a forgiving cat room with food, treats, one toy, furniture, and a small set of simple tricks.
- Let users buy available items with local points, view price and ownership, feed or treat the cat, use the toy, select/place furniture, and trigger learned tricks.
- The successful daily morning check feeds the cat without charging points.
- Avoid punishment, irreversible loss, or streak shame. After absent days, welcome the user back with gentle, non-judgmental copy and no penalty.
- Count total active days, not consecutive streaks. An active day is a local calendar day with at least one meaningful recorded action.
- Unlock celebratory milestones at 21, 50, and 100 total active days; each milestone is awarded once and remains visible.

## Daily dashboard and navigation

- Keep the current responsive Morning, Today, Focus, and Cat shell.
- Morning contains the fixed image check and return message.
- Today contains tasks, scheduled habits, category filters, points, activity timeline, and Daily Reflection.
- Focus contains presets, custom duration, and active-session controls.
- Cat contains status, room, store, inventory, tricks, and milestones.
- Reset daily state by local calendar date while preserving reflection history, total active days, milestones, inventory, points, and compact timeline history.

## Data and privacy

- Store app state locally with a versioned schema, validation, migrations, recovery defaults, and an explicit reset path.
- Persist tasks, habits and schedules, daily records, points ledger, timeline, reflections, timer state, inventory, cat state, preferences, and active-day milestones.
- Do not retain toothbrush images by default or send them to AI.
- Explain that clearing browser data removes progress; consider JSON export/import only after core acceptance criteria pass.

## UX and accessibility

- Use large touch targets, semantic controls, keyboard support, visible focus, reduced-motion support, sufficient contrast, and non-color status cues.
- Provide clear empty, permission, offline, insufficient-points, validation, and recovery states.
- Keep language gentle and specific, especially for missed days, incomplete plans, and optional reflection fields.

## Success criteria

- A new user can complete the morning check, feed the cat, earn points, edit a task, complete a scheduled habit, and run a 2-minute timer without AI.
- The Today timeline accurately records rewarded actions without duplicates across reloads or local-day rollover.
- A user can save a fully or partially completed reflection privately without analysis or diagnosis.
- AI unavailability, image-access denial, timer throttling, absent days, and insufficient points all have understandable manual or recovery paths.
- Total active-day milestones unlock exactly once at 21, 50, and 100 days.
- The responsive experience passes core accessibility checks at common phone, tablet, and desktop widths.

## MVP decisions

- Single anonymous local profile with no sync.
- The toothbrush check is fixed and user-confirmed, not image classification or dental analysis.
- Five fixed categories are shared by tasks, habits, and AI proposals.
- Points are a playful local currency with values defined centrally.
- AI organizes only an explicitly submitted daily brain dump and is never required.
- Reflection is optional, private, local-only, and excluded from AI.
- Milestones use total active days rather than consecutive streaks.
