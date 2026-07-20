import type OpenAI from "openai";

export interface ToothbrushVerification {
  passed: boolean;
  detectedObject: string;
  shortMessage: string;
}

type ResponsesClient = Pick<OpenAI["responses"], "create">;

export async function verifyWithOpenAI(client: ResponsesClient, imageDataUrl: string, model = "gpt-5.6-luna"): Promise<ToothbrushVerification> {
  const response = await client.create({
    model,
    store: false,
    reasoning: { effort: "none" },
    max_output_tokens: 100,
    instructions: "Inspect only the supplied current photo. Pass only when a real physical toothbrush is clearly visible. Reject unclear or ambiguous scenes, drawings, screenshots, displays showing a toothbrush, and text-only images. Keep the message neutral and under 100 characters.",
    input: [{ role: "user", content: [{ type: "input_text", text: "Verify whether this image clearly contains a real physical toothbrush." }, { type: "input_image", image_url: imageDataUrl, detail: "low" }] }],
    text: { format: { type: "json_schema", name: "toothbrush_verification", strict: true, schema: { type: "object", additionalProperties: false, properties: { passed: { type: "boolean" }, detectedObject: { type: "string", maxLength: 40 }, shortMessage: { type: "string", maxLength: 100 } }, required: ["passed", "detectedObject", "shortMessage"] } }, verbosity: "low" },
  });
  return parseToothbrushVerification(response.output_text);
}

export function parseToothbrushVerification(text: string): ToothbrushVerification {
  let value: unknown;
  try { value = JSON.parse(text) as unknown; } catch { throw new Error("Invalid verification response."); }
  if (!isRecord(value) || typeof value.passed !== "boolean" || typeof value.detectedObject !== "string" || value.detectedObject.length > 40 || typeof value.shortMessage !== "string" || value.shortMessage.length < 1 || value.shortMessage.length > 100) throw new Error("Invalid verification response.");
  if (value.passed && value.detectedObject.trim().toLowerCase() !== "toothbrush") throw new Error("Inconsistent verification response.");
  return { passed: value.passed, detectedObject: value.detectedObject, shortMessage: value.shortMessage };
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
