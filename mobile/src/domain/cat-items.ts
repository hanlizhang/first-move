export const CAT_ITEM_IDS = [
  "kitten-milk",
  "cat-food",
  "cat-treat",
  "yarn-toy",
  "teaser-wand",
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
export type CatStoreCategory = "Food" | "Treats" | "Toys" | "Tricks";

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
    description: "A small dish for a quiet snack.",
  },
  {
    id: "cat-food",
    name: "Cat food",
    kind: "food",
    category: "Food",
    price: 10,
    unlockActiveDays: 21,
    purchaseQuantity: 1,
    durable: false,
    milestoneOnly: false,
    active: true,
    description: "A bowl of crunchy kibble.",
  },
  {
    id: "cat-treat",
    name: "Cat treat",
    kind: "food",
    category: "Treats",
    price: 20,
    unlockActiveDays: 50,
    purchaseQuantity: 1,
    durable: false,
    milestoneOnly: false,
    active: true,
    description: "A special treat from a little pouch.",
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
    description: "A soft ball to bat and chase.",
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
    description: "A feather wand for a playful stretch.",
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
    description: "Meet one raised paw.",
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
    description: "The kitten gently offers a paw.",
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
  {
    id: "cat-bed",
    name: "Cat bed",
    kind: "furniture",
    price: 10,
    unlockActiveDays: 0,
    purchaseQuantity: 1,
    durable: true,
    milestoneOnly: false,
    active: false,
    description: "A tucked-away legacy bed.",
  },
  {
    id: "window-cushion",
    name: "Window cushion",
    kind: "furniture",
    price: 14,
    unlockActiveDays: 0,
    purchaseQuantity: 1,
    durable: true,
    milestoneOnly: false,
    active: false,
    description: "A tucked-away legacy window seat.",
  },
];

export const CAT_STORE_CATEGORIES = ["Food", "Treats", "Toys", "Tricks"] as const;
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
