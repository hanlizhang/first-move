import {
  accountLocalWorkspaceKey,
  cloudCacheKey,
} from "../local/repository-core.ts";
import { morningSkipStorageKey } from "../local/morning-skip.ts";
import { recentFirstMoveTemplateKey } from "../local/recent-first-moves-core.ts";
import { mobileSyncQueueKey } from "../cloud/sync-queue.ts";

export const MOBILE_ACCOUNT_DELETION_CONFIRMATION =
  "DELETE MY ACCOUNT" as const;
export const APPLE_SUBSCRIPTION_MANAGEMENT_URL =
  "https://apps.apple.com/account/subscriptions" as const;
export const ACCOUNT_DELETION_QUARANTINE_KEY_PREFIX =
  "first-move:mobile:account-deletion-quarantine:v1:";

export type MobileAccountDeletionOutcome =
  | "accepted"
  | "reauthentication-required"
  | "confirmation-required"
  | "denied"
  | "unavailable";

export interface MobileDeletionSessionSource {
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

export interface RemovableMobileStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface LocalSessionCleaner {
  signOut(input: { scope: "local" }): Promise<unknown>;
}

export async function initiateMobileAccountDeletion(input: {
  apiBaseUrl: string;
  auth: MobileDeletionSessionSource;
  expectedUserId: string;
  confirmation: string;
  request?: typeof fetch;
}): Promise<MobileAccountDeletionOutcome> {
  if (input.confirmation !== MOBILE_ACCOUNT_DELETION_CONFIRMATION) {
    return "confirmation-required";
  }

  let authorization: string;
  try {
    const { data, error } = await input.auth.getSession();
    const session = data.session;
    if (
      error ||
      !session ||
      session.user.id !== input.expectedUserId ||
      !session.access_token
    ) {
      return "denied";
    }
    authorization = `Bearer ${session.access_token}`;
  } catch {
    return "unavailable";
  }

  try {
    const response = await (input.request ?? fetch)(
      `${input.apiBaseUrl.replace(/\/$/, "")}/api/account-deletion/initiate`,
      {
        method: "POST",
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirmation: input.confirmation }),
      },
    );
    const body = await safeJson(response);
    const status =
      isRecord(body) && typeof body.status === "string" ? body.status : "";
    if (response.status === 202 && status === "in_progress") return "accepted";
    if (response.status === 403 && status === "reauthentication_required") {
      return "reauthentication-required";
    }
    if (response.status === 400 && status === "confirmation_required") {
      return "confirmation-required";
    }
    if (response.status === 401 && status === "denied") return "denied";
    return "unavailable";
  } catch {
    return "unavailable";
  }
}

export async function purgeMobileAccountData(
  store: RemovableMobileStore,
  userId: string,
): Promise<void> {
  requireUuid(userId);
  await store.setItem(accountDeletionQuarantineKey(userId), "1");
  await Promise.all(
    accountScopedMobileKeys(userId).map((key) => store.removeItem(key)),
  );
}

export async function finalizeAcceptedMobileAccountDeletion(input: {
  userId: string;
  store: RemovableMobileStore;
  auth: LocalSessionCleaner;
  stopAccountActivity(): void;
  removeRevenueCatIdentity(userId: string): Promise<void>;
}): Promise<void> {
  input.stopAccountActivity();
  await Promise.allSettled([
    purgeMobileAccountData(input.store, input.userId),
    input.removeRevenueCatIdentity(input.userId),
    input.auth.signOut({ scope: "local" }),
  ]);
}

export async function isAccountDeletionQuarantined(
  store: Pick<RemovableMobileStore, "getItem">,
  userId: string,
): Promise<boolean> {
  if (!isUuid(userId)) return true;
  try {
    return (await store.getItem(accountDeletionQuarantineKey(userId))) === "1";
  } catch {
    return false;
  }
}

export function accountDeletionQuarantineKey(userId: string): string {
  return `${ACCOUNT_DELETION_QUARANTINE_KEY_PREFIX}${userId}`;
}

export function accountScopedMobileKeys(userId: string): string[] {
  requireUuid(userId);
  const workspaceKey = accountLocalWorkspaceKey(userId);
  return [
    workspaceKey,
    cloudCacheKey(userId),
    mobileSyncQueueKey(userId),
    morningSkipStorageKey(workspaceKey),
    recentFirstMoveTemplateKey({ kind: "account", userId }),
  ];
}

export async function openAppleSubscriptionManagement(
  openUrl: (url: string) => Promise<unknown>,
): Promise<boolean> {
  try {
    await openUrl(APPLE_SUBSCRIPTION_MANAGEMENT_URL);
    return true;
  } catch {
    return false;
  }
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function requireUuid(value: string): void {
  if (!isUuid(value)) throw new Error("Account identity is invalid.");
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
