import { randomUUID } from "node:crypto";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { validateSupabasePublicConfig } from "./supabase/config.ts";

const DEFAULT_LEASE_SECONDS = 90;
const MAX_RETRY_SECONDS = 6 * 60 * 60;

type Environment = Record<string, string | undefined>;

export type AccountDeletionFailureCategory =
  | "revenuecat_permission"
  | "revenuecat_transient"
  | "supabase_storage"
  | "supabase_transient"
  | "internal";

export type RevenueCatDeletionStatus =
  | "pending"
  | "deletion_satisfied";

export type SupabaseDeletionStatus = "pending" | "deleted";

export interface AccountDeletionClaim {
  requestId: string;
  userId: string;
  revenuecatStatus: RevenueCatDeletionStatus;
  supabaseStatus: SupabaseDeletionStatus;
  retryCount: number;
  leaseToken: string;
}

export interface AccountDeletionWorkerRepository {
  claim(input: {
    leaseToken: string;
    leaseSeconds: number;
    userId?: string;
  }): Promise<AccountDeletionClaim | null>;
  recordRevenueCatSatisfied(input: {
    requestId: string;
    leaseToken: string;
  }): Promise<boolean>;
  retry(input: {
    requestId: string;
    leaseToken: string;
    category: AccountDeletionFailureCategory;
    retryAfterSeconds: number;
  }): Promise<boolean>;
  complete(input: {
    requestId: string;
    leaseToken: string;
  }): Promise<boolean>;
}

export interface RevenueCatDeletionClient {
  ensureCustomerDeleted(userId: string): Promise<"deletion_satisfied">;
}

export interface AccountStoragePreflight {
  hasOwnedObjects(userId: string): Promise<boolean>;
}

export interface SupabaseAuthDeletionClient {
  deleteUser(userId: string): Promise<"deleted" | "already_missing">;
}

export interface SupabaseAuthAdmin {
  deleteUser(
    userId: string,
    shouldSoftDelete: boolean,
  ): Promise<{ error: { code?: string; status?: number } | null }>;
}

export interface AccountDeletionWorkerDependencies {
  repository: AccountDeletionWorkerRepository;
  revenueCat: RevenueCatDeletionClient;
  storage: AccountStoragePreflight;
  supabaseAuth: SupabaseAuthDeletionClient;
  createLeaseToken?: () => string;
  leaseSeconds?: number;
  targetUserId?: string;
}

export type AccountDeletionWorkerResult =
  | { outcome: "idle" }
  | {
      outcome: "retry_scheduled";
      category: AccountDeletionFailureCategory;
    }
  | { outcome: "completed" }
  | { outcome: "lease_lost" }
  | { outcome: "repository_unavailable" };

export class AccountDeletionStepError extends Error {
  readonly category: AccountDeletionFailureCategory;

  constructor(category: AccountDeletionFailureCategory) {
    super("Account deletion step failed.");
    this.name = "AccountDeletionStepError";
    this.category = category;
  }
}

export async function runAccountDeletionWorker(
  dependencies: AccountDeletionWorkerDependencies,
): Promise<AccountDeletionWorkerResult> {
  const leaseToken = (dependencies.createLeaseToken ?? randomUUID)();
  const leaseSeconds = dependencies.leaseSeconds ?? DEFAULT_LEASE_SECONDS;
  let claim: AccountDeletionClaim | null;
  try {
    claim = await dependencies.repository.claim({
      leaseToken,
      leaseSeconds,
      userId: dependencies.targetUserId,
    });
  } catch {
    return { outcome: "repository_unavailable" };
  }
  if (!claim) return { outcome: "idle" };

  if (claim.supabaseStatus === "deleted") {
    return completeClaim(dependencies.repository, claim);
  }

  if (claim.revenuecatStatus !== "deletion_satisfied") {
    try {
      await dependencies.revenueCat.ensureCustomerDeleted(
        claim.userId,
      );
    } catch (error) {
      const category =
        error instanceof AccountDeletionStepError &&
        error.category === "revenuecat_permission"
          ? "revenuecat_permission"
          : "revenuecat_transient";
      return retryClaim(dependencies.repository, claim, category);
    }

    try {
      const recorded = await dependencies.repository.recordRevenueCatSatisfied({
        requestId: claim.requestId,
        leaseToken: claim.leaseToken,
      });
      if (!recorded) return { outcome: "lease_lost" };
      claim = { ...claim, revenuecatStatus: "deletion_satisfied" };
    } catch {
      return { outcome: "repository_unavailable" };
    }
  }

  let hasOwnedStorageObjects: boolean;
  try {
    hasOwnedStorageObjects = await dependencies.storage.hasOwnedObjects(
      claim.userId,
    );
  } catch {
    return retryClaim(
      dependencies.repository,
      claim,
      "supabase_transient",
    );
  }
  if (hasOwnedStorageObjects) {
    return retryClaim(dependencies.repository, claim, "supabase_storage");
  }

  try {
    await dependencies.supabaseAuth.deleteUser(claim.userId);
  } catch {
    return retryClaim(
      dependencies.repository,
      claim,
      "supabase_transient",
    );
  }

  return completeClaim(dependencies.repository, claim);
}

