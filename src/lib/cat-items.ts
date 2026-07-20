export const STORE_CATEGORIES = ["Food", "Treats", "Toys", "Tricks"] as const;
export type StoreCategory = (typeof STORE_CATEGORIES)[number];

export const CAT_ITEMS = [
  { id: "kitten-milk", name: "Kitten milk", price: 5, kind: "food", category: "Food", unlockActiveDays: 1, purchaseQuantity: 1, description: "A shallow dish of kitten-safe milk.", visible: true },
  { id: "cat-food", name: "Cat food", price: 10, kind: "food", category: "Food", unlockActiveDays: 21, purchaseQuantity: 1, description: "A bowl of crunchy kibble.", visible: true },
  { id: "cat-treat", name: "Cat treat", price: 20, kind: "food", category: "Treats", unlockActiveDays: 50, purchaseQuantity: 1, description: "A lickable treat from a small pouch.", visible: true },
  { id: "yarn-toy", name: "Yarn ball", price: 25, kind: "toy", category: "Toys", unlockActiveDays: 3, purchaseQuantity: 1, description: "Pounce, bat, and roll the ball.", visible: true },
  { id: "teaser-wand", name: "Teaser wand", price: 40, kind: "toy", category: "Toys", unlockActiveDays: 7, purchaseQuantity: 1, description: "Guide the wand tip around the room.", visible: true },
  { id: "high-five", name: "High-five", price: 80, kind: "trick", category: "Tricks", unlockActiveDays: 50, purchaseQuantity: 1, description: "Meet a raised paw with a hand target.", visible: true },
  { id: "paw-shake", name: "Paw shake", price: 120, kind: "trick", category: "Tricks", unlockActiveDays: 100, purchaseQuantity: 1, description: "The seated kitten places a paw in your hand.", visible: true },
] as const;

const HIDDEN_ITEMS = [
  { id: "outdoor-garden", name: "Outdoor garden", price: 0, kind: "scene", visible: false },
  { id: "butterfly", name: "Butterfly", price: 0, kind: "interaction", visible: false },
  { id: "soft-kitten-food", name: "Soft kitten food", price: 2, kind: "food", visible: false },
  { id: "cat-bed", name: "Cat bed", price: 10, kind: "furniture", visible: false },
  { id: "window-cushion", name: "Window cushion", price: 14, kind: "furniture", visible: false },
] as const;

const ALL_CAT_ITEMS = [...CAT_ITEMS, ...HIDDEN_ITEMS] as const;
export type CatItem = (typeof CAT_ITEMS)[number];
export type CatItemId = (typeof ALL_CAT_ITEMS)[number]["id"];
export type CatItemKind = (typeof ALL_CAT_ITEMS)[number]["kind"];
export type MilestoneDay = 21 | 50 | 100;

export const CAT_MILESTONES = [
  { day: 21, name: "Everyday meals", unlocks: "Cat food", rewardText: "10 free cat-food servings", grants: [{ itemId: "cat-food", quantity: 10 }] },
  { day: 50, name: "Playful partner", unlocks: "Cat treats and high-five", rewardText: "10 free treats", grants: [{ itemId: "cat-treat", quantity: 10 }] },
  { day: 100, name: "Adventure-ready", unlocks: "Outdoor garden, butterfly, and paw shake", rewardText: "Free garden and butterfly interaction", grants: [{ itemId: "outdoor-garden", quantity: 1 }, { itemId: "butterfly", quantity: 1 }] },
] as const satisfies ReadonlyArray<{ day: MilestoneDay; name: string; unlocks: string; rewardText: string; grants: ReadonlyArray<{ itemId: CatItemId; quantity: number }> }>;

export const LEGACY_ITEM_ALIASES: Readonly<Record<string, CatItemId>> = { "soft-kitten-food": "cat-food" };

export function catItem(id: string): (typeof ALL_CAT_ITEMS)[number] | undefined { return ALL_CAT_ITEMS.find((item) => item.id === id); }
export function isCatItemId(value: unknown): value is CatItemId { return typeof value === "string" && ALL_CAT_ITEMS.some((item) => item.id === value); }
export function isCatItemUnlocked(item: CatItem, totalActiveDays: number): boolean { return totalActiveDays >= item.unlockActiveDays; }
