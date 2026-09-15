const MORNING_SKIP_STORAGE_KEY = "first-move:morning-start-skip:v1";

interface ReadableStorage {
  getItem(key: string): string | null;
}

interface WritableStorage extends ReadableStorage {
  setItem(key: string, value: string): void;
}

export function morningStartSkippedForDate(
  storage: ReadableStorage,
  dateKey: string,
): boolean {
  try {
    return storage.getItem(MORNING_SKIP_STORAGE_KEY) === dateKey;
  } catch {
    return false;
  }
}

export function markMorningStartSkipped(
  storage: WritableStorage,
  dateKey: string,
): void {
  try {
    storage.setItem(MORNING_SKIP_STORAGE_KEY, dateKey);
  } catch {
    // The current in-memory presentation can still advance if storage is blocked.
  }
}
