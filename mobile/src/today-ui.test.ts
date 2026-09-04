import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const todaySource = readFileSync(
  new URL("./app/(tabs)/today.tsx", import.meta.url),
  "utf8",
);
const taskSource = readFileSync(new URL("./app/tasks.tsx", import.meta.url), "utf8");
const reflectionSource = readFileSync(
  new URL("./components/reflection-editor.tsx", import.meta.url),
  "utf8",
);

test("Mobile Today exposes compact points, direction, activity, and Reflection content", () => {
  for (const label of [
    "Current points",
    "Focused today",
    "Tasks",
    "Habits",
    "Focus today",
    "Activity timeline",
    "Reflection",
  ]) {
    assert.match(todaySource, new RegExp(label));
  }
  assert.match(todaySource, /getTodayView\(localWorkspace, today\)/);
  assert.match(todaySource, /formatFocusedDuration/);
  assert.match(todaySource, /DIRECTIONS\.map/);
  assert.match(todaySource, /view\.timeline\.map/);
  assert.doesNotMatch(todaySource, /react-native-svg|victory|chart/i);
});

test("Today Task and Habit checks reuse the owner workspace mutation path", () => {
  assert.match(todaySource, /updateLocalWorkspace/);
  assert.match(todaySource, /toggleTaskCompletion/);
  assert.match(todaySource, /toggleHabitCompletion/);
  assert.doesNotMatch(todaySource, /\.rpc\(/);
});

test("Reflection uses the durable workspace mutation path and keeps authenticated rewards server-owned", () => {
  assert.match(todaySource, /saveReflection\(state, today, input/);
  assert.match(todaySource, /"server-authoritative"/);
  assert.match(todaySource, /"guest-local"/);
  assert.match(todaySource, /updateLocalWorkspace/);
  assert.match(reflectionSource, /Never sent to AI/);
  assert.doesNotMatch(`${todaySource}\n${reflectionSource}`, /console\.|analytics|\.rpc\(/i);
});

test("tapping a Today Task opens that Task in the existing editor", () => {
  assert.match(todaySource, /pathname: "\/tasks", params: \{ edit: task\.id \}/);
  assert.match(taskSource, /useLocalSearchParams/);
  assert.match(taskSource, /setEditingId\(task\.id\)/);
});

test("Today shows simple sync language without developer-facing architecture copy", () => {
  for (const label of ["Local", "Pending", "Synced", "Offline"]) {
    assert.match(todaySource, new RegExp(label));
  }
  assert.doesNotMatch(
    todaySource,
    /canonical workspace|UUID working copy|storage boundary/i,
  );
});
