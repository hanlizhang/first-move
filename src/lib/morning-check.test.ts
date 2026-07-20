import assert from "node:assert/strict";
import test from "node:test";

import { normalizeAppState } from "./app-state.ts";
import { completeMorningCheck, morningVerificationMode, verifyToothbrushPhoto } from "./morning-check.ts";
import { createEmptyState } from "./models.ts";
import { loadAppState, saveAppState, type StorageLike } from "./repository.ts";
import { MORNING_REWARD_POINTS } from "./rewards.ts";

const dateKey = "2026-07-20";
const clock = () => "2026-07-20T07:00:00.000Z";

test("mock verification is the default and makes a deterministic local decision", async () => {
  assert.equal(morningVerificationMode({}), "mock");
  assert.deepEqual(await verifyToothbrushPhoto(new Blob(["local"]), "pass", {}), { outcome: "pass" });
  assert.equal((await verifyToothbrushPhoto(new Blob(["local"]), "fail", {})).outcome, "fail");
});

test("live flag remains unavailable without making an external request", async () => {
  assert.equal(morningVerificationMode({ OPENAI_LIVE_VISION: "true" }), "live");
  assert.equal((await verifyToothbrushPhoto(new Blob(), "pass", { OPENAI_LIVE_VISION: "true" })).outcome, "unavailable");
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
  const recovered = normalizeAppState({ morningChecks: [{ dateKey, verifiedAt: clock(), captureMethod: "camera", verifierMode: "mock" }, { dateKey: "bad", image: "secret" }] });
  assert.equal(recovered.morningChecks.length, 1);
  assert.equal("image" in recovered.morningChecks[0], false);
});
