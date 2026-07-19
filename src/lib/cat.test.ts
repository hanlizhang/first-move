import assert from "node:assert/strict";
import test from "node:test";

import { normalizeAppState } from "./app-state.ts";
import {
  FIRST_IDLE_DELAY_MS,
  MAX_IDLE_DELAY_MS,
  MIN_IDLE_DELAY_MS,
  USER_ACTION_DURATION_MS,
  poseForAction,
  previewPose,
  randomIdleDelay,
  scheduleIdleBehavior,
  scheduleReturnToSitting,
} from "./cat-behavior.ts";
import { CAT_ITEMS, isCatItemUnlocked } from "./cat-items.ts";
import { inventoryQuantity, purchaseCatItem, useFood } from "./cat-store.ts";
import { createEmptyState, type RewardEvent } from "./models.ts";
import { gentleReturnMessage, kittenStage, syncProgress } from "./progress.ts";
import { loadAppState, saveAppState, type StorageLike } from "./repository.ts";
import { startStopwatch, stopSession } from "./sessions.ts";

test("purchases spend points, persist inventory, and enforce ownership rules", () => {
  const funded = { ...createEmptyState(), progress: { ...createEmptyState().progress, points: 20, totalActiveDays: 50 } };
  const first = purchaseCatItem(funded, "yarn-toy", new Date("2026-07-19T12:00:00Z"), () => "purchase-1");
  assert.equal(first.outcome, "purchased");
  assert.equal(first.state.progress.points, 14);
  assert.equal(inventoryQuantity(first.state, "yarn-toy"), 1);
  assert.equal(purchaseCatItem(first.state, "yarn-toy").outcome, "already-owned");
  assert.equal(purchaseCatItem({ ...first.state, progress: { ...first.state.progress, points: 0 } }, "high-five").outcome, "insufficient");

  let stored: string | null = null;
  const storage: StorageLike = { getItem: () => stored, setItem: (_key, value) => { stored = value; } };
  assert.equal(saveAppState(storage, first.state), true);
  const refreshed = loadAppState(storage);
  assert.equal(refreshed.progress.points, 14);
  assert.equal(inventoryQuantity(refreshed, "yarn-toy"), 1);
});

test("food can be purchased repeatedly and consumed without penalties", () => {
  const funded = { ...createEmptyState(), progress: { ...createEmptyState().progress, points: 5, totalActiveDays: 1 } };
  const once = purchaseCatItem(funded, "kitten-milk", new Date("2026-07-19T12:00:00Z"), () => "milk-1").state;
  const twice = purchaseCatItem(once, "kitten-milk", new Date("2026-07-19T12:01:00Z"), () => "milk-2").state;
  assert.equal(inventoryQuantity(twice, "kitten-milk"), 2);
  const used = useFood(twice, "kitten-milk");
  assert.equal(inventoryQuantity(used, "kitten-milk"), 1);
  assert.equal(used.progress.points, 3);
});

test("store unlocks use the exact active-day boundaries", () => {
  const expected = new Map([["kitten-milk", 1], ["cat-treat", 3], ["yarn-toy", 7], ["cat-food", 21], ["high-five", 50]]);
  for (const item of CAT_ITEMS) {
    const boundary = expected.get(item.id)!;
    assert.equal(item.unlockActiveDays, boundary);
    assert.equal(isCatItemUnlocked(item, boundary - 1), false);
    assert.equal(isCatItemUnlocked(item, boundary), true);
  }
  const fundedButLocked = { ...createEmptyState(), progress: { ...createEmptyState().progress, points: 100, totalActiveDays: 6 } };
  assert.equal(purchaseCatItem(fundedButLocked, "yarn-toy").outcome, "locked");
});

test("idle delays stay between five and ten minutes", () => {
  assert.equal(randomIdleDelay(0), MIN_IDLE_DELAY_MS);
  assert.equal(randomIdleDelay(1), MAX_IDLE_DELAY_MS);
  assert.equal(randomIdleDelay(0.5), 450_000);
});

test("idle behavior cannot transition before five minutes and cleanup clears timers", () => {
  const callbacks = new Map<number, () => void>();
  const delays: number[] = [];
  const cleared: number[] = [];
  const actions: string[] = [];
  let nextId = 0;
  const cleanup = scheduleIdleBehavior({
    reducedMotion: false,
    random: () => 0,
    setTimer: (callback, delayMs) => { nextId += 1; callbacks.set(nextId, callback); delays.push(delayMs); return nextId; },
    clearTimer: (timerId) => { cleared.push(timerId); callbacks.delete(timerId); },
    onAction: (action) => actions.push(action),
    onSit: () => actions.push("sit"),
  });
  assert.deepEqual(delays, [FIRST_IDLE_DELAY_MS]);
  assert.deepEqual(actions, []);
  callbacks.get(1)?.();
  assert.deepEqual(actions, ["walk"]);
  cleanup();
  assert.deepEqual(cleared.sort(), [1, 2]);
});

