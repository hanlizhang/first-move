import assert from "node:assert/strict";
import test from "node:test";

import {
  CAT_HOME_POINT,
  CAT_INTERACTION_CAPTIONS,
  CAT_INTERACTION_SEQUENCES,
  CAT_ITEM_INTERACTION_MAP,
  CAT_TARGET_PADDING,
  CAT_WAND_POUNCE_DISTANCE,
  CAT_WAND_STEP,
  FIRST_CAT_IDLE_DELAY_MS,
  MAX_CAT_IDLE_DELAY_MS,
  MIN_CAT_IDLE_DELAY_MS,
  catInteractionAvailability,
  clampNormalizedRoomPoint,
  createCatIdleScheduler,
  createCatSequenceScheduler,
  facingTowardRoomPoint,
  idleActionFor,
  normalizedRoomPoint,
  randomCatIdleDelay,
  roomPointDistance,
  shouldWandPounce,
  stepTowardRoomPoint,
} from "./cat-interactions.ts";
import { createCatActionSequencer } from "./cat-behavior.ts";
import { createEmptyState } from "./models.ts";
import {
  CAT_HOME_POINT as MOBILE_CAT_HOME_POINT,
  CAT_INTERACTION_CAPTIONS as MOBILE_CAT_INTERACTION_CAPTIONS,
  CAT_INTERACTION_SEQUENCES as MOBILE_CAT_INTERACTION_SEQUENCES,
  CAT_ITEM_INTERACTION_MAP as MOBILE_CAT_ITEM_INTERACTION_MAP,
  CAT_TARGET_PADDING as MOBILE_CAT_TARGET_PADDING,
  CAT_WAND_POUNCE_DISTANCE as MOBILE_CAT_WAND_POUNCE_DISTANCE,
  CAT_WAND_STEP as MOBILE_CAT_WAND_STEP,
  FIRST_CAT_IDLE_DELAY_MS as MOBILE_FIRST_CAT_IDLE_DELAY_MS,
  MAX_CAT_IDLE_DELAY_MS as MOBILE_MAX_CAT_IDLE_DELAY_MS,
  MIN_CAT_IDLE_DELAY_MS as MOBILE_MIN_CAT_IDLE_DELAY_MS,
} from "../../mobile/src/domain/cat-interactions.ts";

test("Web and Mobile keep the same Cat captions, sequences, item map, and timing constants", () => {
  assert.deepEqual(CAT_INTERACTION_CAPTIONS, MOBILE_CAT_INTERACTION_CAPTIONS);
  assert.deepEqual(CAT_INTERACTION_SEQUENCES, MOBILE_CAT_INTERACTION_SEQUENCES);
  assert.deepEqual(CAT_ITEM_INTERACTION_MAP, MOBILE_CAT_ITEM_INTERACTION_MAP);
  assert.deepEqual(CAT_HOME_POINT, MOBILE_CAT_HOME_POINT);
  assert.equal(CAT_TARGET_PADDING, MOBILE_CAT_TARGET_PADDING);
  assert.equal(CAT_WAND_STEP, MOBILE_CAT_WAND_STEP);
  assert.equal(CAT_WAND_POUNCE_DISTANCE, MOBILE_CAT_WAND_POUNCE_DISTANCE);
  assert.equal(FIRST_CAT_IDLE_DELAY_MS, MOBILE_FIRST_CAT_IDLE_DELAY_MS);
  assert.equal(MIN_CAT_IDLE_DELAY_MS, MOBILE_MIN_CAT_IDLE_DELAY_MS);
  assert.equal(MAX_CAT_IDLE_DELAY_MS, MOBILE_MAX_CAT_IDLE_DELAY_MS);
});

