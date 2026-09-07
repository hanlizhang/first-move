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
export type CatItemKind =
  | "food"
  | "toy"
  | "furniture"
  | "trick"
  | "scene"
  | "interaction";
export type CatStoreCategory =
  | "Food"
  | "Treats"
  | "Toys"
  | "Furniture"
  | "Tricks";

export interface CatCatalogItem {
  id: CatItemId;
  name: string;
  kind: CatItemKind;
  price: number;
  unlockActiveDays: number;
  purchaseQuantity: number;
  durable: boolean;
  milestoneOnly: boolean;
  active: boolean;
  category?: CatStoreCategory;
  description: string;
}

/** Mirrors the deployed inventory_items rows. Keep this aligned with Web and Supabase. */
export const CAT_CATALOG: readonly CatCatalogItem[] = [
  {
    id: "kitten-milk",
    name: "Kitten milk",
    kind: "food",
    category: "Food",
    price: 5,
    unlockActiveDays: 1,
    purchaseQuantity: 1,
    durable: false,
    milestoneOnly: false,
    active: true,
    description: "A shallow dish of kitten-safe milk.",
  },
  {
    id: "wet-kitten-food",
    name: "Wet kitten food",
    kind: "food",
    category: "Food",
    price: 10,
    unlockActiveDays: 21,
    purchaseQuantity: 1,
    durable: false,
    milestoneOnly: false,
    active: true,
    description: "A soft meal served in a shallow dish.",
  },
  {
    id: "cat-food",
    name: "Cat food",
    kind: "food",
    category: "Food",
    price: 10,
    unlockActiveDays: 35,
    purchaseQuantity: 1,
    durable: false,
    milestoneOnly: false,
    active: true,
    description: "A bowl of crunchy kibble.",
  },
  {
    id: "cat-treat",
    name: "Soft cat treat",
    kind: "food",
    category: "Treats",
    price: 20,
    unlockActiveDays: 50,
    purchaseQuantity: 1,
    durable: false,
    milestoneOnly: false,
    active: true,
    description: "A soft treat from a small pouch.",
  },
  {
    id: "freeze-dried-treat",
    name: "Freeze-dried treat",
    kind: "food",
    category: "Treats",
    price: 15,
    unlockActiveDays: 50,
    purchaseQuantity: 1,
    durable: false,
    milestoneOnly: false,
    active: true,
    description: "A crunchy little treat, one piece at a time.",
  },
  {
    id: "yarn-toy",
    name: "Yarn ball",
    kind: "toy",
    category: "Toys",
    price: 25,
    unlockActiveDays: 3,
    purchaseQuantity: 1,
    durable: true,
    milestoneOnly: false,
    active: true,
    description: "Pounce, bat, and roll the ball.",
  },
  {
    id: "toy-mouse",
    name: "Toy mouse",
    kind: "toy",
    category: "Toys",
    price: 35,
    unlockActiveDays: 14,
    purchaseQuantity: 1,
    durable: true,
    milestoneOnly: false,
    active: true,
    description: "A small toy to chase and pounce on.",
  },
  {
    id: "teaser-wand",
    name: "Teaser wand",
    kind: "toy",
    category: "Toys",
    price: 40,
    unlockActiveDays: 7,
    purchaseQuantity: 1,
    durable: true,
    milestoneOnly: false,
    active: true,
    description: "Guide the wand tip around the room.",
  },
  {
    id: "scratching-post",
    name: "Scratching post",
    kind: "furniture",
    category: "Furniture",
    price: 80,
    unlockActiveDays: 21,
    purchaseQuantity: 1,
    durable: true,
    milestoneOnly: false,
    active: true,
    description: "A sturdy spot for a satisfying scratch.",
  },
  {
    id: "cat-bed",
    name: "Cat bed",
    kind: "furniture",
    category: "Furniture",
    price: 100,
    unlockActiveDays: 50,
    purchaseQuantity: 1,
    durable: true,
    milestoneOnly: false,
    active: true,
    description: "A cozy bed for peaceful naps.",
  },
  {
    id: "window-cushion",
    name: "Window perch",
    kind: "furniture",
    category: "Furniture",
    price: 140,
    unlockActiveDays: 70,
    purchaseQuantity: 1,
    durable: true,
    milestoneOnly: false,
    active: true,
    description: "A sunny perch for watching and resting.",
  },
  {
    id: "cat-tree",
    name: "Cat tree",
    kind: "furniture",
    category: "Furniture",
    price: 300,
    unlockActiveDays: 75,
    purchaseQuantity: 1,
    durable: true,
    milestoneOnly: false,
    active: true,
    description: "A tall place to climb, perch, and rest.",
  },
  {
    id: "high-five",
    name: "High-five",
    kind: "trick",
    category: "Tricks",
    price: 80,
    unlockActiveDays: 50,
    purchaseQuantity: 1,
    durable: true,
    milestoneOnly: false,
    active: true,
    description: "Meet a raised paw with a hand target.",
  },
  {
    id: "paw-shake",
    name: "Paw shake",
    kind: "trick",
    category: "Tricks",
    price: 120,
    unlockActiveDays: 100,
    purchaseQuantity: 1,
    durable: true,
    milestoneOnly: false,
    active: true,
    description: "The seated kitten places a paw in your hand.",
  },
  {
    id: "outdoor-garden",
    name: "Outdoor garden",
    kind: "scene",
    price: 0,
    unlockActiveDays: 100,
    purchaseQuantity: 1,
    durable: true,
    milestoneOnly: true,
    active: true,
    description: "A sunny garden earned at 100 active days.",
  },
  {
    id: "butterfly",
    name: "Butterfly",
    kind: "interaction",
    price: 0,
    unlockActiveDays: 100,
    purchaseQuantity: 1,
    durable: true,
    milestoneOnly: true,
    active: true,
    description: "A butterfly to follow through the garden.",
  },
];

export const CAT_STORE_CATEGORIES = [
  "Food",
  "Treats",
  "Toys",
  "Furniture",
  "Tricks",
] as const;
export const CAT_STORE_ITEMS = CAT_CATALOG.filter(
  (item): item is CatCatalogItem & { category: CatStoreCategory } =>
    item.active && !item.milestoneOnly && item.category !== undefined,
);

const CAT_ITEM_ID_SET = new Set<string>(CAT_ITEM_IDS);
const CAT_ITEM_BY_ID = new Map(CAT_CATALOG.map((item) => [item.id, item]));

export const LEGACY_CAT_ITEM_ALIASES: Readonly<Record<string, CatItemId>> = {
  "soft-kitten-food": "cat-food",
};

export function isCatItemId(value: unknown): value is CatItemId {
  return typeof value === "string" && CAT_ITEM_ID_SET.has(value);
}

export function catItem(id: string): CatCatalogItem | undefined {
  return CAT_ITEM_BY_ID.get(id as CatItemId);
}

export function canonicalCatItemId(value: string): CatItemId | undefined {
  if (isCatItemId(value)) return value;
  return LEGACY_CAT_ITEM_ALIASES[value];
}

export function isCatItemUnlocked(
  item: Pick<CatCatalogItem, "unlockActiveDays">,
  totalActiveDays: number,
): boolean {
  return totalActiveDays >= item.unlockActiveDays;
}
