import assert from "node:assert/strict";
import test from "node:test";

import { normalizeAppState } from "./app-state.ts";
import {
  FIRST_IDLE_DELAY_MS,
  EATING_DURATION_MS,
  MAX_IDLE_DELAY_MS,
  MIN_IDLE_DELAY_MS,
  USER_ACTION_DURATION_MS,
  clampRoomPoint,
  createCatActionSequencer,
  messageForPose,
  previewPose,
  randomIdleDelay,
  scheduleIdleBehavior,
  scheduleReturnToSitting,
} from "./cat-behavior.ts";
import { CAT_CATALOG, CAT_ITEMS, CAT_MILESTONES, STORE_CATEGORIES, catItem, isCatItemUnlocked } from "./cat-items.ts";
import { inventoryQuantity, purchaseCatItem, selectFurniture, useFood } from "./cat-store.ts";
import { createEmptyState, type RewardEvent } from "./models.ts";
import { catGrowthStory, gentleReturnMessage, kittenStage, syncProgress } from "./progress.ts";
import { loadAppState, saveAppState, type StorageLike } from "./repository.ts";
import { startStopwatch, stopSession } from "./sessions.ts";

test("purchases spend points, persist inventory, and enforce ownership rules", () => {
  const funded = { ...createEmptyState(), progress: { ...createEmptyState().progress, points: 100, totalActiveDays: 50 } };
  const first = purchaseCatItem(funded, "yarn-toy", new Date("2026-07-19T12:00:00Z"), () => "purchase-1");
  assert.equal(first.outcome, "purchased");
  assert.equal(first.state.progress.points, 75);
  assert.equal(inventoryQuantity(first.state, "yarn-toy"), 1);
  assert.equal(purchaseCatItem(first.state, "yarn-toy").outcome, "already-owned");
  assert.equal(purchaseCatItem({ ...first.state, progress: { ...first.state.progress, points: 0 } }, "high-five").outcome, "insufficient");

  let stored: string | null = null;
  const storage: StorageLike = { getItem: () => stored, setItem: (_key, value) => { stored = value; } };
  assert.equal(saveAppState(storage, first.state), true);
  const refreshed = loadAppState(storage);
  assert.equal(refreshed.progress.points, 75);
  assert.equal(inventoryQuantity(refreshed, "yarn-toy"), 1);
});

test("new food can be purchased repeatedly and consumed without penalties", () => {
  const funded = { ...createEmptyState(), progress: { ...createEmptyState().progress, points: 30, totalActiveDays: 21 } };
  const once = purchaseCatItem(funded, "wet-kitten-food", new Date("2026-07-19T12:00:00Z"), () => "wet-food-1").state;
  const twice = purchaseCatItem(once, "wet-kitten-food", new Date("2026-07-19T12:01:00Z"), () => "wet-food-2").state;
  assert.equal(inventoryQuantity(twice, "wet-kitten-food"), 2);
  const used = useFood(twice, "wet-kitten-food");
  assert.equal(inventoryQuantity(used, "wet-kitten-food"), 1);
  assert.equal(used.progress.points, 10);
});

