import assert from "node:assert/strict";
import test from "node:test";

import { createEmptyState } from "./models.ts";
import { companionEventsForTransition, companionIdleAction, createCompanionEventController, shouldShowCompanion } from "./companion-events.ts";

test("detects new morning, session, task, habit, and stopped-session events", () => {
  const before = createEmptyState();
  const after = createEmptyState();
  after.morningChecks.push({ dateKey: "2026-07-21", verifiedAt: "now", captureMethod: "camera", verifierMode: "mock" });
  after.tasks.push({ id: "t", title: "Task", direction: "Daily Life", order: 0, createdAt: "now", updatedAt: "now", completedOn: ["2026-07-21"] });
  after.habits.push({ id: "h", title: "Habit", direction: "Rest", schedule: { kind: "daily" }, createdAt: "now", updatedAt: "now", completedOn: ["2026-07-21"] });
  after.sessions.push({ id: "complete", mode: "stopwatch", direction: "Rest", label: "Pause", status: "completed", startedAt: "now", accumulatedElapsedMs: 60_000 });
  after.sessions.push({ id: "stopped", mode: "stopwatch", direction: "Rest", label: "Enough", status: "stopped", startedAt: "now", accumulatedElapsedMs: 30_000 });
  assert.deepEqual(companionEventsForTransition(before, after).map((event) => event.kind), ["morning", "task-complete", "habit-complete", "session-complete", "session-stopped"]);

  const running = structuredClone(after);
  running.sessions[0].status = "running";
  running.sessions[1].status = "running";
  assert.deepEqual(companionEventsForTransition(running, after).slice(-2).map((event) => event.kind), ["session-complete", "session-stopped"]);
});

test("does not replay hydrated records and prevents duplicate queued events", () => {
  const state = createEmptyState();
  state.tasks.push({ id: "t", title: "Task", direction: "Daily Life", order: 0, createdAt: "now", updatedAt: "now", completedOn: ["2026-07-21"] });
  assert.deepEqual(companionEventsForTransition(state, structuredClone(state)), []);
  const callbacks: Array<() => void> = [];
  const reactions: Array<string | undefined> = [];
  const controller = createCompanionEventController({ setTimer: (callback) => (callbacks.push(callback), callbacks.length), clearTimer: () => undefined, onReaction: (reaction) => reactions.push(reaction?.kind) });
  const event = { id: "task:t:2026-07-21", kind: "task-complete" as const };
  controller.enqueue([event, event]);
  callbacks.shift()?.();
  assert.deepEqual(reactions, ["task-complete", undefined]);
});

test("queues simultaneous reactions and cleans up its timer", () => {
  const callbacks = new Map<number, () => void>();
  const cleared: number[] = [];
  const reactions: Array<string | undefined> = [];
  let nextId = 0;
  const controller = createCompanionEventController({ setTimer: (callback) => { callbacks.set(++nextId, callback); return nextId; }, clearTimer: (id) => cleared.push(id), onReaction: (reaction) => reactions.push(reaction?.kind) });
  controller.enqueue([{ id: "a", kind: "morning" }, { id: "b", kind: "habit-complete" }]);
  callbacks.get(1)?.();
  assert.deepEqual(reactions, ["morning", "habit-complete"]);
  controller.dispose();
  assert.deepEqual(cleared, [2]);
});

test("companion visibility, click destination, and focus idle restriction are stable", () => {
  assert.equal(shouldShowCompanion("today"), true);
  assert.equal(shouldShowCompanion("cat"), false);
  assert.equal(companionIdleAction("walk", true), "sleep");
  assert.equal(companionIdleAction("walk", false), "walk");
  assert.equal(companionIdleAction("blink", true), "blink");
});
