import { isDateKey } from "./dates.ts";
import { DIRECTIONS, INTENDED_DURATIONS } from "./models.ts";
import type { PlanningReviewItem, ReviewGroup } from "./planning-review.ts";

export const DAILY_PLAN_STORAGE_KEY = "first-move:daily-plans:v1";

export interface DailyPlanRecord { dateKey: string; items: PlanningReviewItem[] }
export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }

export function loadDailyPlan(storage: Pick<StorageLike, "getItem">, dateKey: string): DailyPlanRecord | undefined {
  try {
    const value: unknown = JSON.parse(storage.getItem(DAILY_PLAN_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(value)) return undefined;
    return value.filter(isDailyPlanRecord).find((plan) => plan.dateKey === dateKey);
  } catch { return undefined; }
}

export function saveDailyPlan(storage: StorageLike, record: DailyPlanRecord): boolean {
  if (!isDailyPlanRecord(record)) return false;
  try {
    const raw: unknown = JSON.parse(storage.getItem(DAILY_PLAN_STORAGE_KEY) ?? "[]");
    const records = Array.isArray(raw) ? raw.filter(isDailyPlanRecord) : [];
    storage.setItem(DAILY_PLAN_STORAGE_KEY, JSON.stringify([...records.filter((plan) => plan.dateKey !== record.dateKey), record]));
    return true;
  } catch { return false; }
}

function isDailyPlanRecord(value: unknown): value is DailyPlanRecord {
  return isRecord(value) && isDateKey(value.dateKey) && Array.isArray(value.items) && value.items.length > 0 && value.items.every(isReviewItem);
}

function isReviewItem(value: unknown): value is PlanningReviewItem {
  return isRecord(value) && typeof value.id === "string" && value.id.length > 0 && isGroup(value.group) && typeof value.title === "string" && typeof value.firstStep === "string" && DIRECTIONS.includes(value.category as never) && INTENDED_DURATIONS.includes(value.durationMinutes as never);
}

function isGroup(value: unknown): value is ReviewGroup { return value === "first-move" || value === "priority" || value === "optional"; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