test("Web catalog matches the approved visible Cat catalog exactly", () => {
  const expected: Record<string, { name: string; price: number; kind: string; category: string; unlock: number; durable: boolean }> = {
    "kitten-milk": { name: "Kitten milk", price: 5, kind: "food", category: "Food", unlock: 1, durable: false },
    "wet-kitten-food": { name: "Wet kitten food", price: 10, kind: "food", category: "Food", unlock: 21, durable: false },
    "cat-food": { name: "Cat food", price: 10, kind: "food", category: "Food", unlock: 35, durable: false },
    "cat-treat": { name: "Soft cat treat", price: 20, kind: "food", category: "Treats", unlock: 50, durable: false },
    "freeze-dried-treat": { name: "Freeze-dried treat", price: 15, kind: "food", category: "Treats", unlock: 50, durable: false },
    "yarn-toy": { name: "Yarn ball", price: 25, kind: "toy", category: "Toys", unlock: 3, durable: true },
    "toy-mouse": { name: "Toy mouse", price: 35, kind: "toy", category: "Toys", unlock: 14, durable: true },
    "teaser-wand": { name: "Teaser wand", price: 40, kind: "toy", category: "Toys", unlock: 7, durable: true },
    "scratching-post": { name: "Scratching post", price: 80, kind: "furniture", category: "Furniture", unlock: 21, durable: true },
    "cat-bed": { name: "Cat bed", price: 100, kind: "furniture", category: "Furniture", unlock: 50, durable: true },
    "window-cushion": { name: "Window perch", price: 140, kind: "furniture", category: "Furniture", unlock: 70, durable: true },
    "cat-tree": { name: "Cat tree", price: 300, kind: "furniture", category: "Furniture", unlock: 75, durable: true },
    "high-five": { name: "High-five", price: 80, kind: "trick", category: "Tricks", unlock: 50, durable: true },
    "paw-shake": { name: "Paw shake", price: 120, kind: "trick", category: "Tricks", unlock: 100, durable: true },
  };
  assert.deepEqual(STORE_CATEGORIES, ["Food", "Treats", "Toys", "Furniture", "Tricks"]);
  assert.equal(CAT_ITEMS.length, Object.keys(expected).length);
  for (const item of CAT_ITEMS) {
    const wanted = expected[item.id];
    assert.ok(wanted, `${item.id} is approved`);
    assert.equal(item.name, wanted.name);
    assert.equal(item.price, wanted.price);
    assert.equal(item.kind, wanted.kind);
    assert.equal(item.category, wanted.category);
    assert.equal(item.unlockActiveDays, wanted.unlock);
    assert.equal(item.purchaseQuantity, 1);
    assert.equal(item.durable, wanted.durable);
    assert.equal(item.active, true);
    assert.equal(item.milestoneOnly, false);
    assert.equal(isCatItemUnlocked(item, wanted.unlock - 1), false);
    assert.equal(isCatItemUnlocked(item, wanted.unlock), true);
  }
  assert.equal(CAT_CATALOG.length, 16);
  assert.deepEqual(catItem("outdoor-garden"), {
    id: "outdoor-garden", name: "Outdoor garden", price: 0, kind: "scene", unlockActiveDays: 100,
    purchaseQuantity: 1, durable: true, milestoneOnly: true, active: true,
    description: "A sunny garden earned at 100 active days.",
  });
  assert.equal(catItem("butterfly")?.unlockActiveDays, 100);
});

test("approved locked, durable, furniture, and insufficient-points rules remain enforced", () => {
  const beforeDay14 = { ...createEmptyState(), progress: { ...createEmptyState().progress, points: 500, totalActiveDays: 13 } };
  assert.equal(purchaseCatItem(beforeDay14, "toy-mouse").outcome, "locked");

  const day75 = { ...beforeDay14, progress: { ...beforeDay14.progress, totalActiveDays: 75 } };
  const mouse = purchaseCatItem(day75, "toy-mouse", new Date("2026-07-19T12:00:00Z"), () => "mouse-1");
  assert.equal(mouse.outcome, "purchased");
  assert.equal(purchaseCatItem(mouse.state, "toy-mouse").outcome, "already-owned");

  const tree = purchaseCatItem(mouse.state, "cat-tree", new Date("2026-07-19T12:01:00Z"), () => "tree-1");
  assert.equal(tree.outcome, "purchased");
  assert.equal(selectFurniture(tree.state, "cat-tree").inventory.selectedFurnitureId, "cat-tree");

  const noPoints = { ...createEmptyState(), progress: { ...createEmptyState().progress, points: 14, totalActiveDays: 50 } };
  assert.equal(purchaseCatItem(noPoints, "freeze-dried-treat").outcome, "insufficient");
});

test("an owned durable remains usable below its current purchase threshold", () => {
  const historical = {
    ...createEmptyState(),
    progress: { ...createEmptyState().progress, points: 500, totalActiveDays: 0 },
    inventory: {
      items: [
        { itemId: "toy-mouse" as const, quantity: 1 },
        { itemId: "cat-tree" as const, quantity: 1 },
      ],
    },
  };
  assert.equal(purchaseCatItem(historical, "toy-mouse").outcome, "already-owned");
  assert.equal(selectFurniture(historical, "cat-tree").inventory.selectedFurnitureId, "cat-tree");
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
  assert.deepEqual(actions, ["blink"]);
  cleanup();
  assert.deepEqual(cleared.sort(), [2, 3]);
});

