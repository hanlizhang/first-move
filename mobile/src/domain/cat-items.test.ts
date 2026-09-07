import assert from "node:assert/strict";
import test from "node:test";

import { normalizeAppState } from "./app-state.ts";
import {
  CAT_CATALOG,
  CAT_ITEM_IDS,
  CAT_STORE_CATEGORIES,
  CAT_STORE_ITEMS,
  canonicalCatItemId,
  type CatCatalogItem,
  type CatItemId,
} from "./cat-items.ts";

type ExpectedCatalogRow = Pick<
  CatCatalogItem,
  | "name"
  | "kind"
  | "category"
  | "price"
  | "unlockActiveDays"
  | "purchaseQuantity"
  | "durable"
  | "milestoneOnly"
  | "active"
>;

const EXPECTED_CATALOG: Readonly<Record<CatItemId, ExpectedCatalogRow>> = {
  "kitten-milk": row("Kitten milk", "food", "Food", 5, 1, false),
  "wet-kitten-food": row("Wet kitten food", "food", "Food", 10, 21, false),
  "cat-food": row("Cat food", "food", "Food", 10, 35, false),
  "cat-treat": row("Soft cat treat", "food", "Treats", 20, 50, false),
  "freeze-dried-treat": row("Freeze-dried treat", "food", "Treats", 15, 50, false),
  "yarn-toy": row("Yarn ball", "toy", "Toys", 25, 3, true),
  "toy-mouse": row("Toy mouse", "toy", "Toys", 35, 14, true),
  "teaser-wand": row("Teaser wand", "toy", "Toys", 40, 7, true),
  "scratching-post": row("Scratching post", "furniture", "Furniture", 80, 21, true),
  "cat-tree": row("Cat tree", "furniture", "Furniture", 300, 75, true),
  "high-five": row("High-five", "trick", "Tricks", 80, 50, true),
  "paw-shake": row("Paw shake", "trick", "Tricks", 120, 100, true),
  "outdoor-garden": row("Outdoor garden", "scene", undefined, 0, 100, true, true),
  butterfly: row("Butterfly", "interaction", undefined, 0, 100, true, true),
  "cat-bed": row("Cat bed", "furniture", "Furniture", 100, 50, true),
  "window-cushion": row("Window perch", "furniture", "Furniture", 140, 70, true),
};

const EXPECTED_DESCRIPTIONS: Readonly<Record<CatItemId, string>> = {
  "kitten-milk": "A shallow dish of kitten-safe milk.",
  "wet-kitten-food": "A soft meal served in a shallow dish.",
  "cat-food": "A bowl of crunchy kibble.",
  "cat-treat": "A soft treat from a small pouch.",
  "freeze-dried-treat": "A crunchy little treat, one piece at a time.",
  "yarn-toy": "Pounce, bat, and roll the ball.",
  "toy-mouse": "A small toy to chase and pounce on.",
  "teaser-wand": "Guide the wand tip around the room.",
  "scratching-post": "A sturdy spot for a satisfying scratch.",
  "cat-tree": "A tall place to climb, perch, and rest.",
  "high-five": "Meet a raised paw with a hand target.",
  "paw-shake": "The seated kitten places a paw in your hand.",
  "outdoor-garden": "A sunny garden earned at 100 active days.",
  butterfly: "A butterfly to follow through the garden.",
  "cat-bed": "A cozy bed for peaceful naps.",
  "window-cushion": "A sunny perch for watching and resting.",
};

test("Mobile Cat catalog matches the approved rows exactly", () => {
  assert.equal(CAT_CATALOG.length, CAT_ITEM_IDS.length);
  assert.deepEqual(new Set(CAT_CATALOG.map((item) => item.id)), new Set(CAT_ITEM_IDS));

  for (const item of CAT_CATALOG) {
    const { description: _description, id: _id, ...actual } = item;
    assert.deepEqual(actual, EXPECTED_CATALOG[item.id], item.id);
    assert.equal(item.description, EXPECTED_DESCRIPTIONS[item.id], item.id);
  }
});

test("the store visibly includes Furniture and excludes milestone-only rewards", () => {
  assert.deepEqual(CAT_STORE_CATEGORIES, [
    "Food",
    "Treats",
    "Toys",
    "Furniture",
    "Tricks",
  ]);
  assert.deepEqual(
    CAT_STORE_ITEMS.filter((item) => item.category === "Furniture").map((item) => item.id),
    ["scratching-post", "cat-bed", "window-cushion", "cat-tree"],
  );
  assert.equal(CAT_STORE_ITEMS.some((item) => item.milestoneOnly), false);
});

test("historical and newly approved inventory IDs survive local hydration", () => {
  const state = normalizeAppState({
    inventory: {
      items: [
        { itemId: "cat-food", quantity: 4 },
        { itemId: "soft-kitten-food", quantity: 2 },
        { itemId: "cat-bed", quantity: 3 },
        { itemId: "window-cushion", quantity: 1 },
        { itemId: "wet-kitten-food", quantity: 10 },
        { itemId: "freeze-dried-treat", quantity: 2 },
        { itemId: "toy-mouse", quantity: 1 },
        { itemId: "scratching-post", quantity: 1 },
        { itemId: "cat-tree", quantity: 1 },
      ],
      selectedFurnitureId: "cat-tree",
    },
  });

  assert.deepEqual(state.inventory, {
    items: [
      { itemId: "cat-food", quantity: 6 },
      { itemId: "cat-bed", quantity: 1 },
      { itemId: "window-cushion", quantity: 1 },
      { itemId: "wet-kitten-food", quantity: 10 },
      { itemId: "freeze-dried-treat", quantity: 2 },
      { itemId: "toy-mouse", quantity: 1 },
      { itemId: "scratching-post", quantity: 1 },
      { itemId: "cat-tree", quantity: 1 },
    ],
    selectedFurnitureId: "cat-tree",
  });
  assert.equal(canonicalCatItemId("soft-kitten-food"), "cat-food");
});

function row(
  name: string,
  kind: CatCatalogItem["kind"],
  category: CatCatalogItem["category"],
  price: number,
  unlockActiveDays: number,
  durable: boolean,
  milestoneOnly = false,
): ExpectedCatalogRow {
  return {
    name,
    kind,
    ...(category === undefined ? {} : { category }),
    price,
    unlockActiveDays,
    purchaseQuantity: 1,
    durable,
    milestoneOnly,
    active: true,
  };
}
