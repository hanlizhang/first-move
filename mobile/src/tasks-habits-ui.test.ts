import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const tasksSource = readFileSync(new URL("./app/tasks.tsx", import.meta.url), "utf8");
const habitsSource = readFileSync(new URL("./app/habits.tsx", import.meta.url), "utf8");
const todaySource = readFileSync(
  new URL("./app/(tabs)/today.tsx", import.meta.url),
  "utf8",
);

test("Today exposes dedicated Mobile Tasks and Habits screens", () => {
  assert.match(todaySource, /router\.push\("\/tasks"\)/);
  assert.match(todaySource, /router\.push\("\/habits"\)/);
  assert.match(tasksSource, /title="Tasks"/);
  assert.match(habitsSource, /title="Habits"/);
});

test("Task and Habit controls use the owner-local repository mutation boundary", () => {
  for (const source of [tasksSource, habitsSource]) {
    assert.match(source, /updateLocalWorkspace/);
    assert.match(source, /cloud\.userId !== auth\.user\.id/);
    assert.match(source, /Canonical cloud · read-only/);
    assert.doesNotMatch(source, /\.rpc\(/);
  }
  assert.match(tasksSource, /toggleTaskCompletion/);
  assert.match(tasksSource, /softDeleteTask/);
  assert.match(habitsSource, /toggleHabitCompletion/);
  assert.match(habitsSource, /softDeleteHabit/);
});
