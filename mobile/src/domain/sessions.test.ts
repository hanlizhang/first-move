import assert from "node:assert/strict";
import test from "node:test";

import { createPendingIntent, getPendingIntent } from "./app-state.ts";
import {
  FOCUS_COUNTDOWN_PRESETS,
  createEmptyState,
  type IntendedDuration,
} from "./models.ts";
import { isUuidV4 } from "./ids.ts";
import {
  cancelSession,
  completeSessionIfElapsed,
  elapsedMs,
  getOpenSession,
  pauseSession,
  reconcileRunningCountdown,
  remainingMs,
  resumeSession,
  reviewSession,
  startCountdown,
  startCountdownFromIntent,
  startStopwatch,
  stopSession,
} from "./sessions.ts";

const startMs = Date.parse("2026-08-09T09:00:00.000Z");

function pendingState(duration: IntendedDuration = 5) {
  return createPendingIntent(
    createEmptyState(),
    {
      stuckState: "knows what to do but cannot start",
      direction: "Work & Study",
      moveText: "Open the exact document.",
      intendedDurationMinutes: duration,
    },
    () => new Date(startMs).toISOString(),
    () => "intent-local",
  );
}

function runningState(duration: IntendedDuration = 5) {
  return startCountdownFromIntent(
    pendingState(duration),
    "intent-local",
    startMs,
    () => "session-local",
  );
}

test("a pending intent starts one bounded schema-v8 countdown", () => {
  const durations: IntendedDuration[] = [2, 5, 10, 25];
  for (const duration of durations) {
    const started = runningState(duration);
    assert.deepEqual(getOpenSession(started), {
      id: "session-local",
      mode: "countdown",
      direction: "Work & Study",
      label: "Open the exact document.",
      targetDurationMinutes: duration,
      linkedIntentId: "intent-local",
      status: "running",
      startedAt: "2026-08-09T09:00:00.000Z",
      lastResumedAt: "2026-08-09T09:00:00.000Z",
      accumulatedElapsedMs: 0,
    });
    assert.equal(
      startCountdownFromIntent(started, "intent-local", startMs + 1).sessions.length,
      1,
    );
  }
});

test("default Mobile Session IDs are canonical UUID v4 values", () => {
  const started = startStopwatch(
    createEmptyState(),
    { direction: "Rest", label: "Pause" },
    startMs,
  );
  assert.ok(started.sessions[0] && isUuidV4(started.sessions[0].id));
});

test("timestamp timing survives reload and pause/resume excludes paused time", () => {
  const started = runningState();
  const reloaded = JSON.parse(JSON.stringify(started)) as typeof started;
  const paused = pauseSession(reloaded, "session-local", startMs + 90_000);
  const pausedSession = getOpenSession(paused);
  assert.ok(pausedSession);
  assert.equal(pausedSession.status, "paused");
  assert.equal(elapsedMs(pausedSession, startMs + 190_000), 90_000);
  assert.equal(remainingMs(pausedSession, startMs + 190_000), 210_000);

  const resumed = resumeSession(paused, "session-local", startMs + 190_000);
  const resumedSession = getOpenSession(resumed);
  assert.ok(resumedSession);
  assert.equal(elapsedMs(resumedSession, startMs + 220_000), 120_000);
  assert.equal(remainingMs(resumedSession, startMs + 220_000), 180_000);
});

test("an expired restored countdown completes once with bounded actual elapsed time", () => {
  const started = runningState(2);
  const completed = reconcileRunningCountdown(started, startMs + 180_000);
  assert.equal(getOpenSession(completed), undefined);
  assert.equal(completed.sessions[0]?.status, "completed");
  assert.equal(completed.sessions[0]?.actualElapsedMs, 120_000);
  assert.equal(getPendingIntent(completed), undefined);
  assert.deepEqual(completed.activityIntents[0], {
    ...pendingState(2).activityIntents[0],
    status: "consumed",
  });

  const repeated = completeSessionIfElapsed(
    completed,
    "session-local",
    startMs + 300_000,
  );
  assert.equal(repeated, completed);
  assert.equal(repeated.sessions.length, 1);
});

