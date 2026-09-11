import assert from "node:assert/strict";
import test from "node:test";

import { validateCanonicalWorkspace } from "../cloud/canonical-workspace.ts";
import {
  createMobileRepositoryWithStore,
  type AsyncKeyValueStore,
} from "../local/repository-core.ts";
import { canonicalPayload, USER_ID } from "../test-fixtures/canonical.ts";
import {
  CAT_POSES,
  CAT_FEEDING_POSE_DURATION_MS,
  CAT_TRANSIENT_POSE_DURATION_MS,
  catActionDisableState,
  catGrowthStory,
  catPoseReturnDelayMs,
  catReactionCaption,
  canStartCatFoodInteraction,
  createCatPoseReturnScheduler,
  getCatRoomView,
  inventoryQuantity,
  kittenStage,
  purchaseAvailability,
  purchaseGuestCatItem,
  selectCatFurniture,
  consumeGuestCatFood,
} from "./cat.ts";
import { CAT_STORE_ITEMS, isCatItemUnlocked } from "./cat-items.ts";
import { createEmptyState } from "./models.ts";

const NOW = new Date("2026-09-06T10:00:00.000Z");

function memoryStore(): AsyncKeyValueStore {
  const values = new Map<string, string>();
  return {
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
  };
}

test("Cat Room view renders Guest points, stage, next unlock, and owned categories", () => {
  const state = createEmptyState();
  state.progress = { ...state.progress, points: 100, totalActiveDays: 7 };
  state.inventory.items = [
    { itemId: "kitten-milk", quantity: 3 },
    { itemId: "yarn-toy", quantity: 1 },
    { itemId: "cat-bed", quantity: 1 },
  ];
  state.inventory.selectedFurnitureId = "cat-bed";

  const room = getCatRoomView(state, "2026-09-06");
  assert.equal(room.points, 100);
  assert.equal(room.stage, "New kitten");
  assert.deepEqual(room.nextUnlock, {
    day: 14,
    label: "Toy mouse",
  });
  assert.equal(room.ownedFood[0]?.quantity, 3);
  assert.equal(room.ownedToys[0]?.item.id, "yarn-toy");
  assert.equal(room.selectedFurniture?.id, "cat-bed");
  assert.equal(room.returnMessage, undefined);
});

test("Cat Room view renders validated authenticated canonical points and inventory", () => {
  const canonical = validateCanonicalWorkspace(canonicalPayload());
  const room = getCatRoomView(canonical.state, "2026-07-29");
  assert.equal(room.points, 5);
  assert.equal(room.activeDays, 1);
  assert.equal(room.ownedFood[0]?.item.id, "kitten-milk");
  assert.equal(room.ownedFood[0]?.quantity, 2);
});

test("store unlocks use exact active-day boundaries and kitten stages do not decay", () => {
  for (const item of CAT_STORE_ITEMS) {
    assert.equal(isCatItemUnlocked(item, item.unlockActiveDays), true);
    if (item.unlockActiveDays > 0) {
      assert.equal(isCatItemUnlocked(item, item.unlockActiveDays - 1), false);
    }
  }
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
});

test("pending authenticated writes disable economic actions but not loaded transient interactions", () => {
  assert.deepEqual(
    catActionDisableState({
      localWorkspaceLoaded: true,
      workspaceEditable: true,
      actionSaving: false,
      pendingAuthenticatedWrite: true,
    }),
    {
      transientInteractionDisabled: false,
      economicWriteDisabled: true,
    },
  );
  assert.deepEqual(
    catActionDisableState({
      localWorkspaceLoaded: true,
      workspaceEditable: false,
      actionSaving: false,
      pendingAuthenticatedWrite: false,
    }),
    {
      transientInteractionDisabled: false,
      economicWriteDisabled: true,
    },
  );
  assert.equal(
    catActionDisableState({
      localWorkspaceLoaded: false,
      workspaceEditable: true,
      actionSaving: false,
      pendingAuthenticatedWrite: false,
    }).transientInteractionDisabled,
    true,
  );
  assert.deepEqual(
    catActionDisableState({
      localWorkspaceLoaded: true,
      workspaceEditable: true,
      actionSaving: true,
      pendingAuthenticatedWrite: false,
    }),
    {
      transientInteractionDisabled: false,
      economicWriteDisabled: true,
    },
  );
});

