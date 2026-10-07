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
const celebrationSource = readFileSync(
  new URL("./components/celebration-provider.tsx", import.meta.url),
  "utf8",
);
const tabsSource = readFileSync(
  new URL("./app/(tabs)/_layout.tsx", import.meta.url),
  "utf8",
);

test("a pending First Move is primary while every existing Focus entry path remains available", () => {
  assert.match(source, /YOUR FIRST MOVE/);
  assert.match(source, /Start this move/);
  assert.match(source, /Start a different Focus session/);
  assert.match(source, /type FocusSetupMode = "countdown" \| "stopwatch"/);
  assert.match(source, /accessibilityLabel="Start countdown focus"/);
  assert.match(source, /accessibilityLabel="Start stopwatch focus"/);
  assert.equal((source.match(/title="Start Focus"/g) ?? []).length, 2);
  const idleComposition = source.slice(
    source.indexOf("{pendingIntent ?", source.indexOf("return (", source.indexOf("if (localWorkspaceStatus"))),
    source.indexOf("{latestClosedSession && !pendingIntent"),
  );
  assert.ok(
    idleComposition.indexOf("PendingFirstMoveCard") <
      idleComposition.indexOf("Start a different Focus session"),
  );
  assert.match(
    idleComposition,
    /standaloneSetupForIntentId === pendingIntent\.id[\s\S]*?focusSetup/,
  );
  assert.match(idleComposition, /:\s*\(\s*focusSetup\s*\)/);
  assert.doesNotMatch(source, /cancelPendingIntent/);
});

test("Start this move inherits wording, Direction, duration, and intent through the existing engine", () => {
  assert.match(
    source,
    /startCountdownFromIntent\(state, pendingIntent\.id, current\)/,
  );
  const pendingCard = source.slice(
    source.indexOf("function PendingFirstMoveCard"),
    source.indexOf("function LinkedFirstMoveResult"),
  );
  assert.match(pendingCard, /\{intent\.moveText\}/);
  assert.match(
    pendingCard,
    /\{intent\.direction\} · \{intent\.intendedDurationMinutes\} min/,
  );
});

test("linked active Focus keeps the timer and First Move context dominant", () => {
  const active = source.slice(
    source.indexOf("function ActiveSessionCard"),
    source.indexOf("function countdownProgress"),
  );
  assert.ok(active.indexOf("YOUR FIRST MOVE") < active.indexOf("{session.label}"));
  assert.ok(active.indexOf("{session.label}") < active.indexOf("<PixelFocusRing"));
  assert.ok(active.indexOf("{session.label}") < active.indexOf('pose="sleeping"'));
  assert.match(active, /session\.linkedIntentId/);
  assert.match(active, /\{session\.direction\}/);
  assert.match(active, /session\.targetDurationMinutes/);
  assert.match(active, />Stop and save</);
  assert.match(active, />Cancel this session</);
});

test("linked results offer Done, Keep going, and Another First Move without a second timer", () => {
  assert.match(source, /function LinkedFirstMoveResult/);
  assert.match(source, /You made the first move\./);
  assert.match(source, /You stopped when you chose\. Your time is saved\./);
  assert.match(source, /Actual focus time/);
  assert.match(source, /title="Done"/);
  assert.match(source, /title="Keep going"/);
  assert.match(source, /title="Another First Move"/);
  assert.match(source, /acknowledgeSession\(state, linkedResultSession\.id, current\)/);
  assert.match(source, /continueLinkedSession\(state, linkedResultSession\.id, current\)/);
  assert.match(source, /router\.push\("\/\(tabs\)\/first-moves"\)/);
  assert.doesNotMatch(source, /setInterval[\s\S]*?function LinkedFirstMoveResult[\s\S]*?setInterval/);
});

