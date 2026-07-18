import assert from "node:assert/strict";
import test from "node:test";

import {
  addHabit,
  addTask,
  isHabitScheduled,
  normalizeAppState,
  toggleHabit,
  toggleTask,
} from "./app-state.ts";
import { createEmptyState, DIRECTIONS, STUCK_STATES, type Habit } from "./models.ts";
import { loadAppState, saveAppState, type StorageLike } from "./repository.ts";
import { FIRST_MOVE_TEMPLATES, templatesFor } from "./templates.ts";

const clock = () => "2026-07-18T08:00:00.000Z";

test("malformed and partial old data returns a usable current state", () => {
  assert.deepEqual(normalizeAppState("broken"), createEmptyState());

  const recovered = normalizeAppState({
    schemaVersion: 0,
    tasks: [
      {
        id: "old-task",
        title: "Open the notes",
        direction: "Work & Study",
        order: 9,
        createdAt: clock(),
        updatedAt: clock(),
        completedOn: [],
      },
      { id: 4, title: null },
    ],
    progress: { points: "many" },
  });

  assert.equal(recovered.schemaVersion, 1);
  assert.equal(recovered.tasks.length, 1);
  assert.equal(recovered.tasks[0].order, 0);
  assert.equal(recovered.progress.points, 0);
});

test("the repository recovers from invalid JSON and blocked writes", () => {
  const invalidStorage: StorageLike = {
    getItem: () => "{not-json",
    setItem: () => {
      throw new Error("blocked");
    },
  };

  assert.deepEqual(loadAppState(invalidStorage), createEmptyState());
  assert.equal(saveAppState(invalidStorage, createEmptyState()), false);
});

test("a task completion awards points only once for a date", () => {
  const withTask = addTask(
    createEmptyState(),
    { title: "Open one document", direction: "Work & Study" },
    clock,
  );
  const taskId = withTask.tasks[0].id;
  const completed = toggleTask(withTask, taskId, "2026-07-18", clock);
  const reopened = toggleTask(completed, taskId, "2026-07-18", clock);
  const completedAgain = toggleTask(reopened, taskId, "2026-07-18", clock);

  assert.equal(completedAgain.progress.points, 5);
  assert.equal(completedAgain.rewardEvents.length, 1);
  assert.deepEqual(completedAgain.tasks[0].completedOn, ["2026-07-18"]);
});

test("a habit completion awards points only once for a date", () => {
  const withHabit = addHabit(
    createEmptyState(),
    { title: "Stretch", direction: "Exercise & Movement", schedule: { kind: "daily" } },
    clock,
  );
  const habitId = withHabit.habits[0].id;
  const completed = toggleHabit(withHabit, habitId, "2026-07-18", clock);
  const reopened = toggleHabit(completed, habitId, "2026-07-18", clock);
  const completedAgain = toggleHabit(reopened, habitId, "2026-07-18", clock);

  assert.equal(completedAgain.progress.points, 3);
  assert.equal(completedAgain.rewardEvents.length, 1);
});

test("selected-weekday habits appear only on selected weekdays", () => {
  const habit: Habit = {
    id: "habit-1",
    title: "Friday walk",
    direction: "Exercise & Movement",
    schedule: { kind: "weekdays", weekdays: ["fri"] },
    createdAt: clock(),
    updatedAt: clock(),
    completedOn: [],
  };

  assert.equal(isHabitScheduled(habit, "2026-07-17"), true);
  assert.equal(isHabitScheduled(habit, "2026-07-18"), false);
});

test("the local library covers every stuck-state and direction pair", () => {
  assert.equal(FIRST_MOVE_TEMPLATES.length, STUCK_STATES.length * DIRECTIONS.length * 2);
  for (const stuckState of STUCK_STATES) {
    for (const direction of DIRECTIONS) {
      assert.ok(templatesFor(stuckState, direction).length >= 2);
    }
  }
});