test("temporary Cat poses use deterministic return durations", () => {
  for (const pose of ["milk", "wet-food", "food", "treat", "freeze-dried-treat"] as const) {
    assert.equal(catPoseReturnDelayMs(pose), CAT_FEEDING_POSE_DURATION_MS, pose);
  }
  for (const pose of [
    "walking",
    "sleeping",
    "yarn",
    "wand",
    "high-five",
    "paw-shake",
  ] as const) {
    assert.equal(catPoseReturnDelayMs(pose), CAT_TRANSIENT_POSE_DURATION_MS, pose);
  }
  assert.equal(catPoseReturnDelayMs("sitting"), undefined);
  assert.equal(catPoseReturnDelayMs("garden"), undefined);
});

test("Cat pose return scheduling replaces stale timers and cancels cleanly", () => {
  const callbacks = new Map<number, () => void>();
  const cleared: number[] = [];
  const delays: number[] = [];
  let nextTimerId = 0;
  let sittingCount = 0;
  const scheduler = createCatPoseReturnScheduler(
    (callback, delayMs) => {
      nextTimerId += 1;
      callbacks.set(nextTimerId, callback);
      delays.push(delayMs);
      return nextTimerId;
    },
    (timerId) => cleared.push(timerId),
  );

  scheduler.schedule("milk", () => {
    sittingCount += 1;
  });
  const staleCallback = callbacks.get(1);
  scheduler.schedule("yarn", () => {
    sittingCount += 1;
  });
  assert.deepEqual(delays, [
    CAT_FEEDING_POSE_DURATION_MS,
    CAT_TRANSIENT_POSE_DURATION_MS,
  ]);
  assert.deepEqual(cleared, [1]);
  staleCallback?.();
  assert.equal(sittingCount, 0);

  callbacks.get(2)?.();
  assert.equal(sittingCount, 1);
  scheduler.schedule("walking", () => {
    sittingCount += 1;
  });
  const cancelledCallback = callbacks.get(3);
  scheduler.cancel();
  assert.deepEqual(cleared, [1, 3]);
  cancelledCallback?.();
  assert.equal(sittingCount, 1);

  scheduler.schedule("sitting", () => {
    sittingCount += 1;
  });
  assert.equal(delays.length, 3);
});

test("feeding pose eligibility validates owned local food without mutating inventory", () => {
  const state = createEmptyState();
  state.inventory.items = [{ itemId: "kitten-milk", quantity: 1 }];
  const before = structuredClone(state);
  assert.equal(canStartCatFoodInteraction(state, "kitten-milk"), true);
  assert.equal(canStartCatFoodInteraction(state, "cat-food"), false);
  assert.equal(canStartCatFoodInteraction(state, "yarn-toy"), false);
  assert.deepEqual(state, before);
});

test("growth story follows symbolic active-day chapters without changing catalog unlocks", () => {
  assert.equal(catGrowthStory(1).title, "New kitten");
  assert.equal(catGrowthStory(21).title, "Beginning weaning");
  assert.equal(catGrowthStory(28).title, "Playful kitten");
  assert.equal(catGrowthStory(35).title, "Curious kitten");
  assert.equal(catGrowthStory(50).title, "Cozy companion");
  assert.equal(catGrowthStory(100).title, "Adventure milestone");
  assert.deepEqual(catGrowthStory(27).nextMilestone, {
    day: 28,
    label: "Playful kitten",
  });
});

test("day-21 progression points to wet kitten food without rewriting owned cat food", () => {
  const beforeDay21 = createEmptyState();
  beforeDay21.progress = {
    ...beforeDay21.progress,
    totalActiveDays: 20,
  };
  assert.deepEqual(getCatRoomView(beforeDay21).nextUnlock, {
    day: 21,
    label: "Wet kitten food, scratching post, and 10 free servings",
  });

  const day21 = createEmptyState();
  day21.progress = { ...day21.progress, totalActiveDays: 21 };
  day21.inventory.items = [{ itemId: "cat-food", quantity: 10 }];
  const room = getCatRoomView(day21);
  assert.equal(room.growthStory.title, "Beginning weaning");
  assert.match(room.growthStory.description, /Wet kitten food/);
  assert.deepEqual(room.nextUnlock, {
    day: 35,
    label: "Cat food",
  });
  assert.deepEqual(room.ownedFood.map(({ item, quantity }) => [item.id, quantity]), [
    ["cat-food", 10],
  ]);
});

test("every visible kitten pose has gentle matching copy", () => {
  for (const pose of CAT_POSES) {
    assert.ok(catReactionCaption(pose).length > 10, pose);
  }
  assert.match(catReactionCaption("sleeping", "cat-bed"), /cat bed/);
  assert.match(catReactionCaption("sleeping", "window-cushion"), /window perch/);
});

