import assert from "node:assert/strict";
import test from "node:test";

import { handleAuthCallback } from "./callback.ts";

test("callback exchanges a PKCE code from the exact First Move route", async () => {
  let exchanged = "";
  const result = await handleAuthCallback("firstmove://auth/callback?code=valid-code", {
    async exchangeCodeForSession(code) {
      exchanged = code;
      return { error: null };
    },
    async setSession() {
      throw new Error("must not run");
    },
  });
  assert.deepEqual(result, { status: "success" });
  assert.equal(exchanged, "valid-code");
});

test("callback accepts Supabase token fragments without returning or logging tokens", async () => {
  let received: unknown;
  const accessToken = "private-access-token";
  const refreshToken = "private-refresh-token";
  const result = await handleAuthCallback(
    `firstmove://auth/callback#access_token=${accessToken}&refresh_token=${refreshToken}`,
    {
      async exchangeCodeForSession() {
        throw new Error("must not run");
      },
      async setSession(tokens) {
        received = tokens;
        return { error: null };
      },
    },
  );
  assert.deepEqual(received, { access_token: accessToken, refresh_token: refreshToken });
  assert.deepEqual(result, { status: "success" });
  assert.doesNotMatch(JSON.stringify(result), /private-(access|refresh)-token/);
});

test("callback rejects wrong routes, missing values, and provider errors generically", async () => {
  const auth = {
    async exchangeCodeForSession() {
      return { error: { message: "token-private-detail" } };
    },
    async setSession() {
      return { error: { message: "token-private-detail" } };
    },
  };
  for (const url of [
    null,
    "https://example.test/auth/callback?code=code",
    "firstmove://other/callback?code=code",
    "firstmove://auth/callback",
    "firstmove://auth/callback?code=bad",
  ]) {
    const result = await handleAuthCallback(url, auth);
    assert.equal(result.status, "invalid");
    assert.doesNotMatch(JSON.stringify(result), /token-private-detail/);
  }
});
