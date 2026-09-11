import assert from "node:assert/strict";
import test from "node:test";

import {
  CAT_HOME_POINT,
  CAT_INTERACTION_CAPTIONS,
  CAT_INTERACTION_SEQUENCES,
  CAT_ITEM_INTERACTION_MAP,
  CAT_QA_PREVIEW_DAYS,
  CAT_QA_PREVIEW_ITEM_IDS,
  CAT_ROOM_LAYOUT,
  CAT_FOOD_VISUAL_BY_ITEM_ID,
  CAT_TARGET_PADDING,
  CAT_WAND_POUNCE_DISTANCE,
  CAT_WAND_STEP,
  FIRST_CAT_IDLE_DELAY_MS,
  MAX_CAT_IDLE_DELAY_MS,
  MIN_CAT_IDLE_DELAY_MS,
  catQaPreviewEnabled,
  catButterflyFollowSteps,
  catFoodVisualFor,
  catInteractionAvailability,
  catMouseChaseSteps,
  catRoomScrollTarget,
  catScratchingPostPlacement,
  catYarnPlaySteps,
  clampRoomPointToArea,
  clampNormalizedRoomPoint,
  createCatIdleScheduler,
  createCatSequenceScheduler,
  facingTowardRoomPoint,
  idleActionFor,
  normalizedRoomPoint,
  projectCatQaPreview,
  randomCatIdleDelay,
  roomPointDistance,
  isRoomPointInArea,
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
  CAT_QA_PREVIEW_DAYS as MOBILE_CAT_QA_PREVIEW_DAYS,
  CAT_QA_PREVIEW_ITEM_IDS as MOBILE_CAT_QA_PREVIEW_ITEM_IDS,
  CAT_ROOM_LAYOUT as MOBILE_CAT_ROOM_LAYOUT,
  CAT_FOOD_VISUAL_BY_ITEM_ID as MOBILE_CAT_FOOD_VISUAL_BY_ITEM_ID,
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
  assert.deepEqual(CAT_QA_PREVIEW_DAYS, MOBILE_CAT_QA_PREVIEW_DAYS);
  assert.deepEqual(CAT_QA_PREVIEW_ITEM_IDS, MOBILE_CAT_QA_PREVIEW_ITEM_IDS);
  assert.deepEqual(CAT_HOME_POINT, MOBILE_CAT_HOME_POINT);
  assert.deepEqual(Object.keys(CAT_ROOM_LAYOUT).sort(), Object.keys(MOBILE_CAT_ROOM_LAYOUT).sort());
  assert.equal(CAT_ROOM_LAYOUT.floorY, MOBILE_CAT_ROOM_LAYOUT.floorY);
  assert.deepEqual(CAT_ROOM_LAYOUT.catTreeMidPlatform, MOBILE_CAT_ROOM_LAYOUT.catTreeMidPlatform);
  assert.deepEqual(CAT_ROOM_LAYOUT.catTreeTopPlatform, MOBILE_CAT_ROOM_LAYOUT.catTreeTopPlatform);
  assert.deepEqual(CAT_FOOD_VISUAL_BY_ITEM_ID, MOBILE_CAT_FOOD_VISUAL_BY_ITEM_ID);
  assert.equal(CAT_TARGET_PADDING, MOBILE_CAT_TARGET_PADDING);
  assert.equal(CAT_WAND_STEP, MOBILE_CAT_WAND_STEP);
  assert.equal(CAT_WAND_POUNCE_DISTANCE, MOBILE_CAT_WAND_POUNCE_DISTANCE);
  assert.equal(FIRST_CAT_IDLE_DELAY_MS, MOBILE_FIRST_CAT_IDLE_DELAY_MS);
  assert.equal(MIN_CAT_IDLE_DELAY_MS, MOBILE_MIN_CAT_IDLE_DELAY_MS);
  assert.equal(MAX_CAT_IDLE_DELAY_MS, MOBILE_MAX_CAT_IDLE_DELAY_MS);
});

