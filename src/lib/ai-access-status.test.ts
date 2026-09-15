import assert from "node:assert/strict";
import test from "node:test";

import { handleAiAccessStatus } from "../app/api/ai-access/status/route.ts";
import {
  loadWebAiAccessStatus,
  webAiAccessPresentation,
} from "./ai-access-status.ts";
import {
  introductoryAiAccessStatus,
  proAiAccessStatus,
  readAiAccessStatus,
  readPaidAiStatus,
  serverLocalDateForTimezone,
} from "./ai-access.ts";

const USER_ID = "10000000-0000-4000-8000-000000000001";

test("trusted status derives Free identity and remaining allowance on the server", async () => {
  let statusUser = "";
  let statusBasis = "";
  const result = await readAiAccessStatus(
    new Request("http://local/api/ai-access/status?user_id=attacker&isPro=true", {
      headers: {
        Authorization: "Bearer trusted-session",
        "X-User-Id": "attacker",
        "X-Is-Pro": "true",
      },
    }),
    {
      authenticate: async (token) => {
        assert.equal(token, "trusted-session");
        return USER_ID;
      },
      verifyProEntitlement: async (userId) => {
        assert.equal(userId, USER_ID);
        return false;
      },
      readStatus: async (userId, accessBasis, accessToken) => {
        statusUser = userId;
        statusBasis = accessBasis;
        assert.equal(accessToken, "trusted-session");
        return { plan: "free", accessBasis: "introductory", remainingIntroductoryTotal: 2 };
      },
    },
  );
  assert.equal(statusUser, USER_ID);
  assert.equal(statusBasis, "introductory");
  assert.deepEqual(result, {
    outcome: "success",
    status: { plan: "free", accessBasis: "introductory", remainingIntroductoryTotal: 2 },
  });
});

test("trusted status returns separate server-derived Pro feature counts", async () => {
  const result = await readAiAccessStatus(authenticatedRequest(), {
    authenticate: async () => USER_ID,
    verifyProEntitlement: async () => true,
    readStatus: async (userId, accessBasis) => {
      assert.equal(userId, USER_ID);
      assert.equal(accessBasis, "pro");
      return {
        plan: "pro",
        accessBasis: "pro",
        remainingFeatureActionsToday: {
          daily_plan: 0,
          toothbrush_verification: 2,
          make_smaller: 5,
        },
      };
    },
  });
  assert.deepEqual(result, {
    outcome: "success",
    status: {
      plan: "pro",
      accessBasis: "pro",
      remainingFeatureActionsToday: {
        daily_plan: 0,
        toothbrush_verification: 2,
        make_smaller: 5,
      },
    },
  });
});

test("server count helpers derive Free and Pro remaining values without client counters", () => {
  assert.deepEqual(introductoryAiAccessStatus(3), {
    plan: "free",
    accessBasis: "introductory",
    remainingIntroductoryTotal: 2,
  });
  assert.deepEqual(
    proAiAccessStatus([
      "daily_plan",
      "toothbrush_verification",
      "toothbrush_verification",
      "make_smaller",
      "untrusted_feature",
    ]),
    {
      plan: "pro",
      accessBasis: "pro",
      remainingFeatureActionsToday: {
        daily_plan: 0,
        toothbrush_verification: 1,
        make_smaller: 4,
      },
    },
  );
  const instant = new Date("2026-09-15T10:30:00.000Z");
  assert.equal(serverLocalDateForTimezone(instant, "Pacific/Kiritimati"), "2026-09-16");
  assert.equal(serverLocalDateForTimezone(instant, "Pacific/Pago_Pago"), "2026-09-14");
});

