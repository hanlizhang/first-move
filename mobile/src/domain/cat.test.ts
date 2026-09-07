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
  catGrowthStory,
  catReactionCaption,
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
    day: 21,
    label: "Cat food and 10 free servings",
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

test("every visible kitten pose has gentle matching copy", () => {
  for (const pose of CAT_POSES) {
    assert.ok(catReactionCaption(pose).length > 20, pose);
  }
  assert.match(catReactionCaption("sleeping", "cat-bed"), /cat bed/);
  assert.match(catReactionCaption("sleeping", "window-cushion"), /window cushion/);
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