test("stopping early saves actual elapsed time with neutral stopped state", () => {
  const stopped = stopSession(runningState(5), "session-local", startMs + 74_321);
  assert.equal(stopped.sessions[0]?.status, "stopped");
  assert.equal(stopped.sessions[0]?.actualElapsedMs, 74_321);
  assert.equal(stopped.rewardEvents.length, 0);
  assert.equal(stopped.progress.points, 0);
  assert.equal(stopped.activityIntents[0]?.status, "consumed");
});

test("an assisted Session keeps the full consumed Intent and its Task relationship", () => {
  const taskId = "task-existing";
  const withTask = createEmptyState();
  withTask.tasks = [
    {
      id: taskId,
      title: "Review notes",
      direction: "Work & Study",
      order: 0,
      createdAt: new Date(startMs).toISOString(),
      updatedAt: new Date(startMs).toISOString(),
      completedOn: [],
    },
  ];
  const withIntent = createPendingIntent(
    withTask,
    {
      stuckState: "knows what to do but cannot start",
      moveText: "Open the notes.",
      intendedDurationMinutes: 5,
      linkedTaskId: taskId,
    },
    () => new Date(startMs).toISOString(),
    () => "task-intent",
  );
  const stopped = stopSession(
    startCountdownFromIntent(
      withIntent,
      "task-intent",
      startMs,
      () => "task-intent-session",
    ),
    "task-intent-session",
    startMs + 30_000,
  );

  assert.equal(getPendingIntent(stopped), undefined);
  assert.equal(stopped.sessions[0]?.linkedIntentId, "task-intent");
  assert.equal(stopped.sessions[0]?.linkedTaskId, undefined);
  assert.equal(stopped.activityIntents[0]?.status, "consumed");
  assert.equal(stopped.activityIntents[0]?.linkedTaskId, taskId);
  assert.equal(stopped.activityIntents[0]?.moveText, "Open the notes.");
});

test("closing an assisted Session does not clear a replacement pending Intent", () => {
  const started = runningState(5);
  const original = started.activityIntents[0]!;
  const withReplacement = createPendingIntent(
    {
      ...started,
      activityIntents: [{ ...original, status: "consumed" }],
    },
    {
      stuckState: "needs intentional rest",
      direction: "Rest",
      moveText: "Sit somewhere comfortable.",
      intendedDurationMinutes: 2,
    },
    () => new Date(startMs + 1_000).toISOString(),
    () => "replacement-intent",
  );

  const stopped = stopSession(
    withReplacement,
    "session-local",
    startMs + 30_000,
  );
  assert.equal(getPendingIntent(stopped)?.id, "replacement-intent");
  assert.equal(stopped.activityIntents[0]?.status, "consumed");
});

test("cancelling a running session keeps its pending intent and no session record", () => {
  const cancelled = cancelSession(
    runningState(10),
    "session-local",
    startMs + 30_000,
  );
  assert.equal(cancelled.sessions.length, 0);
  assert.equal(cancelled.activityIntents[0]?.id, "intent-local");
  assert.equal(cancelled.rewardEvents.length, 0);
});

test("pause and stop reconcile an elapsed countdown, while cancellation creates no result", () => {
  for (const action of [pauseSession, stopSession]) {
    const result = action(runningState(2), "session-local", startMs + 120_000);
    assert.equal(result.sessions[0]?.status, "completed");
    assert.equal(result.sessions[0]?.actualElapsedMs, 120_000);
  }

  const cancelled = cancelSession(
    runningState(2),
    "session-local",
    startMs + 120_000,
  );
  assert.equal(cancelled.sessions.length, 0);
  assert.equal(getPendingIntent(cancelled)?.id, "intent-local");
});

