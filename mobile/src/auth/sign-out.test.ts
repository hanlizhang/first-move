import assert from "node:assert/strict";
import test from "node:test";

import { signOutWithoutDeletingLocalData } from "./sign-out.ts";

test("sign out clears auth through Supabase without touching guest or cloud cache data", async () => {
  const localData = new Map([
    ["first-move:mobile:guest:v1", "guest-private-data"],
    ["first-move:mobile:cloud-cache:v1:user", "validated-cloud-cache"],
  ]);
  let calls = 0;
  const result = await signOutWithoutDeletingLocalData({
    async signOut() {
      calls += 1;
      return { error: null };
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  assert.equal(localData.get("first-move:mobile:guest:v1"), "guest-private-data");
  assert.equal(
    localData.get("first-move:mobile:cloud-cache:v1:user"),
    "validated-cloud-cache",
  );
});
