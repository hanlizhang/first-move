import assert from "node:assert/strict";
import test from "node:test";

import {
  addHabit,
  addTask,
  cancelPendingIntent,
  createPendingIntent,
  getPendingIntent,
  isHabitScheduled,
  localDateKey,
  normalizeAppState,
  toggleHabit,
  toggleTask,
} from "./app-state.ts";
import { createEmptyState, DIRECTIONS, STUCK_STATES, type Habit } from "./models.ts";
import { loadAppState, saveAppState, type StorageLike } from "./repository.ts";
import { calculateSessionReward } from "./rewards.ts";
import { FIRST_MOVE_TEMPLATES, templatesFor } from "./templates.ts";
import {
  cancelSession,
  completeSession,
  elapsedMs,
  getOpenSession,
  pauseSession,
  remainingMs,
  resumeSession,
  reviewSession,
  startCountdown,
  startStopwatch,
  stopSession,
} from "./sessions.ts";
import { getTaskTrackedMs, getTodaySummary, getTodayTimeline } from "./summaries.ts";

const clock = () => "2026-07-18T08:00:00.000Z";

test("malformed and partial old data returns a usable current state", () => {
  assert.deepEqual(normalizeAppState("broken"), createEmptyState());

  const recovered = normalizeAppState({
    schemaVersion: 0,
    tasks: [
      {
        id: "old-task",
        title: "Open the notes",
        direction: "Work & Study",
        order: 9,
        createdAt: clock(),
        updatedAt: clock(),
        completedOn: [],
      },
      { id: 4, title: null },
    ],
    progress: { points: "many" },
  });

  assert.equal(recovered.schemaVersion, 8);
  assert.equal(recovered.tasks.length, 1);
  assert.equal(recovered.tasks[0].order, 0);
  assert.equal(recovered.progress.points, 0);
});

test("creates one pending intent and prevents duplicate pending intents", () => {
  const first = createPendingIntent(
    createEmptyState(),
    {
      stuckState: "knows what to do but cannot start",
      direction: "Work & Study",
      moveText: "Open the document",
      intendedDurationMinutes: 5,
    },
    clock,
    () => "intent-1",
  );
  const duplicateAttempt = createPendingIntent(
    first,
    {
      stuckState: "unsure what is needed",
      direction: "Rest",
      moveText: "Pause",
      intendedDurationMinutes: 2,
    },
    clock,
    () => "intent-2",
  );

  assert.equal(duplicateAttempt.activityIntents.length, 1);
  assert.equal(getPendingIntent(duplicateAttempt)?.id, "intent-1");
});

test("inherits a linked item direction unless an editable direction is supplied", () => {
  const withTask = addTask(
    createEmptyState(),
    { title: "Open the notes", direction: "Work & Study" },
    clock,
  );
  const taskId = withTask.tasks[0].id;
  const inherited = createPendingIntent(
    withTask,
    {
      stuckState: "overwhelmed by a large task",
      moveText: "Read the first heading",
      intendedDurationMinutes: 5,
      linkedTaskId: taskId,
    },
    clock,
    () => "intent-inherited",
  );

  assert.equal(getPendingIntent(inherited)?.direction, "Work & Study");
  assert.equal(getPendingIntent(inherited)?.linkedTaskId, taskId);

  const editable = createPendingIntent(
    cancelPendingIntent(inherited, "intent-inherited"),
    {
      stuckState: "overwhelmed by a large task",
      direction: "Rest",
      moveText: "Set the notes aside",
      intendedDurationMinutes: 2,
      linkedTaskId: taskId,
    },
    clock,
    () => "intent-edited",
  );
  assert.equal(getPendingIntent(editable)?.direction, "Rest");
});