test("reduced motion preserves restful idle behavior without walking", () => {
  const callbacks = new Map<number, () => void>();
  const actions: string[] = [];
  let scheduled = 0;
  const cleanup = scheduleIdleBehavior({ reducedMotion: true, random: () => 0.4, setTimer: (callback) => { scheduled += 1; callbacks.set(scheduled, callback); return scheduled; }, clearTimer: (timerId) => { callbacks.delete(timerId); }, onAction: (action) => actions.push(action), onSit: () => actions.push("sit") });
  callbacks.get(1)?.();
  cleanup();
  assert.equal(scheduled, 3);
  assert.deepEqual(actions, ["blink"]);
});

test("user action overrides return to sitting and previews do not touch app state", () => {
  let callback: (() => void) | undefined;
  let delay = 0;
  let pose = "eating";
  scheduleReturnToSitting((next, delayMs) => { callback = next; delay = delayMs; return 1; }, () => undefined, () => { pose = "sitting"; });
  assert.equal(pose, "eating");
  assert.equal(delay, USER_ACTION_DURATION_MS);
  callback?.();
  assert.equal(pose, "sitting");

  const persisted = createEmptyState();
  const before = structuredClone(persisted);
  assert.equal(previewPose("yarn"), "yarn");
  assert.deepEqual(persisted, before);
});

test("new Cat actions replace an active sequence and stale timers cannot settle the replacement", () => {
  const callbacks = new Map<number, () => void>();
  const delays: number[] = [];
  let nextId = 0;
  const poses: string[] = [];
  const sequencer = createCatActionSequencer(
    (callback, delayMs) => { nextId += 1; callbacks.set(nextId, callback); delays.push(delayMs); return nextId; },
    (timerId) => { callbacks.delete(timerId); },
  );
  assert.equal(sequencer.startInteraction("treat", (pose) => poses.push(pose)), true);
  assert.equal(sequencer.startInteraction("milk", (pose) => poses.push(pose)), true);
  assert.deepEqual(poses, ["licking", "drinking"]);
  assert.deepEqual(delays, [EATING_DURATION_MS, EATING_DURATION_MS]);
  assert.equal(callbacks.has(1), false);
  callbacks.get(2)?.();
  assert.deepEqual(poses, ["licking", "drinking", "sitting"]);
  assert.equal(sequencer.isActive(), false);
});

test("every visible pose has a matching message", () => {
  assert.equal(messageForPose("sitting"), "The kitten sits nearby, cozy and curious.");
  assert.match(messageForPose("walking"), /pads softly/);
  assert.match(messageForPose("sleeping"), /peaceful nap/);
  assert.match(messageForPose("drinking"), /milk/);
  assert.match(messageForPose("eating"), /little bowl/);
  assert.match(messageForPose("licking"), /treat/);
  assert.match(messageForPose("yarn"), /yarn/);
  assert.match(messageForPose("mouse-pounce"), /toy mouse/);
  assert.match(messageForPose("scratching"), /Scratch/);
  assert.match(messageForPose("bed-nap"), /good place/);
  assert.match(messageForPose("perch"), /window/);
  assert.match(messageForPose("tree-perch"), /Higher/);
  assert.match(messageForPose("happy"), /happy and content/);
});

test("milestone grants occur once at 21, 50, and 100 active days", () => {
  let state = createEmptyState();
  for (const milestone of CAT_MILESTONES) {
    state = { ...state, rewardEvents: Array.from({ length: milestone.day }, (_, index) => ({ id: `task:${index}`, source: "task" as const, sourceId: String(index), dateKey: `2026-${String(Math.floor(index / 28) + 1).padStart(2, "0")}-${String(index % 28 + 1).padStart(2, "0")}`, points: 5, createdAt: "2026-01-01T00:00:00Z" })) };
    const once = syncProgress(state, "2026-07-20");
    const twice = syncProgress(once, "2026-07-20");
    assert.equal(once.progress.grantedMilestones.includes(milestone.day), true);
    for (const grant of milestone.grants) assert.equal(inventoryQuantity(twice, grant.itemId), inventoryQuantity(once, grant.itemId));
    state = once;
  }
});

