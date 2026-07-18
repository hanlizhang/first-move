import { useSyncExternalStore } from "react";

import { createEmptyState, type AppState } from "./models.ts";
import { loadAppState, saveAppState } from "./repository.ts";

const serverSnapshot = createEmptyState();
const listeners = new Set<() => void>();
let browserSnapshot: AppState | undefined;

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getBrowserSnapshot, getServerSnapshot);
}

export function updateAppState(recipe: (current: AppState) => AppState): void {
  if (typeof window === "undefined") return;
  const current = getBrowserSnapshot();
  browserSnapshot = recipe(current);
  saveAppState(window.localStorage, browserSnapshot);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getBrowserSnapshot(): AppState {
  if (browserSnapshot) return browserSnapshot;
  if (typeof window === "undefined") return serverSnapshot;
  browserSnapshot = loadAppState(window.localStorage);
  return browserSnapshot;
}

function getServerSnapshot(): AppState {
  return serverSnapshot;
}