test("cancelling a pending intent removes it without a reward or session", () => {
  const withIntent = createPendingIntent(
    createEmptyState(),
    {
      stuckState: "needs intentional rest",
      direction: "Rest",
      moveText: "Settle into the chair",
      intendedDurationMinutes: 10,
    },
    clock,
    () => "intent-cancel",
  );
  const cancelled = cancelPendingIntent(withIntent, "intent-cancel");

  assert.equal(getPendingIntent(cancelled), undefined);
  assert.equal(cancelled.sessions.length, 0);
  assert.equal(cancelled.rewardEvents.length, 0);
  assert.equal(cancelled.progress.points, 0);
});

test("persists a valid pending intent and drops malformed stored intents", () => {
  let stored: string | null = null;
  const memoryStorage: StorageLike = {
    getItem: () => stored,
    setItem: (_key, value) => { stored = value; },
  };
  const withIntent = createPendingIntent(
    createEmptyState(),
    {
      stuckState: "scrolling and unable to stop",
      direction: "Daily Life",
      moveText: "Place one item away",
      intendedDurationMinutes: 2,
    },
    clock,
    () => "intent-persisted",
  );

  assert.equal(saveAppState(memoryStorage, withIntent), true);
  assert.equal(getPendingIntent(loadAppState(memoryStorage))?.id, "intent-persisted");

  stored = JSON.stringify({
    ...createEmptyState(),
    activityIntents: [
      { id: 42, status: "pending" },
      { id: "bad-duration", stuckState: "unsure what is needed", direction: "Rest", moveText: "Pause", intendedDurationMinutes: 99, createdAt: clock(), status: "pending" },
    ],
  });
  assert.equal(loadAppState(memoryStorage).activityIntents.length, 0);
});

test("the repository recovers from invalid JSON and blocked writes", () => {
  const invalidStorage: StorageLike = {
    getItem: () => "{not-json",
    setItem: () => {
      throw new Error("blocked");
    },
  };

  assert.deepEqual(loadAppState(invalidStorage), createEmptyState());
  assert.equal(saveAppState(invalidStorage, createEmptyState()), false);
});

test("a running countdown recovers from persisted timestamps after refresh", () => {
  let state = createPendingIntent(
    createEmptyState(),
    {
      stuckState: "knows what to do but cannot start",
      direction: "Work & Study",
      moveText: "Open the document",
      intendedDurationMinutes: 5,
    },
    () => "2026-07-19T10:00:00.000Z",
    () => "intent-timer",
  );
  state = startCountdown(
    state,
    { linkedIntentId: "intent-timer", durationMinutes: 5 },
    Date.parse("2026-07-19T10:00:00.000Z"),
    () => "session-countdown",
  );

  let stored: string | null = null;
  const storage: StorageLike = {
    getItem: () => stored,
    setItem: (_key, value) => { stored = value; },
  };
  saveAppState(storage, state);
  const refreshed = loadAppState(storage);
  const running = getOpenSession(refreshed);

  assert.ok(running);
  assert.equal(elapsedMs(running, Date.parse("2026-07-19T10:02:00.000Z")), 120_000);
  assert.equal(remainingMs(running, Date.parse("2026-07-19T10:02:00.000Z")), 180_000);
});

test("a standalone countdown starts without creating or linking an ActivityIntent", () => {
  const started = startCountdown(
    createEmptyState(),
    { direction: "Rest", label: "   ", durationMinutes: 2 },
    1_000,
    () => "session-countdown-standalone",
  );

  assert.equal(started.activityIntents.length, 0);
  assert.deepEqual(started.sessions[0], {
    id: "session-countdown-standalone",
    mode: "countdown",
    direction: "Rest",
    label: "Focus time",
    targetDurationMinutes: 2,
    linkedTaskId: undefined,
    linkedHabitId: undefined,
    linkedIntentId: undefined,
    status: "running",
    startedAt: "1970-01-01T00:00:01.000Z",
    lastResumedAt: "1970-01-01T00:00:01.000Z",
    accumulatedElapsedMs: 0,
  });
});

