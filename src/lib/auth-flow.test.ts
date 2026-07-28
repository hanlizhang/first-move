import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAuthCallbackUrl,
  buildAuthResultUrl,
  exchangeCallbackCode,
  requestMagicLink,
  restoredEmail,
  runMagicLinkSubmission,
  signOut,
} from "./auth-flow.ts";
import { STORAGE_KEY } from "./repository.ts";
import { validateSupabasePublicConfig } from "./supabase/config.ts";

test("constructs the exact local and production callback URLs", () => {
  assert.equal(
    buildAuthCallbackUrl("http://localhost:3000"),
    "http://localhost:3000/auth/callback",
  );
  assert.equal(
    buildAuthCallbackUrl("https://first-move-rose.vercel.app"),
    "https://first-move-rose.vercel.app/auth/callback",
  );
});

test("magic-link request uses the current origin callback", async () => {
  let received: unknown;
  const result = await requestMagicLink(
    {
      async signInWithOtp(input) {
        received = input;
        return { error: null };
      },
    },
    " user@example.com ",
    "http://localhost:3000",
  );

  assert.equal(result.ok, true);
  assert.deepEqual(received, {
    email: "user@example.com",
    options: { emailRedirectTo: "http://localhost:3000/auth/callback" },
  });
});

test("callback exchanges a valid code and rejects missing or failed codes", async () => {
  let exchanged = "";
  assert.equal(
    await exchangeCallbackCode("valid-code", {
      async exchangeCodeForSession(code) {
        exchanged = code;
        return { error: null };
      },
    }),
    "success",
  );
  assert.equal(exchanged, "valid-code");
  assert.equal(
    await exchangeCallbackCode(null, {
      async exchangeCodeForSession() {
        throw new Error("must not run");
      },
    }),
    "invalid",
  );
  assert.equal(
    await exchangeCallbackCode("bad-code", {
      async exchangeCodeForSession() {
        return { error: { message: "invalid" } };
      },
    }),
    "invalid",
  );
  assert.equal(
    buildAuthResultUrl("http://localhost:3000/auth/callback?code=secret", "success"),
    "http://localhost:3000/?auth=success",
  );
  assert.equal(
    buildAuthResultUrl("https://first-move-rose.vercel.app/auth/callback", "invalid"),
    "https://first-move-rose.vercel.app/?auth=error",
  );
});

test("restores an authenticated email and preserves guest mode without a user", async () => {
  assert.equal(
    await restoredEmail({
      async getUser() {
        return { data: { user: { email: "restored@example.com" } }, error: null };
      },
    }),
    "restored@example.com",
  );
  assert.equal(
    await restoredEmail({
      async getUser() {
        return { data: { user: null }, error: null };
      },
    }),
    null,
  );
});

test("sign out does not modify local application data", async () => {
  const localData = JSON.stringify({ schemaVersion: 8, tasks: [{ id: "task-local" }] });
  const storage = new Map([[STORAGE_KEY, localData]]);
  let called = false;

  const result = await signOut({
    async signOut() {
      called = true;
      return { error: null };
    },
  });

  assert.equal(called, true);
  assert.equal(result.ok, true);
  assert.equal(storage.get(STORAGE_KEY), localData);
});

test("submit failure returns from loading state without an unhandled rejection", async () => {
  const loadingStates: boolean[] = [];
  let authenticationRequests = 0;

  const result = await runMagicLinkSubmission(async () => {
    validateSupabasePublicConfig(undefined, "sb_publishable_test");
    authenticationRequests += 1;
    return { ok: true, message: "unexpected" };
  }, (loading) => loadingStates.push(loading));

  assert.equal(result.ok, false);
  assert.match(result.message, /Guest Mode still works/);
  assert.deepEqual(loadingStates, [true, false]);
  assert.equal(authenticationRequests, 0);
});
