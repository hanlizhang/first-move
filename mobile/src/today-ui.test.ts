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
const planningFlowSource = readFileSync(
  new URL("./components/day-plan-flow.tsx", import.meta.url),
  "utf8",
);
const plannerSource = readFileSync(
  new URL("./components/day-planner.tsx", import.meta.url),
  "utf8",
);

test("Mobile Today opens with a shared step-and-kitten hero before activity content", () => {
  for (const label of [
    "focused today",
    "Small steps add up",
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
  assert.match(todaySource, /<PixelStepScene reduceMotion=\{reduceMotion\} variant="daily" \/>/);
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
  assert.match(reflectionSource, /Private on your workspace/);
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

test("Today puts core actions and daily content ahead of optional manual planning", () => {
  const hero = todaySource.indexOf("<TodaySummary");
  const stuck = todaySource.indexOf('title="I’m Stuck"');
  const tasks = todaySource.indexOf('title="Tasks"');
  const habits = todaySource.indexOf('title="Habits"');
  const focus = todaySource.indexOf('title="Focus today"');
  const morning = todaySource.indexOf("<DayPlanFlow");
  const timeline = todaySource.indexOf('title="Activity timeline"');
  const reflection = todaySource.indexOf('title="Reflection"');

  assert.ok(hero > -1 && hero < stuck);
  assert.ok(stuck < tasks && tasks < habits && habits < focus);
  assert.ok(focus < morning && morning < timeline && timeline < reflection);
  assert.match(todaySource, /Small steps add up\./);
  assert.doesNotMatch(todaySource, /completedTasks.*taskCount/s);
  assert.doesNotMatch(todaySource, /checkedHabits.*habitCount/s);
});

test("Today uses lightweight row lists instead of a bordered card for every section", () => {
  assert.match(todaySource, /StyleSheet\.hairlineWidth/);
  assert.match(todaySource, /style=\{styles\.sectionList\}/);
  assert.doesNotMatch(todaySource, /styles\.compactCard|compactCard:/);
  assert.doesNotMatch(reflectionSource, /editorCard/);
  assert.doesNotMatch(todaySource, /function OverviewMetric|overviewMetrics|overviewMetric:/);
  assert.match(todaySource, /todayHero: \{/);
  assert.match(todaySource, /todayHeroValue: \{ color: colors\.text, fontSize: 24/);
});

test("manual planning remains collapsed in Today and offers existing review and direct Task paths", () => {
  assert.match(planningFlowSource, /const \[expanded, setExpanded\] = useState\(false\)/);
  assert.match(planningFlowSource, /accessibilityState=\{\{ expanded \}\}/);
  assert.match(planningFlowSource, /expanded \? <DayPlanner dateKey=\{dateKey\}/);
  assert.match(plannerSource, /Plan manually/);
  assert.match(plannerSource, /Create Tasks directly/);
  assert.match(plannerSource, /Review or edit plan/);
  assert.match(plannerSource, /confirmDailyPlan\(dateKey, items\)/);
  assert.doesNotMatch(`${planningFlowSource}\n${plannerSource}`, /\bAI\b|photo|quota|organizeDay|aiAccess/);
});

test("Focus summary, chronological activity, and both Reflection states remain present", () => {
  assert.match(todaySource, /formatFocusedDuration\(view\.totalFocusedMs\)/);
  assert.match(todaySource, /view\.focusItems\.map/);
  assert.match(todaySource, /view\.timeline\.map/);
  assert.match(todaySource, /formatTimelineTime/);
  assert.match(reflectionSource, /Add reflection/);
  assert.match(reflectionSource, /Edit reflection/);
  assert.match(reflectionSource, /Saved today/);
  assert.match(reflectionSource, /Private on your workspace\./);
});