test("Guest purchase prevents insufficient and negative balances", () => {
  const state = createEmptyState();
  state.progress = { ...state.progress, points: 4, totalActiveDays: 100 };
  assert.equal(purchaseAvailability(state, "kitten-milk"), "insufficient");
  const result = purchaseGuestCatItem(state, "kitten-milk", NOW);
  assert.equal(result.outcome, "insufficient");
  assert.equal(result.state.progress.points, 4);
  assert.equal(result.state.rewardEvents.length, 0);
  assert.ok(result.state.progress.points >= 0);
});

test("Guest durable ownership is one-time while consumable quantities repeat and decrease", () => {
  const state = createEmptyState();
  state.progress = { ...state.progress, points: 100, totalActiveDays: 50 };
  const yarn = purchaseGuestCatItem(
    state,
    "yarn-toy",
    NOW,
    () => "10000000-0000-4000-8000-000000000001",
  );
  assert.equal(yarn.outcome, "purchased");
  assert.equal(inventoryQuantity(yarn.state, "yarn-toy"), 1);
  assert.equal(purchaseGuestCatItem(yarn.state, "yarn-toy", NOW).outcome, "already-owned");

  const firstMilk = purchaseGuestCatItem(
    yarn.state,
    "kitten-milk",
    NOW,
    () => "10000000-0000-4000-8000-000000000002",
  );
  const secondMilk = purchaseGuestCatItem(
    firstMilk.state,
    "kitten-milk",
    NOW,
    () => "10000000-0000-4000-8000-000000000003",
  );
  assert.equal(inventoryQuantity(secondMilk.state, "kitten-milk"), 2);
  const used = consumeGuestCatFood(secondMilk.state, "kitten-milk");
  assert.equal(used.outcome, "used");
  assert.equal(inventoryQuantity(used.state, "kitten-milk"), 1);
  assert.equal(consumeGuestCatFood(used.state, "yarn-toy").outcome, "invalid");
});

test("new foods can be purchased repeatedly and consumed with their approved unlocks", () => {
  const state = createEmptyState();
  state.progress = { ...state.progress, points: 100, totalActiveDays: 50 };

  const wetFood = purchaseGuestCatItem(
    state,
    "wet-kitten-food",
    NOW,
    () => "10000000-0000-4000-8000-000000000010",
  );
  const firstTreat = purchaseGuestCatItem(
    wetFood.state,
    "freeze-dried-treat",
    NOW,
    () => "10000000-0000-4000-8000-000000000011",
  );
  const secondTreat = purchaseGuestCatItem(
    firstTreat.state,
    "freeze-dried-treat",
    NOW,
    () => "10000000-0000-4000-8000-000000000012",
  );

  assert.equal(wetFood.outcome, "purchased");
  assert.equal(secondTreat.outcome, "purchased");
  assert.equal(inventoryQuantity(secondTreat.state, "wet-kitten-food"), 1);
  assert.equal(inventoryQuantity(secondTreat.state, "freeze-dried-treat"), 2);
  assert.equal(consumeGuestCatFood(secondTreat.state, "wet-kitten-food").outcome, "used");
  const consumedTreat = consumeGuestCatFood(secondTreat.state, "freeze-dried-treat");
  assert.equal(consumedTreat.outcome, "used");
  assert.equal(inventoryQuantity(consumedTreat.state, "freeze-dried-treat"), 1);
});

test("new durable toys and furniture enforce unlocks and one-time ownership", () => {
  const state = createEmptyState();
  state.progress = { ...state.progress, points: 1_000, totalActiveDays: 13 };
  assert.equal(purchaseAvailability(state, "toy-mouse"), "locked");
  assert.equal(purchaseAvailability(state, "scratching-post"), "locked");
  assert.equal(purchaseAvailability(state, "cat-tree"), "locked");

  const day14 = {
    ...state,
    progress: { ...state.progress, totalActiveDays: 14 },
  };
  assert.equal(purchaseAvailability(day14, "toy-mouse"), "available");
  assert.equal(purchaseAvailability(day14, "scratching-post"), "locked");

  const day21 = {
    ...state,
    progress: { ...state.progress, totalActiveDays: 21 },
  };
  assert.equal(purchaseAvailability(day21, "scratching-post"), "available");

  const unlocked = {
    ...state,
    progress: { ...state.progress, totalActiveDays: 100 },
  };
  for (const itemId of ["toy-mouse", "scratching-post", "cat-tree"] as const) {
    const purchased = purchaseGuestCatItem(
      unlocked,
      itemId,
      NOW,
      () => `10000000-0000-4000-8000-0000000000${itemId.length}`,
    );
    assert.equal(purchased.outcome, "purchased", itemId);
    assert.equal(inventoryQuantity(purchased.state, itemId), 1, itemId);
    assert.equal(purchaseGuestCatItem(purchased.state, itemId, NOW).outcome, "already-owned", itemId);
  }
});

