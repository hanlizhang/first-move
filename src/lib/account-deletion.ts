import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { validateSupabasePublicConfig } from "./supabase/config.ts";

export const ACCOUNT_DELETION_CONFIRMATION = "DELETE MY ACCOUNT" as const;
export const ACCOUNT_DELETION_RELEASE_VALUE = "phase-1c-verified" as const;
export const RECENT_INTERACTIVE_AUTH_MAX_AGE_SECONDS = 5 * 60;

type Environment = Record<string, string | undefined>;

interface VerifiedDeletionIdentity {
  userId: string;
  amr: unknown;
}

type InitiationOutcome = "initiated" | "already_pending" | "user_not_found";

export interface AccountDeletionDependencies {
  environment: Environment;
  now?: () => Date;
  verifyBearer?: (
    accessToken: string,
    environment: Environment,
  ) => Promise<VerifiedDeletionIdentity | null>;
  initiate?: (
    userId: string,
    environment: Environment,
  ) => Promise<InitiationOutcome>;
  attemptWorker?: (
    userId: string,
    environment: Environment,
  ) => Promise<void>;
}

export async function handleAccountDeletionInitiation(
  request: Request,
  dependencies: AccountDeletionDependencies,
): Promise<Response> {
  if (
    dependencies.environment.ACCOUNT_DELETION_INITIATION_ENABLED !==
    ACCOUNT_DELETION_RELEASE_VALUE
  ) {
    return deletionResponse("unavailable", 503);
  }

  const accessToken = bearerAccessToken(request.headers.get("authorization"));
  if (!accessToken) return deletionResponse("denied", 401);

  const verifyBearer =
    dependencies.verifyBearer ?? verifySupabaseDeletionBearer;
  let identity: VerifiedDeletionIdentity | null;
  try {
    identity = await verifyBearer(accessToken, dependencies.environment);
  } catch {
    return deletionResponse("unavailable", 503);
  }
  if (!identity) return deletionResponse("denied", 401);

  const nowSeconds = Math.floor(
    (dependencies.now?.() ?? new Date()).getTime() / 1_000,
  );
  if (!hasRecentInteractiveAuthentication(identity.amr, nowSeconds)) {
    return deletionResponse("reauthentication_required", 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return deletionResponse("confirmation_required", 400);
  }
  if (
    !isRecord(body) ||
    body.confirmation !== ACCOUNT_DELETION_CONFIRMATION
  ) {
    return deletionResponse("confirmation_required", 400);
  }

  const initiate = dependencies.initiate ?? initiateDeletionRequest;
  let outcome: InitiationOutcome;
  try {
    outcome = await initiate(identity.userId, dependencies.environment);
  } catch {
    return deletionResponse("unavailable", 503);
  }
  if (outcome === "user_not_found") return deletionResponse("denied", 401);
  if (dependencies.attemptWorker) {
    try {
      await dependencies.attemptWorker(identity.userId, dependencies.environment);
    } catch {
      // Durable outbox retry remains authoritative when the bounded attempt fails.
    }
  }
  return deletionResponse("in_progress", 202);
}

export function hasRecentInteractiveAuthentication(
  amr: unknown,
  nowSeconds: number,
  maximumAgeSeconds = RECENT_INTERACTIVE_AUTH_MAX_AGE_SECONDS,
): boolean {
  if (
    !Array.isArray(amr) ||
    !Number.isInteger(nowSeconds) ||
    !Number.isInteger(maximumAgeSeconds) ||
    maximumAgeSeconds < 0
  ) {
    return false;
  }

  const interactiveMethods = new Set(["magiclink", "otp", "email/signup"]);
  return amr.some((entry) => {
    if (
      !isRecord(entry) ||
      typeof entry.method !== "string" ||
      !interactiveMethods.has(entry.method) ||
      typeof entry.timestamp !== "number" ||
      !Number.isInteger(entry.timestamp)
    ) {
      return false;
    }
    const age = nowSeconds - entry.timestamp;
    return age >= 0 && age <= maximumAgeSeconds;
  });
}

export function deletionIdentityFromVerifiedClaims(
  user: unknown,
  claims: unknown,
): VerifiedDeletionIdentity | null {
  if (
    !isRecord(user) ||
    !isRecord(claims) ||
    typeof user.id !== "string" ||
    !isUuid(user.id) ||
    claims.sub !== user.id ||
    claims.role !== "authenticated" ||
    user.is_anonymous === true ||
    claims.is_anonymous === true
  ) {
    return null;
  }
  return { userId: user.id.toLowerCase(), amr: claims.amr };
}

async function verifySupabaseDeletionBearer(
  accessToken: string,
  environment: Environment,
): Promise<VerifiedDeletionIdentity | null> {
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

  const userResult = await supabase.auth.getUser(accessToken);
  if (userResult.error) {
    if (
      typeof userResult.error.status === "number" &&
      userResult.error.status >= 500
    ) {
      throw userResult.error;
    }
    return null;
  }

  const claimsResult = await supabase.auth.getClaims(accessToken);
  if (claimsResult.error) {
    if (
      typeof claimsResult.error.status === "number" &&
      claimsResult.error.status >= 500
    ) {
      throw claimsResult.error;
    }
    return null;
  }

  return deletionIdentityFromVerifiedClaims(
    userResult.data.user,
    claimsResult.data?.claims,
  );
}

async function initiateDeletionRequest(
  userId: string,
  environment: Environment,
): Promise<InitiationOutcome> {
  const { url } = validateSupabasePublicConfig(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey) throw new Error("Account deletion is not configured.");

  const supabase = createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const { data, error } = await supabase.rpc("initiate_account_deletion", {
    p_user_id: userId,
  });
  if (error) throw error;
  if (!isRecord(data) || !isInitiationOutcome(data.outcome)) {
    throw new Error("Invalid deletion initiation response.");
  }
  return data.outcome;
}

function bearerAccessToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer ([^\s]+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

function deletionResponse(status: string, httpStatus: number): Response {
  return Response.json(
    { status },
    { status: httpStatus, headers: { "Cache-Control": "no-store" } },
  );
}

function isInitiationOutcome(value: unknown): value is InitiationOutcome {
  return (
    value === "initiated" ||
    value === "already_pending" ||
    value === "user_not_found"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
