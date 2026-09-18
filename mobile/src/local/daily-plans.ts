import { normalizeDailyPlans, upsertDailyPlan } from "../domain/day-planning.ts";
import type { DailyPlanRecord } from "../domain/models.ts";
import type { AsyncKeyValueStore } from "./repository-core.ts";

export const GUEST_DAILY_PLANS_KEY = "first-move:mobile:guest:daily-plans:v1";

export async function loadGuestDailyPlans(
  store: AsyncKeyValueStore,
): Promise<DailyPlanRecord[]> {
  try {
    const raw = await store.getItem(GUEST_DAILY_PLANS_KEY);
    if (!raw) return [];
    return normalizeDailyPlans(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

export async function saveGuestDailyPlan(
  store: AsyncKeyValueStore,
  plan: DailyPlanRecord,
): Promise<DailyPlanRecord[]> {
  const current = await loadGuestDailyPlans(store);
  const next = upsertDailyPlan(current, plan);
  if (next === current) throw new Error("The daily plan is invalid.");
  await store.setItem(GUEST_DAILY_PLANS_KEY, JSON.stringify(next));
  return next;
}
