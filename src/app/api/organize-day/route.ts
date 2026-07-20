import OpenAI from "openai";

import { MAX_BRAIN_DUMP_LENGTH, createMockDayPlan, organizeWithOpenAI, planningMode } from "../../../lib/day-planning.ts";

export const runtime = "nodejs";
const MAX_REQUEST_BYTES = 8 * 1024;

interface RouteDependencies {
  environment: Record<string, string | undefined>;
  createClient: (apiKey: string) => Pick<OpenAI["responses"], "create">;
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
  if (!apiKey) return json({ error: "Live planning is not configured." }, 503);
  try {
    const plan = await organizeWithOpenAI(dependencies.createClient(apiKey), brainDump, dependencies.environment.OPENAI_MODEL || "gpt-5.6-luna");
    return json(plan, 200, "live");
  } catch {
    return json({ error: "Planning failed without retrying." }, 502);
  }
}

function json(value: unknown, status = 200, mode?: "mock" | "live"): Response { return Response.json(value, { status, headers: { "Cache-Control": "no-store", ...(mode ? { "X-Planning-Mode": mode } : {}) } }); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