test("a Quick Countdown stays standalone while a pending First Move remains available", () => {
  const withIntent = createPendingIntent(
    createEmptyState(),
    {
      stuckState: "overwhelmed by a large task",
      direction: "Work & Study",
      moveText: "Open one note",
      intendedDurationMinutes: 5,
    },
    clock,
    () => "intent-still-pending",
  );
  const started = startCountdown(
    withIntent,
    { direction: "Rest", label: "Take a short pause", durationMinutes: 2 },
    1_000,
    () => "session-quick-with-pending",
  );

  assert.equal(started.sessions[0].linkedIntentId, undefined);
  assert.equal(started.sessions[0].label, "Take a short pause");
  assert.equal(getPendingIntent(started)?.id, "intent-still-pending");
  assert.equal(
    startCountdown(started, { direction: "Daily Life", durationMinutes: 2 }, 2_000),
    started,
  );
  const completed = completeSession(started, "session-quick-with-pending", 121_000);
  assert.equal(getPendingIntent(completed)?.id, "intent-still-pending");
});

test("a standalone countdown can inherit and preserve a Task link", () => {
  const withTask = addTask(createEmptyState(), { title: "Draft one paragraph", direction: "Work & Study" }, clock);
  const taskId = withTask.tasks[0].id;
  const started = startCountdown(
    withTask,
    { linkedTaskId: taskId, durationMinutes: 25 },
    1_000,
    () => "session-countdown-task",
  );

  assert.equal(started.sessions[0].label, "Draft one paragraph");
  assert.equal(started.sessions[0].direction, "Work & Study");
  assert.equal(started.sessions[0].linkedTaskId, taskId);
  assert.equal(started.sessions[0].linkedIntentId, undefined);
});

test("a standalone countdown can inherit and preserve a Habit link", () => {
  const withHabit = addHabit(
    createEmptyState(),
    { title: "Stretch gently", direction: "Exercise & Movement", schedule: { kind: "daily" } },
    clock,
  );
  const habitId = withHabit.habits[0].id;
  const started = startCountdown(
    withHabit,
    { linkedHabitId: habitId, durationMinutes: 5 },
    1_000,
    () => "session-countdown-habit",
  );

  assert.equal(started.sessions[0].label, "Stretch gently");
  assert.equal(started.sessions[0].direction, "Exercise & Movement");
  assert.equal(started.sessions[0].linkedHabitId, habitId);
  assert.equal(started.sessions[0].linkedIntentId, undefined);
});

test("a pending ActivityIntent uses the shared countdown engine and retains its parent relationship", () => {
  const withTask = addTask(createEmptyState(), { title: "Review notes", direction: "Work & Study" }, clock);
  const taskId = withTask.tasks[0].id;
  const withIntent = createPendingIntent(
    withTask,
    {
      stuckState: "knows what to do but cannot start",
      moveText: "Open the notes",
      intendedDurationMinutes: 5,
      linkedTaskId: taskId,
    },
    clock,
    () => "intent-assisted",
  );
  const started = startCountdown(
    withIntent,
    { linkedIntentId: "intent-assisted", durationMinutes: 5 },
    1_000,
    () => "session-assisted",
  );

  assert.equal(started.sessions[0].label, "Open the notes");
  assert.equal(started.sessions[0].direction, "Work & Study");
  assert.equal(started.sessions[0].targetDurationMinutes, 5);
  assert.equal(started.sessions[0].linkedIntentId, "intent-assisted");
  assert.equal(started.sessions[0].linkedTaskId, undefined);
  assert.equal(started.activityIntents[0].linkedTaskId, taskId);
});

