import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { DIRECTIONS, FOCUS_COUNTDOWN_PRESETS } from "./domain/models.ts";

const source = readFileSync(
  new URL("./app/(tabs)/focus.tsx", import.meta.url),
  "utf8",
);
const pickerSource = readFileSync(
  new URL("./components/focus-link-picker.tsx", import.meta.url),
  "utf8",
);

test("Mobile Focus exposes the three independent Session entry paths", () => {
  assert.match(source, /Next small move/);
  assert.match(source, /Start this First Move/);
  assert.match(source, /type FocusSetupMode = "countdown" \| "stopwatch"/);
  assert.match(source, /accessibilityLabel="Start countdown focus"/);
  assert.match(source, /accessibilityLabel="Start stopwatch focus"/);
  assert.equal((source.match(/title="Start Focus"/g) ?? []).length, 2);
  const idleComposition = source.slice(
    source.indexOf("{pendingIntent ?"),
    source.indexOf("</>", source.indexOf("{pendingIntent ?")),
  );
  assert.ok(idleComposition.indexOf("PendingFirstMoveCard") < idleComposition.indexOf("FocusSetup"));
  assert.doesNotMatch(source, /cancelPendingIntent/);
});

test("Mobile Focus makes persistence automatic and review optional", () => {
  assert.match(source, /Actual focus time/);
  assert.match(source, /Edit details/);
  assert.match(source, /Save changes/);
  assert.doesNotMatch(source, /Save session/);
  assert.doesNotMatch(source, /Saved automatically/);
});

test("Focus completion feedback follows only newly completed or stopped saved sessions", () => {
  assert.match(source, /useCelebrations/);
  assert.match(source, /presentFocusCompletion\(completed\)/);
  assert.match(source, /candidate\?\.status === "completed" \|\| candidate\?\.status === "stopped"/);
  assert.match(source, /if \(closedSession\) presentFocusCompletion\(closedSession\)/);
  assert.match(source, /cancelSession\(state, openSession\.id\)/);
  assert.doesNotMatch(
    source.slice(source.indexOf("onCancel={() =>"), source.indexOf("onPause={() =>")),
    /presentFocusCompletion/,
  );
  assert.match(source, /<SessionReview/);
});

test("Focus links use the current owner workspace without exposing sync internals", () => {
  assert.match(source, /buildFocusLinkOptions\(localWorkspace, today\)/);
  assert.doesNotMatch(source, /canonicalState/);
  assert.doesNotMatch(source, /Storage boundary|UUID|canonical responses|queue in order/);
  assert.doesNotMatch(pickerSource, /Canonical item|Working item/);
});

test("Focus uses one compact searchable linked-item field", () => {
  assert.match(source, /FocusLinkPicker/);
  assert.doesNotMatch(source, /function LinkPicker/);
  assert.match(pickerSource, /Search Tasks and Habits/);
  assert.match(pickerSource, /No linked item/);
  assert.match(pickerSource, /Tasks/);
  assert.match(pickerSource, /Habits/);
  assert.match(pickerSource, /Selected/);
  assert.match(source, /Current linked item retained/);
  assert.doesNotMatch(pickerSource, /Current relationship|Unavailable for new links/);
  assert.doesNotMatch(pickerSource, /standalone|Session/);
  assert.match(pickerSource, /continue without a link/i);
});

test("idle Focus uses one accessible mode selector and preserves both setup states", () => {
  assert.match(source, /useState<FocusSetupMode>\("countdown"\)/);
  assert.match(source, /accessibilityRole="tablist"/);
  assert.match(source, /accessibilityRole="tab"/);
  assert.match(source, /accessibilityState=\{\{ selected \}\}/);
  assert.match(source, /accessibilityElementsHidden=\{mode !== "countdown"\}/);
  assert.match(source, /accessibilityElementsHidden=\{mode !== "stopwatch"\}/);
  assert.match(source, /hiddenSetup: \{ display: "none" \}/);
});

test("Countdown keeps every preset, secondary custom input, and existing start semantics", () => {
  assert.deepEqual(FOCUS_COUNTDOWN_PRESETS, [2, 5, 10, 25, 50]);
  assert.match(source, /FOCUS_COUNTDOWN_PRESETS\.map/);
  assert.match(source, /<ChoiceButton\s+balanced\s+compact/);
  assert.match(source, /choiceBalanced: \{ flexBasis: "29%", flexGrow: 1 \}/);
  assert.match(source, /label=\{`\$\{minutes\} min`\}/);
  assert.match(source, /label=\{customMinutes && customDuration[\s\S]*?"Custom duration"\}/);
  assert.match(source, /parseFocusDurationInput\(customMinutes\)/);
  assert.match(source, /disabled=\{disabled \|\| duration === undefined\}/);
  assert.match(source, /durationMinutes: duration/);
  assert.match(source, /\.\.\.focusLinkFields\(linkKey\)/);
});

test("optional setup details retain title, linked item, and all compact Directions", () => {
  assert.deepEqual(DIRECTIONS, [
    "Work & Study",
    "Daily Life",
    "Exercise & Movement",
    "Intentional Entertainment",
    "Rest",
  ]);
  assert.match(source, /label=\{expanded \? "Hide details" : "Add details"\}/);
  assert.match(source, /function SetupDetails/);
  assert.match(source, /Activity title \(optional\)/);
  assert.match(source, /Link to a Task or Habit \(optional\)/);
  assert.match(source, /<DirectionPicker compact/);
  assert.match(source, /DIRECTIONS\.map/);
  assert.match(source, /choiceCompact/);
  assert.match(source, /setDetailsExpanded\(true\)/);
});

test("Focus setup prioritizes Start and removes implementation copy", () => {
  const countdown = source.slice(
    source.indexOf("function CountdownSetup"),
    source.indexOf("function StopwatchSetup"),
  );
  const stopwatch = source.slice(
    source.indexOf("function StopwatchSetup"),
    source.indexOf("function SetupDetails"),
  );
  assert.ok(countdown.indexOf('title="Start Focus"') < countdown.indexOf("<DetailsDisclosure"));
  assert.ok(stopwatch.indexOf('title="Start Focus"') < stopwatch.indexOf("<DetailsDisclosure"));
  assert.doesNotMatch(source, />Standalone<|"Standalone|ActivityIntent relationship|Session engine|saved local Session|Relationship"/);
  assert.match(source, /startCountdown\(state, input, current, undefined, references\)/);
  assert.match(source, /startStopwatch\(state, input, current, undefined, references\)/);
  assert.match(source, /startCountdownFromIntent\(state, pendingIntent\.id, current\)/);
});
