import assert from "node:assert/strict";
import test from "node:test";

import type { CatItemId } from "./cat-items.ts";
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

test("Cat v1B captions and item mappings use the shared interaction semantics", () => {
  assert.deepEqual(CAT_INTERACTION_CAPTIONS, {
    sitting: "The kitten sits nearby, cozy and curious.",
    walking: "The kitten pads softly around the room.",
    sleeping: "The kitten curls up for a peaceful nap.",
    milk: "The kitten laps milk from a shallow dish.",
    food: "The kitten eats from the little bowl.",
    treat: "The kitten tastes a treat from the pouch.",
    "wand-follow": "Eyes locked on the moving teaser.",
    "wand-pounce": "Almost got it.",
    "yarn-anticipate": "The yarn ball has the kitten's full attention.",
    "yarn-action": "A paw bats the yarn across the floor.",
    "yarn-settle": "The kitten settles beside the yarn ball.",
    "mouse-stalk": "The toy mouse has been spotted.",
    "mouse-chase": "A quiet stalk turns into a quick chase.",
    "mouse-pounce": "Paws land beside the toy mouse.",
    scratch: "Scratch, stretch, scratch.",
    "bed-nap": "This looks like a good place for a nap.",
    perch: "The kitten watches the world from the window.",
    "tree-climb": "Up the cat tree, one step at a time.",
    "tree-perch": "Higher is apparently better.",
    "high-five": "One tiny paw meets your hand.",
    "paw-shake": "The kitten places one paw gently in your hand.",
    garden: "The kitten explores the garden, one soft step at a time.",
    "butterfly-spot": "Something fluttered past.",
    "butterfly-chase": "The kitten follows the butterfly through the garden.",
  });
  assert.deepEqual(CAT_ITEM_INTERACTION_MAP, {
    "yarn-toy": "yarn",
    "toy-mouse": "mouse",
    "teaser-wand": "wand",
    "scratching-post": "scratch",
    "cat-bed": "bed-nap",
    "window-cushion": "perch",
    "cat-tree": "tree",
    "high-five": "high-five",
    "paw-shake": "paw-shake",
    "outdoor-garden": "garden",
    butterfly: "butterfly",
  });
});

test("normalized targets clamp to padded room bounds and invalid layouts return home", () => {
  assert.deepEqual(clampNormalizedRoomPoint({ x: -4, y: 8 }), {
    x: CAT_TARGET_PADDING,
    y: 1 - CAT_TARGET_PADDING,
  });
  assert.deepEqual(normalizedRoomPoint(-20, 500, 200, 250), {
    x: CAT_TARGET_PADDING,
    y: 1 - CAT_TARGET_PADDING,
  });
  assert.deepEqual(normalizedRoomPoint(1, 1, 0, 0), CAT_HOME_POINT);
  assert.deepEqual(
    clampNormalizedRoomPoint({ x: 0.5, y: 0.5 }, Number.POSITIVE_INFINITY),
    { x: 0.5, y: 0.5 },
  );
});

test("wand following uses bounded steps, facing, proximity, and reduced-motion immobility", () => {
  const current = { x: 0.5, y: 0.5 };
  const target = { x: 0.9, y: 0.5 };
  const next = stepTowardRoomPoint(current, target);
  assert.ok(Math.abs(roomPointDistance(current, next) - CAT_WAND_STEP) < 0.000_001);
  assert.deepEqual(next, { x: 0.62, y: 0.5 });
  assert.deepEqual(stepTowardRoomPoint(current, target, CAT_WAND_STEP, false), current);
  assert.equal(facingTowardRoomPoint(current, target), "right");
  assert.equal(facingTowardRoomPoint(current, { x: 0.1, y: 0.5 }), "left");
  assert.equal(facingTowardRoomPoint(current, { x: 0.501, y: 0.5 }, "left"), "left");

  const closeTarget = { x: current.x + CAT_WAND_POUNCE_DISTANCE, y: current.y };
  assert.equal(shouldWandPounce(current, closeTarget, 0.72), true);
  assert.equal(shouldWandPounce(current, closeTarget, 0.71), false);
  assert.equal(shouldWandPounce(current, { x: 0.8, y: 0.8 }, 1), false);
});

test("yarn, mouse, furniture, tricks, and butterfly have distinct finite sequences", () => {
  assert.deepEqual(
    CAT_INTERACTION_SEQUENCES.yarn.map(({ phase }) => phase),
    ["yarn-anticipate", "yarn-action", "yarn-settle"],
  );
  assert.deepEqual(
    CAT_INTERACTION_SEQUENCES.mouse.map(({ phase }) => phase),
    ["mouse-stalk", "mouse-chase", "mouse-pounce"],
  );
  assert.equal(CAT_INTERACTION_SEQUENCES.scratch.length, 4);
  assert.deepEqual(
    CAT_INTERACTION_SEQUENCES.tree.map(({ phase }) => phase),
    ["tree-climb", "tree-perch"],
  );
  assert.deepEqual(
    CAT_INTERACTION_SEQUENCES.butterfly.map(({ phase }) => phase),
    ["butterfly-spot", "butterfly-chase"],
  );
  assert.notDeepEqual(CAT_INTERACTION_SEQUENCES.yarn, CAT_INTERACTION_SEQUENCES.mouse);
  assert.notEqual(
    CAT_INTERACTION_SEQUENCES["high-five"][0]?.phase,
    CAT_INTERACTION_SEQUENCES["paw-shake"][0]?.phase,
  );
});

