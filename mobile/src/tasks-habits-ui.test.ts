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

test("Task and Habit controls use the owner-scoped working and sync boundary", () => {
  for (const source of [tasksSource, habitsSource]) {
    assert.match(source, /updateLocalWorkspace/);
    assert.match(source, /workspaceEditable/);
    assert.match(source, /owner-scoped retry queue/);
    assert.doesNotMatch(source, /Canonical cloud · read-only/);
    assert.doesNotMatch(source, /\.rpc\(/);
  }
  assert.match(tasksSource, /toggleTaskCompletion/);
  assert.match(tasksSource, /softDeleteTask/);
  assert.match(habitsSource, /toggleHabitCompletion/);
  assert.match(habitsSource, /softDeleteHabit/);
});

test("the ordinary Tasks list renders only active or current-date completed Tasks", () => {
  assert.match(tasksSource, /isTaskVisibleToday\(task, today\)/);
  assert.match(tasksSource, /\{visibleTasks\.length\}/);
  assert.match(tasksSource, /visibleTasks\.map/);
  assert.match(tasksSource, /No active Tasks/);
});

test("hidden Tasks cannot remain selected in the ordinary Tasks editor", () => {
  assert.match(tasksSource, /const requestedTask = visibleTasks\.find/);
  assert.match(tasksSource, /editingId\s+\? visibleTasks\.find/);
  assert.match(
    tasksSource,
    /if \(editingId && !editingTask\) \{\s+setEditingId\(undefined\);\s+setTitle\(""\);\s+setDirection\(DIRECTIONS\[0\]\);/,
  );
  assert.match(tasksSource, /const editorTitle = editingId && !editingTask \? "" : title/);
  assert.match(tasksSource, /const editing = editingTask\?\.id/);
});
