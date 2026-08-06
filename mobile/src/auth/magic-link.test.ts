import assert from "node:assert/strict";
import test from "node:test";

import { requestMagicLink } from "./magic-link.ts";

test("email magic link uses the exact native callback and normalized address", async () => {
  let received: unknown;
  const result = await requestMagicLink(
    {
      async signInWithOtp(input) {
        received = input;
        return { error: null };
      },
    },
    " person@example.test ",
  );
  assert.equal(result.ok, true);
  assert.deepEqual(received, {
    email: "person@example.test",
    options: { emailRedirectTo: "firstmove://auth/callback" },
  });
});

test("email validation prevents an auth request", async () => {
  let calls = 0;
  const result = await requestMagicLink(
    {
      async signInWithOtp() {
        calls += 1;
        return { error: null };
      },
    },
    "not-an-email",
  );
  assert.equal(result.ok, false);
  assert.equal(calls, 0);
});
