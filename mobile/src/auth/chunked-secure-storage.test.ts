import assert from "node:assert/strict";
import test from "node:test";

import { createChunkedSecureStorage } from "./chunked-secure-storage.ts";

function memorySecureStore() {
  const values = new Map<string, string>();
  return {
    values,
    async getItemAsync(key: string) {
      return values.get(key) ?? null;
    },
    async setItemAsync(key: string, value: string) {
      values.set(key, value);
    },
    async deleteItemAsync(key: string) {
      values.delete(key);
    },
  };
}

test("secure adapter restores a session larger than legacy Keychain value limits", async () => {
  const store = memorySecureStore();
  const storage = createChunkedSecureStorage(store, () => "generation-1");
  const session = JSON.stringify({ access_token: "a".repeat(2600), refresh_token: "r".repeat(1400) });
  await storage.setItem("supabase.auth.token", session);
  assert.equal(await storage.getItem("supabase.auth.token"), session);
  assert.ok(store.values.size > 2);
  assert.equal([...store.values.values()].some((value) => value.includes(session)), false);
});

test("secure adapter replaces generations and sign-out removal clears every chunk", async () => {
  const store = memorySecureStore();
  const generations = ["first", "second"];
  const storage = createChunkedSecureStorage(store, () => generations.shift() ?? "later");
  await storage.setItem("session", "x".repeat(1200));
  await storage.setItem("session", "new-session");
  assert.equal([...store.values.keys()].some((key) => key.includes(".first.")), false);
  assert.equal(await storage.getItem("session"), "new-session");
  await storage.removeItem("session");
  assert.equal(store.values.size, 0);
});

test("secure adapter restores and removes a legacy unchunked value", async () => {
  const store = memorySecureStore();
  store.values.set("session", "legacy-session");
  const storage = createChunkedSecureStorage(store, () => "next");
  assert.equal(await storage.getItem("session"), "legacy-session");
  await storage.removeItem("session");
  assert.equal(store.values.size, 0);
});
