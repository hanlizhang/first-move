import assert from "node:assert/strict";
import test from "node:test";

import { createEmptyState, type ActivitySession, type AppState } from "./models.ts";
import { formatFocusedDuration, getTodayView } from "./today.ts";

const TODAY = "2026-09-04";

function closedSession(
  id: string,
  overrides: Partial<ActivitySession> = {},
): ActivitySession {
  return {
    id,
    mode: "stopwatch",
    direction: "Work & Study",
    label: `Session ${id}`,
    status: "completed",
    startedAt: "2026-09-03T22:30:00.000Z",
    localDate: TODAY,
    timezone: "Pacific/Auckland",
    accumulatedElapsedMs: 60_000,
    endedAt: "2026-09-03T22:31:00.000Z",
    actualElapsedMs: 60_000,
    ...overrides,
  };
}

function todayState(): AppState {
  return {
    ...createEmptyState(),
    tasks: [
      {
        id: "task-later",
        title: "Second Task",
        direction: "Daily Life",
        order: 1,
        createdAt: "2026-09-01T08:00:00.000Z",
        updatedAt: "2026-09-01T08:00:00.000Z",
        completedOn: [TODAY],
      },
      {
        id: "task-first",
        title: "First Task",
        direction: "Work & Study",
        order: 0,
        createdAt: "2026-09-01T08:00:00.000Z",
        updatedAt: "2026-09-01T08:00:00.000Z",
        completedOn: [],
      },
    ],
    habits: [
      {
        id: "habit-friday",
        title: "Friday Habit",
        direction: "Exercise & Movement",
        schedule: { kind: "weekdays", weekdays: ["fri"] },
        createdAt: "2026-09-01T08:00:00.000Z",
        updatedAt: "2026-09-01T08:00:00.000Z",
        completedOn: [TODAY],
      },
      {
        id: "habit-monday",
        title: "Monday Habit",
        direction: "Rest",
        schedule: { kind: "weekdays", weekdays: ["mon"] },
        createdAt: "2026-09-01T08:00:00.000Z",
        updatedAt: "2026-09-01T08:00:00.000Z",
        completedOn: [],
      },
    ],
    activityIntents: [
      {
        id: "intent-one",
        stuckState: "knows what to do but cannot start",
        direction: "Work & Study",
        moveText: "Open the draft.",
        intendedDurationMinutes: 2,
        createdAt: "2026-09-03T22:00:00.000Z",
        status: "consumed",
      },
    ],
    sessions: [
      closedSession("session-task", {
        label: "Draft review",
        linkedTaskId: "task-first",
        actualElapsedMs: 74_000,
        accumulatedElapsedMs: 74_000,
        endedAt: "2026-09-03T22:35:00.000Z",
      }),
      closedSession("session-intent", {
        label: "Tiny start",
        linkedIntentId: "intent-one",
        status: "stopped",
        actualElapsedMs: 30_000,
        accumulatedElapsedMs: 30_000,
        endedAt: "2026-09-03T22:40:00.000Z",
      }),
      closedSession("session-other-day", {
        localDate: "2026-09-03",
        timezone: "America/Los_Angeles",
        endedAt: "2026-09-04T12:00:00.000Z",
      }),
      closedSession("session-without-date", {
        localDate: undefined,
        timezone: undefined,
        endedAt: "2026-09-04T20:00:00.000Z",
      }),
    ],
    rewardEvents: [
      {
        id: "reward-legacy-session",
        source: "session",
        sourceId: "session-without-date",
        dateKey: TODAY,
        points: 0.1,
        createdAt: "2026-09-04T20:00:00.000Z",
      },
    ],
    journalEntries: [
      {
        dateKey: TODAY,
        completed: "Reviewed the draft",
        nextStep: "Open one comment",
        updatedAt: "2026-09-04T20:00:00.000Z",
      },
    ],
  };
}

test("Today selects ordered active parents, scheduled Habits, and an existing reflection", () => {
  const view = getTodayView(todayState(), TODAY);

  assert.deepEqual(view.tasks.map((task) => task.id), ["task-first", "task-later"]);
  assert.deepEqual(view.habits.map((habit) => habit.id), ["habit-friday"]);
  assert.equal(view.reflection?.completed, "Reviewed the draft");
});

test("Today uses captured Session dates instead of the viewer's current timezone", () => {
  const view = getTodayView(todayState(), TODAY);

  assert.deepEqual(
    view.focusItems.map((item) => item.id),
    ["session-without-date", "session-intent", "session-task"],
  );
  assert.equal(view.totalFocusedMs, 164_000);
  assert.equal(view.focusItems[1]?.linkedKind, "First Move");
  assert.equal(view.focusItems[1]?.linkedLabel, "Open the draft.");
  assert.equal(view.focusItems[2]?.linkedKind, "Task");
  assert.equal(view.focusItems[2]?.linkedLabel, "First Task");
  assert.equal(view.focusItems.some((item) => item.id === "session-other-day"), false);
});

test("Today does not guess a historical date when no captured date fact exists", () => {
  const state = todayState();
  state.rewardEvents = [];
  const view = getTodayView(state, TODAY);

  assert.equal(view.focusItems.some((item) => item.id === "session-without-date"), false);
});

test("focused duration formatting stays compact while retaining actual seconds", () => {
  assert.equal(formatFocusedDuration(0), "0s");
  assert.equal(formatFocusedDuration(74_321), "1m 14s");
  assert.equal(formatFocusedDuration(3_720_000), "1h 2m");
});
