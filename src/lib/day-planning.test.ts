import assert from "node:assert/strict";
import test from "node:test";

import { handleOrganizeDay } from "../app/api/organize-day/route.ts";
import { MAX_BRAIN_DUMP_LENGTH, createMockDayPlan, organizeWithOpenAI, parseDayPlan, planningMode, requestDayPlan } from "./day-planning.ts";

test("mock planning is the safe default and returns bounded concrete items", () => {
  assert.equal(planningMode({}), "mock");
  const plan = createMockDayPlan("write report\nrest\nwalk\nwatch a film");
  assert.equal(plan.priorityTasks.length, 3); assert.equal(plan.optionalTasks.length, 1);
  assert.ok(plan.firstMove.firstStep.length > 0);
  for (const item of [...plan.priorityTasks, ...plan.optionalTasks]) assert.ok(item.firstStep.length > 0);
});

test("client validates input and makes exactly one explicit request", async () => {
  let calls = 0;
  const plan = createMockDayPlan("write report");
  const request: typeof fetch = async () => { calls += 1; return Response.json(plan, { headers: { "X-Planning-Mode": "mock" } }); };
  assert.equal((await requestDayPlan("   ", request)).outcome, "failure");
  assert.equal((await requestDayPlan("x".repeat(MAX_BRAIN_DUMP_LENGTH + 1), request)).outcome, "failure");
  assert.equal((await requestDayPlan("write report", request)).outcome, "success");
  assert.equal(calls, 1);
});

test("OpenAI planning uses structured bounded Responses parameters", async () => {
  const expected = createMockDayPlan("work"); let captured: Record<string, unknown> | undefined;
  const client = { create: async (parameters: unknown) => { captured = parameters as Record<string, unknown>; return { output_text: JSON.stringify(expected) }; } };
  const plan = await organizeWithOpenAI(client as never, "work");
  assert.deepEqual(plan, expected); assert.equal(captured?.model, "gpt-5.6-luna"); assert.equal(captured?.store, false);
  assert.deepEqual(captured?.reasoning, { effort: "none" }); assert.equal(captured?.max_output_tokens, 800);
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
  const response = await handleOrganizeDay(jsonRequest("work"), { environment: { OPENAI_LIVE_PLANNING: "true", OPENAI_API_KEY: "test-only", OPENAI_MODEL: "test-model" }, createClient: () => ({ create: async (parameters: unknown) => { calls += 1; assert.equal((parameters as { model: string }).model, "test-model"); return { output_text: JSON.stringify(expected) }; } }) as never });
  assert.equal(response.status, 200); assert.equal(response.headers.get("x-planning-mode"), "live"); assert.equal(calls, 1);
});

function jsonRequest(brainDump: string): Request { return new Request("http://local/api/organize-day", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brainDump }) }); }