test("future day-21 milestone grants wet food once without converting historical cat food", () => {
  const rewardEvents: RewardEvent[] = Array.from({ length: 21 }, (_, index) => ({
    id: `task:day-21:${index}`,
    source: "task",
    sourceId: String(index),
    dateKey: `2026-01-${String(index + 1).padStart(2, "0")}`,
    points: 5,
    createdAt: "2026-01-01T00:00:00Z",
  }));
  const future = syncProgress({ ...createEmptyState(), rewardEvents }, "2026-01-21");
  assert.equal(inventoryQuantity(future, "wet-kitten-food"), 10);
  assert.equal(inventoryQuantity(future, "cat-food"), 0);
  assert.equal(inventoryQuantity(syncProgress(future, "2026-01-21"), "wet-kitten-food"), 10);

  const historical = {
    ...createEmptyState(),
    rewardEvents,
    inventory: { items: [{ itemId: "cat-food" as const, quantity: 10 }] },
    progress: { ...createEmptyState().progress, grantedMilestones: [21 as const] },
  };
  const preserved = syncProgress(historical, "2026-01-21");
  assert.equal(inventoryQuantity(preserved, "cat-food"), 10);
  assert.equal(inventoryQuantity(preserved, "wet-kitten-food"), 0);

  const previouslyUnlockedButUngranted = normalizeAppState({
    ...createEmptyState(),
    rewardEvents,
    inventory: { items: [{ itemId: "cat-food", quantity: 10 }] },
    progress: { ...createEmptyState().progress, unlockedMilestones: [21], grantedMilestones: undefined },
  });
  assert.equal(inventoryQuantity(previouslyUnlockedButUngranted, "cat-food"), 10);
  assert.equal(inventoryQuantity(previouslyUnlockedButUngranted, "wet-kitten-food"), 10);
  assert.deepEqual(previouslyUnlockedButUngranted.progress.grantedMilestones, [21]);
  assert.deepEqual(CAT_MILESTONES.find(({ day }) => day === 50)?.grants, [{ itemId: "cat-treat", quantity: 10 }]);
  assert.deepEqual(CAT_MILESTONES.find(({ day }) => day === 100)?.grants, [{ itemId: "outdoor-garden", quantity: 1 }, { itemId: "butterfly", quantity: 1 }]);
});

test("legacy inventory IDs hydrate without conversion or inflated durable quantities", () => {
  const recovered = normalizeAppState({
    ...createEmptyState(),
    inventory: {
      items: [
        { itemId: "soft-kitten-food", quantity: 4 },
        { itemId: "cat-food", quantity: 2 },
        { itemId: "yarn-toy", quantity: 8 },
        { itemId: "cat-bed", quantity: 3 },
        { itemId: "window-cushion", quantity: 2 },
      ],
      selectedFurnitureId: "cat-bed",
    },
  });
  assert.equal(inventoryQuantity(recovered, "cat-food"), 6);
  assert.equal(inventoryQuantity(recovered, "yarn-toy"), 1);
  assert.equal(inventoryQuantity(recovered, "cat-bed"), 1);
  assert.equal(inventoryQuantity(recovered, "window-cushion"), 1);
  assert.equal(recovered.inventory.selectedFurnitureId, "cat-bed");
});

test("wand pointer coordinates clamp inside the room", () => {
  assert.deepEqual(clampRoomPoint(-20, 500, { left: 10, top: 20, width: 200, height: 120 }), { x: 8, y: 112 });
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

test("kitten growth story uses the approved symbolic active-day chapters", () => {
  assert.equal(kittenStage(1), "New kitten");
  assert.equal(kittenStage(20), "New kitten");
  assert.equal(kittenStage(21), "Beginning weaning");
  assert.equal(kittenStage(27), "Beginning weaning");
  assert.equal(kittenStage(28), "Playful kitten");
  assert.equal(kittenStage(34), "Playful kitten");
  assert.equal(kittenStage(35), "Curious kitten");
  assert.equal(kittenStage(49), "Curious kitten");
  assert.equal(kittenStage(50), "Cozy companion");
  assert.equal(kittenStage(99), "Cozy companion");
  assert.equal(kittenStage(100), "Adventure milestone");
  assert.match(catGrowthStory(21).description, /Wet kitten food/);
  assert.match(catGrowthStory(21).description, /scratching post/);
  assert.match(catGrowthStory(28).description, /already gathered/);
  assert.match(catGrowthStory(35).description, /Kibble/);
  assert.deepEqual(catGrowthStory(27).nextMilestone, { day: 28, label: "Playful kitten" });
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
