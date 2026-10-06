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
const morningSource = readFileSync(
  new URL("./components/morning-plan-flow.tsx", import.meta.url),
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

test("Today puts core actions and daily content ahead of optional Morning Start", () => {
  const hero = todaySource.indexOf("<TodaySummary");
  const stuck = todaySource.indexOf('title="I’m Stuck"');
  const tasks = todaySource.indexOf('title="Tasks"');
  const habits = todaySource.indexOf('title="Habits"');
  const focus = todaySource.indexOf('title="Focus today"');
  const morning = todaySource.indexOf("<MorningPlanFlow");
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

test("Morning Start is collapsed until opened and keeps every verification and planning route", () => {
  assert.match(morningSource, /const \[expanded, setExpanded\] = useState\(false\)/);
  assert.match(morningSource, /accessibilityState=\{\{ expanded \}\}/);
  assert.match(morningSource, /expanded && step === "verify"/);
  assert.match(morningSource, /expanded && step === "plan"/);
  for (const label of [
    "Take photo",
    "Choose image",
    "Verify photo",
    "Skip without reward · Plan my day",
  ]) {
    assert.match(morningSource, new RegExp(label));
  }
  assert.match(plannerSource, /Plan manually/);
  assert.match(plannerSource, /Create Tasks directly/);
});

test("Morning and planning show AI allowance only inside their entered flows", () => {
  const expandedVerification = morningSource.indexOf("function MorningStart");
  const morningQuota = morningSource.indexOf("quotaCopy");
  assert.ok(expandedVerification > -1 && morningQuota > expandedVerification);
  assert.match(morningSource, /Guest Mode never calls the live AI service/);
  assert.match(morningSource, /Skip remains available without a reward/);
  assert.match(plannerSource, /const signedIn = auth\.status === "authenticated"/);
  assert.match(plannerSource, /Manual planning remains available/);
  assert.match(plannerSource, /Organize with AI/);
});

test("Focus summary, chronological activity, and both Reflection states remain present", () => {
  assert.match(todaySource, /formatFocusedDuration\(view\.totalFocusedMs\)/);
  assert.match(todaySource, /view\.focusItems\.map/);
  assert.match(todaySource, /view\.timeline\.map/);
  assert.match(todaySource, /formatTimelineTime/);
  assert.match(reflectionSource, /Add reflection/);
  assert.match(reflectionSource, /Edit reflection/);
  assert.match(reflectionSource, /Saved today/);
  assert.match(reflectionSource, /Private on your workspace\. Never sent to AI\./);
});
