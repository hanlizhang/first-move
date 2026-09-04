import assert from "node:assert/strict";
import test from "node:test";

import { deleteHabit, deleteTask } from "./app-state.ts";
import { buildFocusLinkOptions, focusLinkFields } from "./focus-links.ts";
import { createEmptyState, type ActivitySession, type Habit, type Task } from "./models.ts";

const today = "2026-09-03";
const timestamp = "2026-09-03T08:00:00.000Z";

function task(id: string, title: string, completedOn: string[] = []): Task {
  return {
    id,
    title,
    direction: "Work & Study",
    order: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    completedOn,
  };
}

function habit(id: string, title: string, completedOn: string[] = []): Habit {
  return {
    id,
    title,
    direction: "Exercise & Movement",
    schedule: { kind: "daily" },
    createdAt: timestamp,
    updatedAt: timestamp,
    completedOn,
  };
}

test("new Focus links include only Tasks and Habits active on the current local date", () => {
  const activeTask = task("task-active", "Active task", ["2026-09-02"]);
  const completedTask = task("task-completed", "Completed task", [today]);
  const deletedTask = task("task-deleted", "Deleted task");
  const activeHabit = habit("habit-active", "Active habit", ["2026-09-02"]);
  const checkedHabit = habit("habit-checked", "Checked habit", [today]);
  const deletedHabit = habit("habit-deleted", "Deleted habit");
  const populated = {
    ...createEmptyState(),
    tasks: [activeTask, completedTask, deletedTask],
    habits: [activeHabit, checkedHabit, deletedHabit],
  };
  const state = deleteHabit(deleteTask(populated, deletedTask.id), deletedHabit.id);

  const options = buildFocusLinkOptions(state, today);

  assert.deepEqual(options.map((option) => option.key), [
    "task:task-active",
    "habit:habit-active",
  ]);
  assert.deepEqual(focusLinkFields(options, "task:task-active"), {
    linkedTaskId: "task-active",
  });
  assert.deepEqual(focusLinkFields(options, "habit:habit-active"), {
    linkedHabitId: "habit-active",
  });
  assert.deepEqual(focusLinkFields(options, "task:task-completed"), {});
  assert.deepEqual(focusLinkFields(options, "habit:habit-checked"), {});
});

test("deriving new Focus links leaves historical relationships unchanged", () => {
  const completedTask = task("canonical-task-id", "Completed task", [today]);
  const checkedHabit = habit("canonical-habit-id", "Checked habit", [today]);
  const sessions: ActivitySession[] = [
    {
      id: "task-session",
      mode: "stopwatch",
      direction: completedTask.direction,
      label: completedTask.title,
      status: "stopped",
      linkedTaskId: completedTask.id,
      startedAt: timestamp,
      accumulatedElapsedMs: 1_000,
      endedAt: timestamp,
      actualElapsedMs: 1_000,
    },
    {
      id: "habit-session",
      mode: "stopwatch",
      direction: checkedHabit.direction,
      label: checkedHabit.title,
      status: "stopped",
      linkedHabitId: checkedHabit.id,
      startedAt: timestamp,
      accumulatedElapsedMs: 1_000,
      endedAt: timestamp,
      actualElapsedMs: 1_000,
    },
  ];
  const state = {
    ...createEmptyState(),
    tasks: [completedTask],
    habits: [checkedHabit],
    sessions,
  };

  assert.deepEqual(buildFocusLinkOptions(state, today), []);
  assert.equal(state.sessions[0].linkedTaskId, "canonical-task-id");
  assert.equal(state.sessions[1].linkedHabitId, "canonical-habit-id");
});
