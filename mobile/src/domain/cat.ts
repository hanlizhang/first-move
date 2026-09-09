import { captureLocalDay, isLocalDateKey } from "./dates.ts";
import { createUuidV4 } from "./ids.ts";
import {
  CAT_CATALOG,
  catItem,
  isCatItemUnlocked,
  type CatCatalogItem,
  type CatItemId,
} from "./cat-items.ts";
import { CAT_INTERACTION_CAPTIONS } from "./cat-interactions.ts";
import type { AppState, InventoryItem, RewardEvent } from "./models.ts";

export type CatPurchaseOutcome =
  | "purchased"
  | "insufficient"
  | "already-owned"
  | "locked"
  | "invalid";
export type CatUseOutcome = "used" | "empty" | "invalid";

export interface CatPurchaseResult {
  state: AppState;
  outcome: CatPurchaseOutcome;
}

export interface CatUseResult {
  state: AppState;
  outcome: CatUseOutcome;
}

export interface OwnedCatItem {
  item: CatCatalogItem;
  quantity: number;
}

export interface CatRoomView {
  points: number;
  stage: string;
  activeDays: number;
  nextUnlock: { day: number; label: string } | undefined;
  growthStory: CatGrowthStory;
  returnMessage?: string;
  ownedFood: OwnedCatItem[];
  ownedToys: OwnedCatItem[];
  ownedFurniture: OwnedCatItem[];
  ownedTricks: OwnedCatItem[];
  ownedScenes: OwnedCatItem[];
  ownedInteractions: OwnedCatItem[];
  selectedFurniture?: CatCatalogItem;
}

export const CAT_POSES = [
  "sitting",
  "walking",
  "sleeping",
  "milk",
  "food",
  "treat",
  "yarn",
  "wand",
  "anticipating",
  "pouncing",
  "mouse",
  "scratching-left",
  "scratching-right",
  "watching",
  "climbing",
  "perched",
  "high-five",
  "paw-shake",
  "butterfly",
  "garden",
] as const;

export type CatPose = (typeof CAT_POSES)[number];

export interface CatGrowthStory {
  title: string;
  description: string;
  nextMilestone?: { day: number; label: string };
}

export interface CatActionDisableState {
  transientInteractionDisabled: boolean;
  economicWriteDisabled: boolean;
}

export const CAT_FEEDING_POSE_DURATION_MS = 5_000;
export const CAT_TRANSIENT_POSE_DURATION_MS = 6_500;

export interface CatPoseReturnScheduler {
  schedule(pose: CatPose, onSit: () => void): void;
  cancel(): void;
}

export const CAT_REACTION_CAPTIONS: Readonly<Record<CatPose, string>> = {
  sitting: CAT_INTERACTION_CAPTIONS.sitting,
  walking: CAT_INTERACTION_CAPTIONS.walking,
  sleeping: CAT_INTERACTION_CAPTIONS.sleeping,
  milk: CAT_INTERACTION_CAPTIONS.milk,
  food: CAT_INTERACTION_CAPTIONS.food,
  treat: CAT_INTERACTION_CAPTIONS.treat,
  yarn: CAT_INTERACTION_CAPTIONS["yarn-action"],
  wand: CAT_INTERACTION_CAPTIONS["wand-follow"],
  anticipating: CAT_INTERACTION_CAPTIONS["yarn-anticipate"],
  pouncing: CAT_INTERACTION_CAPTIONS["wand-pounce"],
  mouse: CAT_INTERACTION_CAPTIONS["mouse-chase"],
  "scratching-left": CAT_INTERACTION_CAPTIONS.scratch,
  "scratching-right": CAT_INTERACTION_CAPTIONS.scratch,
  watching: CAT_INTERACTION_CAPTIONS.perch,
  climbing: CAT_INTERACTION_CAPTIONS["tree-climb"],
  perched: CAT_INTERACTION_CAPTIONS["tree-perch"],
  "high-five": CAT_INTERACTION_CAPTIONS["high-five"],
  "paw-shake": CAT_INTERACTION_CAPTIONS["paw-shake"],
  butterfly: CAT_INTERACTION_CAPTIONS["butterfly-chase"],
  garden: CAT_INTERACTION_CAPTIONS.garden,
};

const CAT_GROWTH_CHAPTERS = [
  {
    day: 1,
    title: "New kitten",
    description: "A new kitten settles in with milk, rest, and short room explorations.",
  },
  {
    day: 21,
    title: "Beginning weaning",
    description: "Wet kitten food joins gentle new mealtimes alongside kitten milk.",
  },
  {
    day: 28,
    title: "Playful kitten",
    description: "Chasing, batting, and pouncing bring more movement to the room.",
  },
  {
    day: 35,
    title: "Curious kitten",
    description: "Reach-and-follow play and scratching add new ways to explore.",
  },
  {
    day: 50,
    title: "Cozy companion",
    description: "Treats, simple tricks, and a favorite sleep spot make the room feel lived in.",
  },
  {
    day: 100,
    title: "Adventure milestone",
    description: "The garden and butterfly open a bigger scene to explore together.",
  },
] as const;

