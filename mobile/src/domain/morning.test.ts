import assert from "node:assert/strict";
import test from "node:test";

import { createEmptyState } from "./models.ts";
import {
  completeMorningCheck,
  morningStep,
} from "./morning.ts";

const TODAY = "2026-09-15";

test("toothbrush success preserves one-check Morning semantics and server reward authority", () => {
  const completed = completeMorningCheck(
    createEmptyState(),
    TODAY,
    "camera",
    "live",
    {
      clock: () => "2026-09-15T06:30:00.000Z",
    },
  );
  const duplicate = completeMorningCheck(completed, TODAY, "upload", "live");
  assert.deepEqual(completed.morningChecks, [
    {
      dateKey: TODAY,
      verifiedAt: "2026-09-15T06:30:00.000Z",
      captureMethod: "camera",
      verifierMode: "live",
    },
  ]);
  assert.equal(completed.rewardEvents.length, 0);
  assert.equal(completed.progress.points, 0);
  assert.equal(duplicate, completed);
});

test("Skip advances to Plan my day without creating a check, reward, attempt, or image data", () => {
  const state = createEmptyState();
  assert.equal(morningStep({ complete: false, skipped: true }), "plan");
  assert.deepEqual(state.morningChecks, []);
  assert.deepEqual(state.morningAttempts, []);
  assert.deepEqual(state.rewardEvents, []);
  assert.doesNotMatch(JSON.stringify(state), /image|photo|jpeg|base64/i);
});
