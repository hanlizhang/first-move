import { createHash, randomUUID } from "node:crypto";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { validateSupabasePublicConfig } from "./supabase/config.ts";

export const AI_MODEL = "gpt-5.6-luna" as const;
export const REVENUECAT_PRO_ENTITLEMENT_ID = "pro" as const;

export type PaidAiFeature =
  | "daily_plan"
  | "toothbrush_verification"
  | "make_smaller";
export type AiAccessBasis = "introductory" | "pro";

export const AI_FEATURE_DAILY_LIMITS: Record<PaidAiFeature, number> = {
  daily_plan: 1,
  toothbrush_verification: 3,
  make_smaller: 5,
};

export interface AiQuotaMetadata {
  accessBasis: AiAccessBasis;
  feature: PaidAiFeature;
  remainingIntroductoryTotal?: number;
  remainingFeatureActionsToday?: number;
}

export type AiAccessErrorCode =
  | "unauthenticated"
  | "invalid_request_id"
  | "duplicate_request"
  | "introductory_quota_exhausted"
  | "pro_feature_quota_exhausted"
  | "revenuecat_unavailable"
  | "quota_service_unavailable";

export type AiAuthorizationResult =
  | { outcome: "authorized"; quota: AiQuotaMetadata }
  | {
      outcome: "denied";
      code: AiAccessErrorCode;
      quota?: AiQuotaMetadata;
    };

export type AiAccessStatus =
  | {
      plan: "free";
      accessBasis: "introductory";
      remainingIntroductoryTotal: number;
    }
  | {
      plan: "pro";
      accessBasis: "pro";
      remainingFeatureActionsToday: Record<PaidAiFeature, number>;
    };

export type AiAccessStatusResult =
  | { outcome: "success"; status: AiAccessStatus }
  | {
      outcome: "denied";
      code:
        | "unauthenticated"
        | "revenuecat_unavailable"
        | "quota_service_unavailable";
    };

export interface AiAuthorizationInput {
  feature: PaidAiFeature;
  requestId: string;
  requestFingerprint: string;
}

interface AiAccessDependencies {
  authenticate(accessToken: string): Promise<string | null>;
  verifyProEntitlement(userId: string): Promise<boolean>;
  reserve(input: AiReservationInput): Promise<AiReservationResult>;
}

interface AiAccessStatusDependencies {
  authenticate(accessToken: string): Promise<string | null>;
  verifyProEntitlement(userId: string): Promise<boolean>;
  readStatus(
    userId: string,
    accessBasis: AiAccessBasis,
    accessToken: string,
  ): Promise<AiAccessStatus>;
}

interface AiReservationInput extends AiAuthorizationInput {
  accessBasis: AiAccessBasis;
  userId: string;
}

type AiReservationResult =
  | { outcome: "reserved"; quota: AiQuotaMetadata }
  | { outcome: "already_reserved" }
  | {
      outcome: "denied";
      code:
        | "introductory_quota_exhausted"
        | "pro_feature_quota_exhausted";
      quota: AiQuotaMetadata;
    };

export type AiAuthorizer = (
  request: Request,
  input: AiAuthorizationInput,
) => Promise<AiAuthorizationResult>;

export type AiAccessStatusReader = (
  request: Request,
) => Promise<AiAccessStatusResult>;

export function createAiAuthorizer(
  environment: Record<string, string | undefined>,
): AiAuthorizer {
  const dependencies = createDefaultDependencies(environment);
  return (request, input) =>
    authorizePaidAiRequest(request, input, dependencies);
}

export function createAiAccessStatusReader(
  environment: Record<string, string | undefined>,
): AiAccessStatusReader {
  const dependencies = createDefaultStatusDependencies(environment);
  return (request) => readAiAccessStatus(request, dependencies);
}