test("ownership gates interactions without mutating inventory inputs", () => {
  const owned: CatItemId[] = [
    "yarn-toy",
    "toy-mouse",
    "teaser-wand",
    "scratching-post",
    "cat-bed",
    "window-cushion",
    "cat-tree",
    "high-five",
    "paw-shake",
    "outdoor-garden",
    "butterfly",
  ];
  const before = [...owned];
  assert.deepEqual(catInteractionAvailability(owned, "window-cushion"), {
    butterfly: true,
    garden: true,
    highFive: true,
    mouse: true,
    pawShake: true,
    perch: true,
    scratch: true,
    tree: false,
    wand: true,
    yarn: true,
  });
  assert.equal(catInteractionAvailability(owned, "cat-tree").tree, true);
  assert.equal(catInteractionAvailability(["butterfly"]).butterfly, false);
  assert.deepEqual(owned, before);
});

test("sequence scheduling replaces stale interactions, completes, and cancels cleanly", () => {
  const callbacks = new Map<number, () => void>();
  const cleared: number[] = [];
  let nextTimerId = 0;
  const phases: string[] = [];
  let completions = 0;
  const scheduler = createCatSequenceScheduler(
    (callback, _delayMs) => {
      nextTimerId += 1;
      callbacks.set(nextTimerId, callback);
      return nextTimerId;
    },
    (timerId) => cleared.push(timerId),
  );

  scheduler.start(
    CAT_INTERACTION_SEQUENCES.yarn,
    (step) => phases.push(step.phase),
    () => {
      completions += 1;
    },
  );
  const staleYarnTimer = callbacks.get(1);
  assert.equal(scheduler.isActive(), true);

  scheduler.start(
    CAT_INTERACTION_SEQUENCES["high-five"],
    (step) => phases.push(step.phase),
    () => {
      completions += 1;
    },
  );
  assert.deepEqual(cleared, [1]);
  staleYarnTimer?.();
  assert.deepEqual(phases, ["yarn-anticipate", "high-five"]);
  assert.equal(completions, 0);
  callbacks.get(2)?.();
  assert.equal(completions, 1);
  assert.equal(scheduler.isActive(), false);

  scheduler.start(
    CAT_INTERACTION_SEQUENCES["paw-shake"],
    (step) => phases.push(step.phase),
    () => {
      completions += 1;
    },
  );
  const cancelledTimer = callbacks.get(3);
  scheduler.cancel();
  cancelledTimer?.();
  assert.deepEqual(cleared, [1, 3]);
  assert.equal(completions, 1);
  assert.equal(scheduler.isActive(), false);
});

test("idle scheduling waits five minutes, repeats in the five-to-ten-minute range, and cleans up", () => {
  const callbacks = new Map<number, () => void>();
  const cleared: number[] = [];
  const delays: number[] = [];
  const actions: string[] = [];
  const randomValues = [0.4, 0.5, 1];
  let nextTimerId = 0;
  let interactionActive = false;
  const scheduler = createCatIdleScheduler({
    clearTimer: (timerId: number) => cleared.push(timerId),
    isInteractionActive: () => interactionActive,
    onAction: (action) => actions.push(action),
    random: () => randomValues.shift() ?? 0,
    reducedMotion: () => false,
    setTimer: (callback, delayMs) => {
      nextTimerId += 1;
      callbacks.set(nextTimerId, callback);
      delays.push(delayMs);
      return nextTimerId;
    },
  });

  scheduler.start();
  assert.deepEqual(delays, [FIRST_CAT_IDLE_DELAY_MS]);
  callbacks.get(1)?.();
  assert.deepEqual(actions, ["walk"]);
  assert.equal(delays[1], 7.5 * 60_000);

  interactionActive = true;
  callbacks.get(2)?.();
  assert.deepEqual(actions, ["walk"]);
  assert.equal(delays[2], MAX_CAT_IDLE_DELAY_MS);

  scheduler.noteUserInteraction();
  assert.equal(cleared.at(-1), 3);
  assert.equal(delays.at(-1), MIN_CAT_IDLE_DELAY_MS);
  scheduler.cancel();
  assert.equal(cleared.at(-1), 4);
  callbacks.get(4)?.();
  assert.deepEqual(actions, ["walk"]);
});

test("reduced-motion idle choices never translate through an automatic walk", () => {
  assert.equal(idleActionFor(0, true), "blink");
  assert.equal(idleActionFor(0.99, true), "sleep");
  for (const sample of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
    assert.notEqual(idleActionFor(sample, true), "walk");
  }
  assert.equal(randomCatIdleDelay(-1), MIN_CAT_IDLE_DELAY_MS);
  assert.equal(randomCatIdleDelay(2), MAX_CAT_IDLE_DELAY_MS);
});