const MEANINGFUL_UNLOCKS = [
  { day: 1, label: "Kitten milk" },
  { day: 3, label: "Yarn ball" },
  { day: 7, label: "Teaser wand" },
  { day: 14, label: "Toy mouse" },
  { day: 21, label: "Wet kitten food, scratching post, and 10 free servings" },
  { day: 35, label: "Cat food" },
  { day: 50, label: "Treats, high-five, cat bed, and 10 free soft treats" },
  { day: 70, label: "Window perch" },
  { day: 75, label: "Cat tree" },
  { day: 100, label: "Garden, butterfly, and paw shake" },
] as const;

export function catActionDisableState({
  localWorkspaceLoaded,
  workspaceEditable,
  actionSaving,
  pendingAuthenticatedWrite,
}: {
  localWorkspaceLoaded: boolean;
  workspaceEditable: boolean;
  actionSaving: boolean;
  pendingAuthenticatedWrite: boolean;
}): CatActionDisableState {
  return {
    transientInteractionDisabled: !localWorkspaceLoaded,
    economicWriteDisabled:
      !workspaceEditable || actionSaving || pendingAuthenticatedWrite,
  };
}

export function catPoseReturnDelayMs(pose: CatPose): number | undefined {
  if (pose === "milk" || pose === "food" || pose === "treat") {
    return CAT_FEEDING_POSE_DURATION_MS;
  }
  if (
    pose === "walking" ||
    pose === "sleeping" ||
    pose === "yarn" ||
    pose === "wand" ||
    pose === "anticipating" ||
    pose === "pouncing" ||
    pose === "mouse" ||
    pose === "scratching-left" ||
    pose === "scratching-right" ||
    pose === "watching" ||
    pose === "climbing" ||
    pose === "perched" ||
    pose === "high-five" ||
    pose === "paw-shake"
  ) {
    return CAT_TRANSIENT_POSE_DURATION_MS;
  }
  return undefined;
}

export function createCatPoseReturnScheduler<TimerId>(
  setTimer: (callback: () => void, delayMs: number) => TimerId,
  clearTimer: (timerId: TimerId) => void,
): CatPoseReturnScheduler {
  let timerId: TimerId | undefined;
  let revision = 0;

  function cancel() {
    revision += 1;
    if (timerId !== undefined) clearTimer(timerId);
    timerId = undefined;
  }

  return {
    schedule(pose, onSit) {
      cancel();
      const delayMs = catPoseReturnDelayMs(pose);
      if (delayMs === undefined) return;
      const scheduledRevision = revision;
      timerId = setTimer(() => {
        if (scheduledRevision !== revision) return;
        timerId = undefined;
        onSit();
      }, delayMs);
    },
    cancel,
  };
}

export function getCatRoomView(state: AppState, today?: string): CatRoomView {
  const owned = CAT_CATALOG.flatMap((item) => {
    const quantity = inventoryQuantity(state, item.id);
    return quantity > 0 ? [{ item, quantity }] : [];
  });
  const selectedFurniture = state.inventory.selectedFurnitureId
    ? catItem(state.inventory.selectedFurnitureId)
    : undefined;

  return {
    points: Math.max(0, roundPoints(state.progress.points)),
    stage: kittenStage(state.progress.totalActiveDays),
    activeDays: state.progress.totalActiveDays,
    nextUnlock: MEANINGFUL_UNLOCKS.find(
      (unlock) => unlock.day > state.progress.totalActiveDays,
    ),
    growthStory: catGrowthStory(state.progress.totalActiveDays),
    returnMessage: gentleCatReturnMessage(state.progress.lastActiveDate, today),
    ownedFood: owned.filter(({ item }) => item.kind === "food"),
    ownedToys: owned.filter(({ item }) => item.kind === "toy"),
    ownedFurniture: owned.filter(({ item }) => item.kind === "furniture"),
    ownedTricks: owned.filter(({ item }) => item.kind === "trick"),
    ownedScenes: owned.filter(({ item }) => item.kind === "scene"),
    ownedInteractions: owned.filter(({ item }) => item.kind === "interaction"),
    selectedFurniture:
      selectedFurniture?.kind === "furniture" &&
      inventoryQuantity(state, selectedFurniture.id) > 0
        ? selectedFurniture
        : undefined,
  };
}

export function kittenStage(totalActiveDays: number): string {
  return catGrowthStory(totalActiveDays).title;
}

export function catGrowthStory(totalActiveDays: number): CatGrowthStory {
  const days = Math.max(0, totalActiveDays);
  const current = [...CAT_GROWTH_CHAPTERS]
    .reverse()
    .find((chapter) => days >= chapter.day) ?? CAT_GROWTH_CHAPTERS[0];
  const next = CAT_GROWTH_CHAPTERS.find((chapter) => chapter.day > days);
  return {
    title: current.title,
    description: current.description,
    nextMilestone: next ? { day: next.day, label: next.title } : undefined,
  };
}

