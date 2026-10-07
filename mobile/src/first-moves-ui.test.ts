import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { DIRECTIONS, INTENDED_DURATIONS, STUCK_STATES } from "./domain/models.ts";

const source = readFileSync(
  new URL("./app/(tabs)/first-moves.tsx", import.meta.url),
  "utf8",
);
const pixelScenesSource = readFileSync(
  new URL("./components/pixel-scenes.tsx", import.meta.url),
  "utf8",
);
const pixelKittenSource = readFileSync(
  new URL("./components/pixel-kitten.tsx", import.meta.url),
  "utf8",
);
const tabsSource = readFileSync(
  new URL("./app/(tabs)/_layout.tsx", import.meta.url),
  "utf8",
);

test("First Move adds an illustration-led landing without changing the three guided steps", () => {
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
  assert.match(source, /type FlowStep = "landing" \| "stuck-state" \| "direction" \| "move"/);
  assert.match(source, /visualPreview === "step-1"[\s\S]*?\? "stuck-state"/);
  assert.match(source, /visualPreview === "step-2"[\s\S]*?\? "direction"/);
  assert.match(source, /if \(step === "landing"\)/);
  assert.match(source, /<SafeAreaView/);
  assert.match(source, />Feeling stuck\?</);
  assert.match(source, />Try one small action today\.</);
  assert.match(source, /<PixelKittenScene/);
  assert.doesNotMatch(source, /heroGlow/);
  assert.doesNotMatch(pixelScenesSource, /translateX/);
  assert.match(pixelScenesSource, /centerArtwork/);
  assert.match(pixelScenesSource, /hero/);
  assert.match(pixelScenesSource, /blinking=\{false\}/);
  assert.match(pixelScenesSource, /kittenSceneFloor/);
  assert.doesNotMatch(pixelKittenSource, /HeroSittingKitten/);
  assert.match(source, /landingCopy:[\s\S]*?flex: 23/);
  assert.match(source, /landingHero:[\s\S]*?flex: 52/);
  assert.match(source, /landingActionZone:[\s\S]*?flex: 25[\s\S]*?justifyContent: "flex-end"/);
  assert.match(source, /title="Start small"/);
  assert.match(source, /onPress=\{\(\) => setStep\("stuck-state"\)\}/);
  assert.match(source, /if \(!__DEV__ \|\| !visualPreview\) return undefined/);
  assert.match(source, /STUCK_STATES\.map/);
  assert.match(source, /DIRECTIONS\.map/);
  assert.match(source, /INTENDED_DURATIONS\.map/);
  assert.match(source, /setStep\("direction"\)/);
  assert.match(source, /setStep\("move"\)/);
});

test("First Move steps use illustrated choice tiles instead of settings rows", () => {
  const steps = source.slice(
    source.indexOf('{step === "stuck-state"'),
    source.indexOf('{notice && step !== "move"'),
  );
  assert.match(steps, /style=\{styles\.flowSurface\}/);
  assert.match(steps, /style=\{styles\.choiceList\}/);
  assert.match(steps, /<StuckStateSymbol state=\{value\}/);
  assert.match(steps, /<PixelDirectionIcon direction=\{value\}/);
  assert.match(source, /tileChoice/);
  assert.doesNotMatch(source, /choiceChevron/);
  assert.doesNotMatch(steps, /<Card tone="primary">/);
});

test("First Move controls retain accessibility, touch targets, and save semantics", () => {
  assert.match(source, /accessibilityRole=\{compact \? "radio" : "button"\}/);
  assert.match(source, /accessibilityState=\{\{ selected \}\}/);
  assert.match(source, /minHeight: touchTarget/);
  assert.match(source, /accessibilityLabel="First Move wording"/);
  assert.match(source, /maxLength=\{160\}/);
  assert.match(source, /setTemplateId\(undefined\)/);
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

test("the primary bottom tab uses the singular accessible product label", () => {
  assert.match(
    tabsSource,
    /name="first-moves"[\s\S]*?tabBarAccessibilityLabel: "First Move"[\s\S]*?title: "First Move"/,
  );
  assert.doesNotMatch(tabsSource, /title: "First Moves"/);
});

test("the landing attention treatment respects reduced motion", () => {
  assert.match(pixelScenesSource, /AccessibilityInfo\.isReduceMotionEnabled\(\)/);
  assert.match(pixelScenesSource, /"reduceMotionChanged"/);
  assert.match(pixelScenesSource, /if \(!attention \|\| reduceMotion\) return undefined/);
  assert.match(pixelScenesSource, /accessibilityLabel=\{accessibilityLabel\}/);
  assert.equal((pixelScenesSource.match(/styles\.attentionPixel(?:One|Two|Four|Five)/g) ?? []).length, 4);
});

test("all five Directions use distinct reusable pixel pictograms", () => {
  assert.match(pixelScenesSource, /export function PixelDirectionIcon/);
  for (const symbol of [
    "laptopScreen",
    "homeRoof",
    "dumbbellBar",
    "controllerBody",
    "restMoon",
  ]) {
    assert.match(pixelScenesSource, new RegExp(`styles\\.${symbol}`));
  }
  assert.doesNotMatch(source, /directionPixel|DirectionSymbol/);
});