export async function readAiAccessStatus(
  request: Request,
  dependencies: AiAccessStatusDependencies,
): Promise<AiAccessStatusResult> {
  const accessToken = bearerAccessToken(request.headers.get("authorization"));
  if (!accessToken) return { outcome: "denied", code: "unauthenticated" };

  let userId: string | null;
  try {
    userId = await dependencies.authenticate(accessToken);
  } catch {
    return { outcome: "denied", code: "quota_service_unavailable" };
  }
  if (!userId) return { outcome: "denied", code: "unauthenticated" };

  let pro: boolean;
  try {
    pro = await dependencies.verifyProEntitlement(userId);
  } catch {
    return { outcome: "denied", code: "revenuecat_unavailable" };
  }

  try {
    return {
      outcome: "success",
      status: await dependencies.readStatus(
        userId,
        pro ? "pro" : "introductory",
        accessToken,
      ),
    };
  } catch {
    return { outcome: "denied", code: "quota_service_unavailable" };
  }
}

export function introductoryAiAccessStatus(used: number): AiAccessStatus {
  if (!Number.isInteger(used) || used < 0) {
    throw new Error("Invalid introductory AI usage count.");
  }
  return {
    plan: "free",
    accessBasis: "introductory",
    remainingIntroductoryTotal: Math.max(0, 5 - used),
  };
}

export function proAiAccessStatus(
  usedFeatures: readonly unknown[],
): AiAccessStatus {
  const used: Record<PaidAiFeature, number> = {
    daily_plan: 0,
    toothbrush_verification: 0,
    make_smaller: 0,
  };
  for (const feature of usedFeatures) {
    if (isPaidAiFeature(feature)) used[feature] += 1;
  }
  return {
    plan: "pro",
    accessBasis: "pro",
    remainingFeatureActionsToday: {
      daily_plan: Math.max(0, AI_FEATURE_DAILY_LIMITS.daily_plan - used.daily_plan),
      toothbrush_verification: Math.max(
        0,
        AI_FEATURE_DAILY_LIMITS.toothbrush_verification - used.toothbrush_verification,
      ),
      make_smaller: Math.max(
        0,
        AI_FEATURE_DAILY_LIMITS.make_smaller - used.make_smaller,
      ),
    },
  };
}

export function serverLocalDateForTimezone(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  if (!value.year || !value.month || !value.day) {
    throw new Error("Profile timezone date unavailable.");
  }
  return `${value.year}-${value.month}-${value.day}`;
}

export async function authorizePaidAiRequest(
  request: Request,
  input: AiAuthorizationInput,
  dependencies: AiAccessDependencies,
): Promise<AiAuthorizationResult> {
  const accessToken = bearerAccessToken(request.headers.get("authorization"));
  if (!accessToken) return { outcome: "denied", code: "unauthenticated" };

  let userId: string | null;
  try {
    userId = await dependencies.authenticate(accessToken);
  } catch {
    return { outcome: "denied", code: "quota_service_unavailable" };
  }
  if (!userId) return { outcome: "denied", code: "unauthenticated" };

  let pro: boolean;
  try {
    pro = await dependencies.verifyProEntitlement(userId);
  } catch {
    return { outcome: "denied", code: "revenuecat_unavailable" };
  }

  let reservation: AiReservationResult;
  try {
    reservation = await dependencies.reserve({
      ...input,
      accessBasis: pro ? "pro" : "introductory",
      userId,
    });
  } catch {
    return { outcome: "denied", code: "quota_service_unavailable" };
  }

  if (reservation.outcome === "already_reserved") {
    return { outcome: "denied", code: "duplicate_request" };
  }
  if (reservation.outcome === "denied") {
    return {
      outcome: "denied",
      code: reservation.code,
      quota: reservation.quota,
    };
  }
  return { outcome: "authorized", quota: reservation.quota };
}

export function paidAiRequestId(headers: Headers):
  | { ok: true; requestId: string }
  | { ok: false; code: "invalid_request_id" } {
  const supplied = headers.get("x-request-id")?.trim();
  if (!supplied) return { ok: true, requestId: randomUUID() };
  return isUuid(supplied)
    ? { ok: true, requestId: supplied.toLowerCase() }
    : { ok: false, code: "invalid_request_id" };
}

export function paidAiRequestFingerprint(
  feature: PaidAiFeature,
  payload: string | Uint8Array,
): string {
  return createHash("sha256")
    .update(feature)
    .update("\0")
    .update(payload)
    .digest("hex");
}

