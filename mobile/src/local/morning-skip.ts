import AsyncStorage from "@react-native-async-storage/async-storage";

import { isLocalDateKey } from "../domain/dates.ts";
import type { AsyncKeyValueStore } from "./repository-core.ts";

export const MOBILE_MORNING_SKIP_KEY_PREFIX = "first-move:mobile:morning-skip:v1:";

export async function loadMorningSkip(ownerKey: string): Promise<string | undefined> {
  return loadMorningSkipFrom(AsyncStorage, ownerKey);
}

export async function markMorningSkipped(ownerKey: string, dateKey: string): Promise<void> {
  return markMorningSkippedIn(AsyncStorage, ownerKey, dateKey);
}

export async function loadMorningSkipFrom(
  store: AsyncKeyValueStore,
  ownerKey: string,
): Promise<string | undefined> {
  try {
    const value = await store.getItem(storageKey(ownerKey));
    return value && isLocalDateKey(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export async function markMorningSkippedIn(
  store: AsyncKeyValueStore,
  ownerKey: string,
  dateKey: string,
): Promise<void> {
  if (!isLocalDateKey(dateKey)) return;
  try {
    await store.setItem(storageKey(ownerKey), dateKey);
  } catch {
    // In-memory presentation can still advance if device storage is unavailable.
  }
}

function storageKey(ownerKey: string): string {
  return `${MOBILE_MORNING_SKIP_KEY_PREFIX}${ownerKey}`;
}
