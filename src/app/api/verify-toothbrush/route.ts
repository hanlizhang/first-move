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
import { morningVerificationMode } from "../../../lib/morning-check.ts";
import { verifyWithOpenAI, type ToothbrushVerification } from "../../../lib/toothbrush-openai.ts";

export const runtime = "nodejs";
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

interface RouteDependencies {
  environment: Record<string, string | undefined>;
  createClient: (apiKey: string) => Pick<OpenAI["responses"], "create">;
  authorize?: AiAuthorizer;
  logProviderFailure?: (diagnostic: ProviderFailureDiagnostic) => void;
}

interface ProviderFailureDiagnostic {
  route: "/api/verify-toothbrush";
  feature: "toothbrush_verification";
  errorName?: string;
  httpStatus?: number;
  providerErrorCode?: string;
  providerErrorType?: string;
  providerRequestId?: string;
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
  if (!apiKey) return json({ code: "openai_not_configured", error: "Live verification is not configured." }, 503);
  const dataUrl = `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;
  const requestIdentity = paidAiRequestId(request.headers);
  if (!requestIdentity.ok) return aiAccessError(requestIdentity.code);
  const authorize = dependencies.authorize ?? createAiAuthorizer(dependencies.environment);
  const authorization = await authorize(request, {
    feature: "toothbrush_verification",
    requestFingerprint: paidAiRequestFingerprint("toothbrush_verification", dataUrl),
    requestId: requestIdentity.requestId,
  });
  if (authorization.outcome === "denied") {
    return aiAccessError(authorization.code, authorization.quota);
  }
  try {
    const result = await verifyWithOpenAI(dependencies.createClient(apiKey), dataUrl, AI_MODEL);
    return json({ ...result, quota: authorization.quota }, 200, "live");
  } catch (error) {
    (dependencies.logProviderFailure ?? defaultProviderFailureLogger)(providerFailureDiagnostic(error));
    return json({ code: "openai_provider_failure", error: "Verification failed without retrying." }, 502);
  }
}

function providerFailureDiagnostic(error: unknown): ProviderFailureDiagnostic {
  const diagnostic: ProviderFailureDiagnostic = { route: "/api/verify-toothbrush", feature: "toothbrush_verification" };
  if (!isRecord(error)) return diagnostic;

  const errorName = safeErrorName(readProperty(error, "name"));
  const httpStatus = safeHttpStatus(readProperty(error, "status"));
  const providerErrorCode = safeProviderToken(readProperty(error, "code"));
  const providerErrorType = safeProviderToken(readProperty(error, "type"));
  const providerRequestId = safeProviderRequestId(
    readProperty(error, "requestID") ?? readProperty(error, "request_id") ?? readProperty(error, "requestId"),
  );

  if (errorName) diagnostic.errorName = errorName;
  if (httpStatus) diagnostic.httpStatus = httpStatus;
  if (providerErrorCode) diagnostic.providerErrorCode = providerErrorCode;
  if (providerErrorType) diagnostic.providerErrorType = providerErrorType;
  if (providerRequestId) diagnostic.providerRequestId = providerRequestId;
  return diagnostic;
}

function defaultProviderFailureLogger(diagnostic: ProviderFailureDiagnostic): void { console.error(diagnostic); }
function readProperty(value: Record<string, unknown>, key: string): unknown {
  try { return value[key]; } catch { return undefined; }
}
function safeErrorName(value: unknown): string | undefined {
  return typeof value === "string" && /^(?:Error|[A-Z][A-Za-z0-9]{0,63}Error)$/.test(value) ? value : undefined;
}
function safeHttpStatus(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 400 && value <= 599 ? value : undefined;
}
function safeProviderToken(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(value)) return undefined;
  if (/^(?:bearer|eyj|sk[-_]|sb[-_]|rc[-_])/i.test(value) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value)) return undefined;
  return value;
}
function safeProviderRequestId(value: unknown): string | undefined {
  return typeof value === "string" && /^(?:req|request)[_-][A-Za-z0-9_-]{1,120}$/i.test(value) ? value : undefined;
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

function json(value: unknown, status = 200, mode?: "mock" | "live"): Response { return Response.json(value, { status, headers: { "Cache-Control": "no-store", ...(mode ? { "X-Verification-Mode": mode } : {}) } }); }
function aiAccessError(code: AiAccessErrorCode, quota?: AiQuotaMetadata): Response {
  const definitions: Record<AiAccessErrorCode, { message: string; status: number }> = {
    unauthenticated: { message: "A valid signed-in session is required for live AI verification.", status: 401 },
    invalid_request_id: { message: "The AI request identifier is invalid.", status: 400 },
    duplicate_request: { message: "This AI request was already dispatched and was not repeated.", status: 409 },
    introductory_quota_exhausted: { message: "The introductory AI quota is exhausted.", status: 429 },
    pro_feature_quota_exhausted: { message: "Today’s Pro toothbrush-verification quota is exhausted.", status: 429 },
    revenuecat_unavailable: { message: "Subscription status could not be verified.", status: 503 },
    quota_service_unavailable: { message: "AI quota authorization is unavailable.", status: 503 },
  };
  const definition = definitions[code];
  return json({ code, error: definition.message, ...(quota ? { quota } : {}) }, definition.status);
}
