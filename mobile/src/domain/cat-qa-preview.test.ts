import assert from "node:assert/strict";
import test from "node:test";

import { createCatQaPreviewWorkspace } from "./cat-qa-preview.ts";
import { createEmptyState } from "./models.ts";

test("Cat QA workspace projection cannot alter canonical business state", () => {
  const canonical = createEmptyState();
  canonical.progress.points = 42;
  canonical.progress.totalActiveDays = 3;
  canonical.inventory.items = [{ itemId: "yarn-toy", quantity: 1 }];
  const before = structuredClone(canonical);

  const projected = createCatQaPreviewWorkspace(canonical, {
    active: true,
    activeDays: 100,
    ownedItemIds: ["yarn-toy", "outdoor-garden", "butterfly"],
    selectedFurnitureId: undefined,
  });

  assert.notEqual(projected, canonical);
  assert.equal(projected.progress.totalActiveDays, 100);
  assert.equal(projected.progress.points, 42);
  assert.equal(projected.rewardEvents.length, 0);
  assert.deepEqual(projected.inventory.items, [
    { itemId: "yarn-toy", quantity: 1 },
    { itemId: "outdoor-garden", quantity: 1 },
    { itemId: "butterfly", quantity: 1 },
  ]);
  assert.deepEqual(canonical, before);
});

test("inactive Cat QA projection preserves the production workspace identity", () => {
  const canonical = createEmptyState();
  assert.equal(createCatQaPreviewWorkspace(canonical, {
    active: false,
    activeDays: 100,
    ownedItemIds: ["cat-tree"],
    selectedFurnitureId: "cat-tree",
  }), canonical);
});
