import { createEmptyState, type AppState } from "./models.ts";
import { normalizeAppState } from "./app-state.ts";

export const STORAGE_KEY = "first-move:app-state";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadAppState(storage: StorageLike): AppState {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return raw ? normalizeAppState(JSON.parse(raw) as unknown) : createEmptyState();
  } catch {
    return createEmptyState();
  }
}

export function saveAppState(storage: StorageLike, state: AppState): boolean {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(normalizeAppState(state)));
    return true;
  } catch {
    return false;
  }
}