test("reduced motion schedules no automatic idle timer", () => {
  let scheduled = 0;
  const cleanup = scheduleIdleBehavior({ reducedMotion: true, random: () => 0, setTimer: () => { scheduled += 1; return 1; }, clearTimer: () => undefined, onAction: () => undefined, onSit: () => undefined });
  cleanup();
  assert.equal(scheduled, 0);
});

test("user action overrides return to sitting and previews do not touch app state", () => {
  let callback: (() => void) | undefined;
  let delay = 0;
  let pose = poseForAction("food");
  scheduleReturnToSitting((next, delayMs) => { callback = next; delay = delayMs; return 1; }, () => undefined, () => { pose = "sitting"; });
  assert.equal(pose, "eating");
  assert.equal(delay, USER_ACTION_DURATION_MS);
  callback?.();
  assert.equal(pose, "sitting");

  const persisted = createEmptyState();
  const before = structuredClone(persisted);
  assert.equal(previewPose("playing"), "playing");
  assert.deepEqual(persisted, before);
});

test("user actions map only to their relevant poses", () => {
  assert.equal(poseForAction("food"), "eating");
  assert.equal(poseForAction("toy"), "playing");
  assert.equal(poseForAction("trick"), "happy");
});

test("qualifying actions count distinct local active days only once", () => {
  const events: RewardEvent[] = [
    { id: "task:a:day", source: "task", sourceId: "a", dateKey: "2026-07-18", points: 5, createdAt: "2026-07-18T08:00:00Z" },
    { id: "habit:b:day", source: "habit", sourceId: "b", dateKey: "2026-07-18", points: 3, createdAt: "2026-07-18T09:00:00Z" },
    { id: "morning:day", source: "morning", sourceId: "morning", dateKey: "2026-07-19", points: 1, createdAt: "2026-07-19T08:00:00Z" },
  ];
  const state = {
    ...createEmptyState(),
    rewardEvents: events,
    sessions: [{ id: "session-day", mode: "stopwatch" as const, direction: "Rest" as const, label: "Pause", status: "stopped" as const, startedAt: "2026-07-18T10:00:00Z", accumulatedElapsedMs: 60_000, endedAt: "2026-07-18T10:01:00Z", actualElapsedMs: 60_000 }],
    journalEntries: [{ dateKey: "2026-07-19", updatedAt: "2026-07-19T20:00:00Z" }],
  };
  const synced = syncProgress(state, "2026-07-19", true);
  assert.deepEqual(synced.progress.activeDateKeys, ["2026-07-18", "2026-07-19"]);
  assert.equal(synced.progress.totalActiveDays, 2);
  assert.equal(synced.progress.gentleStreak, 2);
  assert.equal(synced.progress.lastActiveDate, "2026-07-19");
});

test("a one-minute stopped session counts as active even when its rounded reward is zero", () => {
  const started = startStopwatch(createEmptyState(), { direction: "Rest" }, Date.parse("2026-07-19T10:00:00Z"), () => "one-minute-stop");
  const stopped = stopSession(started, "one-minute-stop", Date.parse("2026-07-19T10:01:00Z"));
  assert.equal(stopped.rewardEvents.length, 0);
  assert.equal(stopped.progress.totalActiveDays, 1);
});

test("kitten stages use the active-day boundaries", () => {
  assert.equal(kittenStage(1), "New kitten");
  assert.equal(kittenStage(7), "New kitten");
  assert.equal(kittenStage(8), "Settling in");
  assert.equal(kittenStage(21), "Settling in");
  assert.equal(kittenStage(22), "Curious kitten");
  assert.equal(kittenStage(50), "Curious kitten");
  assert.equal(kittenStage(51), "Adventurous kitten");
  assert.equal(kittenStage(99), "Adventurous kitten");
  assert.equal(kittenStage(100), "Companion");
});

test("return messages are gentle only after an absent day", () => {
  assert.equal(gentleReturnMessage("2026-07-18", "2026-07-19"), undefined);
  assert.match(gentleReturnMessage("2026-07-17", "2026-07-19") ?? "", /exploring/);
  assert.match(gentleReturnMessage("2026-07-17", "2026-07-19") ?? "", /nothing was lost/);
});

test("malformed cat inventory and progress recover safely", () => {
  const recovered = normalizeAppState({
    ...createEmptyState(),
    inventory: { items: [{ itemId: "not-real", quantity: 4 }, { itemId: "cat-bed", quantity: -1 }, { itemId: "yarn-toy", quantity: 7 }], selectedFurnitureId: "not-real" },
    progress: { points: "lots", activeDateKeys: [null, "bad"], unlockedMilestones: [7], firstUseDate: "bad", journeyDay: -2 },
  });
  assert.deepEqual(recovered.inventory.items, [{ itemId: "yarn-toy", quantity: 1 }]);
  assert.equal(recovered.inventory.selectedFurnitureId, undefined);
  assert.equal(recovered.progress.points, 0);
  assert.equal(recovered.progress.firstUseDate, undefined);
  assert.equal(recovered.progress.journeyDay, 0);
});
