import { parseAiAccessStatus, type MobileAiAccessState } from "./access.ts";
import {
  MAX_BRAIN_DUMP_LENGTH,
  parseDayPlan,
  type DayPlan,
} from "../domain/day-planning.ts";
import { createUuidV4 } from "../domain/ids.ts";

export interface MobileAiSessionSource {
  getSession(): Promise<{
    data: {
      session: {
        access_token: string;
        user: { id: string };
      } | null;
    };
    error: unknown | null;
  }>;
}

export type AiRequestFailureKind =
  | "sign-in-required"
  | "introductory-exhausted"
  | "pro-exhausted"
  | "service-unavailable"
  | "provider-failure"
  | "rejected";

export type DayPlanRequestResult =
  | { outcome: "success"; plan: DayPlan }
  | { outcome: "failure"; kind: AiRequestFailureKind; message: string };

export type ToothbrushRequestResult =
  | { outcome: "pass"; mode: "mock" | "live" }
  | { outcome: "fail"; message: string }
  | { outcome: "failure"; kind: AiRequestFailureKind; message: string };

export interface MobileAiRequestContext {
  apiBaseUrl: string;
  auth: MobileAiSessionSource;
  userId?: string;
  request?: typeof fetch;
  requestId?: () => string;
}

export async function loadMobileAiAccessStatus(
  context: MobileAiRequestContext,
): Promise<MobileAiAccessState> {
  if (!context.userId) return { status: "guest" };
  const authorization = await authorizationForCurrentSession(context.auth, context.userId);
  if (!authorization) return { status: "sign-in-required", userId: context.userId };
  try {
    const response = await (context.request ?? fetch)(
      endpoint(context.apiBaseUrl, "/api/ai-access/status"),
      { headers: { Authorization: authorization } },
    );
    if (response.status === 401) {
      return { status: "sign-in-required", userId: context.userId };
    }
    if (!response.ok) return { status: "unavailable", userId: context.userId };
    const access = parseAiAccessStatus(await response.json());
    return access
      ? { status: "ready", userId: context.userId, access }
      : { status: "unavailable", userId: context.userId };
  } catch {
    return { status: "unavailable", userId: context.userId };
  }
}

export async function requestMobileDayPlan(
  brainDump: string,
  context: MobileAiRequestContext,
): Promise<DayPlanRequestResult> {
  const text = brainDump.trim();
  if (!text || text.length > MAX_BRAIN_DUMP_LENGTH) {
    return failure("rejected", "Enter between 1 and 2,000 characters.");
  }
  if (!context.userId) return failure("sign-in-required", planningMessage("sign-in-required"));
  const authorization = await authorizationForCurrentSession(context.auth, context.userId);
  if (!authorization) return failure("sign-in-required", planningMessage("sign-in-required"));
  try {
    const response = await (context.request ?? fetch)(
      endpoint(context.apiBaseUrl, "/api/organize-day"),
      {
        method: "POST",
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json",
          "X-Request-Id": (context.requestId ?? createUuidV4)(),
        },
        body: JSON.stringify({ brainDump: text }),
      },
    );
    const value = await safeJson(response);
    const plan = response.ok ? parseDayPlan(value) : undefined;
    if (plan) return { outcome: "success", plan };
    const kind = failureKind(value, response.status);
    return failure(kind, planningMessage(kind));
  } catch {
    return failure(
      "service-unavailable",
      "AI planning is temporarily unavailable. Your text is still here, and manual planning remains available.",
    );
  }
}