test("completing an assisted countdown clears only the matching active pending intent", () => {
  const withIntent = createPendingIntent(
    createEmptyState(),
    {
      stuckState: "knows what to do but cannot start",
      direction: "Work & Study",
      moveText: "Open the draft",
      intendedDurationMinutes: 2,
    },
    clock,
    () => "intent-complete",
  );
  const started = startCountdown(
    withIntent,
    { linkedIntentId: "intent-complete", durationMinutes: 2 },
    0,
    () => "session-intent-complete",
  );
  const completed = completeSession(started, "session-intent-complete", 120_000);

  assert.equal(getPendingIntent(completed), undefined);
  assert.equal(completed.sessions[0].status, "completed");
  assert.equal(completed.sessions[0].linkedIntentId, "intent-complete");

  const withoutOriginalIntent = cancelPendingIntent(started, "intent-complete");
  const withReplacementIntent = createPendingIntent(
    withoutOriginalIntent,
    {
      stuckState: "needs intentional rest",
      direction: "Rest",
      moveText: "Sit by the window",
      intendedDurationMinutes: 5,
    },
    clock,
    () => "intent-replacement",
  );
  const completedWithReplacement = completeSession(
    withReplacementIntent,
    "session-intent-complete",
    120_000,
  );
  assert.equal(getPendingIntent(completedWithReplacement)?.id, "intent-replacement");
});

test("stopping an assisted countdown clears its active pending intent", () => {
  const withIntent = createPendingIntent(
    createEmptyState(),
    {
      stuckState: "unsure what is needed",
      direction: "Daily Life",
      moveText: "Put one thing away",
      intendedDurationMinutes: 5,
    },
    clock,
    () => "intent-stop",
  );
  const stopped = stopSession(
    startCountdown(
      withIntent,
      { linkedIntentId: "intent-stop", durationMinutes: 5 },
      0,
      () => "session-intent-stop",
    ),
    "session-intent-stop",
    30_000,
  );

  assert.equal(getPendingIntent(stopped), undefined);
  assert.equal(stopped.sessions[0].status, "stopped");
  assert.equal(stopped.sessions[0].linkedIntentId, "intent-stop");
});

test("cancelling an assisted countdown keeps its pending intent ready", () => {
  const withIntent = createPendingIntent(
    createEmptyState(),
    {
      stuckState: "in bed and unable to get up",
      direction: "Daily Life",
      moveText: "Put both feet on the floor",
      intendedDurationMinutes: 2,
    },
    clock,
    () => "intent-cancel-session",
  );
  const cancelled = cancelSession(
    startCountdown(
      withIntent,
      { linkedIntentId: "intent-cancel-session", durationMinutes: 2 },
      0,
      () => "session-intent-cancel",
    ),
    "session-intent-cancel",
    30_000,
  );

  assert.equal(cancelled.sessions.length, 0);
  assert.equal(getPendingIntent(cancelled)?.id, "intent-cancel-session");
  assert.equal(cancelled.rewardEvents.length, 0);
});

test("a completed standalone session persists before any optional review", () => {
  const withTask = addTask(createEmptyState(), { title: "Read one page", direction: "Work & Study" }, clock);
  const taskId = withTask.tasks[0].id;
  const completed = completeSession(
    startCountdown(
      withTask,
      { linkedTaskId: taskId, label: "Read the introduction", durationMinutes: 2 },
      0,
      () => "session-auto-saved",
    ),
    "session-auto-saved",
    60_000,
  );
  let stored: string | null = null;
  const storage: StorageLike = {
    getItem: () => stored,
    setItem: (_key, value) => { stored = value; },
  };

  assert.equal(completed.sessions[0].reviewedAt, undefined);
  assert.equal(saveAppState(storage, completed), true);
  const restored = loadAppState(storage);
  assert.equal(restored.sessions[0].status, "completed");
  assert.equal(restored.sessions[0].actualElapsedMs, 60_000);
  assert.equal(restored.sessions[0].label, "Read the introduction");
  assert.equal(restored.sessions[0].direction, "Work & Study");
  assert.equal(restored.sessions[0].linkedTaskId, taskId);
  assert.equal(restored.sessions[0].reviewedAt, undefined);
  assert.equal(restored.rewardEvents.length, 1);
});

