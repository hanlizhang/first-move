import assert from "node:assert/strict";
import test from "node:test";

import type { AsyncKeyValueStore } from "./repository-core.ts";
import {
  MOBILE_MORNING_SKIP_KEY_PREFIX,
  loadMorningSkipFrom,
  markMorningSkippedIn,
} from "./morning-skip.ts";

test("Morning Skip persists only a date in the current owner namespace", async () => {
  const values = new Map<string, string>();
  const store: AsyncKeyValueStore = {
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
  };
  const ownerA = "first-move:mobile:account:a";
  const ownerB = "first-move:mobile:account:b";
  await markMorningSkippedIn(store, ownerA, "2026-09-15");

  assert.equal(await loadMorningSkipFrom(store, ownerA), "2026-09-15");
  assert.equal(await loadMorningSkipFrom(store, ownerB), undefined);
  assert.deepEqual([...values.entries()], [
    [`${MOBILE_MORNING_SKIP_KEY_PREFIX}${ownerA}`, "2026-09-15"],
  ]);
  assert.doesNotMatch(JSON.stringify([...values]), /image|photo|bytes|base64|reward|check|usage/i);
});