test("standalone countdown supports every preset and validated custom minutes without an intent", () => {
  for (const durationMinutes of [...FOCUS_COUNTDOWN_PRESETS, 1, 720]) {
    const withPending = pendingState();
    const started = startCountdown(
      withPending,
      { direction: "Rest", label: "  Quiet   focus  ", durationMinutes },
      startMs,
      () => `countdown-${durationMinutes}`,
    );
    assert.equal(started.sessions.at(-1)?.mode, "countdown");
    assert.equal(started.sessions.at(-1)?.targetDurationMinutes, durationMinutes);
    assert.equal(started.sessions.at(-1)?.label, "Quiet focus");
    assert.equal(started.sessions.at(-1)?.linkedIntentId, undefined);
    assert.equal(getPendingIntent(started)?.id, "intent-local");
  }

  for (const durationMinutes of [0, 1.5, 721, Number.NaN]) {
    const state = createEmptyState();
    assert.equal(
      startCountdown(state, { direction: "Rest", durationMinutes }),
      state,
    );
  }
});

test("standalone countdown links a validated existing canonical Task UUID without copying it", () => {
  const taskId = "10000000-0000-4000-8000-000000000001";
  const state = createEmptyState();
  const started = startCountdown(
    state,
    { linkedTaskId: taskId, durationMinutes: 25 },
    startMs,
    () => "canonical-task-countdown",
    {
      tasks: [
        { id: taskId, title: "Cloud task", direction: "Daily Life" },
      ],
    },
  );

  assert.equal(started.tasks.length, 0);
  assert.equal(started.activityIntents.length, 0);
  assert.equal(started.sessions[0]?.linkedTaskId, taskId);
  assert.equal(started.sessions[0]?.label, "Cloud task");
  assert.equal(started.sessions[0]?.direction, "Daily Life");
});

test("standalone starts reject unknown or multiple relationships", () => {
  const state = createEmptyState();
  assert.equal(
    startCountdown(state, { linkedTaskId: "missing", durationMinutes: 5 }),
    state,
  );
  assert.equal(
    startStopwatch(state, {
      direction: "Rest",
      linkedTaskId: "one",
      linkedHabitId: "two",
    }),
    state,
  );
});

test("stopwatch shares timestamp recovery, pause, resume, stop, and default persistence", () => {
  const started = startStopwatch(
    createEmptyState(),
    { direction: "Rest", label: "   " },
    startMs,
    () => "stopwatch-local",
  );
  assert.equal(started.activityIntents.length, 0);
  assert.equal(started.sessions[0]?.mode, "stopwatch");
  assert.equal(started.sessions[0]?.targetDurationMinutes, undefined);
  assert.equal(started.sessions[0]?.label, "Tracked time");

  const restored = JSON.parse(JSON.stringify(started)) as typeof started;
  const paused = pauseSession(restored, "stopwatch-local", startMs + 30_000);
  const resumed = resumeSession(paused, "stopwatch-local", startMs + 90_000);
  assert.equal(elapsedMs(resumed.sessions[0]!, startMs + 105_000), 45_000);
  const stopped = stopSession(resumed, "stopwatch-local", startMs + 105_000);
  assert.equal(stopped.sessions[0]?.status, "stopped");
  assert.equal(stopped.sessions[0]?.actualElapsedMs, 45_000);
  assert.equal(stopped.rewardEvents.length, 0);
});

test("stopwatch can inherit a canonical Habit while keeping title and direction editable", () => {
  const habitId = "20000000-0000-4000-8000-000000000001";
  const started = startStopwatch(
    createEmptyState(),
    {
      linkedHabitId: habitId,
      label: "Evening mobility",
      direction: "Rest",
    },
    startMs,
    () => "canonical-habit-stopwatch",
    {
      habits: [
        {
          id: habitId,
          title: "Stretch gently",
          direction: "Exercise & Movement",
        },
      ],
    },
  );
  assert.equal(started.sessions[0]?.linkedHabitId, habitId);
  assert.equal(started.sessions[0]?.label, "Evening mobility");
  assert.equal(started.sessions[0]?.direction, "Rest");
});

