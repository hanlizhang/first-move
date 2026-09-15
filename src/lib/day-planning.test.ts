import assert from "node:assert/strict";
import test from "node:test";

import { handleOrganizeDay } from "../app/api/organize-day/route.ts";
import type { AiAuthorizer } from "./ai-access.ts";
import { MAX_BRAIN_DUMP_LENGTH, createMockDayPlan, organizeWithOpenAI, parseDayPlan, planningMode, requestDayPlan } from "./day-planning.ts";

const authorize: AiAuthorizer = async (_request, input) => ({
  outcome: "authorized",
  quota: {
    accessBasis: "introductory",
    feature: input.feature,
    remainingIntroductoryTotal: 4,
  },
});

test("mock planning is the safe default and returns bounded concrete items", () => {
  assert.equal(planningMode({}), "mock");
  const plan = createMockDayPlan("write report\nrest\nwalk\nwatch a film");
  assert.equal(plan.priorityTasks.length, 0); assert.equal(plan.optionalTasks.length, 3);
  assert.ok(plan.firstMove.firstStep.length > 0);
  for (const item of [...plan.priorityTasks, ...plan.optionalTasks]) assert.ok(item.firstStep.length > 0);
});

test("mock priorities use explicit signals instead of narration order", () => {
  const plan = createMockDayPlan("tidy desk\nread a book\nsubmit client report by noon");
  assert.deepEqual(plan.priorityTasks.map((item) => item.title), ["submit client report by noon"]);
  assert.deepEqual(plan.optionalTasks.map((item) => item.title), ["tidy desk", "read a book"]);
  assert.equal(plan.firstMove.title, "submit client report by noon");
});

test("mock planning reduces task size when low energy is explicit", () => {
  const plan = createMockDayPlan("I have low energy\nwrite report");
  assert.equal(plan.suggestedDuration, 2);
  assert.ok([...plan.priorityTasks, ...plan.optionalTasks].every((item) => item.durationMinutes === 2));
});

test("client validates input and makes exactly one explicit request", async () => {
  let calls = 0; let authorization = ""; let requestId = "";
  const plan = createMockDayPlan("write report");
  const request: typeof fetch = async (_input, init) => {
    calls += 1;
    const headers = new Headers(init?.headers);
    authorization = headers.get("authorization") ?? "";
    requestId = headers.get("x-request-id") ?? "";
    return Response.json(plan, { headers: { "X-Planning-Mode": "mock" } });
  };
  assert.equal((await requestDayPlan("   ", request)).outcome, "failure");
  assert.equal((await requestDayPlan("x".repeat(MAX_BRAIN_DUMP_LENGTH + 1), request)).outcome, "failure");
  assert.equal((await requestDayPlan("write report", request, "supabase-token")).outcome, "success");
  assert.equal(calls, 1);
  assert.equal(authorization, "Bearer supabase-token");
  assert.match(requestId, /^[0-9a-f-]{36}$/);
});

test("trusted AI planning denial messages preserve the manual path", async () => {
  const cases = [
    ["unauthenticated", /Sign in to use live AI planning/],
    ["introductory_quota_exhausted", /five introductory AI actions are used/],
    ["pro_feature_quota_exhausted", /Today’s Pro AI planning action is used/],
    ["revenuecat_unavailable", /temporarily unavailable/],
    ["quota_service_unavailable", /temporarily unavailable/],
    ["openai_provider_failure", /AI planning request failed/],
  ] as const;
  for (const [code, expected] of cases) {
    const status = code === "unauthenticated" ? 401 : code === "openai_provider_failure" ? 502 : code.includes("quota_exhausted") ? 429 : 503;
    const result = await requestDayPlan(
      "write report",
      async () => Response.json({ code }, { status }),
      "access-token",
    );
    assert.equal(result.outcome, "failure");
    if (result.outcome === "failure") {
      assert.match(result.message, expected);
      assert.match(result.message, /manual/i);
    }
  }
});