test("wand targets normalize and clamp within room bounds", () => {
  assert.deepEqual(normalizedRoomPoint(-20, 500, 200, 120), { x: 0.06, y: 0.94 });
  assert.deepEqual(normalizedRoomPoint(20, 30, 0, 120), CAT_HOME_POINT);
  assert.deepEqual(clampNormalizedRoomPoint({ x: Number.POSITIVE_INFINITY, y: -1 }), { x: 0.06, y: 0.06 });
});

test("wand following uses bounded steps, facing, a close-only pounce, and reduced-motion immobility", () => {
  const current = { x: 0.2, y: 0.7 };
  const target = { x: 0.8, y: 0.2 };
  const next = stepTowardRoomPoint(current, target);
  assert.ok(roomPointDistance(current, next) <= CAT_WAND_STEP + Number.EPSILON);
  assert.equal(facingTowardRoomPoint(current, target), "right");
  assert.equal(facingTowardRoomPoint(target, current), "left");
  assert.deepEqual(stepTowardRoomPoint(current, target, CAT_WAND_STEP, false), current);
  assert.equal(shouldWandPounce({ x: 0.5, y: 0.5 }, { x: 0.6, y: 0.5 }, 0.9), true);
  assert.equal(shouldWandPounce({ x: 0.1, y: 0.1 }, { x: 0.8, y: 0.8 }, 0.9), false);
  assert.equal(shouldWandPounce({ x: 0.5, y: 0.5 }, { x: 0.6, y: 0.5 }, 0.2), false);
});

test("owned items and selected furniture gate every Cat v1B action", () => {
  const owned = [
    "yarn-toy", "toy-mouse", "teaser-wand", "scratching-post", "cat-bed",
    "window-cushion", "cat-tree", "high-five", "paw-shake", "outdoor-garden", "butterfly",
  ] as const;
  const withPerch = catInteractionAvailability(owned, "window-cushion");
  assert.deepEqual(withPerch, {
    butterfly: true, garden: true, highFive: true, mouse: true, pawShake: true,
    perch: true, scratch: true, tree: false, wand: true, yarn: true,
  });
  const withTree = catInteractionAvailability(owned, "cat-tree");
  assert.equal(withTree.perch, false);
  assert.equal(withTree.tree, true);
  assert.equal(catInteractionAvailability(["butterfly"]).butterfly, false);
});

test("yarn, mouse, scratching, furniture, tricks, and butterfly use distinct semantic phases", () => {
  assert.deepEqual(CAT_INTERACTION_SEQUENCES.yarn.map(({ phase }) => phase), ["yarn-anticipate", "yarn-action", "yarn-settle"]);
  assert.deepEqual(CAT_INTERACTION_SEQUENCES.mouse.map(({ phase }) => phase), ["mouse-stalk", "mouse-chase", "mouse-pounce"]);
  assert.deepEqual(CAT_INTERACTION_SEQUENCES.scratch.map(({ phase }) => phase), ["scratch", "scratch", "scratch", "scratch"]);
  assert.deepEqual(CAT_INTERACTION_SEQUENCES["bed-nap"].map(({ phase }) => phase), ["bed-nap"]);
  assert.deepEqual(CAT_INTERACTION_SEQUENCES.perch.map(({ phase }) => phase), ["perch"]);
  assert.deepEqual(CAT_INTERACTION_SEQUENCES.tree.map(({ phase }) => phase), ["tree-climb", "tree-perch"]);
  assert.deepEqual(CAT_INTERACTION_SEQUENCES["high-five"].map(({ phase }) => phase), ["high-five"]);
  assert.deepEqual(CAT_INTERACTION_SEQUENCES["paw-shake"].map(({ phase }) => phase), ["paw-shake"]);
  assert.deepEqual(CAT_INTERACTION_SEQUENCES.butterfly.map(({ phase }) => phase), ["butterfly-spot", "butterfly-chase"]);
});