test("review edits an already-saved standalone Session without changing its result", () => {
  const taskId = "10000000-0000-4000-8000-000000000001";
  const stopped = stopSession(
    startStopwatch(
      createEmptyState(),
      { direction: "Rest" },
      startMs,
      () => "review-session",
    ),
    "review-session",
    startMs + 61_000,
  );
  const reviewed = reviewSession(
    stopped,
    "review-session",
    {
      label: "  Reviewed   focus ",
      direction: "Work & Study",
      linkedTaskId: taskId,
    },
    startMs + 70_000,
    {
      tasks: [
        { id: taskId, title: "Existing task", direction: "Work & Study" },
      ],
    },
  );

  assert.equal(reviewed.sessions[0]?.status, "stopped");
  assert.equal(reviewed.sessions[0]?.actualElapsedMs, 61_000);
  assert.equal(reviewed.sessions[0]?.label, "Reviewed focus");
  assert.equal(reviewed.sessions[0]?.linkedTaskId, taskId);
  assert.equal(
    reviewed.sessions[0]?.reviewedAt,
    new Date(startMs + 70_000).toISOString(),
  );

  const habitId = "20000000-0000-4000-8000-000000000001";
  const relinked = reviewSession(
    reviewed,
    "review-session",
    {
      label: "Reviewed focus",
      direction: "Exercise & Movement",
      linkedHabitId: habitId,
    },
    startMs + 80_000,
    {
      habits: [
        {
          id: habitId,
          title: "Existing habit",
          direction: "Exercise & Movement",
        },
      ],
    },
  );
  assert.equal(relinked.sessions[0]?.linkedTaskId, undefined);
  assert.equal(relinked.sessions[0]?.linkedHabitId, habitId);

  const unlinked = reviewSession(
    relinked,
    "review-session",
    { label: "Standalone again", direction: "Rest" },
    startMs + 90_000,
  );
  assert.equal(unlinked.sessions[0]?.linkedTaskId, undefined);
  assert.equal(unlinked.sessions[0]?.linkedHabitId, undefined);
  assert.equal(unlinked.sessions[0]?.actualElapsedMs, 61_000);
});

test("review preserves an unavailable historical parent and an assisted Intent relationship", () => {
  const unavailableTaskId = "30000000-0000-4000-8000-000000000001";
  const historical = createEmptyState();
  historical.sessions = [
    {
      id: "historical-task-session",
      mode: "stopwatch",
      direction: "Daily Life",
      label: "Old task",
      linkedTaskId: unavailableTaskId,
      status: "stopped",
      startedAt: new Date(startMs).toISOString(),
      accumulatedElapsedMs: 10_000,
      endedAt: new Date(startMs + 10_000).toISOString(),
      actualElapsedMs: 10_000,
    },
  ];
  const retained = reviewSession(
    historical,
    "historical-task-session",
    {
      label: "Still historical",
      direction: "Daily Life",
      linkedTaskId: unavailableTaskId,
    },
    startMs + 20_000,
  );
  assert.equal(retained.sessions[0]?.linkedTaskId, unavailableTaskId);

  const completed = reconcileRunningCountdown(runningState(2), startMs + 120_000);
  const reviewed = reviewSession(
    completed,
    "session-local",
    { label: "Edited First Move", direction: "Daily Life" },
    startMs + 130_000,
  );
  assert.equal(reviewed.sessions[0]?.linkedIntentId, "intent-local");
  assert.equal(reviewed.activityIntents[0]?.status, "consumed");
  assert.equal(reviewed.activityIntents[0]?.moveText, "Open the exact document.");
});
