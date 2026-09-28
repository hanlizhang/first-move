import assert from "node:assert/strict";
import test from "node:test";

import { GUEST_DAILY_PLANS_KEY } from "../local/daily-plans.ts";
import { GUEST_WORKSPACE_KEY } from "../local/repository-core.ts";
import { morningSkipStorageKey } from "../local/morning-skip.ts";
import {
  APPLE_SUBSCRIPTION_MANAGEMENT_URL,
  MOBILE_ACCOUNT_DELETION_CONFIRMATION,
  accountDeletionQuarantineKey,
  accountScopedMobileKeys,
  finalizeAcceptedMobileAccountDeletion,
  initiateMobileAccountDeletion,
  openAppleSubscriptionManagement,
  purgeMobileAccountData,
} from "./account-deletion.ts";

const USER_A = "10000000-0000-4000-8000-000000000001";
const USER_B = "20000000-0000-4000-8000-000000000002";

test("deletion initiation sends bearer identity and exact confirmation only", async () => {
  let requestBody = "";
  const outcome = await initiateMobileAccountDeletion({
    apiBaseUrl: "https://firstmove.test/",
    auth: sessionSource(USER_A),
    expectedUserId: USER_A,
    confirmation: MOBILE_ACCOUNT_DELETION_CONFIRMATION,
    request: async (input, init) => {
      assert.equal(input, "https://firstmove.test/api/account-deletion/initiate");
      assert.equal(init?.method, "POST");
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        "Bearer private-session-token",
      );
      requestBody = String(init?.body);
      return Response.json({ status: "in_progress" }, { status: 202 });
    },
  });
  assert.equal(outcome, "accepted");
  assert.deepEqual(JSON.parse(requestBody), {
    confirmation: MOBILE_ACCOUNT_DELETION_CONFIRMATION,
  });
  assert.doesNotMatch(requestBody, new RegExp(USER_A, "i"));
});

test("missing exact confirmation or a mismatched session never calls initiation", async () => {
  for (const input of [
    { confirmation: "delete my account", auth: sessionSource(USER_A) },
    {
      confirmation: MOBILE_ACCOUNT_DELETION_CONFIRMATION,
      auth: sessionSource(USER_B),
    },
  ]) {
    let requests = 0;
    const outcome = await initiateMobileAccountDeletion({
      apiBaseUrl: "https://firstmove.test",
      auth: input.auth,
      expectedUserId: USER_A,
      confirmation: input.confirmation,
      request: async () => {
        requests += 1;
        return Response.json({ status: "in_progress" }, { status: 202 });
      },
    });
    assert.notEqual(outcome, "accepted");
    assert.equal(requests, 0);
  }
});

test("server recent-auth denial is preserved as a reauthentication requirement", async () => {
  const outcome = await initiateMobileAccountDeletion({
    apiBaseUrl: "https://firstmove.test",
    auth: sessionSource(USER_A),
    expectedUserId: USER_A,
    confirmation: MOBILE_ACCOUNT_DELETION_CONFIRMATION,
    request: async () =>
      Response.json(
        { status: "reauthentication_required" },
        { status: 403 },
      ),
  });
  assert.equal(outcome, "reauthentication-required");
});

test("owner cleanup removes only the deleted UUID and preserves Guest and another account", async () => {
  const guestMorningKey = morningSkipStorageKey(GUEST_WORKSPACE_KEY);
  const values = new Map<string, string>([
    [GUEST_WORKSPACE_KEY, "guest-workspace"],
    [GUEST_DAILY_PLANS_KEY, "guest-plans"],
    [guestMorningKey, "2026-09-28"],
    ...accountScopedMobileKeys(USER_A).map((key) => [key, "account-a"] as const),
    ...accountScopedMobileKeys(USER_B).map((key) => [key, "account-b"] as const),
  ]);
  await purgeMobileAccountData(memoryStore(values), USER_A);

  for (const key of accountScopedMobileKeys(USER_A)) {
    assert.equal(values.has(key), false);
  }
  assert.equal(values.get(accountDeletionQuarantineKey(USER_A)), "1");
  assert.equal(values.get(GUEST_WORKSPACE_KEY), "guest-workspace");
  assert.equal(values.get(GUEST_DAILY_PLANS_KEY), "guest-plans");
  assert.equal(values.get(guestMorningKey), "2026-09-28");
  for (const key of accountScopedMobileKeys(USER_B)) {
    assert.equal(values.get(key), "account-b");
  }
});

test("accepted deletion stops account activity before cleanup and clears the local session", async () => {
  const events: string[] = [];
  const values = new Map(
    accountScopedMobileKeys(USER_A).map((key) => [key, "account-a"]),
  );
  await finalizeAcceptedMobileAccountDeletion({
    userId: USER_A,
    store: memoryStore(values),
    stopAccountActivity() {
      events.push("stop-sync-and-memory");
    },
    async removeRevenueCatIdentity(userId) {
      events.push(`revenuecat:${userId}`);
    },
    auth: {
      async signOut(input) {
        events.push(`auth:${input.scope}`);
        return { error: null };
      },
    },
  });
  assert.equal(events[0], "stop-sync-and-memory");
  assert.ok(events.includes(`revenuecat:${USER_A}`));
  assert.ok(events.includes("auth:local"));
  assert.equal(values.get(accountDeletionQuarantineKey(USER_A)), "1");
  assert.equal(values.has(accountScopedMobileKeys(USER_A)[2]!), false);
});

test("Apple subscription management opens Apple's supported account URL", async () => {
  const opened: string[] = [];
  assert.equal(
    await openAppleSubscriptionManagement(async (url) => {
      opened.push(url);
    }),
    true,
  );
  assert.deepEqual(opened, [APPLE_SUBSCRIPTION_MANAGEMENT_URL]);
});

function sessionSource(userId: string) {
  return {
    async getSession() {
      return {
        data: {
          session: {
            access_token: "private-session-token",
            user: { id: userId },
          },
        },
        error: null,
      };
    },
  };
}

function memoryStore(values: Map<string, string>) {
  return {
    async getItem(key: string) {
      return values.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      values.set(key, value);
    },
    async removeItem(key: string) {
      values.delete(key);
    },
  };
}