test("Cat QA preview is development-gated and keeps unlock day separate from ownership", () => {
  assert.equal(catQaPreviewEnabled(false), false);
  assert.equal(catQaPreviewEnabled(true), true);
  assert.deepEqual(CAT_QA_PREVIEW_DAYS, [1, 3, 7, 14, 21, 35, 50, 70, 75, 100]);
  assert.deepEqual(CAT_QA_PREVIEW_ITEM_IDS, [
    "kitten-milk", "wet-kitten-food", "cat-food", "cat-treat", "freeze-dried-treat",
    "yarn-toy", "toy-mouse", "teaser-wand", "scratching-post", "cat-bed",
    "window-cushion", "cat-tree", "high-five", "paw-shake", "outdoor-garden", "butterfly",
  ]);

  const canonical = {
    activeDays: 3,
    ownedItemIds: ["yarn-toy"] as const,
    selectedFurnitureId: undefined,
  };
  const preview = {
    activeDay: 100 as const,
    ownedItemIds: ["cat-tree", "butterfly"] as const,
    selectedFurnitureId: "cat-tree" as const,
  };
  const canonicalBefore = structuredClone(canonical);
  const previewBefore = structuredClone(preview);
  const projected = projectCatQaPreview(canonical, preview, true);

  assert.deepEqual(projected, {
    active: true,
    activeDays: 100,
    ownedItemIds: ["yarn-toy", "cat-tree", "butterfly"],
    selectedFurnitureId: "cat-tree",
  });
  assert.deepEqual(canonical, canonicalBefore);
  assert.deepEqual(preview, previewBefore);
});

