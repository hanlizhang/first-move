import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { DIRECTIONS, INTENDED_DURATIONS, STUCK_STATES } from "./domain/models.ts";

const source = readFileSync(
  new URL("./app/(tabs)/first-moves.tsx", import.meta.url),
  "utf8",
);

test("First Moves preserves every guided choice and the three-step flow", () => {
  assert.equal(STUCK_STATES.length, 6);
  assert.deepEqual(STUCK_STATES, [
    "scrolling and unable to stop",
    "in bed and unable to get up",
    "knows what to do but cannot start",
    "overwhelmed by a large task",
    "needs intentional rest",
    "unsure what is needed",
  ]);
  assert.equal(DIRECTIONS.length, 5);
  assert.deepEqual(INTENDED_DURATIONS, [2, 5, 10, 25]);
  assert.match(source, /type FlowStep = "stuck-state" \| "direction" \| "move"/);
  assert.match(source, /STUCK_STATES\.map/);
  assert.match(source, /DIRECTIONS\.map/);
  assert.match(source, /INTENDED_DURATIONS\.map/);
  assert.match(source, /setStep\("direction"\)/);
  assert.match(source, /setStep\("move"\)/);
});

test("First Move steps use lightweight rows instead of stacked questionnaire cards", () => {
  const steps = source.slice(
    source.indexOf('{step === "stuck-state"'),
    source.indexOf('{notice && step !== "move"'),
  );
  assert.match(steps, /style=\{styles\.flowSurface\}/);
  assert.match(steps, /style=\{styles\.choiceList\}/);
  assert.match(source, /StyleSheet\.hairlineWidth/);
  assert.match(source, /choiceChevron/);
  assert.doesNotMatch(steps, /<Card tone="primary">/);
});

test("First Move controls retain accessibility, touch targets, and save semantics", () => {
  assert.match(source, /accessibilityRole=\{compact \? "radio" : "button"\}/);
  assert.match(source, /accessibilityState=\{\{ selected \}\}/);
  assert.match(source, /minHeight: touchTarget/);
  assert.match(source, /accessibilityLabel="First Move wording"/);
  assert.match(source, /createPendingIntent\(state/);
  assert.match(source, /title=\{saving \? "Saving…" : "Save this First Move"\}/);
  for (const label of [
    "Choose another",
    "Make duration shorter",
    "Enter my own move",
    "Change direction",
    "Cancel",
  ]) {
    assert.match(source, new RegExp(`label="${label}"`));
  }
});
