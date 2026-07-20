import assert from "node:assert/strict";
import test from "node:test";

import { normalizeAppState } from "./app-state.ts";
import { MAX_MORNING_ATTEMPTS, completeMorningCheck, morningAttemptCount, morningVerificationMode, recordMorningAttempt, verifyToothbrushPhoto } from "./morning-check.ts";
import { createEmptyState } from "./models.ts";
import { loadAppState, saveAppState, type StorageLike } from "./repository.ts";
import { MORNING_REWARD_POINTS } from "./rewards.ts";

const dateKey = "2026-07-20";
const clock = () => "2026-07-20T07:00:00.000Z";

test("mock verification is the default and makes a deterministic local decision", async () => {
  assert.equal(morningVerificationMode({}), "mock");
  const passRequest: typeof fetch = async () => Response.json({ passed: true, detectedObject: "toothbrush", shortMessage: "Passed." }, { headers: { "X-Verification-Mode": "mock" } });
  const failRequest: typeof fetch = async () => Response.json({ passed: false, detectedObject: "none", shortMessage: "Try again." });
  assert.deepEqual(await verifyToothbrushPhoto(new Blob(["local"]), "pass", passRequest), { outcome: "pass", mode: "mock" });
  assert.equal((await verifyToothbrushPhoto(new Blob(["local"]), "fail", failRequest)).outcome, "fail");
});

test("live mode is explicit and client network errors do not retry", async () => {
  assert.equal(morningVerificationMode({ OPENAI_LIVE_VISION: "true" }), "live");
  let calls = 0;
  const request: typeof fetch = async () => { calls += 1; throw new Error("offline"); };
  assert.equal((await verifyToothbrushPhoto(new Blob(), "pass", request)).outcome, "unavailable");
  assert.equal(calls, 1);
});

test("morning verification attempts stop at three per local date", () => {
  let state = createEmptyState();
  for (let index = 0; index < 5; index += 1) state = recordMorningAttempt(state, dateKey);
  assert.equal(morningAttemptCount(state, dateKey), MAX_MORNING_ATTEMPTS);
  assert.equal(state.morningAttempts.length, 1);
});

test("a morning check and reward are created exactly once per local date", () => {
  const first = completeMorningCheck(createEmptyState(), dateKey, "camera", "mock", clock);
  const duplicate = completeMorningCheck(first, dateKey, "upload", "mock", clock);
  assert.equal(duplicate.morningChecks.length, 1);
  assert.equal(duplicate.morningChecks[0].captureMethod, "camera");
  assert.equal(duplicate.rewardEvents.filter((event) => event.source === "morning").length, 1);
  assert.equal(duplicate.progress.points, MORNING_REWARD_POINTS);
  assert.deepEqual(duplicate.progress.activeDateKeys, [dateKey]);
});

test("the next local date creates a new check and reward", () => {
  const first = completeMorningCheck(createEmptyState(), dateKey, "camera", "mock", clock);
  const next = completeMorningCheck(first, "2026-07-21", "upload", "mock", () => "2026-07-21T07:00:00.000Z");
  assert.equal(next.morningChecks.length, 2);
  assert.equal(next.progress.points, MORNING_REWARD_POINTS * 2);
});

test("repository persists only check metadata and recovers malformed checks", () => {
  const values = new Map<string, string>();
  const storage: StorageLike = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
  const state = completeMorningCheck(createEmptyState(), dateKey, "camera", "mock", clock);
  assert.equal(saveAppState(storage, state), true);
  const serialized = [...values.values()][0];
  assert.equal(serialized.includes("image"), false);
  assert.equal(loadAppState(storage).morningChecks.length, 1);
  const recovered = normalizeAppState({ morningChecks: [{ dateKey, verifiedAt: clock(), captureMethod: "camera", verifierMode: "mock" }, { dateKey: "bad", image: "secret" }], morningAttempts: [{ dateKey, count: 99 }, { dateKey: "bad", count: 2 }] });
  assert.equal(recovered.morningChecks.length, 1);
  assert.equal("image" in recovered.morningChecks[0], false);
  assert.equal(recovered.morningAttempts[0].count, MAX_MORNING_ATTEMPTS);
});