export function accountDeletionRetryDelaySeconds(
  category: AccountDeletionFailureCategory,
  retryCount: number,
): number {
  const safeRetryCount = Number.isInteger(retryCount)
    ? Math.max(0, Math.min(retryCount, 16))
    : 0;
  const baseSeconds =
    category === "revenuecat_permission" || category === "supabase_storage"
      ? 15 * 60
      : 30;
  return Math.min(
    MAX_RETRY_SECONDS,
    baseSeconds * 2 ** safeRetryCount,
  );
}

export async function requestRevenueCatCustomerDeletion(
  userId: string,
  environment: Environment,
  request: typeof fetch = fetch,
): Promise<"deletion_satisfied"> {
  if (!isUuid(userId)) throw new AccountDeletionStepError("internal");
  const apiKey = environment.REVENUECAT_SECRET_API_KEY?.trim();
  if (!apiKey) {
    throw new AccountDeletionStepError("revenuecat_permission");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await request(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
      {
        method: "DELETE",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        cache: "no-store",
        signal: controller.signal,
      },
    );
    if (response.status === 200 || response.status === 404) {
      return "deletion_satisfied";
    }
    if (response.status === 401 || response.status === 403) {
      throw new AccountDeletionStepError("revenuecat_permission");
    }
    throw new AccountDeletionStepError("revenuecat_transient");
  } catch (error) {
    if (error instanceof AccountDeletionStepError) throw error;
    throw new AccountDeletionStepError("revenuecat_transient");
  } finally {
    clearTimeout(timeout);
  }
}

export async function deleteSupabaseAuthUser(
  userId: string,
  admin: SupabaseAuthAdmin,
): Promise<"deleted" | "already_missing"> {
  if (!isUuid(userId)) throw new AccountDeletionStepError("internal");
  const { error } = await admin.deleteUser(userId, false);
  if (!error) return "deleted";
  if (error.status === 404 || error.code === "user_not_found") {
    return "already_missing";
  }
  throw new AccountDeletionStepError("supabase_transient");
}

export async function runConfiguredAccountDeletionWorker(
  environment: Environment,
  options: {
    request?: typeof fetch;
    createLeaseToken?: () => string;
    leaseSeconds?: number;
    targetUserId?: string;
  } = {},
): Promise<AccountDeletionWorkerResult> {
  const client = createAccountDeletionServiceClient(environment);
  const repository = createSupabaseWorkerRepository(client);

  return runAccountDeletionWorker({
    repository,
    revenueCat: {
      ensureCustomerDeleted: (userId) =>
        requestRevenueCatCustomerDeletion(
          userId,
          environment,
          options.request,
        ),
    },
    storage: {
      hasOwnedObjects: async (userId) => {
        const { data, error } = await client.rpc(
          "account_has_storage_objects",
          { p_user_id: userId },
        );
        if (error || typeof data !== "boolean") {
          throw new AccountDeletionStepError("supabase_transient");
        }
        return data;
      },
    },
    supabaseAuth: {
      deleteUser: (userId) =>
        deleteSupabaseAuthUser(userId, client.auth.admin),
    },
    createLeaseToken: options.createLeaseToken,
    leaseSeconds: options.leaseSeconds,
    targetUserId: options.targetUserId,
  });
}