test("status endpoint is read-only, no-store, and exposes presentation-safe data", async () => {
  const response = await handleAiAccessStatus(
    new Request("http://local/api/ai-access/status?isPro=true&user_id=attacker"),
    {
      environment: {},
      readStatus: async () => ({
        outcome: "success",
        status: { plan: "free", accessBasis: "introductory", remainingIntroductoryTotal: 4 },
      }),
    },
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const text = await response.text();
  assert.deepEqual(JSON.parse(text), {
    plan: "free",
    accessBasis: "introductory",
    remainingIntroductoryTotal: 4,
  });
  assert.doesNotMatch(text, /attacker|user_id|ai_usage_events|revenuecat/i);
});

test("status endpoint rejects Guest and fails closed on trusted service errors", async () => {
  for (const [code, expectedStatus] of [
    ["unauthenticated", 401],
    ["revenuecat_unavailable", 503],
    ["quota_service_unavailable", 503],
  ] as const) {
    const response = await handleAiAccessStatus(
      new Request("http://local/api/ai-access/status"),
      {
        environment: {},
        readStatus: async () => ({ outcome: "denied", code }),
      },
    );
    assert.equal(response.status, expectedStatus);
    assert.equal((await response.json() as { code: string }).code, code);
  }
});

test("Web renders trusted Pro, Free, and Guest access distinctly", () => {
  const pro = webAiAccessPresentation({
    kind: "ready",
    status: {
      plan: "pro",
      accessBasis: "pro",
      remainingFeatureActionsToday: {
        daily_plan: 0,
        toothbrush_verification: 2,
        make_smaller: 4,
      },
    },
  });
  assert.equal(pro.heading, "Current plan: Pro");
  assert.deepEqual(pro.allowances, [
    "Plan my day: 0 of 1 remaining today",
    "Toothbrush verification: 2 of 3 remaining today",
    "Make this smaller: 4 of 5 remaining today",
  ]);

  const free = webAiAccessPresentation({
    kind: "ready",
    status: { plan: "free", accessBasis: "introductory", remainingIntroductoryTotal: 3 },
  });
  assert.equal(free.heading, "Current plan: Free");
  assert.equal(free.summary, "3 of 5 AI actions remaining");

  const guest = webAiAccessPresentation({ kind: "guest" });
  assert.match(guest.heading, /unavailable until sign-in/i);
  assert.match(guest.summary, /sign in to use live AI/i);
  assert.doesNotMatch(`${guest.heading} ${guest.summary}`, /Current plan: Pro/);
});

test("Web status client sends only the bearer token and handles safe failures", async () => {
  let requestedUrl = "";
  let authorization = "";
  const loaded = await loadWebAiAccessStatus("access-token", async (input, init) => {
    requestedUrl = String(input);
    authorization = new Headers(init?.headers).get("authorization") ?? "";
    return Response.json({
      plan: "pro",
      accessBasis: "pro",
      remainingFeatureActionsToday: {
        daily_plan: 1,
        toothbrush_verification: 3,
        make_smaller: 5,
      },
    });
  });
  assert.equal(requestedUrl, "/api/ai-access/status");
  assert.equal(authorization, "Bearer access-token");
  assert.equal(loaded.kind, "ready");
  assert.deepEqual(await loadWebAiAccessStatus(undefined), { kind: "guest" });
  assert.deepEqual(
    await loadWebAiAccessStatus("expired", async () => new Response(null, { status: 401 })),
    { kind: "guest" },
  );
  assert.deepEqual(
    await loadWebAiAccessStatus("valid", async () => new Response(null, { status: 503 })),
    { kind: "unavailable" },
  );
});

test("signed-out status stops before RevenueCat and quota reads", async () => {
  let authenticationCalls = 0;
  let entitlementCalls = 0;
  let statusReads = 0;
  const result = await readAiAccessStatus(
    new Request("http://local/api/ai-access/status"),
    {
      authenticate: async () => { authenticationCalls += 1; return USER_ID; },
      verifyProEntitlement: async () => { entitlementCalls += 1; return true; },
      readStatus: async () => {
        statusReads += 1;
        return proAiAccessStatus([]);
      },
    },
  );
  assert.deepEqual(result, { outcome: "denied", code: "unauthenticated" });
  assert.equal(authenticationCalls, 0);
  assert.equal(entitlementCalls, 0);
  assert.equal(statusReads, 0);
});

test("Free status counts usage with the validated user bearer under owner RLS", async () => {
  const requests: Request[] = [];
  const status = await readPaidAiStatus(
    USER_ID,
    "introductory",
    "validated-user-token",
    supabaseEnvironment(),
    async (input, init) => {
      requests.push(new Request(input, init));
      return new Response(null, {
        status: 200,
        headers: { "Content-Range": "0-2/3" },
      });
    },
  );

  assert.deepEqual(status, {
    plan: "free",
    accessBasis: "introductory",
    remainingIntroductoryTotal: 2,
  });
  assert.equal(requests.length, 1);
  assertAuthenticatedOwnerRead(requests[0]);
  assert.match(requests[0].url, /ai_usage_events/);
  assert.match(requests[0].url, new RegExp(`user_id=eq\\.${USER_ID}`));
});

test("Pro status reads profile timezone and daily usage with the validated user bearer", async () => {
  const requests: Request[] = [];
  const status = await readPaidAiStatus(
    USER_ID,
    "pro",
    "validated-user-token",
    supabaseEnvironment(),
    async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      if (request.url.includes("/profiles?")) {
        return Response.json({ timezone: "Europe/Zurich" });
      }
      return Response.json([
        { feature: "daily_plan" },
        { feature: "toothbrush_verification" },
      ]);
    },
  );

  assert.deepEqual(status, {
    plan: "pro",
    accessBasis: "pro",
    remainingFeatureActionsToday: {
      daily_plan: 0,
      toothbrush_verification: 2,
      make_smaller: 5,
    },
  });
  assert.equal(requests.length, 2);
  requests.forEach(assertAuthenticatedOwnerRead);
  assert.match(requests[0].url, /profiles/);
  assert.match(requests[1].url, /ai_usage_events/);
  assert.match(requests[1].url, /local_date=eq\./);
});

function supabaseEnvironment(): Record<string, string> {
  return {
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-publishable-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-must-not-be-used-for-status",
  };
}

function assertAuthenticatedOwnerRead(request: Request): void {
  assert.equal(request.headers.get("authorization"), "Bearer validated-user-token");
  assert.equal(request.headers.get("apikey"), "public-publishable-key");
  assert.notEqual(
    request.headers.get("authorization"),
    "Bearer service-role-must-not-be-used-for-status",
  );
}

function authenticatedRequest(): Request {
  return new Request("http://local/api/ai-access/status", {
    headers: { Authorization: "Bearer trusted-session" },
  });
}
