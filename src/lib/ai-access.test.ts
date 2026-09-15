import assert from "node:assert/strict";
import test from "node:test";

import {
  authorizePaidAiRequest,
  paidAiRequestFingerprint,
  paidAiRequestId,
  revenueCatResponseHasActivePro,
  verifyRevenueCatProEntitlement,
} from "./ai-access.ts";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const REQUEST_ID = "11000000-0000-4000-8000-000000000001";
const INPUT = {
  feature: "daily_plan" as const,
  requestFingerprint: "a".repeat(64),
  requestId: REQUEST_ID,
};

test("missing bearer authentication is rejected before entitlement or quota checks", async () => {
  let authenticationCalls = 0; let revenueCatCalls = 0; let reservations = 0;
  const result = await authorizePaidAiRequest(new Request("http://local"), INPUT, {
    authenticate: async () => { authenticationCalls += 1; return USER_ID; },
    verifyProEntitlement: async () => { revenueCatCalls += 1; return false; },
    reserve: async () => { reservations += 1; return { outcome: "already_reserved" as const }; },
  });
  assert.deepEqual(result, { outcome: "denied", code: "unauthenticated" });
  assert.equal(authenticationCalls, 0);
  assert.equal(revenueCatCalls, 0);
  assert.equal(reservations, 0);
});

test("the validated Supabase user alone becomes the RevenueCat and quota identity", async () => {
  let revenueCatUser = ""; let reservedUser = ""; let reservedBasis = "";
  const request = new Request("http://local", {
    method: "POST",
    headers: { Authorization: "Bearer valid-access-token", "X-User-Id": "attacker" },
    body: JSON.stringify({ user_id: "attacker" }),
  });
  const result = await authorizePaidAiRequest(request, INPUT, {
    authenticate: async (accessToken) => {
      assert.equal(accessToken, "valid-access-token");
      return USER_ID;
    },
    verifyProEntitlement: async (userId) => { revenueCatUser = userId; return false; },
    reserve: async (input) => {
      reservedUser = input.userId;
      reservedBasis = input.accessBasis;
      return { outcome: "reserved" as const, quota: { accessBasis: "introductory" as const, feature: input.feature, remainingIntroductoryTotal: 4 } };
    },
  });
  assert.equal(revenueCatUser, USER_ID);
  assert.equal(reservedUser, USER_ID);
  assert.equal(reservedBasis, "introductory");
  assert.equal(result.outcome, "authorized");
});

test("active Pro selects Pro reservation without changing introductory history", async () => {
  let accessBasis = "";
  const result = await authorizePaidAiRequest(authenticatedRequest(), INPUT, {
    authenticate: async () => USER_ID,
    verifyProEntitlement: async () => true,
    reserve: async (input) => {
      accessBasis = input.accessBasis;
      return { outcome: "reserved" as const, quota: { accessBasis: "pro" as const, feature: input.feature, remainingFeatureActionsToday: 0 } };
    },
  });
  assert.equal(accessBasis, "pro");
  assert.deepEqual(result, { outcome: "authorized", quota: { accessBasis: "pro", feature: "daily_plan", remainingFeatureActionsToday: 0 } });
});

test("RevenueCat failure fails closed before quota reservation", async () => {
  let reservations = 0;
  const result = await authorizePaidAiRequest(authenticatedRequest(), INPUT, {
    authenticate: async () => USER_ID,
    verifyProEntitlement: async () => { throw new Error("timeout"); },
    reserve: async () => { reservations += 1; return { outcome: "already_reserved" as const }; },
  });
  assert.deepEqual(result, { outcome: "denied", code: "revenuecat_unavailable" });
  assert.equal(reservations, 0);
});

test("quota database failure fails closed", async () => {
  const result = await authorizePaidAiRequest(authenticatedRequest(), INPUT, {
    authenticate: async () => USER_ID,
    verifyProEntitlement: async () => false,
    reserve: async () => { throw new Error("database unavailable"); },
  });
  assert.deepEqual(result, { outcome: "denied", code: "quota_service_unavailable" });
});

test("an existing request reservation is never authorized for a second dispatch", async () => {
  const result = await authorizePaidAiRequest(authenticatedRequest(), INPUT, {
    authenticate: async () => USER_ID,
    verifyProEntitlement: async () => false,
    reserve: async () => ({ outcome: "already_reserved" as const }),
  });
  assert.deepEqual(result, { outcome: "denied", code: "duplicate_request" });
});

test("RevenueCat Pro parsing accepts lifetime, unexpired, and grace-period access only", () => {
  assert.equal(revenueCatResponseHasActivePro(customerInfo()), false);
  assert.equal(revenueCatResponseHasActivePro(customerInfo({ expires_date: null, grace_period_expires_date: null })), true);
  assert.equal(revenueCatResponseHasActivePro(customerInfo({ expires_date: "2026-09-16T00:00:00Z", grace_period_expires_date: null })), true);
  assert.equal(revenueCatResponseHasActivePro(customerInfo({ expires_date: "2026-09-14T00:00:00Z", grace_period_expires_date: "2026-09-16T00:00:00Z" })), true);
  assert.equal(revenueCatResponseHasActivePro(customerInfo({ expires_date: "2026-09-14T00:00:00Z", grace_period_expires_date: null })), false);
  assert.throws(() => revenueCatResponseHasActivePro({ subscriber: { entitlements: {} } }));
});

test("RevenueCat verification uses the server secret and exact Supabase App User ID", async () => {
  let requestedUrl = ""; let authorization = "";
  const mockFetch: typeof fetch = async (input, init) => {
    requestedUrl = String(input);
    authorization = new Headers(init?.headers).get("authorization") ?? "";
    return Response.json(customerInfo());
  };
  assert.equal(await verifyRevenueCatProEntitlement(USER_ID, { REVENUECAT_SECRET_API_KEY: "server-secret" }, mockFetch), false);
  assert.equal(requestedUrl, `https://api.revenuecat.com/v1/subscribers/${USER_ID}`);
  assert.equal(authorization, "Bearer server-secret");
  await assert.rejects(() => verifyRevenueCatProEntitlement(USER_ID, {}, mockFetch));
});

test("request identifiers are UUID-only and fingerprints retain no request content", () => {
  assert.deepEqual(paidAiRequestId(new Headers({ "X-Request-Id": REQUEST_ID })), { ok: true, requestId: REQUEST_ID });
  assert.deepEqual(paidAiRequestId(new Headers({ "X-Request-Id": "not-a-uuid" })), { ok: false, code: "invalid_request_id" });
  const generated = paidAiRequestId(new Headers());
  assert.equal(generated.ok, true);
  if (generated.ok) assert.match(generated.requestId, /^[0-9a-f-]{36}$/);
  const fingerprint = paidAiRequestFingerprint("daily_plan", "private prompt text");
  assert.match(fingerprint, /^[0-9a-f]{64}$/);
  assert.equal(fingerprint.includes("private prompt text"), false);
  assert.notEqual(fingerprint, paidAiRequestFingerprint("make_smaller", "private prompt text"));
});

function authenticatedRequest(): Request {
  return new Request("http://local", { headers: { Authorization: "Bearer valid-access-token" } });
}

function customerInfo(pro?: { expires_date: string | null; grace_period_expires_date: string | null }) {
  return {
    request_date: "2026-09-15T00:00:00Z",
    subscriber: { entitlements: pro ? { pro } : {} },
  };
}