async function retryClaim(
  repository: AccountDeletionWorkerRepository,
  claim: AccountDeletionClaim,
  category: AccountDeletionFailureCategory,
): Promise<AccountDeletionWorkerResult> {
  try {
    const recorded = await repository.retry({
      requestId: claim.requestId,
      leaseToken: claim.leaseToken,
      category,
      retryAfterSeconds: accountDeletionRetryDelaySeconds(
        category,
        claim.retryCount,
      ),
    });
    return recorded
      ? { outcome: "retry_scheduled", category }
      : { outcome: "lease_lost" };
  } catch {
    return { outcome: "repository_unavailable" };
  }
}

async function completeClaim(
  repository: AccountDeletionWorkerRepository,
  claim: AccountDeletionClaim,
): Promise<AccountDeletionWorkerResult> {
  try {
    const completed = await repository.complete({
      requestId: claim.requestId,
      leaseToken: claim.leaseToken,
    });
    return completed
      ? { outcome: "completed" }
      : { outcome: "lease_lost" };
  } catch {
    return { outcome: "repository_unavailable" };
  }
}

function createAccountDeletionServiceClient(environment: Environment) {
  const { url } = validateSupabasePublicConfig(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey) {
    throw new Error("Account deletion worker is not configured.");
  }
  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

function createSupabaseWorkerRepository(
  client: ReturnType<typeof createAccountDeletionServiceClient>,
): AccountDeletionWorkerRepository {
  return {
    claim: async ({ leaseToken, leaseSeconds, userId }) => {
      const { data, error } = await client.rpc(
        "claim_account_deletion_request",
        {
          p_lease_seconds: leaseSeconds,
          p_lease_token: leaseToken,
          p_user_id: userId,
        },
      );
      if (error) throw error;
      return data === null ? null : parseDeletionClaim(data);
    },
    recordRevenueCatSatisfied: async (input) =>
      booleanRpc(client, "record_account_deletion_revenuecat_satisfied", {
        p_lease_token: input.leaseToken,
        p_request_id: input.requestId,
      }),
    retry: async (input) =>
      booleanRpc(client, "retry_account_deletion_request", {
        p_failure_category: input.category,
        p_lease_token: input.leaseToken,
        p_request_id: input.requestId,
        p_retry_after_seconds: input.retryAfterSeconds,
      }),
    complete: async (input) =>
      booleanRpc(client, "complete_account_deletion_request", {
        p_lease_token: input.leaseToken,
        p_request_id: input.requestId,
      }),
  };
}

async function booleanRpc(
  client: ReturnType<typeof createAccountDeletionServiceClient>,
  functionName: string,
  parameters: Record<string, unknown>,
): Promise<boolean> {
  const { data, error } = await client.rpc(functionName, parameters);
  if (error || typeof data !== "boolean") throw error ?? new Error("Invalid RPC response.");
  return data;
}

function parseDeletionClaim(value: unknown): AccountDeletionClaim {
  if (
    !isRecord(value) ||
    typeof value.requestId !== "string" ||
    !isUuid(value.requestId) ||
    typeof value.userId !== "string" ||
    !isUuid(value.userId) ||
    !isRevenueCatStatus(value.revenuecatStatus) ||
    !isSupabaseStatus(value.supabaseStatus) ||
    typeof value.retryCount !== "number" ||
    !Number.isInteger(value.retryCount) ||
    value.retryCount < 0 ||
    typeof value.leaseToken !== "string" ||
    !isUuid(value.leaseToken)
  ) {
    throw new Error("Invalid account deletion claim.");
  }
  return {
    requestId: value.requestId.toLowerCase(),
    userId: value.userId.toLowerCase(),
    revenuecatStatus: value.revenuecatStatus,
    supabaseStatus: value.supabaseStatus,
    retryCount: value.retryCount,
    leaseToken: value.leaseToken.toLowerCase(),
  };
}

function isRevenueCatStatus(value: unknown): value is RevenueCatDeletionStatus {
  return (
    value === "pending" ||
    value === "deletion_satisfied"
  );
}

function isSupabaseStatus(value: unknown): value is SupabaseDeletionStatus {
  return value === "pending" || value === "deleted";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