test("OpenAI planning uses structured bounded Responses parameters", async () => {
  const expected = createMockDayPlan("work"); let captured: Record<string, unknown> | undefined;
  const client = { create: async (parameters: unknown) => { captured = parameters as Record<string, unknown>; return { output_text: JSON.stringify(expected) }; } };
  const plan = await organizeWithOpenAI(client as never, "work");
  assert.deepEqual(plan, expected); assert.equal(captured?.model, "gpt-5.6-luna"); assert.equal(captured?.store, false);
  assert.deepEqual(captured?.reasoning, { effort: "none" }); assert.equal(captured?.max_output_tokens, 800);
  const instructions = String(captured?.instructions);
  assert.match(instructions, /Narration order is not priority order/);
  assert.match(instructions, /deadlines, appointments, external commitments, prerequisites, and high-impact tasks/);
  assert.match(instructions, /exactly one smallest concrete First Move/);
  assert.match(instructions, /invent obligations/);
});

test("planning parser rejects malformed, excessive, and invalid-category output", () => {
  const plan = createMockDayPlan("one");
  assert.throws(() => parseDayPlan("not json"));
  assert.throws(() => parseDayPlan(JSON.stringify({ ...plan, priorityTasks: Array(4).fill(plan.firstMove) })));
  assert.throws(() => parseDayPlan(JSON.stringify({ ...plan, firstMove: { ...plan.firstMove, category: "Other" } })));
});

test("route mock mode never constructs OpenAI and rejects empty or long input", async () => {
  let clients = 0; const dependencies = { environment: {}, createClient: () => { clients += 1; throw new Error("must not run"); } };
  const valid = await handleOrganizeDay(jsonRequest("write report"), dependencies);
  const empty = await handleOrganizeDay(jsonRequest("  "), dependencies);
  const long = await handleOrganizeDay(jsonRequest("x".repeat(MAX_BRAIN_DUMP_LENGTH + 1)), dependencies);
  assert.equal(valid.status, 200); assert.equal(empty.status, 400); assert.equal(long.status, 413); assert.equal(clients, 0);
});

test("route calls a mocked OpenAI client once only in configured live mode", async () => {
  let calls = 0; const expected = createMockDayPlan("work");
  const response = await handleOrganizeDay(jsonRequest("work"), { environment: { OPENAI_LIVE_PLANNING: "true", OPENAI_API_KEY: "test-only", OPENAI_MODEL: "must-not-override" }, authorize, createClient: () => ({ create: async (parameters: unknown) => { calls += 1; assert.equal((parameters as { model: string }).model, "gpt-5.6-luna"); return { output_text: JSON.stringify(expected) }; } }) as never });
  assert.equal(response.status, 200); assert.equal(response.headers.get("x-planning-mode"), "live"); assert.equal(calls, 1);
  assert.deepEqual((await response.json() as { quota: unknown }).quota, { accessBasis: "introductory", feature: "daily_plan", remainingIntroductoryTotal: 4 });
});

test("unauthenticated live planning is rejected before OpenAI dispatch", async () => {
  let clients = 0;
  const response = await handleOrganizeDay(jsonRequest("work"), {
    environment: { OPENAI_LIVE_PLANNING: "true", OPENAI_API_KEY: "test-only" },
    createClient: () => { clients += 1; throw new Error("must not run"); },
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json() as { code: string }).code, "unauthenticated");
  assert.equal(clients, 0);
});

test("quota and RevenueCat failures reject planning before OpenAI dispatch", async () => {
  for (const code of ["revenuecat_unavailable", "quota_service_unavailable"] as const) {
    let clients = 0;
    const response = await handleOrganizeDay(jsonRequest("work"), {
      environment: { OPENAI_LIVE_PLANNING: "true", OPENAI_API_KEY: "test-only" },
      authorize: async () => ({ outcome: "denied", code }),
      createClient: () => { clients += 1; throw new Error("must not run"); },
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json() as { code: string }).code, code);
    assert.equal(clients, 0);
  }
});

test("provider failure consumes one authorization but never retries OpenAI", async () => {
  let authorizations = 0; let providerCalls = 0;
  const response = await handleOrganizeDay(jsonRequest("work"), {
    environment: { OPENAI_LIVE_PLANNING: "true", OPENAI_API_KEY: "test-only" },
    authorize: async (request, input) => { authorizations += 1; return authorize(request, input); },
    createClient: () => ({ create: async () => { providerCalls += 1; throw new Error("provider failed"); } }) as never,
  });
  assert.equal(response.status, 502);
  assert.equal((await response.json() as { code: string }).code, "openai_provider_failure");
  assert.equal(authorizations, 1);
  assert.equal(providerCalls, 1);
});

function jsonRequest(brainDump: string): Request { return new Request("http://local/api/organize-day", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brainDump }) }); }
