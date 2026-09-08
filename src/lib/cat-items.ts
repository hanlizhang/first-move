export const CAT_ITEM_IDS = [
  "kitten-milk",
  "wet-kitten-food",
  "cat-food",
  "cat-treat",
  "freeze-dried-treat",
  "yarn-toy",
  "toy-mouse",
  "teaser-wand",
  "scratching-post",
  "cat-tree",
  "high-five",
  "paw-shake",
  "outdoor-garden",
  "butterfly",
  "cat-bed",
  "window-cushion",
] as const;

export type CatItemId = (typeof CAT_ITEM_IDS)[number];
export type CatItemKind = "food" | "toy" | "furniture" | "trick" | "scene" | "interaction";

export const STORE_CATEGORIES = ["Food", "Treats", "Toys", "Furniture", "Tricks"] as const;
export type StoreCategory = (typeof STORE_CATEGORIES)[number];

export interface CatCatalogItem {
  id: CatItemId;
  name: string;
  price: number;
  kind: CatItemKind;
  category?: StoreCategory;
  unlockActiveDays: number;
  purchaseQuantity: number;
  durable: boolean;
  milestoneOnly: boolean;
  active: boolean;
  description: string;
}

/** Mirrors the canonical inventory_items catalog. Keep this aligned with Mobile and Supabase. */
export const CAT_CATALOG: readonly CatCatalogItem[] = [
  { id: "kitten-milk", name: "Kitten milk", price: 5, kind: "food", category: "Food", unlockActiveDays: 1, purchaseQuantity: 1, durable: false, milestoneOnly: false, active: true, description: "A shallow dish of kitten-safe milk." },
  { id: "wet-kitten-food", name: "Wet kitten food", price: 10, kind: "food", category: "Food", unlockActiveDays: 21, purchaseQuantity: 1, durable: false, milestoneOnly: false, active: true, description: "A soft meal served in a shallow dish." },
  { id: "cat-food", name: "Cat food", price: 10, kind: "food", category: "Food", unlockActiveDays: 35, purchaseQuantity: 1, durable: false, milestoneOnly: false, active: true, description: "A bowl of crunchy kibble." },
  { id: "cat-treat", name: "Soft cat treat", price: 20, kind: "food", category: "Treats", unlockActiveDays: 50, purchaseQuantity: 1, durable: false, milestoneOnly: false, active: true, description: "A soft treat from a small pouch." },
  { id: "freeze-dried-treat", name: "Freeze-dried treat", price: 15, kind: "food", category: "Treats", unlockActiveDays: 50, purchaseQuantity: 1, durable: false, milestoneOnly: false, active: true, description: "A crunchy little treat, one piece at a time." },
  { id: "yarn-toy", name: "Yarn ball", price: 25, kind: "toy", category: "Toys", unlockActiveDays: 3, purchaseQuantity: 1, durable: true, milestoneOnly: false, active: true, description: "Pounce, bat, and roll the ball." },
  { id: "toy-mouse", name: "Toy mouse", price: 35, kind: "toy", category: "Toys", unlockActiveDays: 14, purchaseQuantity: 1, durable: true, milestoneOnly: false, active: true, description: "A small toy to chase and pounce on." },
  { id: "teaser-wand", name: "Teaser wand", price: 40, kind: "toy", category: "Toys", unlockActiveDays: 7, purchaseQuantity: 1, durable: true, milestoneOnly: false, active: true, description: "Guide the wand tip around the room." },
  { id: "scratching-post", name: "Scratching post", price: 80, kind: "furniture", category: "Furniture", unlockActiveDays: 21, purchaseQuantity: 1, durable: true, milestoneOnly: false, active: true, description: "A sturdy spot for a satisfying scratch." },
  { id: "cat-bed", name: "Cat bed", price: 100, kind: "furniture", category: "Furniture", unlockActiveDays: 50, purchaseQuantity: 1, durable: true, milestoneOnly: false, active: true, description: "A cozy bed for peaceful naps." },
  { id: "window-cushion", name: "Window perch", price: 140, kind: "furniture", category: "Furniture", unlockActiveDays: 70, purchaseQuantity: 1, durable: true, milestoneOnly: false, active: true, description: "A sunny perch for watching and resting." },
  { id: "cat-tree", name: "Cat tree", price: 300, kind: "furniture", category: "Furniture", unlockActiveDays: 75, purchaseQuantity: 1, durable: true, milestoneOnly: false, active: true, description: "A tall place to climb, perch, and rest." },
  { id: "high-five", name: "High-five", price: 80, kind: "trick", category: "Tricks", unlockActiveDays: 50, purchaseQuantity: 1, durable: true, milestoneOnly: false, active: true, description: "Meet a raised paw with a hand target." },
  { id: "paw-shake", name: "Paw shake", price: 120, kind: "trick", category: "Tricks", unlockActiveDays: 100, purchaseQuantity: 1, durable: true, milestoneOnly: false, active: true, description: "The seated kitten places a paw in your hand." },
  { id: "outdoor-garden", name: "Outdoor garden", price: 0, kind: "scene", unlockActiveDays: 100, purchaseQuantity: 1, durable: true, milestoneOnly: true, active: true, description: "A sunny garden earned at 100 active days." },
  { id: "butterfly", name: "Butterfly", price: 0, kind: "interaction", unlockActiveDays: 100, purchaseQuantity: 1, durable: true, milestoneOnly: true, active: true, description: "A butterfly to follow through the garden." },
];

export type CatItem = CatCatalogItem & { category: StoreCategory };

export const CAT_ITEMS = CAT_CATALOG.filter(
  (item): item is CatItem => item.active && !item.milestoneOnly && item.category !== undefined,
);

export type MilestoneDay = 21 | 50 | 100;

export const CAT_MILESTONES = [
  { day: 21, name: "Beginning weaning", unlocks: "Wet kitten food", rewardText: "10 free wet-kitten-food servings", grants: [{ itemId: "wet-kitten-food", quantity: 10 }] },
  { day: 50, name: "Cozy companion", unlocks: "Treats, high-five, and cat bed", rewardText: "10 free soft cat treats", grants: [{ itemId: "cat-treat", quantity: 10 }] },
  { day: 100, name: "Adventure-ready", unlocks: "Outdoor garden, butterfly, and paw shake", rewardText: "Free garden and butterfly interaction", grants: [{ itemId: "outdoor-garden", quantity: 1 }, { itemId: "butterfly", quantity: 1 }] },
] as const satisfies ReadonlyArray<{ day: MilestoneDay; name: string; unlocks: string; rewardText: string; grants: ReadonlyArray<{ itemId: CatItemId; quantity: number }> }>;

export const LEGACY_ITEM_ALIASES: Readonly<Record<string, CatItemId>> = { "soft-kitten-food": "cat-food" };

const CAT_ITEM_ID_SET = new Set<string>(CAT_ITEM_IDS);
const CAT_ITEM_BY_ID = new Map(CAT_CATALOG.map((item) => [item.id, item]));

export function catItem(id: string): CatCatalogItem | undefined { return CAT_ITEM_BY_ID.get(id as CatItemId); }
export function isCatItemId(value: unknown): value is CatItemId { return typeof value === "string" && CAT_ITEM_ID_SET.has(value); }
export function isCatItemUnlocked(item: Pick<CatCatalogItem, "unlockActiveDays">, totalActiveDays: number): boolean { return totalActiveDays >= item.unlockActiveDays; }
