import { isCatItemId } from "./cat-items.ts";
import type { CatQaPreviewProjection } from "./cat-interactions.ts";
import type { AppState } from "./models.ts";

/** Builds an in-memory render input only. Callers must never persist this projection. */
export function createCatQaPreviewWorkspace(
  canonical: AppState,
  preview: CatQaPreviewProjection,
): AppState {
  if (!preview.active) return canonical;

  const previewOwnedIds = new Set(preview.ownedItemIds);
  const presentIds = new Set<string>();
  const items = canonical.inventory.items.map((entry) => {
    presentIds.add(entry.itemId);
    return isCatItemId(entry.itemId) && previewOwnedIds.has(entry.itemId) && entry.quantity < 1
      ? { ...entry, quantity: 1 }
      : entry;
  });
  for (const itemId of preview.ownedItemIds) {
    if (!presentIds.has(itemId)) items.push({ itemId, quantity: 1 });
  }

  return {
    ...canonical,
    inventory: {
      ...canonical.inventory,
      items,
      selectedFurnitureId: preview.selectedFurnitureId,
    },
    progress: {
      ...canonical.progress,
      totalActiveDays: preview.activeDays,
    },
  };
}
