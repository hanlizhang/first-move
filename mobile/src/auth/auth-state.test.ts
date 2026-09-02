import assert from "node:assert/strict";
import test from "node:test";

import { initialAuthState, reduceAuthState, restoreAuthSession } from "./auth-state.ts";

test("auth transitions cover loading, signed-out, guest, authenticated, and error", () => {
  const signedOut = reduceAuthState(initialAuthState, { type: "SESSION_RESTORED", user: null });
  assert.equal(signedOut.status, "signed-out");
  const guest = reduceAuthState(signedOut, { type: "CONTINUE_AS_GUEST" });
  assert.equal(guest.status, "guest");
  assert.equal(reduceAuthState(guest, { type: "SIGNED_OUT" }).status, "guest");
  const authenticated = reduceAuthState(guest, {
    type: "AUTHENTICATED",
    user: { id: "90000000-0000-4000-8000-000000000001", email: "person@example.test" },
  });
  assert.equal(authenticated.status, "authenticated");
  const error = reduceAuthState(authenticated, {
    type: "FAILED",
    message: "Account unavailable.",
  });
  assert.equal(error.status, "error");
  const loading = reduceAuthState(error, { type: "RESTORE_STARTED" });
  assert.equal(loading.status, "loading");
});

test("session restore returns the existing Supabase Auth UUID", async () => {
  const event = await restoreAuthSession({
    async getSession() {
      return {
        data: {
          session: {
            user: {
              id: "90000000-0000-4000-8000-000000000001",
              email: "restored@example.test",
            },
          },
        },
        error: null,
      };
    },
  });
  assert.deepEqual(event, {
    type: "SESSION_RESTORED",
    user: {
      id: "90000000-0000-4000-8000-000000000001",
      email: "restored@example.test",
    },
  });
});

test("failed session restore offers Guest Mode and never returns the backend error", async () => {
  const event = await restoreAuthSession({
    async getSession() {
      return {
        data: { session: null },
        error: { message: "token-private-detail" },
      };
    },
  });
  assert.equal(event.type, "FAILED");
  assert.doesNotMatch(JSON.stringify(event), /token-private-detail/);
});
