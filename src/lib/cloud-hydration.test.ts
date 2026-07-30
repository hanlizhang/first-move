import assert from "node:assert/strict";
import test from "node:test";

import { replaceLocalWorkspace, validateCanonicalWorkspace } from "./cloud-hydration.ts";
import { DAILY_PLAN_STORAGE_KEY } from "./daily-plan-state.ts";
import { STORAGE_KEY } from "./repository.ts";

const canonical = {
  profile: { first_use_local_date: "2026-07-29" },
  settings: {},
  tasks: [{ id: "10000000-0000-4000-8000-000000000001", title: "Cloud task", direction: "Daily Life", rank: "0", created_at: "2026-07-29T08:00:00Z", updated_at: "2026-07-29T08:00:00Z" }],
  task_completions: [{ id: "11000000-0000-4000-8000-000000000001", task_id: "10000000-0000-4000-8000-000000000001", local_date: "2026-07-29" }],
  habits: [], habit_schedule_weekdays: [], habit_completions: [], activity_intents: [],
  activity_sessions: [], daily_plans: [], daily_plan_items: [], morning_checks: [], morning_attempts: [],
  journal_entries: [{ id: "12000000-0000-4000-8000-000000000001", local_date: "2026-07-29", what_helped: "Private cloud note", updated_at: "2026-07-29T20:00:00Z" }],
  reward_ledger: [{ id: "13000000-0000-4000-8000-000000000001", source_type: "task", source_id: "11000000-0000-4000-8000-000000000001", local_date: "2026-07-29", points_tenths: 50, created_at: "2026-07-29T08:00:00Z" }],
  inventory_events: [{ id: "14000000-0000-4000-8000-000000000001", item_id: "kitten-milk", quantity_delta: 2 }],
  inventory_balances: [{ item_id: "kitten-milk", quantity: 2 }],
  milestone_grants: [], active_days: ["2026-07-29"], points_tenths: 50,
};

test("canonical hydration validates private journal, balances, and references before replacement", () => {
  const workspace = validateCanonicalWorkspace(canonical);
  assert.equal(workspace.state.tasks[0].completedOn[0], "2026-07-29");
  assert.equal(workspace.state.journalEntries[0].whatHelped, "Private cloud note");
  assert.equal(workspace.state.progress.points, 5);
  assert.deepEqual(workspace.state.inventory.items, [{ itemId: "kitten-milk", quantity: 2 }]);
});

test("invalid balance prevents hydration", () => {
  assert.throws(() => validateCanonicalWorkspace({ ...canonical, points_tenths: 40 }), /point balance/);
  assert.throws(() => validateCanonicalWorkspace({ ...canonical, inventory_balances: [{ item_id: "kitten-milk", quantity: 3 }] }), /inventory/);
});

test("Use cloud progress replaces both stores only after validation and never deletes keys", () => {
  const values = new Map([[STORAGE_KEY, "guest"], [DAILY_PLAN_STORAGE_KEY, "guest-plans"], ["first-move:other", "keep"]]);
  let removals = 0;
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: () => { removals += 1; },
  };
  replaceLocalWorkspace(storage, validateCanonicalWorkspace(canonical));
  assert.match(values.get(STORAGE_KEY) ?? "", /Cloud task/);
  assert.equal(values.get("first-move:other"), "keep");
  assert.equal(removals, 0);
});
