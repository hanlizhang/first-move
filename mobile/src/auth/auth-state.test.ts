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
            access_token: "stored-session-token",
            user: {
              id: "90000000-0000-4000-8000-000000000001",
              email: "restored@example.test",
            },
          },
        },
        error: null,
      };
    },
    async getUser(accessToken) {
      assert.equal(accessToken, "stored-session-token");
      return {
        data: {
          user: {
            id: "90000000-0000-4000-8000-000000000001",
            email: "restored@example.test",
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
    async getUser() {
      throw new Error("must not run");
    },
  });
  assert.equal(event.type, "FAILED");
  assert.doesNotMatch(JSON.stringify(event), /token-private-detail/);
});

test("a deleted Auth identity is purged before RevenueCat identify or sync startup", async () => {
  const events: string[] = [];
  const userId = "90000000-0000-4000-8000-000000000001";
  const event = await restoreAuthSession(
    {
      async getSession() {
        events.push("session");
        return {
          data: {
            session: {
              access_token: "stale-token",
              user: { id: userId, email: "stale@example.test" },
            },
          },
          error: null,
        };
      },
      async getUser() {
        events.push("live-user");
        return {
          data: { user: null },
          error: { status: 403, code: "user_not_found" },
        };
      },
    },
    {
      async onRejectedAccount(rejectedUserId) {
        events.push(`purge:${rejectedUserId}`);
      },
    },
  );
  if (event.type === "SESSION_RESTORED" && event.user) {
    events.push("identify-revenuecat");
    events.push("start-sync");
  }
  assert.deepEqual(event, { type: "SESSION_RESTORED", user: null });
  assert.deepEqual(events, ["session", "live-user", `purge:${userId}`]);
});

test("a local deletion quarantine rejects identity before any live or downstream work", async () => {
  const events: string[] = [];
  const userId = "90000000-0000-4000-8000-000000000001";
  const event = await restoreAuthSession(
    {
      async getSession() {
        events.push("session");
        return {
          data: {
            session: {
              access_token: "quarantined-token",
              user: { id: userId },
            },
          },
          error: null,
        };
      },
      async getUser() {
        events.push("live-user");
        throw new Error("must not run");
      },
    },
    {
      async isAccountBlocked() {
        events.push("quarantine");
        return true;
      },
      async onRejectedAccount(rejectedUserId) {
        events.push(`purge:${rejectedUserId}`);
      },
    },
  );
  assert.deepEqual(event, { type: "SESSION_RESTORED", user: null });
  assert.deepEqual(events, ["session", "quarantine", `purge:${userId}`]);
});

test("an invalid session is cleared without erasing account-local data", async () => {
  const events: string[] = [];
  const userId = "90000000-0000-4000-8000-000000000001";
  const event = await restoreAuthSession(
    {
      async getSession() {
        return {
          data: {
            session: {
              access_token: "expired-token",
              user: { id: userId },
            },
          },
          error: null,
        };
      },
      async getUser() {
        return {
          data: { user: null },
          error: { status: 401, code: "session_expired" },
        };
      },
    },
    {
      async onRejectedAccount() {
        events.push("purge-account-data");
      },
      async onInvalidSession(rejectedUserId) {
        events.push(`clear-session:${rejectedUserId}`);
      },
    },
  );
  assert.deepEqual(event, { type: "SESSION_RESTORED", user: null });
  assert.deepEqual(events, [`clear-session:${userId}`]);
});

test("a live-user mismatch fails closed without deleting either account namespace", async () => {
  const events: string[] = [];
  const storedUserId = "90000000-0000-4000-8000-000000000001";
  const event = await restoreAuthSession(
    {
      async getSession() {
        return {
          data: {
            session: {
              access_token: "mismatched-token",
              user: { id: storedUserId },
            },
          },
          error: null,
        };
      },
      async getUser() {
        return {
          data: {
            user: { id: "90000000-0000-4000-8000-000000000002" },
          },
          error: null,
        };
      },
    },
    {
      async onRejectedAccount() {
        events.push("purge-account-data");
      },
      async onInvalidSession(rejectedUserId) {
        events.push(`clear-session:${rejectedUserId}`);
      },
    },
  );
  assert.deepEqual(event, { type: "SESSION_RESTORED", user: null });
  assert.deepEqual(events, [`clear-session:${storedUserId}`]);
});
