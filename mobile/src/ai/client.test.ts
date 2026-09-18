import assert from "node:assert/strict";
import test from "node:test";

import {
  aiAccessForUser,
  featureRemaining,
  mobileAiAccessPresentation,
} from "./access.ts";
import {
  loadMobileAiAccessStatus,
  requestMobileDayPlan,
  requestMobileToothbrushVerification,
  type MobileAiSessionSource,
} from "./client.ts";

const USER_A = "10000000-0000-4000-8000-000000000001";
const USER_B = "20000000-0000-4000-8000-000000000002";

function auth(userId = USER_A, token = "current-access-token"): MobileAiSessionSource {
  return {
    async getSession() {
      return {
        data: { session: { access_token: token, user: { id: userId } } },
        error: null,
      };
    },
  };
}

test("Guest status, planning, and toothbrush paths never call AI APIs", async () => {
  let calls = 0;
  const request: typeof fetch = async () => {
    calls += 1;
    throw new Error("Guest request must not run");
  };
  const session = auth();
  const context = { apiBaseUrl: "https://server.example", auth: session, request };

  assert.deepEqual(await loadMobileAiAccessStatus(context), { status: "guest" });
  const planning = await requestMobileDayPlan("One thing", context);
  assert.equal(planning.outcome, "failure");
  assert.equal(planning.outcome === "failure" ? planning.kind : "", "sign-in-required");
  assert.equal(
    (await requestMobileToothbrushVerification(new Blob(["image"], { type: "image/jpeg" }), context)).outcome,
    "failure",
  );
  assert.equal(calls, 0);
});

test("every authenticated call reads and sends the current Supabase bearer token", async () => {
  let token = "token-one";
  const received: string[] = [];
  const session: MobileAiSessionSource = {
    async getSession() {
      return {
        data: { session: { access_token: token, user: { id: USER_A } } },
        error: null,
      };
    },
  };
  const request: typeof fetch = async (_url, init) => {
    received.push(new Headers(init?.headers).get("authorization") ?? "");
    return Response.json({
      plan: "free",
      accessBasis: "introductory",
      remainingIntroductoryTotal: 4,
    });
  };
  const context = {
    apiBaseUrl: "https://server.example",
    auth: session,
    request,
    userId: USER_A,
  };
  await loadMobileAiAccessStatus(context);
  token = "token-two";
  await loadMobileAiAccessStatus(context);
  assert.deepEqual(received, ["Bearer token-one", "Bearer token-two"]);
});

test("planning sends only the explicit brain dump and never submits user_id or isPro", async () => {
  let requestedUrl = "";
  let body = "";
  let authorization = "";
  const request: typeof fetch = async (url, init) => {
    requestedUrl = String(url);
    body = String(init?.body);
    authorization = new Headers(init?.headers).get("authorization") ?? "";
    return Response.json({
      firstMove: item("Open the draft", "Open the draft"),
      priorityTasks: [],
      optionalTasks: [],
      suggestedCategory: "Work & Study",
      suggestedDuration: 2,
    });
  };
  const result = await requestMobileDayPlan("  Finish report  ", {
    apiBaseUrl: "https://server.example/",
    auth: auth(),
    request,
    requestId: () => "30000000-0000-4000-8000-000000000003",
    userId: USER_A,
  });

  assert.equal(result.outcome, "success");
  assert.equal(requestedUrl, "https://server.example/api/organize-day");
  assert.equal(authorization, "Bearer current-access-token");
  assert.deepEqual(JSON.parse(body), { brainDump: "Finish report" });
  assert.doesNotMatch(body, /user_id|isPro/i);
});

test("toothbrush upload is raw image data with no client identity or entitlement fields", async () => {
  let body: BodyInit | null | undefined;
  let headers = new Headers();
  const image = new Blob(["jpeg-bytes"], { type: "image/jpeg" });
  const result = await requestMobileToothbrushVerification(image, {
    apiBaseUrl: "https://server.example",
    auth: auth(),
    userId: USER_A,
    requestId: () => "40000000-0000-4000-8000-000000000004",
    request: async (_url, init) => {
      body = init?.body;
      headers = new Headers(init?.headers);
      return Response.json(
        { passed: true, detectedObject: "toothbrush", shortMessage: "Passed." },
        { headers: { "X-Verification-Mode": "live" } },
      );
    },
  });

  assert.deepEqual(result, { outcome: "pass", mode: "live" });
  assert.equal(body, image);
  assert.equal(headers.get("authorization"), "Bearer current-access-token");
  assert.equal(headers.get("content-type"), "image/jpeg");
  assert.equal(JSON.stringify(body).includes("user_id"), false);
  assert.equal(JSON.stringify(body).includes("isPro"), false);
});

test("Free and Pro presentations use only parsed server-returned remaining values", async () => {
  const free = await loadMobileAiAccessStatus({
    apiBaseUrl: "https://server.example",
    auth: auth(),
    userId: USER_A,
    request: async () => Response.json({
      plan: "free",
      accessBasis: "introductory",
      remainingIntroductoryTotal: 3,
    }),
  });
  assert.match(mobileAiAccessPresentation(free).summary, /3 of 5/);

  const pro = await loadMobileAiAccessStatus({
    apiBaseUrl: "https://server.example",
    auth: auth(),
    userId: USER_A,
    request: async () => Response.json({
      plan: "pro",
      accessBasis: "pro",
      remainingFeatureActionsToday: {
        daily_plan: 0,
        toothbrush_verification: 2,
        make_smaller: 5,
      },
    }),
  });
  assert.equal(featureRemaining(pro, "daily_plan"), 0);
  assert.equal(featureRemaining(pro, "toothbrush_verification"), 2);
  assert.deepEqual(mobileAiAccessPresentation(pro).allowances, [
    "Plan my day: 0 of 1 remaining today",
    "Toothbrush verification: 2 of 3 remaining today",
  ]);
});

test("account switching never presents account A AI status to account B", () => {
  const state = {
    status: "ready" as const,
    userId: USER_A,
    access: {
      plan: "free" as const,
      accessBasis: "introductory" as const,
      remainingIntroductoryTotal: 1,
    },
  };
  assert.deepEqual(aiAccessForUser(state, USER_B), {
    status: "loading",
    userId: USER_B,
  });
  assert.deepEqual(aiAccessForUser(state, undefined), { status: "guest" });
});

test("quota, service, and provider errors remain safe and make no automatic retry", async () => {
  for (const [code, status, expected] of [
    ["introductory_quota_exhausted", 429, "introductory-exhausted"],
    ["pro_feature_quota_exhausted", 429, "pro-exhausted"],
    ["quota_service_unavailable", 503, "service-unavailable"],
    ["openai_provider_failure", 502, "provider-failure"],
  ] as const) {
    let calls = 0;
    const result = await requestMobileDayPlan("One task", {
      apiBaseUrl: "https://server.example",
      auth: auth(),
      userId: USER_A,
      request: async () => {
        calls += 1;
        return Response.json({ code }, { status });
      },
    });
    assert.equal(result.outcome, "failure");
    assert.equal(result.outcome === "failure" ? result.kind : "", expected);
    assert.match(result.outcome === "failure" ? result.message : "", /manual/i);
    assert.equal(calls, 1);
  }
});

function item(title: string, firstStep: string) {
  return {
    title,
    firstStep,
    category: "Work & Study",
    durationMinutes: 2,
  };
}