test("session completion is idempotent and saves actual elapsed time once", () => {
  const started = startStopwatch(
    createEmptyState(),
    { direction: "Daily Life", label: "Sort one shelf" },
    1_000,
    () => "session-once",
  );
  const completed = completeSession(started, "session-once", 11_000);
  const completedAgain = completeSession(completed, "session-once", 21_000);

  assert.equal(completedAgain.sessions.length, 1);
  assert.equal(completedAgain.sessions[0].status, "completed");
  assert.equal(completedAgain.sessions[0].actualElapsedMs, 10_000);
  assert.deepEqual(completedAgain, completed);
});

test("completed and stopped session rewards use their configured rates and round to one decimal", () => {
  assert.equal(calculateSessionReward(60_000, "completed"), 0.1);
  assert.equal(calculateSessionReward(90_000, "completed"), 0.2);
  assert.equal(calculateSessionReward(300_000, "stopped"), 0.2);
  assert.equal(calculateSessionReward(59_999, "completed"), 0);
  assert.equal(calculateSessionReward(59_999, "stopped"), 0);
});

test("session time rewards are persisted and duplicate-safe", () => {
  const short = completeSession(
    startStopwatch(createEmptyState(), { direction: "Rest" }, 0, () => "session-short"),
    "session-short",
    59_999,
  );
  assert.equal(short.rewardEvents.length, 0);

  const started = startStopwatch(createEmptyState(), { direction: "Daily Life" }, 0, () => "session-rewarded");
  const completed = completeSession(started, "session-rewarded", 125_000);
  const repeated = completeSession(completed, "session-rewarded", 180_000);
  assert.equal(completed.rewardEvents[0].id, "session:session-rewarded:time");
  assert.equal(completed.rewardEvents[0].points, 0.2);
  assert.equal(completed.progress.points, 0.2);
  assert.deepEqual(repeated, completed);

  let stored: string | null = null;
  const storage: StorageLike = {
    getItem: () => stored,
    setItem: (_key, value) => { stored = value; },
  };
  saveAppState(storage, completed);
  const refreshed = loadAppState(storage);
  assert.equal(refreshed.rewardEvents.length, 1);
  assert.equal(refreshed.rewardEvents[0].points, 0.2);
  assert.equal(refreshed.progress.points, 0.2);
  assert.deepEqual(completeSession(refreshed, "session-rewarded", 240_000), refreshed);
});

test("an intentionally stopped session earns thirty percent of the completed rate", () => {
  const started = startStopwatch(createEmptyState(), { direction: "Rest" }, 0, () => "session-stopped-reward");
  const stopped = stopSession(started, "session-stopped-reward", 300_000);
  assert.equal(stopped.sessions[0].status, "stopped");
  assert.equal(stopped.rewardEvents[0].points, 0.2);
  assert.equal(stopped.progress.points, 0.2);
});

test("closed sessions can be reviewed, linked, unlinked, and kept standalone", () => {
  const withTask = addTask(createEmptyState(), { title: "Draft outline", direction: "Work & Study" }, clock);
  const taskId = withTask.tasks[0].id;
  const closed = completeSession(
    startStopwatch(withTask, { direction: "Rest" }, 0, () => "session-review"),
    "session-review",
    60_000,
  );
  const linked = reviewSession(closed, "session-review", { label: "Outline intro", direction: "Work & Study", linkedTaskId: taskId }, 70_000);
  assert.equal(linked.sessions[0].label, "Outline intro");
  assert.equal(linked.sessions[0].linkedTaskId, taskId);
  assert.equal(linked.tasks.length, 1);
  const standalone = reviewSession(linked, "session-review", { label: "Quiet planning", direction: "Rest" }, 80_000);
  assert.equal(standalone.sessions[0].linkedTaskId, undefined);
  assert.equal(standalone.sessions[0].direction, "Rest");
});

