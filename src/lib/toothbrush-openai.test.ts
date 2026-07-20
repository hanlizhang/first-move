import assert from "node:assert/strict";
import test from "node:test";

import { handleVerifyToothbrush, MAX_IMAGE_BYTES } from "../app/api/verify-toothbrush/route.ts";
import { parseToothbrushVerification, verifyWithOpenAI } from "./toothbrush-openai.ts";

test("OpenAI verification uses the bounded low-detail Responses request", async () => {
  let captured: Record<string, unknown> | undefined;
  const client = { create: async (parameters: unknown) => { captured = parameters as Record<string, unknown>; return { output_text: JSON.stringify({ passed: true, detectedObject: "toothbrush", shortMessage: "A toothbrush is clearly visible." }) }; } };
  const result = await verifyWithOpenAI(client as never, "data:image/jpeg;base64,AA==");
  assert.equal(result.passed, true);
  assert.equal(captured?.model, "gpt-5.6-luna");
  assert.equal(captured?.store, false);
  assert.deepEqual(captured?.reasoning, { effort: "none" });
  assert.equal(captured?.max_output_tokens, 100);
  const input = captured?.input as Array<{ content: Array<Record<string, unknown>> }>;
  assert.equal(input[0].content[1].detail, "low");
});

test("structured response validation rejects inconsistent passes", () => {
  assert.throws(() => parseToothbrushVerification(JSON.stringify({ passed: true, detectedObject: "drawing", shortMessage: "No." })));
  assert.throws(() => parseToothbrushVerification("not json"));
});

test("route mock mode never constructs an OpenAI client", async () => {
  let clients = 0;
  const response = await handleVerifyToothbrush(new Request("http://local/api/verify-toothbrush", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: new Uint8Array([1, 2]) }), { environment: {}, createClient: () => { clients += 1; throw new Error("must not run"); } });
  assert.equal(response.status, 200); assert.equal(clients, 0);
  assert.equal((await response.json() as { passed: boolean }).passed, true);
});

test("route calls the mocked OpenAI client once only in configured live mode", async () => {
  let calls = 0;
  const response = await handleVerifyToothbrush(new Request("http://local/api/verify-toothbrush", { method: "POST", headers: { "Content-Type": "image/png" }, body: new Uint8Array([1, 2]) }), {
    environment: { OPENAI_LIVE_VISION: "true", OPENAI_API_KEY: "test-only", OPENAI_MODEL: "test-model" },
    createClient: () => ({ create: async (parameters: unknown) => { calls += 1; assert.equal((parameters as { model: string }).model, "test-model"); return { output_text: JSON.stringify({ passed: false, detectedObject: "unclear", shortMessage: "The scene is unclear." }) }; } }) as never,
  });
  assert.equal(response.status, 200); assert.equal(calls, 1);
  assert.equal(response.headers.get("x-verification-mode"), "live");
});

test("route rejects unsupported and oversized images before OpenAI", async () => {
  let clients = 0;
  const dependencies = { environment: { OPENAI_LIVE_VISION: "true", OPENAI_API_KEY: "test-only" }, createClient: () => { clients += 1; throw new Error("must not run"); } };
  const wrongType = await handleVerifyToothbrush(new Request("http://local", { method: "POST", headers: { "Content-Type": "text/plain" }, body: "x" }), dependencies);
  const oversized = await handleVerifyToothbrush(new Request("http://local", { method: "POST", headers: { "Content-Type": "image/jpeg", "Content-Length": String(MAX_IMAGE_BYTES + 1) }, body: new Uint8Array([1]) }), dependencies);
  assert.equal(wrongType.status, 415); assert.equal(oversized.status, 413); assert.equal(clients, 0);
});
