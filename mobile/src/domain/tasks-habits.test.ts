import assert from "node:assert/strict";
import test from "node:test";

import { isUuidV4 } from "./ids.ts";
import { createEmptyState } from "./models.ts";
import {
  addHabit,
  addTask,
  editHabit,
  editTask,
  isHabitScheduled,
  softDeleteHabit,
  softDeleteTask,
  toggleHabitCompletion,
  toggleTaskCompletion,
} from "./tasks-habits.ts";

const firstTimestamp = "2026-09-02T08:00:00.000Z";
const secondTimestamp = "2026-09-02T09:00:00.000Z";
const taskId = "10000000-0000-4000-8000-000000000001";
const habitId = "20000000-0000-4000-8000-000000000001";

test("Tasks use schema-v8 fields, stable UUID identity, edits, and local-date completion facts", () => {
  const created = addTask(
    createEmptyState(),
    { title: "  Open   the application  ", direction: "Work & Study" },
    () => firstTimestamp,
    () => taskId,
  );
  assert.deepEqual(created.tasks[0], {
    id: taskId,
    title: "Open the application",
    direction: "Work & Study",
    order: 0,
    createdAt: firstTimestamp,
    updatedAt: firstTimestamp,
    completedOn: [],
  });

  const edited = editTask(
    created,
    taskId,
    { title: "Send one application", direction: "Daily Life" },
    () => secondTimestamp,
  );
  const completed = toggleTaskCompletion(
    edited,
    taskId,
    "2026-09-02",
    () => secondTimestamp,
  );
  assert.equal(completed.tasks[0]?.title, "Send one application");
  assert.equal(completed.tasks[0]?.direction, "Daily Life");
  assert.deepEqual(completed.tasks[0]?.completedOn, ["2026-09-02"]);
  assert.deepEqual(
    toggleTaskCompletion(completed, taskId, "2026-09-02", () => secondTimestamp)
      .tasks[0]?.completedOn,
    [],
  );
  assert.equal(completed.rewardEvents.length, 0);
});

test("Task deletion removes only the active parent and retains stable historical relationships", () => {
  const state = addTask(
    createEmptyState(),
    { title: "Linked task", direction: "Rest" },
    () => firstTimestamp,
    () => taskId,
  );
  state.sessions = [
    {
      id: "30000000-0000-4000-8000-000000000001",
      mode: "stopwatch",
      direction: "Rest",
      label: "Linked task",
      linkedTaskId: taskId,
      status: "stopped",
      startedAt: firstTimestamp,
      accumulatedElapsedMs: 1000,
      endedAt: secondTimestamp,
      actualElapsedMs: 1000,
    },
  ];
  const deleted = softDeleteTask(state, taskId);
  assert.equal(deleted.tasks.length, 0);
  assert.equal(deleted.sessions[0]?.linkedTaskId, taskId);
  assert.equal(softDeleteTask(deleted, taskId), deleted);
});

test("Habits preserve daily or normalized selected-weekday schedules and current-date checks", () => {
  const created = addHabit(
    createEmptyState(),
    {
      title: "  Take a short walk ",
      direction: "Exercise & Movement",
      schedule: { kind: "weekdays", weekdays: ["fri", "mon", "fri"] },
    },
    () => firstTimestamp,
    () => habitId,
  );
  assert.deepEqual(created.habits[0]?.schedule, {
    kind: "weekdays",
    weekdays: ["mon", "fri"],
  });
  assert.equal(isHabitScheduled(created.habits[0]!, "2026-09-04"), true);
  assert.equal(isHabitScheduled(created.habits[0]!, "2026-09-05"), false);

  const edited = editHabit(
    created,
    habitId,
    {
      title: "Walk outside",
      direction: "Daily Life",
      schedule: { kind: "daily" },
    },
    () => secondTimestamp,
  );
  const checked = toggleHabitCompletion(
    edited,
    habitId,
    "2026-09-02",
    () => secondTimestamp,
  );
  assert.deepEqual(checked.habits[0]?.completedOn, ["2026-09-02"]);
  assert.deepEqual(
    toggleHabitCompletion(checked, habitId, "2026-09-02", () => secondTimestamp)
      .habits[0]?.completedOn,
    [],
  );
  assert.equal(checked.rewardEvents.length, 0);
  assert.equal(softDeleteHabit(checked, habitId).habits.length, 0);
});

test("invalid Task and Habit inputs do not change schema-v8 state", () => {
  const state = createEmptyState();
  assert.equal(
    addTask(state, { title: "   ", direction: "Rest" }, undefined, () => taskId),
    state,
  );
  assert.equal(
    addHabit(
      state,
      {
        title: "Walk",
        direction: "Exercise & Movement",
        schedule: { kind: "weekdays", weekdays: [] },
      },
      undefined,
      () => habitId,
    ),
    state,
  );
  assert.equal(toggleTaskCompletion(state, taskId, "not-a-date"), state);
  assert.equal(toggleHabitCompletion(state, habitId, "2026-02-30"), state);
  assert.equal(
    addTask(
      state,
      { title: "Task", direction: "Daily Life" },
      undefined,
      () => "not-a-uuid",
    ),
    state,
  );
});

test("default Mobile Task and Habit IDs are canonical UUID v4 values", () => {
  const task = addTask(createEmptyState(), {
    title: "Task",
    direction: "Daily Life",
  }).tasks[0];
  const habit = addHabit(createEmptyState(), {
    title: "Habit",
    direction: "Rest",
    schedule: { kind: "daily" },
  }).habits[0];
  assert.ok(task && isUuidV4(task.id));
  assert.ok(habit && isUuidV4(habit.id));
});