export async function verifyRevenueCatProEntitlement(
  userId: string,
  environment: Record<string, string | undefined>,
  request: typeof fetch = fetch,
): Promise<boolean> {
  const apiKey = environment.REVENUECAT_SECRET_API_KEY?.trim();
  if (!apiKey) throw new Error("RevenueCat is not configured.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await request(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        cache: "no-store",
        signal: controller.signal,
      },
    );
    if (!response.ok) throw new Error("RevenueCat request failed.");
    return revenueCatResponseHasActivePro(await response.json());
  } finally {
    clearTimeout(timeout);
  }
}

export function revenueCatResponseHasActivePro(value: unknown): boolean {
  if (!isRecord(value) || typeof value.request_date !== "string") {
    throw new Error("Invalid RevenueCat response.");
  }
  const checkedAt = Date.parse(value.request_date);
  if (!Number.isFinite(checkedAt)) {
    throw new Error("Invalid RevenueCat response date.");
  }
  if (!isRecord(value.subscriber) || !isRecord(value.subscriber.entitlements)) {
    throw new Error("Invalid RevenueCat entitlements.");
  }

  const entitlement = value.subscriber.entitlements[REVENUECAT_PRO_ENTITLEMENT_ID];
  if (entitlement === undefined) return false;
  if (!isRecord(entitlement)) throw new Error("Invalid Pro entitlement.");

  const expiresAt = entitlement.expires_date;
  const graceExpiresAt = entitlement.grace_period_expires_date;
  if (expiresAt === null) return true;
  if (typeof expiresAt !== "string") {
    throw new Error("Invalid Pro entitlement expiration.");
  }

  const expiration = Date.parse(expiresAt);
  if (!Number.isFinite(expiration)) {
    throw new Error("Invalid Pro entitlement expiration.");
  }
  if (expiration > checkedAt) return true;
  if (graceExpiresAt === null || graceExpiresAt === undefined) return false;
  if (typeof graceExpiresAt !== "string") {
    throw new Error("Invalid Pro entitlement grace period.");
  }
  const graceExpiration = Date.parse(graceExpiresAt);
  if (!Number.isFinite(graceExpiration)) {
    throw new Error("Invalid Pro entitlement grace period.");
  }
  return graceExpiration > checkedAt;
}

function createDefaultDependencies(
  environment: Record<string, string | undefined>,
): AiAccessDependencies {
  return {
    authenticate: (accessToken) =>
      validateSupabaseAccessToken(accessToken, environment),
    verifyProEntitlement: (userId) =>
      verifyRevenueCatProEntitlement(userId, environment),
    reserve: (input) => reservePaidAiUsage(input, environment),
  };
}

function createDefaultStatusDependencies(
  environment: Record<string, string | undefined>,
): AiAccessStatusDependencies {
  return {
    authenticate: (accessToken) =>
      validateSupabaseAccessToken(accessToken, environment),
    verifyProEntitlement: (userId) =>
      verifyRevenueCatProEntitlement(userId, environment),
    readStatus: (userId, accessBasis, accessToken) =>
      readPaidAiStatus(userId, accessBasis, accessToken, environment),
  };
}

async function validateSupabaseAccessToken(
  accessToken: string,
  environment: Record<string, string | undefined>,
): Promise<string | null> {
  const { url, publishableKey } = validateSupabasePublicConfig(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  const supabase = createSupabaseClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error) {
    if (typeof error.status === "number" && error.status >= 500) throw error;
    return null;
  }
  return data.user && isUuid(data.user.id) ? data.user.id : null;
}

async function reservePaidAiUsage(
  input: AiReservationInput,
  environment: Record<string, string | undefined>,
): Promise<AiReservationResult> {
  const { url } = validateSupabasePublicConfig(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey) throw new Error("AI quota service is not configured.");

  const supabase = createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const { data, error } = await supabase.rpc("reserve_ai_usage", {
    p_access_basis: input.accessBasis,
    p_feature: input.feature,
    p_region_code: serverRegionCode(environment),
    p_request_fingerprint: input.requestFingerprint,
    p_request_id: input.requestId,
    p_user_id: input.userId,
  });
  if (error) throw error;
  return parseReservationResult(data, input.feature);
}

