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

test("tombstoned historical completion does not reappear in completedOn", () => {
  const workspace = validateCanonicalWorkspace({
    ...canonical,
    task_completions: [{ ...canonical.task_completions[0], deleted_at: "2026-07-30T08:00:00Z" }],
  });
  assert.deepEqual(workspace.state.tasks[0].completedOn, []);
  assert.equal(workspace.state.rewardEvents.length, 1);
});

test("tombstoned intent stays hidden while the historical session keeps its relationship", () => {
  const intentId = "15000000-0000-4000-8000-000000000001";
  for (const status of ["consumed", "cancelled"]) {
    const workspace = validateCanonicalWorkspace({
      ...canonical,
      activity_intents: [{ id: intentId, status, deleted_at: "2026-07-29T09:02:00Z" }],
      activity_sessions: [{ id: "16000000-0000-4000-8000-000000000001", mode: "countdown", status: "completed", direction: "Daily Life", label: "Historical", target_duration_minutes: 2, linked_intent_id: intentId, started_at: "2026-07-29T09:00:00Z", accumulated_elapsed_ms: 120000, ended_at: "2026-07-29T09:02:00Z", actual_elapsed_ms: 120000 }],
    });
    assert.equal(workspace.state.activityIntents.length, 0);
    assert.equal(workspace.state.sessions[0].linkedIntentId, intentId);
  }
});

test("tombstoned task and habit parents validate history but stay out of active lists", () => {
  const deletedTaskId = "17000000-0000-4000-8000-000000000001";
  const deletedHabitId = "18000000-0000-4000-8000-000000000001";
  const historicalSession = { id: "19000000-0000-4000-8000-000000000001", mode: "stopwatch", status: "stopped", direction: "Daily Life", label: "Historical", started_at: "2026-07-29T09:00:00Z", accumulated_elapsed_ms: 0, ended_at: "2026-07-29T09:00:00Z", actual_elapsed_ms: 0 };
  const value = {
    ...canonical,
    tasks: [...canonical.tasks, { id: deletedTaskId, title: "Deleted task", direction: "Daily Life", rank: "1", created_at: "2026-07-29T08:00:00Z", updated_at: "2026-07-29T08:00:00Z", deleted_at: "2026-07-29T09:00:00Z" }],
    habits: [{ id: deletedHabitId, title: "Deleted habit", direction: "Daily Life", schedule_kind: "daily", created_at: "2026-07-29T08:00:00Z", updated_at: "2026-07-29T08:00:00Z", deleted_at: "2026-07-29T09:00:00Z" }],
    activity_sessions: [{ ...historicalSession, linked_task_id: deletedTaskId }, { ...historicalSession, id: "19100000-0000-4000-8000-000000000001", linked_habit_id: deletedHabitId }],
  };
  const workspace = validateCanonicalWorkspace(value);
  assert.equal(workspace.state.tasks.some((task) => task.id === deletedTaskId), false);
  assert.equal(workspace.state.habits.length, 0);
  assert.equal(workspace.state.sessions[0].linkedTaskId, deletedTaskId);
  assert.equal(workspace.state.sessions[1].linkedHabitId, deletedHabitId);
  assert.throws(() => validateCanonicalWorkspace({ ...value, tasks: canonical.tasks }), /task reference/);
});

test("canonical hydration preserves standalone, Task-linked, and Habit-linked Focus sessions", () => {
  const taskId = canonical.tasks[0].id;
  const habitId = "1a000000-0000-4000-8000-000000000001";
  const habitCompletionId = "1a100000-0000-4000-8000-000000000001";
  const closedSession = {
    mode: "countdown",
    status: "stopped",
    direction: "Daily Life",
    label: "Focus time",
    target_duration_minutes: 25,
    started_at: "2026-07-29T10:00:00Z",
    accumulated_elapsed_ms: 0,
    ended_at: "2026-07-29T10:00:00Z",
    actual_elapsed_ms: 0,
  };
  const workspace = validateCanonicalWorkspace({
    ...canonical,
    habits: [{
      id: habitId,
      title: "Stretch",
      direction: "Exercise & Movement",
      schedule_kind: "daily",
      created_at: "2026-07-29T08:00:00Z",
      updated_at: "2026-07-29T08:00:00Z",
    }],
    habit_completions: [{ id: habitCompletionId, habit_id: habitId, local_date: "2026-07-29" }],
    activity_sessions: [
      { ...closedSession, id: "1b000000-0000-4000-8000-000000000001" },
      { ...closedSession, id: "1c000000-0000-4000-8000-000000000001", label: "Cloud task", linked_task_id: taskId },
      {
        ...closedSession,
        id: "1d000000-0000-4000-8000-000000000001",
        mode: "stopwatch",
        label: "Stretch",
        target_duration_minutes: null,
        linked_habit_id: habitId,
      },
    ],
  });

  assert.equal(workspace.state.sessions[0].linkedTaskId, undefined);
  assert.equal(workspace.state.sessions[0].linkedHabitId, undefined);
  assert.equal(workspace.state.sessions[0].linkedIntentId, undefined);
  assert.equal(workspace.state.sessions[1].linkedTaskId, taskId);
  assert.equal(workspace.state.sessions[2].linkedHabitId, habitId);
  assert.equal(workspace.state.sessions[2].mode, "stopwatch");
  assert.equal(workspace.state.tasks[0].id, taskId);
  assert.deepEqual(workspace.state.tasks[0].completedOn, ["2026-07-29"]);
  assert.equal(workspace.state.habits[0].id, habitId);
  assert.deepEqual(workspace.state.habits[0].completedOn, ["2026-07-29"]);
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