test("session review preserves Habit and assisted ActivityIntent relationships", () => {
  const withHabit = addHabit(
    createEmptyState(),
    { title: "Take a walk", direction: "Exercise & Movement", schedule: { kind: "daily" } },
    clock,
  );
  const habitId = withHabit.habits[0].id;
  const habitClosed = completeSession(
    startStopwatch(withHabit, { linkedHabitId: habitId }, 0, () => "session-habit-review"),
    "session-habit-review",
    60_000,
  );
  const habitReviewed = reviewSession(
    habitClosed,
    "session-habit-review",
    { label: "Walked outside", direction: "Exercise & Movement", linkedHabitId: habitId },
    70_000,
  );
  assert.equal(habitReviewed.sessions[0].linkedHabitId, habitId);

  const withIntent = createPendingIntent(
    createEmptyState(),
    {
      stuckState: "unsure what is needed",
      direction: "Rest",
      moveText: "Sit somewhere comfortable",
      intendedDurationMinutes: 2,
    },
    clock,
    () => "intent-review",
  );
  const intentClosed = completeSession(
    startCountdown(withIntent, { linkedIntentId: "intent-review", durationMinutes: 2 }, 0, () => "session-intent-review"),
    "session-intent-review",
    120_000,
  );
  const intentReviewed = reviewSession(
    intentClosed,
    "session-intent-review",
    { label: "Sat comfortably", direction: "Rest" },
    130_000,
  );
  assert.equal(intentReviewed.sessions[0].linkedIntentId, "intent-review");
});

test("daily summaries and timeline retain separate sessions while totaling task time", () => {
  let state = addTask(createEmptyState(), { title: "Study", direction: "Work & Study" }, clock);
  const taskId = state.tasks[0].id;
  state = completeSession(startStopwatch(state, { linkedTaskId: taskId }, 0, () => "session-a"), "session-a", 60_000);
  state = completeSession(startStopwatch(state, { linkedTaskId: taskId }, 120_000, () => "session-b"), "session-b", 240_000);
  state = toggleTask(state, taskId, localDateKey(new Date(300_000)), () => new Date(300_000).toISOString());
  const dateKey = localDateKey(new Date(60_000));
  const summary = getTodaySummary(state, dateKey);
  const timeline = getTodayTimeline(state, dateKey);
  assert.equal(summary.totalTrackedMs, 180_000);
  assert.equal(summary.byDirection["Work & Study"], 180_000);
  assert.equal(getTaskTrackedMs(state, taskId), 180_000);
  assert.equal(timeline.filter((entry) => entry.kind === "session").length, 2);
  assert.equal(timeline.some((entry) => entry.kind === "task"), true);
});

test("stopwatch supports no link, inheritance, pause, resume, and neutral early stop", () => {
  const withTask = addTask(
    createEmptyState(),
    { title: "Review notes", direction: "Work & Study" },
    clock,
  );
  const taskId = withTask.tasks[0].id;
  const started = startStopwatch(
    withTask,
    { linkedTaskId: taskId },
    1_000,
    () => "session-linked",
  );
  assert.equal(started.sessions[0].direction, "Work & Study");
  assert.equal(started.sessions[0].linkedTaskId, taskId);

  const paused = pauseSession(started, "session-linked", 6_000);
  assert.equal(paused.sessions[0].accumulatedElapsedMs, 5_000);
  const resumed = resumeSession(paused, "session-linked", 10_000);
  const stopped = stopSession(resumed, "session-linked", 13_000);
  assert.equal(stopped.sessions[0].status, "stopped");
  assert.equal(stopped.sessions[0].actualElapsedMs, 8_000);
  assert.equal(stopped.rewardEvents.length, 0);

  const unlinked = startStopwatch(
    createEmptyState(),
    { direction: "Rest" },
    2_000,
    () => "session-unlinked",
  );
  assert.equal(unlinked.sessions[0].linkedTaskId, undefined);
  assert.equal(unlinked.sessions[0].label, "Tracked time");
});