export async function readPaidAiStatus(
  userId: string,
  accessBasis: AiAccessBasis,
  accessToken: string,
  environment: Record<string, string | undefined>,
  request: typeof fetch = fetch,
): Promise<AiAccessStatus> {
  const supabase = createAuthenticatedReadClient(
    environment,
    accessToken,
    request,
  );
  if (accessBasis === "introductory") {
    const { count, error } = await supabase
      .from("ai_usage_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("access_basis", "introductory");
    if (error || count === null) throw error ?? new Error("AI usage count unavailable.");
    return introductoryAiAccessStatus(count);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("user_id", userId)
    .single();
  if (
    profileError ||
    !profile ||
    typeof profile.timezone !== "string" ||
    !profile.timezone
  ) {
    throw profileError ?? new Error("Profile timezone unavailable.");
  }
  const localDate = serverLocalDateForTimezone(new Date(), profile.timezone);
  const { data: usage, error: usageError } = await supabase
    .from("ai_usage_events")
    .select("feature")
    .eq("user_id", userId)
    .eq("access_basis", "pro")
    .eq("local_date", localDate);
  if (usageError || !usage) throw usageError ?? new Error("AI usage unavailable.");

  return proAiAccessStatus(usage.map((event) => event.feature));
}

function createAuthenticatedReadClient(
  environment: Record<string, string | undefined>,
  accessToken: string,
  request: typeof fetch,
) {
  // Status reads use the validated owner session and existing RLS. The service
  // role is intentionally limited to the SECURITY DEFINER reservation RPC.
  const { url, publishableKey } = validateSupabasePublicConfig(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  return createSupabaseClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      fetch: request,
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}

function parseReservationResult(
  value: unknown,
  expectedFeature: PaidAiFeature,
): AiReservationResult {
  if (!isRecord(value) || typeof value.outcome !== "string") {
    throw new Error("Invalid quota service response.");
  }
  if (value.outcome === "already_reserved") {
    return { outcome: "already_reserved" };
  }
  if (value.outcome !== "reserved" && value.outcome !== "denied") {
    throw new Error("Invalid quota service outcome.");
  }
  const quota = parseQuotaMetadata(value.quota, expectedFeature);
  if (value.outcome === "reserved") return { outcome: "reserved", quota };
  if (
    value.code !== "introductory_quota_exhausted" &&
    value.code !== "pro_feature_quota_exhausted"
  ) {
    throw new Error("Invalid quota denial.");
  }
  return { outcome: "denied", code: value.code, quota };
}

function parseQuotaMetadata(
  value: unknown,
  expectedFeature: PaidAiFeature,
): AiQuotaMetadata {
  if (
    !isRecord(value) ||
    (value.accessBasis !== "introductory" && value.accessBasis !== "pro") ||
    value.feature !== expectedFeature
  ) {
    throw new Error("Invalid quota metadata.");
  }
  const quota: AiQuotaMetadata = {
    accessBasis: value.accessBasis,
    feature: expectedFeature,
  };
  if (value.accessBasis === "introductory") {
    if (!isRemainingCount(value.remainingIntroductoryTotal)) {
      throw new Error("Invalid introductory quota metadata.");
    }
    quota.remainingIntroductoryTotal = value.remainingIntroductoryTotal;
  } else {
    if (!isRemainingCount(value.remainingFeatureActionsToday)) {
      throw new Error("Invalid Pro quota metadata.");
    }
    quota.remainingFeatureActionsToday = value.remainingFeatureActionsToday;
  }
  return quota;
}

function bearerAccessToken(header: string | null): string | undefined {
  if (!header) return undefined;
  const match = /^Bearer ([^\s]+)$/i.exec(header.trim());
  return match?.[1];
}

function serverRegionCode(
  environment: Record<string, string | undefined>,
): string {
  const configured = environment.AI_SERVER_REGION_CODE?.trim().toUpperCase();
  return configured && /^[A-Z]{2}$/.test(configured) ? configured : "ZZ";
}

function isRemainingCount(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isPaidAiFeature(value: unknown): value is PaidAiFeature {
  return (
    value === "daily_plan" ||
    value === "toothbrush_verification" ||
    value === "make_smaller"
  );
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
