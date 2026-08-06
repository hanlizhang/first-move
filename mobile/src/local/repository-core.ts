import { validateCanonicalWorkspace, type CanonicalWorkspace } from "../cloud/canonical-workspace.ts";
import { createEmptyState, type AppState } from "../domain/models.ts";

export const GUEST_WORKSPACE_KEY = "first-move:mobile:guest:v1";
export const CLOUD_CACHE_KEY_PREFIX = "first-move:mobile:cloud-cache:v1:";
export const LOCAL_REPOSITORY_VERSION = 1 as const;

export interface AsyncKeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

interface GuestEnvelope {
  version: 1;
  state: AppState;
}

interface CloudCacheEnvelope {
  version: 1;
  userId: string;
  hydratedAt: string;
  canonicalPayload: Record<string, unknown>;
}

export interface MobileRepository {
  loadGuestWorkspace(): Promise<AppState>;
  saveGuestWorkspace(state: AppState): Promise<void>;
  loadCloudWorkspace(userId: string): Promise<CanonicalWorkspace | undefined>;
  saveCloudWorkspace(userId: string, workspace: CanonicalWorkspace, hydratedAt: string): Promise<void>;
}

export function createMobileRepositoryWithStore(store: AsyncKeyValueStore): MobileRepository {
  return {
    async loadGuestWorkspace() {
      const raw = await store.getItem(GUEST_WORKSPACE_KEY);
      const envelope = migrateGuestEnvelope(parseJson(raw));
      await store.setItem(GUEST_WORKSPACE_KEY, JSON.stringify(envelope));
      return envelope.state;
    },

    async saveGuestWorkspace(state) {
      const envelope = migrateGuestEnvelope({ version: LOCAL_REPOSITORY_VERSION, state });
      await store.setItem(GUEST_WORKSPACE_KEY, JSON.stringify(envelope));
    },

    async loadCloudWorkspace(userId) {
      const raw = parseJson(await store.getItem(cloudCacheKey(userId)));
      if (!isRecord(raw) || raw.version !== LOCAL_REPOSITORY_VERSION || raw.userId !== userId) {
        return undefined;
      }
      try {
        return validateCanonicalWorkspace(raw.canonicalPayload);
      } catch {
        return undefined;
      }
    },

    async saveCloudWorkspace(userId, workspace, hydratedAt) {
      const envelope: CloudCacheEnvelope = {
        version: LOCAL_REPOSITORY_VERSION,
        userId,
        hydratedAt,
        canonicalPayload: workspace.canonicalPayload,
      };
      await store.setItem(cloudCacheKey(userId), JSON.stringify(envelope));
    },
  };
}

export function cloudCacheKey(userId: string): string {
  return `${CLOUD_CACHE_KEY_PREFIX}${userId}`;
}

export function migrateGuestEnvelope(value: unknown): GuestEnvelope {
  if (isRecord(value) && value.version === LOCAL_REPOSITORY_VERSION && isSchemaV8State(value.state)) {
    return { version: LOCAL_REPOSITORY_VERSION, state: structuredClone(value.state) };
  }
  if (isSchemaV8State(value)) {
    return { version: LOCAL_REPOSITORY_VERSION, state: structuredClone(value) };
  }
  return { version: LOCAL_REPOSITORY_VERSION, state: createEmptyState() };
}

function isSchemaV8State(value: unknown): value is AppState {
  return (
    isRecord(value) &&
    value.schemaVersion === 8 &&
    Array.isArray(value.tasks) &&
    Array.isArray(value.habits) &&
    Array.isArray(value.activityIntents) &&
    Array.isArray(value.sessions) &&
    Array.isArray(value.rewardEvents) &&
    Array.isArray(value.journalEntries) &&
    Array.isArray(value.morningChecks) &&
    Array.isArray(value.morningAttempts) &&
    isRecord(value.inventory) &&
    Array.isArray(value.inventory.items) &&
    isRecord(value.progress)
  );
}

function parseJson(value: string | null): unknown {
  if (value === null) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
