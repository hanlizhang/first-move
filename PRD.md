# First Move — MVP Product Requirements

## Summary

First Move is a cheerful, mobile-first morning routine web app. A user verifies brushing their teeth, chooses what matters today, completes habits and focus sessions, earns local reward points, and cares for a virtual cat.

## Goals

- Make the first useful action of the day obvious and quick.
- Turn a lightweight daily plan into visible progress and playful rewards.
- Work fully without an account or AI.
- Feel good on phones while remaining complete on tablet and desktop.

## Non-goals

No authentication, server database, payments, native app, system alarms, app/site blocking, social features, or cross-device sync. The MVP is not a medical or dental diagnostic tool.

## Primary flow

1. Open the daily dashboard.
2. Take or select a toothbrush photo and confirm the morning check. The app presents the image for user confirmation and does not retain it by default.
3. Review and edit today's tasks and habits.
4. Optionally ask GPT-5.6 to organize the task list; review the proposal before applying it. Manual reorder, edit, and categorization remain available.
5. Run focus timers, complete items, earn points, and spend them on cat items.

## MVP requirements

### Daily dashboard

- Show the date, morning-check state, points balance, cat status, today's tasks and habits, and a prominent focus action.
- Reset daily completion state by the user's local calendar date while preserving history needed for streaks and totals.

### Toothbrush image check

- Support camera capture where available and file selection everywhere else.
- Show a preview and require explicit user confirmation to complete the check.
- Provide a manual “I brushed” fallback if camera/file access fails or is declined.
- Keep processing in the browser and discard the image after confirmation or cancellation. Do not claim automated dental validation.

### Tasks and habits

- Create, edit, delete, reorder, and complete daily tasks.
- Create, edit, delete, and complete recurring daily habits.
- Seed helpful examples on first use, editable like all other items.
- Award points once per item per local day and prevent duplicate rewards.

### Focus timers

- Offer 2, 10, and 25 minute presets plus a custom duration from 1–120 minutes.
- Support start, pause, resume, cancel, and completion states.
- Calculate remaining time from timestamps so background-tab throttling does not corrupt the timer.
- Use in-page sound/vibration only with permission and availability; provide a visual completion state. No system alarm or background guarantee.

### Rewards and virtual cat

- Store points locally. Award simple, documented amounts for the morning check, completed tasks/habits, and completed focus sessions.
- Provide a small shop with food, toys, and furniture; show price and owned quantity/state.
- Let users feed or play with the cat and place/select owned furniture.
- Keep cat needs forgiving: no irreversible loss, punishment, or paywall.

### Optional AI organization

- Offer an opt-in action that sends only the task text the user chooses to a server-side OpenAI API route using GPT-5.6.
- Return a structured proposal such as reordered tasks, concise labels, and suggested focus durations; never apply changes without review.
- Clearly indicate loading, error, and unavailable states. Manual editing, ordering, and timer selection cover the full workflow.
- Keep API keys server-side and document environment configuration. The rest of the app remains usable without a key or network.

## Data and privacy

- Store app state locally in the browser with a versioned schema and safe migration/reset path.
- Store task text, habits, points, inventory, cat state, preferences, and compact daily completion history.
- Do not persist captured images by default or send them to AI in the MVP.
- Explain that clearing browser data removes progress; provide JSON export/import if time permits after core scope.

## UX and accessibility

- Mobile-first layout with bottom or compact navigation; expand to a two-column dashboard on larger screens.
- Use large touch targets, clear empty/error states, semantic controls, keyboard support, visible focus, reduced-motion support, and non-color status cues.
- Suggested sections: Today, Focus, and Cat. Keep task editing inline or in a lightweight sheet/dialog.

## Success criteria

- A new user can complete the morning check, edit a task, run a 2-minute timer, earn points, and interact with the cat without setup or AI.
- State survives reloads and rolls over correctly on a new local day.
- Camera denial, unavailable AI, timer tab throttling, and insufficient points all have understandable recovery paths.
- The responsive UI passes core accessibility checks and works at common phone, tablet, and desktop widths.

## MVP decisions

- Single anonymous local profile; no sync.
- User-confirmed toothbrush photo rather than image classification.
- Points are a playful local currency with fixed values in a central configuration.
- Cat inventory is a small static catalog bundled with the app.
- AI organizes only selected task text and is never required.