test("stopwatch supports a Habit link through the same session engine", () => {
  const withHabit = addHabit(
    createEmptyState(),
    { title: "Tidy the desk", direction: "Daily Life", schedule: { kind: "daily" } },
    clock,
  );
  const habitId = withHabit.habits[0].id;
  const started = startStopwatch(
    withHabit,
    { linkedHabitId: habitId },
    1_000,
    () => "session-stopwatch-habit",
  );

  assert.equal(started.sessions[0].mode, "stopwatch");
  assert.equal(started.sessions[0].label, "Tidy the desk");
  assert.equal(started.sessions[0].direction, "Daily Life");
  assert.equal(started.sessions[0].linkedHabitId, habitId);
});

test("malformed sessions are discarded and only one open session can start", () => {
  const started = startStopwatch(
    createEmptyState(),
    { direction: "Rest" },
    1_000,
    () => "session-first",
  );
  const duplicateStart = startStopwatch(
    started,
    { direction: "Daily Life" },
    2_000,
    () => "session-second",
  );
  assert.equal(duplicateStart.sessions.length, 1);

  const recovered = normalizeAppState({
    ...createEmptyState(),
    sessions: [
      { id: "bad", mode: "countdown", direction: "Rest", label: "Bad", targetDurationMinutes: -4, status: "running" },
    ],
  });
  assert.equal(recovered.sessions.length, 0);
});

test("a task completion awards points only once for a date", () => {
  const withTask = addTask(
    createEmptyState(),
    { title: "Open one document", direction: "Work & Study" },
    clock,
  );
  const taskId = withTask.tasks[0].id;
  const completed = toggleTask(withTask, taskId, "2026-07-18", clock);
  const reopened = toggleTask(completed, taskId, "2026-07-18", clock);
  const completedAgain = toggleTask(reopened, taskId, "2026-07-18", clock);

  assert.equal(completedAgain.progress.points, 5);
  assert.equal(completedAgain.rewardEvents.length, 1);
  assert.deepEqual(completedAgain.tasks[0].completedOn, ["2026-07-18"]);
});

test("a habit completion awards points only once for a date", () => {
  const withHabit = addHabit(
    createEmptyState(),
    { title: "Stretch", direction: "Exercise & Movement", schedule: { kind: "daily" } },
    clock,
  );
  const habitId = withHabit.habits[0].id;
  const completed = toggleHabit(withHabit, habitId, "2026-07-18", clock);
  const reopened = toggleHabit(completed, habitId, "2026-07-18", clock);
  const completedAgain = toggleHabit(reopened, habitId, "2026-07-18", clock);

  assert.equal(completedAgain.progress.points, 3);
  assert.equal(completedAgain.rewardEvents.length, 1);
});

test("selected-weekday habits appear only on selected weekdays", () => {
  const habit: Habit = {
    id: "habit-1",
    title: "Friday walk",
    direction: "Exercise & Movement",
    schedule: { kind: "weekdays", weekdays: ["fri"] },
    createdAt: clock(),
    updatedAt: clock(),
    completedOn: [],
  };

  assert.equal(isHabitScheduled(habit, "2026-07-17"), true);
  assert.equal(isHabitScheduled(habit, "2026-07-18"), false);
});

test("the local library covers every stuck-state and direction pair", () => {
  assert.ok(FIRST_MOVE_TEMPLATES.length >= STUCK_STATES.length * DIRECTIONS.length * 2);
  for (const stuckState of STUCK_STATES) {
    for (const direction of DIRECTIONS) {
      assert.ok(templatesFor(stuckState, direction).length >= 2);
    }
  }
});

test("phone, standing, and water reset is available for the three approved stuck states", () => {
  const text = "Put the phone down, stand up, and drink one glass of water.";
  for (const stuckState of ["scrolling and unable to stop", "in bed and unable to get up", "unsure what is needed"] as const) {
    for (const direction of DIRECTIONS) assert.ok(templatesFor(stuckState, direction).some((template) => template.text === text));
  }
});
