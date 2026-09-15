import {
  createAiAccessStatusReader,
  type AiAccessStatusReader,
  type AiAccessStatusResult,
} from "../../../../lib/ai-access.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteDependencies {
  environment: Record<string, string | undefined>;
  readStatus?: AiAccessStatusReader;
}

export async function GET(request: Request): Promise<Response> {
  return handleAiAccessStatus(request, { environment: process.env });
}

export async function handleAiAccessStatus(
  request: Request,
  dependencies: RouteDependencies,
): Promise<Response> {
  const readStatus =
    dependencies.readStatus ?? createAiAccessStatusReader(dependencies.environment);
  const result = await readStatus(request);
  if (result.outcome === "success") return json(result.status);
  return statusError(result);
}

function statusError(
  result: Extract<AiAccessStatusResult, { outcome: "denied" }>,
): Response {
  if (result.code === "unauthenticated") {
    return json(
      {
        code: result.code,
        error: "A valid signed-in session is required to view AI access.",
      },
      401,
    );
  }
  return json(
    {
      code: result.code,
      error: "AI access status is temporarily unavailable.",
    },
    503,
  );
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