test("a new semantic sequence cancels the old timer and completion settles once", () => {
  const callbacks = new Map<number, () => void>();
  const cleared: number[] = [];
  const phases: string[] = [];
  let nextId = 0;
  const scheduler = createCatSequenceScheduler<number>(
    (callback) => { nextId += 1; callbacks.set(nextId, callback); return nextId; },
    (timerId) => { cleared.push(timerId); callbacks.delete(timerId); },
  );
  scheduler.start(CAT_INTERACTION_SEQUENCES.yarn, (step) => phases.push(step.phase), () => phases.push("yarn-done"));
  scheduler.start(CAT_INTERACTION_SEQUENCES.mouse, (step) => phases.push(step.phase), () => phases.push("mouse-done"));
  assert.deepEqual(phases, ["yarn-anticipate", "mouse-stalk"]);
  assert.deepEqual(cleared, [1]);
  callbacks.get(2)?.();
  callbacks.get(3)?.();
  callbacks.get(4)?.();
  assert.deepEqual(phases, ["yarn-anticipate", "mouse-stalk", "mouse-chase", "mouse-pounce", "mouse-done"]);
  assert.equal(scheduler.isActive(), false);
});

test("wand and trick controllers start, cancel, clean up, and reset without durable mutation", () => {
  const callbacks = new Map<number, () => void>();
  const cleared: number[] = [];
  const poses: string[] = [];
  const phases: string[] = [];
  let nextId = 0;
  const controller = createCatActionSequencer(
    (callback) => { nextId += 1; callbacks.set(nextId, callback); return nextId; },
    (timerId) => { cleared.push(timerId); callbacks.delete(timerId); },
  );
  const durable = createEmptyState();
  const before = structuredClone(durable);

  controller.startInteraction("wand", (pose) => poses.push(pose), (phase) => phases.push(phase));
  assert.equal(controller.isActive(), true);
  controller.cancel();
  assert.equal(controller.isActive(), false);
  assert.deepEqual(cleared, [1]);

  controller.startInteraction("high-five", (pose) => poses.push(pose), (phase) => phases.push(phase));
  callbacks.get(2)?.();
  assert.deepEqual(poses, ["wand", "high-five", "sitting"]);
  assert.deepEqual(phases, ["wand-follow", "high-five", "sitting"]);
  assert.deepEqual(durable, before);
});

test("idle waits five minutes, yields to users, reschedules for five-to-ten minutes, and cleans up", () => {
  const callbacks = new Map<number, () => void>();
  const delays: number[] = [];
  const cleared: number[] = [];
  const actions: string[] = [];
  let interacting = true;
  let nextId = 0;
  const scheduler = createCatIdleScheduler<number>({
    clearTimer: (timerId) => { cleared.push(timerId); callbacks.delete(timerId); },
    isInteractionActive: () => interacting,
    onAction: (action) => actions.push(action),
    random: () => 0.5,
    reducedMotion: () => false,
    setTimer: (callback, delayMs) => { nextId += 1; callbacks.set(nextId, callback); delays.push(delayMs); return nextId; },
  });
  scheduler.start();
  assert.deepEqual(delays, [FIRST_CAT_IDLE_DELAY_MS]);
  callbacks.get(1)?.();
  assert.deepEqual(actions, []);
  assert.equal(delays[1], 450_000);
  interacting = false;
  scheduler.noteUserInteraction();
  assert.equal(delays[2], 450_000);
  callbacks.get(3)?.();
  assert.deepEqual(actions, ["walk"]);
  scheduler.cancel();
  assert.ok(cleared.includes(2));
  assert.ok(cleared.includes(4));
});

test("idle delay and reduced-motion action selection stay deterministic", () => {
  assert.equal(randomCatIdleDelay(-1), MIN_CAT_IDLE_DELAY_MS);
  assert.equal(randomCatIdleDelay(1.5), MAX_CAT_IDLE_DELAY_MS);
  assert.equal(idleActionFor(0.4, true), "blink");
  assert.equal(idleActionFor(0.9, true), "sleep");
  assert.notEqual(idleActionFor(0.9, false), "blink");
});