test("linked completion reuses one celebration overlay and preserves owner persistence boundaries", () => {
  assert.match(celebrationSource, /You made the first move\./);
  assert.match(celebrationSource, /You stopped when you chose\./);
  assert.match(celebrationSource, /FirstMoveCelebrationContext/);
  assert.equal((celebrationSource.match(/<Modal/g) ?? []).length, 1);
  assert.doesNotMatch(source, /<Modal|AsyncStorage|localWorkspaceKey|cloudCacheKey/);
  assert.match(source, /updateLocalWorkspace/);
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

test("idle Focus centers the shared ring and Start action before secondary configuration", () => {
  const countdown = source.slice(
    source.indexOf("function CountdownSetup"),
    source.indexOf("function StopwatchSetup"),
  );
  assert.match(source, /import \{ PixelFocusRing \} from "\.\.\/\.\.\/components\/pixel-scenes\.tsx"/);
  assert.match(source, /const focusParentWidth = Math\.min\(viewportWidth - spacing\.md \* 2, 420\)/);
  assert.match(source, /focusParentWidth \* 0\.62/);
  assert.match(source, /viewportHeight \* \(activePresentation \? 0\.29 : 0\.27\)/);
  assert.match(countdown, /size=\{ringSize\}/);
  assert.match(countdown, /value=\{duration === undefined \? "--:--" : formatDuration\(duration \* 60_000\)\}/);
  assert.ok(countdown.indexOf("<PixelFocusRing") < countdown.indexOf('title="Start Focus"'));
  assert.ok(countdown.indexOf('title="Start Focus"') < countdown.indexOf("secondaryConfiguration"));
  assert.ok(countdown.indexOf('label="Customize"') < countdown.indexOf("FOCUS_COUNTDOWN_PRESETS.map"));
  assert.ok(countdown.indexOf("FOCUS_COUNTDOWN_PRESETS.map") < countdown.indexOf(">Mode</Text>"));
  assert.match(countdown, /pose="sleeping"/);
  assert.match(source, /focusPageContent:[\s\S]*?alignItems: "center"/);
  assert.match(source, /timerPresentation:[\s\S]*?alignItems: "center"/);
  assert.doesNotMatch(source, /<Screen eyebrow="Focus"/);
});

test("normal Focus states use a fixed page and only exceptional content can scroll", () => {
  const page = source.slice(
    source.indexOf("function FocusPage"),
    source.indexOf("function ActiveSessionCard"),
  );
  assert.match(source, /const requiresFocusOverflow = fontScale > 1\.3 \|\| viewportHeight < 600/);
  assert.match(page, /scroll \? \([\s\S]*?<ScrollView/);
  assert.match(page, /:\s*\(\s*<View style=\{styles\.focusPageContent\}>/);
  assert.match(source, /title=\{openSession \? undefined : "Focus"\}/);
  assert.match(source, /\{notice && !openSession \?/);
  assert.match(source, /numberOfLines=\{3\}/);
  assert.match(source, /configurationScroller: \{ flexShrink: 1, maxHeight: 260 \}/);
  assert.match(tabsSource, /hideFocusTabs[\s\S]*?display: "none"/);
  assert.match(tabsSource, /getOpenSession\(localWorkspace\)/);
});

test("Countdown keeps every preset, secondary custom input, and existing start semantics", () => {
  assert.deepEqual(FOCUS_COUNTDOWN_PRESETS, [2, 5, 10, 25, 50]);
  assert.match(source, /FOCUS_COUNTDOWN_PRESETS\.map/);
  assert.match(source, /<ChoiceButton\s+balanced\s+compact/);
  assert.match(source, /choiceBalanced: \{ flexBasis: "29%", flexGrow: 1 \}/);
  assert.match(source, /label=\{`\$\{minutes\} min`\}/);
  assert.match(source, /label="Custom"/);
  assert.match(source, /summary=\{customMinutes && customDuration \? `\$\{customDuration\} min` : undefined\}/);
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
  assert.match(source, /label="Details"/);
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
