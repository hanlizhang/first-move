import OpenAI from "openai";

import {
  AI_MODEL,
  createAiAuthorizer,
  paidAiRequestFingerprint,
  paidAiRequestId,
  type AiAccessErrorCode,
  type AiAuthorizer,
  type AiQuotaMetadata,
} from "../../../lib/ai-access.ts";
import { MAX_BRAIN_DUMP_LENGTH, createMockDayPlan, organizeWithOpenAI, planningMode } from "../../../lib/day-planning.ts";

export const runtime = "nodejs";
const MAX_REQUEST_BYTES = 8 * 1024;

interface RouteDependencies {
  environment: Record<string, string | undefined>;
  createClient: (apiKey: string) => Pick<OpenAI["responses"], "create">;
  authorize?: AiAuthorizer;
}

export async function POST(request: Request): Promise<Response> {
  return handleOrganizeDay(request, { environment: process.env, createClient: (apiKey) => new OpenAI({ apiKey, maxRetries: 0, timeout: 20_000 }).responses });
}

export async function handleOrganizeDay(request: Request, dependencies: RouteDependencies): Promise<Response> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return json({ error: "JSON is required." }, 415);
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) return json({ error: "Request is too large." }, 413);
  const raw = await request.text();
  if (raw.length > MAX_REQUEST_BYTES) return json({ error: "Request is too large." }, 413);
  let value: unknown;
  try { value = JSON.parse(raw) as unknown; } catch { return json({ error: "Invalid JSON." }, 400); }
  const brainDump = isRecord(value) && typeof value.brainDump === "string" ? value.brainDump.trim() : "";
  if (!brainDump) return json({ error: "Brain dump is required." }, 400);
  if (brainDump.length > MAX_BRAIN_DUMP_LENGTH) return json({ error: "Brain dump is too long." }, 413);

  if (planningMode(dependencies.environment) === "mock") return json(createMockDayPlan(brainDump), 200, "mock");
  const apiKey = dependencies.environment.OPENAI_API_KEY;
  if (!apiKey) return json({ code: "openai_not_configured", error: "Live planning is not configured." }, 503);

  const requestIdentity = paidAiRequestId(request.headers);
  if (!requestIdentity.ok) return aiAccessError(requestIdentity.code);
  const authorize = dependencies.authorize ?? createAiAuthorizer(dependencies.environment);
  const authorization = await authorize(request, {
    feature: "daily_plan",
    requestFingerprint: paidAiRequestFingerprint("daily_plan", brainDump),
    requestId: requestIdentity.requestId,
  });
  if (authorization.outcome === "denied") {
    return aiAccessError(authorization.code, authorization.quota);
  }

  try {
    const plan = await organizeWithOpenAI(dependencies.createClient(apiKey), brainDump, AI_MODEL);
    return json({ ...plan, quota: authorization.quota }, 200, "live");
  } catch {
    return json({ code: "openai_provider_failure", error: "Planning failed without retrying." }, 502);
  }
}

function json(value: unknown, status = 200, mode?: "mock" | "live"): Response { return Response.json(value, { status, headers: { "Cache-Control": "no-store", ...(mode ? { "X-Planning-Mode": mode } : {}) } }); }
function aiAccessError(code: AiAccessErrorCode, quota?: AiQuotaMetadata): Response {
  const definitions: Record<AiAccessErrorCode, { message: string; status: number }> = {
    unauthenticated: { message: "A valid signed-in session is required for live AI planning.", status: 401 },
    invalid_request_id: { message: "The AI request identifier is invalid.", status: 400 },
    duplicate_request: { message: "This AI request was already dispatched and was not repeated.", status: 409 },
    introductory_quota_exhausted: { message: "The introductory AI quota is exhausted.", status: 429 },
    pro_feature_quota_exhausted: { message: "Today’s Pro daily-plan quota is exhausted.", status: 429 },
    revenuecat_unavailable: { message: "Subscription status could not be verified.", status: 503 },
    quota_service_unavailable: { message: "AI quota authorization is unavailable.", status: 503 },
  };
  const definition = definitions[code];
  return json({ code, error: definition.message, ...(quota ? { quota } : {}) }, definition.status);
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
