import OpenAI from "openai";

import { morningVerificationMode } from "../../../lib/morning-check.ts";
import { verifyWithOpenAI, type ToothbrushVerification } from "../../../lib/toothbrush-openai.ts";

export const runtime = "nodejs";
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

interface RouteDependencies {
  environment: Record<string, string | undefined>;
  createClient: (apiKey: string) => Pick<OpenAI["responses"], "create">;
}

export async function POST(request: Request): Promise<Response> {
  return handleVerifyToothbrush(request, {
    environment: process.env,
    createClient: (apiKey) => new OpenAI({ apiKey, maxRetries: 0, timeout: 20_000 }).responses,
  });
}

export async function handleVerifyToothbrush(request: Request, dependencies: RouteDependencies): Promise<Response> {
  const contentType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "image/jpeg" && contentType !== "image/png") return json({ error: "Only JPEG and PNG images are accepted." }, 415);
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) return json({ error: "Image is too large." }, 413);
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_IMAGE_BYTES) return json({ error: bytes.byteLength ? "Image is too large." : "Image is empty." }, bytes.byteLength ? 413 : 400);

  if (morningVerificationMode(dependencies.environment) === "mock") {
    const passed = dependencies.environment.NODE_ENV === "development" && request.headers.get("x-mock-outcome") === "fail" ? false : true;
    return json({ passed, detectedObject: passed ? "toothbrush" : "none", shortMessage: passed ? "Mock check passed." : "Mock check did not find a toothbrush." } satisfies ToothbrushVerification, 200, "mock");
  }

  const apiKey = dependencies.environment.OPENAI_API_KEY;
  if (!apiKey) return json({ error: "Live verification is not configured." }, 503);
  const dataUrl = `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;
  try {
    const result = await verifyWithOpenAI(dependencies.createClient(apiKey), dataUrl, dependencies.environment.OPENAI_MODEL || "gpt-5.6-luna");
    return json(result, 200, "live");
  } catch {
    return json({ error: "Verification failed without retrying." }, 502);
  }
}

function json(value: unknown, status = 200, mode?: "mock" | "live"): Response { return Response.json(value, { status, headers: { "Cache-Control": "no-store", ...(mode ? { "X-Verification-Mode": mode } : {}) } }); }
