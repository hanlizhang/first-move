import assert from "node:assert/strict";
import test from "node:test";

import type { AsyncKeyValueStore } from "./repository-core.ts";
import {
  GUEST_DAILY_PLANS_KEY,
  loadGuestDailyPlans,
  saveGuestDailyPlan,
} from "./daily-plans.ts";

function memoryStore() {
  const values = new Map<string, string>();
  const store: AsyncKeyValueStore = {
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
  };
  return { store, values };
}

test("Guest manual plans persist locally without any image or AI payload fields", async () => {
  const memory = memoryStore();
  const plan = {
    dateKey: "2026-09-15",
    items: [
      {
        id: "10000000-0000-4000-8000-000000000001",
        group: "first-move" as const,
        title: "Begin gently",
        firstStep: "Put one document within reach.",
        category: "Work & Study" as const,
        durationMinutes: 2 as const,
      },
    ],
  };
  await saveGuestDailyPlan(memory.store, plan);

  assert.deepEqual(await loadGuestDailyPlans(memory.store), [plan]);
  const persisted = memory.values.get(GUEST_DAILY_PLANS_KEY) ?? "";
  assert.doesNotMatch(persisted, /image|photo|bytes|base64|user_id|isPro/i);
});
