export const STORE_CATEGORIES = ["Food", "Treats", "Toys", "Tricks"] as const;
export type StoreCategory = (typeof STORE_CATEGORIES)[number];

export const CAT_ITEMS = [
  { id: "kitten-milk", name: "Kitten milk", price: 1, kind: "food", category: "Food", unlockActiveDays: 1, description: "A tiny carton for a cozy snack.", visible: true },
  { id: "cat-food", name: "Cat food", price: 3, kind: "food", category: "Food", unlockActiveDays: 21, description: "A simple everyday bowl.", visible: true },
  { id: "cat-treat", name: "Cat treat", price: 1, kind: "food", category: "Treats", unlockActiveDays: 3, description: "One small celebratory bite.", visible: true },
  { id: "yarn-toy", name: "Yarn ball", price: 6, kind: "toy", category: "Toys", unlockActiveDays: 7, description: "For a short, playful pounce.", visible: true },
  { id: "high-five", name: "High-five", price: 8, kind: "trick", category: "Tricks", unlockActiveDays: 50, description: "Teach one cheerful little trick.", visible: true },
] as const;

const LEGACY_CAT_ITEMS = [
  { id: "soft-kitten-food", name: "Soft kitten food", price: 2, kind: "food", visible: false },
  { id: "cat-bed", name: "Cat bed", price: 10, kind: "furniture", visible: false },
  { id: "window-cushion", name: "Window cushion", price: 14, kind: "furniture", visible: false },
] as const;

const ALL_CAT_ITEMS = [...CAT_ITEMS, ...LEGACY_CAT_ITEMS] as const;

export type CatItem = (typeof CAT_ITEMS)[number];
export type CatItemId = (typeof ALL_CAT_ITEMS)[number]["id"];
export type CatItemKind = (typeof ALL_CAT_ITEMS)[number]["kind"];

export function catItem(id: string): (typeof ALL_CAT_ITEMS)[number] | undefined {
  return ALL_CAT_ITEMS.find((item) => item.id === id);
}

export function isCatItemId(value: unknown): value is CatItemId {
  return typeof value === "string" && ALL_CAT_ITEMS.some((item) => item.id === value);
}

export function isCatItemUnlocked(item: CatItem, totalActiveDays: number): boolean {
  return totalActiveDays >= item.unlockActiveDays;
}