test("production mode ignores every Cat QA preview field", () => {
  const canonical = {
    activeDays: 14,
    ownedItemIds: ["toy-mouse"] as const,
    selectedFurnitureId: undefined,
  };
  assert.deepEqual(projectCatQaPreview(canonical, {
    activeDay: 100,
    ownedItemIds: ["outdoor-garden", "butterfly"],
    selectedFurnitureId: null,
  }, false), {
    active: false,
    activeDays: 14,
    ownedItemIds: ["toy-mouse"],
    selectedFurnitureId: undefined,
  });
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

test("semantic room anchors keep furniture supports and play targets inside one bounded room", () => {
  const anchors = [
    CAT_ROOM_LAYOUT.catHome,
    CAT_ROOM_LAYOUT.bedAnchor,
    CAT_ROOM_LAYOUT.butterflySpotAnchor,
    CAT_ROOM_LAYOUT.butterflyFollowAnchor,
    CAT_ROOM_LAYOUT.scratchingPostAnchor,
    CAT_ROOM_LAYOUT.windowPerchAnchor,
    CAT_ROOM_LAYOUT.catTreeFloorAnchor,
    CAT_ROOM_LAYOUT.catTreeMidAnchor,
    CAT_ROOM_LAYOUT.catTreeTopAnchor,
  ];
  for (const point of anchors) {
    assert.ok(point.x >= 0 && point.x <= 1);
    assert.ok(point.y >= 0 && point.y <= 1);
  }
  assert.equal(CAT_ROOM_LAYOUT.catHome.y, CAT_ROOM_LAYOUT.floorY);
  assert.equal(CAT_ROOM_LAYOUT.bedAnchor.y, CAT_ROOM_LAYOUT.floorY);
  assert.equal(CAT_ROOM_LAYOUT.scratchingPostAnchor.y, CAT_ROOM_LAYOUT.floorY);
  assert.equal(CAT_ROOM_LAYOUT.catTreeFloorAnchor.y, CAT_ROOM_LAYOUT.floorY);
  assert.ok(CAT_ROOM_LAYOUT.windowPerchAnchor.y < CAT_ROOM_LAYOUT.floorY);
  assert.ok(CAT_ROOM_LAYOUT.catTreeTopAnchor.y < CAT_ROOM_LAYOUT.catTreeMidAnchor.y);
  assert.ok(roomPointDistance(CAT_ROOM_LAYOUT.bedAnchor, CAT_ROOM_LAYOUT.catHome) < 0.2);
});

test("scratch, bed, window, and tree interaction positions contact their visible supports", () => {
  const scratch = catScratchingPostPlacement();
  assert.equal(facingTowardRoomPoint(scratch.cat, scratch.target), "right");
  assert.ok(roomPointDistance(scratch.cat, scratch.target) <= 0.1 + Number.EPSILON);
  assert.deepEqual(CAT_ROOM_LAYOUT.bedAnchor, { x: 0.34, y: CAT_ROOM_LAYOUT.floorY });
  assert.deepEqual(CAT_ROOM_LAYOUT.windowPerchAnchor, { x: 0.28, y: 0.38 });
  assert.deepEqual(CAT_ROOM_LAYOUT.catTreeMidAnchor, { x: 0.31, y: 0.51 });
  assert.deepEqual(CAT_ROOM_LAYOUT.catTreeTopAnchor, { x: 0.23, y: 0.29 });
  assert.ok(isRoomPointInArea(CAT_ROOM_LAYOUT.catTreeMidAnchor, CAT_ROOM_LAYOUT.catTreeMidPlatform));
  assert.ok(isRoomPointInArea(CAT_ROOM_LAYOUT.catTreeTopAnchor, CAT_ROOM_LAYOUT.catTreeTopPlatform));
});

test("mouse and yarn placements preserve target-facing direction, contact, and proximity", () => {
  const mouse = catMouseChaseSteps();
  assert.equal(facingTowardRoomPoint(mouse[0]!.cat, mouse[0]!.target), "left");
  assert.equal(facingTowardRoomPoint(mouse[1]!.cat, mouse[1]!.target), "right");
  assert.equal(facingTowardRoomPoint(mouse[2]!.cat, mouse[2]!.target), "right");
  assert.ok(mouse[1]!.target.x > mouse[1]!.cat.x);
  assert.ok(mouse[2]!.target.x > mouse[2]!.cat.x);
  assert.ok(roomPointDistance(mouse[2]!.cat, mouse[2]!.target) <= 0.056);
  for (const step of mouse) {
    assert.ok(isRoomPointInArea(step.target, CAT_ROOM_LAYOUT.mousePlayArea));
  }

  const butterfly = catButterflyFollowSteps();
  assert.deepEqual(butterfly.map(({ target }) => target), [
    CAT_ROOM_LAYOUT.butterflySpotAnchor,
    CAT_ROOM_LAYOUT.butterflyFollowAnchor,
  ]);
  for (const step of butterfly) {
    assert.equal(facingTowardRoomPoint(step.cat, step.target), "right");
  }

  const yarn = catYarnPlaySteps();
  for (const step of yarn) {
    assert.ok(isRoomPointInArea(step.target, CAT_ROOM_LAYOUT.toyPlayArea));
    assert.ok(roomPointDistance(step.cat, step.target) <= 0.101);
  }
});

test("wand area clamps long pointer travel and room scrolling happens only when needed", () => {
  assert.deepEqual(
    clampRoomPointToArea({ x: 1, y: 1 }, CAT_ROOM_LAYOUT.wandPlayArea),
    { x: CAT_ROOM_LAYOUT.wandPlayArea.right, y: CAT_ROOM_LAYOUT.wandPlayArea.bottom },
  );
  assert.equal(catRoomScrollTarget({ currentScrollY: 500, roomHeight: 300, roomTop: 20, viewportHeight: 600 }), undefined);
  assert.equal(catRoomScrollTarget({ currentScrollY: 500, roomHeight: 300, roomTop: -250, viewportHeight: 600 }), 234);
  assert.equal(catRoomScrollTarget({ currentScrollY: 500, roomHeight: 300, roomTop: 620, viewportHeight: 600 }), 1_104);
});

test("all five foods map to distinct production visual variants", () => {
  const visuals = [
    catFoodVisualFor("kitten-milk"),
    catFoodVisualFor("wet-kitten-food"),
    catFoodVisualFor("cat-food"),
    catFoodVisualFor("cat-treat"),
    catFoodVisualFor("freeze-dried-treat"),
  ];
  assert.deepEqual(visuals, ["milk", "wet-food", "kibble", "soft-treat", "freeze-dried-treat"]);
  assert.equal(new Set(visuals).size, 5);
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
  assert.deepEqual(CAT_INTERACTION_SEQUENCES.scratch.map(({ phase }) => phase), ["scratch", "scratch", "scratch"]);
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
