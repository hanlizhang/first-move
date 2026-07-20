import assert from "node:assert/strict";
import test from "node:test";

import { createMockDayPlan } from "./day-planning.ts";
import { DAILY_PLAN_STORAGE_KEY, loadDailyPlan, saveDailyPlan } from "./daily-plan-state.ts";
import { planToReviewItems } from "./planning-review.ts";

function memory(initial?: string) { let value = initial ?? null; return { getItem: () => value, setItem: (_key: string, next: string) => { value = next; } }; }

test("confirmed daily plan persists once and can be reopened for review", () => {
  const storage = memory(); const record = { dateKey: "2026-07-20", items: planToReviewItems(createMockDayPlan("write report\nwalk")) };
  assert.equal(saveDailyPlan(storage, record), true);
  assert.deepEqual(loadDailyPlan(storage, record.dateKey), record);
});

test("daily plan storage safely ignores malformed data and another date", () => {
  assert.equal(loadDailyPlan(memory("not json"), "2026-07-20"), undefined);
  const storage = memory(JSON.stringify([{ dateKey: "bad", items: [] }]));
  assert.equal(loadDailyPlan(storage, "2026-07-20"), undefined);
  assert.equal(DAILY_PLAN_STORAGE_KEY.includes("daily-plans"), true);
});