export function catReactionCaption(
  pose: CatPose,
  selectedFurnitureId?: CatItemId,
): string {
  if (pose === "sleeping" && selectedFurnitureId === "cat-bed") {
    return "The kitten curls up in the cat bed for a peaceful nap.";
  }
  if (pose === "sleeping" && selectedFurnitureId === "window-cushion") {
    return "The kitten naps on the window perch in a patch of light.";
  }
  return CAT_REACTION_CAPTIONS[pose];
}

export function gentleCatReturnMessage(
  lastActiveDate?: string,
  today?: string,
): string | undefined {
  if (
    lastActiveDate &&
    today &&
    isLocalDateKey(lastActiveDate) &&
    isLocalDateKey(today) &&
    daysBetween(lastActiveDate, today) > 1
  ) {
    return "Your kitten explored while you were away. Nothing was lost.";
  }
  return undefined;
}

export function purchaseAvailability(
  state: AppState,
  itemId: CatItemId,
): CatPurchaseOutcome | "available" {
  const item = catItem(itemId);
  if (!item?.active || item.milestoneOnly || item.category === undefined) {
    return "invalid";
  }
  if (item.durable && inventoryQuantity(state, itemId) > 0) return "already-owned";
  if (!isCatItemUnlocked(item, state.progress.totalActiveDays)) return "locked";
  if (state.progress.points < item.price) return "insufficient";
  return "available";
}

export function purchaseGuestCatItem(
  state: AppState,
  itemId: CatItemId,
  date = new Date(),
  idFactory: () => string = createUuidV4,
  timezone = captureLocalDay(date).timezone,
): CatPurchaseResult {
  const availability = purchaseAvailability(state, itemId);
  if (availability !== "available") return { state, outcome: availability };
  const item = catItem(itemId)!;
  const currentQuantity = inventoryQuantity(state, itemId);
  const eventId = idFactory();
  const localDay = captureLocalDay(date);
  const reward: RewardEvent = {
    id: `store:${eventId}`,
    source: "store",
    sourceId: itemId,
    dateKey: localDay.localDate,
    timezone,
    points: -item.price,
    createdAt: date.toISOString(),
  };
  const points = Math.max(0, roundPoints(state.progress.points - item.price));
  return {
    outcome: "purchased",
    state: {
      ...state,
      inventory: {
        ...state.inventory,
        items: setInventoryQuantity(
          state.inventory.items,
          itemId,
          currentQuantity + item.purchaseQuantity,
        ),
      },
      rewardEvents: [...state.rewardEvents, reward],
      progress: { ...state.progress, points },
    },
  };
}

export function consumeGuestCatFood(state: AppState, itemId: CatItemId): CatUseResult {
  const item = catItem(itemId);
  if (!item || item.kind !== "food") return { state, outcome: "invalid" };
  const quantity = inventoryQuantity(state, itemId);
  if (quantity < 1) return { state, outcome: "empty" };
  return {
    outcome: "used",
    state: {
      ...state,
      inventory: {
        ...state.inventory,
        items: setInventoryQuantity(state.inventory.items, itemId, quantity - 1),
      },
    },
  };
}

export function canStartCatFoodInteraction(
  state: AppState,
  itemId: CatItemId,
): boolean {
  return catItem(itemId)?.kind === "food" && inventoryQuantity(state, itemId) > 0;
}

export function selectCatFurniture(
  state: AppState,
  itemId?: CatItemId,
): AppState {
  if (itemId === undefined) {
    if (!state.inventory.selectedFurnitureId) return state;
    return {
      ...state,
      inventory: { ...state.inventory, selectedFurnitureId: undefined },
    };
  }
  const item = catItem(itemId);
  if (
    !item ||
    item.kind !== "furniture" ||
    inventoryQuantity(state, itemId) < 1 ||
    state.inventory.selectedFurnitureId === itemId
  ) {
    return state;
  }
  return {
    ...state,
    inventory: { ...state.inventory, selectedFurnitureId: itemId },
  };
}

export function inventoryQuantity(state: AppState, itemId: CatItemId): number {
  return state.inventory.items.find((entry) => entry.itemId === itemId)?.quantity ?? 0;
}

function setInventoryQuantity(
  items: InventoryItem[],
  itemId: CatItemId,
  quantity: number,
): InventoryItem[] {
  const otherItems = items.filter((entry) => entry.itemId !== itemId);
  return quantity > 0 ? [...otherItems, { itemId, quantity }] : otherItems;
}

function daysBetween(first: string, second: string): number {
  const firstTime = Date.parse(`${first}T12:00:00Z`);
  const secondTime = Date.parse(`${second}T12:00:00Z`);
  return Math.round((secondTime - firstTime) / 86_400_000);
}

function roundPoints(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}
