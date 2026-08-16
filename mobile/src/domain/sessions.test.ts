import assert from "node:assert/strict";
import test from "node:test";

import { createPendingIntent } from "./app-state.ts";
import { createEmptyState, type IntendedDuration } from "./models.ts";
import {
  cancelSession,
  completeSessionIfElapsed,
  elapsedMs,
  getOpenSession,
  pauseSession,
  reconcileRunningCountdown,
  remainingMs,
  resumeSession,
  startCountdownFromIntent,
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

test("pause, stop, and cancel cannot turn an elapsed countdown into another outcome", () => {
  for (const action of [pauseSession, stopSession, cancelSession]) {
    const result = action(runningState(2), "session-local", startMs + 120_000);
    assert.equal(result.sessions[0]?.status, "completed");
    assert.equal(result.sessions[0]?.actualElapsedMs, 120_000);
  }
});
