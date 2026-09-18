import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const planner = readFileSync(
  new URL("./components/day-planner.tsx", import.meta.url),
  "utf8",
);
const morning = readFileSync(
  new URL("./components/morning-plan-flow.tsx", import.meta.url),
  "utf8",
);
const settings = readFileSync(
  new URL("./app/(tabs)/settings.tsx", import.meta.url),
  "utf8",
);

test("Mobile AI presentation is integrated without a new tab and keeps manual paths", () => {
  assert.match(settings, /AiAccessPanel/);
  assert.match(planner, /Plan manually/);
  assert.match(planner, /Create Tasks directly/);
  assert.match(morning, /Skip without reward · Plan my day/);
  assert.match(morning, /Guest Mode never calls the live AI service/);
});

test("toothbrush UI keeps image state transient and explicitly deletes cache files", () => {
  assert.match(morning, /maximum of 768 px/);
  assert.match(morning, /deleteTransientFile/);
  assert.doesNotMatch(morning, /AsyncStorage|Supabase|object storage|console\./);
  assert.doesNotMatch(morning, /setItem\(|saveCloudWorkspace|saveLocalWorkspace/);
});

test("quota and provider denial copy leaves manual plan and Skip actions available", () => {
  assert.match(planner, /Manual planning remains available/);
  assert.match(morning, /Skip remains available without a reward/);
  assert.match(planner, /Organize with AI/);
  assert.match(morning, /Verify photo/);
});
