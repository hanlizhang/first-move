import { useSyncExternalStore } from "react";

import { createEmptyState, type AppState } from "./models.ts";
import { loadAppState, saveAppState } from "./repository.ts";

const serverSnapshot = createEmptyState();
const listeners = new Set<() => void>();
const mutationListeners = new Set<(previous: AppState, next: AppState) => void>();
let browserSnapshot: AppState | undefined;

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getBrowserSnapshot, getServerSnapshot);
}

export function updateAppState(recipe: (current: AppState) => AppState): void {
  if (typeof window === "undefined") return;
  const current = getBrowserSnapshot();
  const next = recipe(current);
  if (next === current) return;
  browserSnapshot = next;
  saveAppState(window.localStorage, browserSnapshot);
  listeners.forEach((listener) => listener());
  mutationListeners.forEach((listener) => listener(current, next));
}

export function replaceAppState(state: AppState, persist = true): boolean {
  if (typeof window === "undefined") return false;
  if (persist && !saveAppState(window.localStorage, state)) return false;
  browserSnapshot = state;
  listeners.forEach((listener) => listener());
  return true;
}

export function subscribeAppStateMutations(listener: (previous: AppState, next: AppState) => void): () => void {
  mutationListeners.add(listener);
  return () => mutationListeners.delete(listener);
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