test("historically owned durable items remain usable below current purchase thresholds", () => {
  const state = createEmptyState();
  state.progress = { ...state.progress, points: 1_000, totalActiveDays: 1 };
  state.inventory.items = [
    { itemId: "yarn-toy", quantity: 1 },
    { itemId: "teaser-wand", quantity: 1 },
    { itemId: "high-five", quantity: 1 },
    { itemId: "paw-shake", quantity: 1 },
    { itemId: "cat-tree", quantity: 1 },
    { itemId: "outdoor-garden", quantity: 1 },
    { itemId: "butterfly", quantity: 1 },
  ];
  state.inventory.selectedFurnitureId = "cat-tree";

  const room = getCatRoomView(state);
  assert.deepEqual(room.ownedToys.map(({ item }) => item.id), [
    "yarn-toy",
    "teaser-wand",
  ]);
  assert.deepEqual(room.ownedTricks.map(({ item }) => item.id), [
    "high-five",
    "paw-shake",
  ]);
  assert.equal(room.ownedScenes[0]?.item.id, "outdoor-garden");
  assert.equal(room.ownedInteractions[0]?.item.id, "butterfly");
  assert.equal(room.selectedFurniture?.id, "cat-tree");
  assert.equal(purchaseAvailability(state, "yarn-toy"), "already-owned");
  assert.equal(purchaseAvailability(state, "cat-tree"), "already-owned");
});

test("Guest purchases and food use persist without entering account storage", async () => {
  const repository = createMobileRepositoryWithStore(memoryStore());
  await repository.updateGuestWorkspace((state) => ({
    ...state,
    progress: { ...state.progress, points: 20, totalActiveDays: 1 },
  }));
  await repository.updateGuestWorkspace(
    (state) =>
      purchaseGuestCatItem(
        state,
        "kitten-milk",
        NOW,
        () => "10000000-0000-4000-8000-000000000004",
      ).state,
  );
  await repository.updateGuestWorkspace(
    (state) => consumeGuestCatFood(state, "kitten-milk").state,
  );

  const guest = await repository.loadGuestWorkspace();
  const account = await repository.loadLocalWorkspace({ kind: "account", userId: USER_ID });
  assert.equal(guest.progress.points, 15);
  assert.equal(inventoryQuantity(guest, "kitten-milk"), 0);
  assert.equal(account.progress.points, 0);
  assert.equal(account.inventory.items.length, 0);
});

test("owned furniture selection persists and rejects unowned furniture", async () => {
  const repository = createMobileRepositoryWithStore(memoryStore());
  await repository.updateGuestWorkspace((state) => ({
    ...state,
    inventory: { items: [{ itemId: "cat-bed", quantity: 1 }] },
  }));
  await repository.updateGuestWorkspace((state) => selectCatFurniture(state, "cat-bed"));
  assert.equal((await repository.loadGuestWorkspace()).inventory.selectedFurnitureId, "cat-bed");

  await repository.updateGuestWorkspace((state) =>
    selectCatFurniture(state, "window-cushion"),
  );
  assert.equal((await repository.loadGuestWorkspace()).inventory.selectedFurnitureId, "cat-bed");
});

test("missed days only change the gentle message and never remove progress or belongings", () => {
  const state = createEmptyState();
  state.progress = {
    ...state.progress,
    points: 42,
    totalActiveDays: 22,
    activeDateKeys: ["2026-09-01"],
    lastActiveDate: "2026-09-01",
  };
  state.inventory.items = [
    { itemId: "cat-food", quantity: 4 },
    { itemId: "yarn-toy", quantity: 1 },
  ];
  const before = structuredClone(state);
  const room = getCatRoomView(state, "2026-09-06");
  assert.match(room.returnMessage ?? "", /Nothing was lost/);
  assert.deepEqual(state, before);
  assert.equal(room.points, 42);
  assert.equal(room.activeDays, 22);
  assert.equal(room.ownedFood[0]?.quantity, 4);
  assert.equal(room.ownedToys[0]?.quantity, 1);
});