export async function requestMobileToothbrushVerification(
  image: Blob,
  context: MobileAiRequestContext,
): Promise<ToothbrushRequestResult> {
  if (!context.userId) return failure("sign-in-required", verificationMessage("sign-in-required"));
  const authorization = await authorizationForCurrentSession(context.auth, context.userId);
  if (!authorization) return failure("sign-in-required", verificationMessage("sign-in-required"));
  try {
    const response = await (context.request ?? fetch)(
      endpoint(context.apiBaseUrl, "/api/verify-toothbrush"),
      {
        method: "POST",
        headers: {
          Authorization: authorization,
          "Content-Type": image.type === "image/png" ? "image/png" : "image/jpeg",
          "X-Request-Id": (context.requestId ?? createUuidV4)(),
        },
        body: image,
      },
    );
    const value = await safeJson(response);
    if (response.ok && isVerificationPayload(value)) {
      return value.passed
        ? {
            outcome: "pass",
            mode: response.headers.get("x-verification-mode") === "mock" ? "mock" : "live",
          }
        : { outcome: "fail", message: value.shortMessage };
    }
    const kind = failureKind(value, response.status);
    return failure(kind, verificationMessage(kind));
  } catch {
    return failure(
      "service-unavailable",
      "AI verification is temporarily unavailable. You can skip without a reward.",
    );
  }
}

export async function authorizationForCurrentSession(
  auth: MobileAiSessionSource,
  expectedUserId: string,
): Promise<string | undefined> {
  try {
    const { data, error } = await auth.getSession();
    const session = data.session;
    if (error || !session || session.user.id !== expectedUserId || !session.access_token) {
      return undefined;
    }
    return `Bearer ${session.access_token}`;
  } catch {
    return undefined;
  }
}

function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function failureKind(value: unknown, status: number): AiRequestFailureKind {
  const code = isRecord(value) && typeof value.code === "string" ? value.code : "";
  if (status === 401 || code === "unauthenticated") return "sign-in-required";
  if (code === "introductory_quota_exhausted") return "introductory-exhausted";
  if (code === "pro_feature_quota_exhausted") return "pro-exhausted";
  if (code === "openai_provider_failure" || status === 502) return "provider-failure";
  if (
    code === "revenuecat_unavailable" ||
    code === "quota_service_unavailable" ||
    code === "openai_not_configured" ||
    status === 503
  ) {
    return "service-unavailable";
  }
  return "rejected";
}

function planningMessage(kind: AiRequestFailureKind): string {
  if (kind === "sign-in-required") return "Sign in to use live AI planning. Manual planning remains available.";
  if (kind === "introductory-exhausted") return "Your five introductory AI actions are used. Manual planning remains available.";
  if (kind === "pro-exhausted") return "Today’s Pro Plan my day action is used. Manual planning remains available.";
  if (kind === "provider-failure") return "The AI planning request failed after it was sent. Your text is still here, and manual planning remains available.";
  if (kind === "service-unavailable") return "AI planning is temporarily unavailable. Manual planning remains available.";
  return "The plan could not be organized. Your text is still here, and manual planning remains available.";
}

function verificationMessage(kind: AiRequestFailureKind): string {
  if (kind === "sign-in-required") return "Sign in to use live AI verification, or skip without a reward.";
  if (kind === "introductory-exhausted") return "Your five introductory AI actions are used. You can skip without a reward.";
  if (kind === "pro-exhausted") return "You have used today’s three Pro verification actions. You can skip without a reward.";
  if (kind === "provider-failure") return "The AI verification request failed after it was sent. Try a new photo or skip without a reward.";
  if (kind === "service-unavailable") return "AI verification is temporarily unavailable. You can skip without a reward.";
  return "This photo could not be verified. Try a new photo or skip without a reward.";
}

function failure<T extends AiRequestFailureKind>(
  kind: T,
  message: string,
): { outcome: "failure"; kind: T; message: string } {
  return { outcome: "failure", kind, message };
}

function isVerificationPayload(
  value: unknown,
): value is { passed: boolean; shortMessage: string } {
  return (
    isRecord(value) &&
    typeof value.passed === "boolean" &&
    typeof value.shortMessage === "string" &&
    value.shortMessage.length > 0 &&
    value.shortMessage.length <= 100
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
