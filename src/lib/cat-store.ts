import { catItem, isCatItemUnlocked, type CatItemId } from "./cat-items.ts";
import { localDateKey } from "./dates.ts";
import type { AppState } from "./models.ts";
import { roundPoints } from "./rewards.ts";

type IdFactory = () => string;

export type PurchaseResult = { state: AppState; outcome: "purchased" | "insufficient" | "already-owned" | "locked" | "invalid" };

export function purchaseCatItem(
  state: AppState,
  itemId: CatItemId,
  now = new Date(),
  idFactory: IdFactory = () => crypto.randomUUID(),
): PurchaseResult {
  const item = catItem(itemId);
  if (!item || !item.visible) return { state, outcome: "invalid" };
  if (!isCatItemUnlocked(item, state.progress.totalActiveDays)) return { state, outcome: "locked" };
  const owned = inventoryQuantity(state, itemId);
  if (item.kind !== "food" && owned > 0) return { state, outcome: "already-owned" };
  if (state.progress.points < item.price) return { state, outcome: "insufficient" };
  const purchaseId = idFactory();
  const createdAt = now.toISOString();
  return {
    outcome: "purchased",
    state: {
      ...state,
      inventory: {
        ...state.inventory,
        items: setQuantity(state, itemId, owned + 1),
      },
      rewardEvents: [...state.rewardEvents, { id: `store:${purchaseId}`, source: "store", sourceId: itemId, dateKey: localDateKey(now), points: -item.price, createdAt }],
      progress: { ...state.progress, points: roundPoints(state.progress.points - item.price) },
    },
  };
}

export function useFood(state: AppState, itemId: CatItemId): AppState {
  const item = catItem(itemId);
  const quantity = inventoryQuantity(state, itemId);
  if (!item || item.kind !== "food" || quantity < 1) return state;
  return { ...state, inventory: { ...state.inventory, items: setQuantity(state, itemId, quantity - 1) } };
}

export function selectFurniture(state: AppState, itemId: CatItemId): AppState {
  const item = catItem(itemId);
  if (!item || item.kind !== "furniture" || inventoryQuantity(state, itemId) < 1) return state;
  return { ...state, inventory: { ...state.inventory, selectedFurnitureId: itemId } };
}

export function inventoryQuantity(state: AppState, itemId: CatItemId): number {
  return state.inventory.items.find((entry) => entry.itemId === itemId)?.quantity ?? 0;
}

function setQuantity(state: AppState, itemId: CatItemId, quantity: number) {
  const rest = state.inventory.items.filter((entry) => entry.itemId !== itemId);
  return quantity > 0 ? [...rest, { itemId, quantity }] : rest;
}
