import { validateCanonicalWorkspace, type CanonicalWorkspace } from "../cloud/canonical-workspace.ts";
import { normalizeAppState } from "../domain/app-state.ts";
import { createEmptyState, type AppState } from "../domain/models.ts";

export const GUEST_WORKSPACE_KEY = "first-move:mobile:guest:v1";
export const ACCOUNT_LOCAL_WORKSPACE_KEY_PREFIX =
  "first-move:mobile:account-local:v1:";
export const CLOUD_CACHE_KEY_PREFIX = "first-move:mobile:cloud-cache:v1:";
export const LOCAL_REPOSITORY_VERSION = 1 as const;

export type LocalWorkspaceOwner =
  | { kind: "guest" }
  | { kind: "account"; userId: string };

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
  loadLocalWorkspace(owner: LocalWorkspaceOwner): Promise<AppState>;
  saveLocalWorkspace(owner: LocalWorkspaceOwner, state: AppState): Promise<void>;
  updateLocalWorkspace(
    owner: LocalWorkspaceOwner,
    recipe: (current: AppState) => AppState,
  ): Promise<AppState>;
  loadGuestWorkspace(): Promise<AppState>;
  saveGuestWorkspace(state: AppState): Promise<void>;
  updateGuestWorkspace(recipe: (current: AppState) => AppState): Promise<AppState>;
  loadCloudWorkspace(userId: string): Promise<CanonicalWorkspace | undefined>;
  saveCloudWorkspace(userId: string, workspace: CanonicalWorkspace, hydratedAt: string): Promise<void>;
}

export function createMobileRepositoryWithStore(store: AsyncKeyValueStore): MobileRepository {
  const mutationQueues = new Map<string, Promise<void>>();

  async function loadLocalWorkspace(owner: LocalWorkspaceOwner): Promise<AppState> {
    const key = localWorkspaceKey(owner);
    let raw: string | null;
    try {
      raw = await store.getItem(key);
    } catch {
      return createEmptyState();
    }
    const envelope = migrateGuestEnvelope(parseJson(raw));
    try {
      await store.setItem(key, JSON.stringify(envelope));
    } catch {
      // A readable workspace remains usable in memory even if repair persistence fails.
    }
    return envelope.state;
  }

  async function saveLocalWorkspace(
    owner: LocalWorkspaceOwner,
    state: AppState,
  ): Promise<void> {
    const envelope: GuestEnvelope = {
      version: LOCAL_REPOSITORY_VERSION,
      state: normalizeAppState(state),
    };
    await store.setItem(localWorkspaceKey(owner), JSON.stringify(envelope));
  }

  async function updateLocalWorkspace(
    owner: LocalWorkspaceOwner,
    recipe: (current: AppState) => AppState,
  ): Promise<AppState> {
    const key = localWorkspaceKey(owner);
    let result = createEmptyState();
    const previous = mutationQueues.get(key) ?? Promise.resolve();
    const mutation = previous.then(async () => {
      const current = await loadLocalWorkspace(owner);
      result = normalizeAppState(recipe(current));
      await saveLocalWorkspace(owner, result);
    });
    mutationQueues.set(
      key,
      mutation.then(
        () => undefined,
        () => undefined,
      ),
    );
    await mutation;
    return result;
  }

  const guestOwner: LocalWorkspaceOwner = { kind: "guest" };

  return {
    loadLocalWorkspace,

    saveLocalWorkspace,

    updateLocalWorkspace,

    loadGuestWorkspace() {
      return loadLocalWorkspace(guestOwner);
    },

    saveGuestWorkspace(state) {
      return saveLocalWorkspace(guestOwner, state);
    },

    async updateGuestWorkspace(recipe) {
      return updateLocalWorkspace(guestOwner, recipe);
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

export function accountLocalWorkspaceKey(userId: string): string {
  return `${ACCOUNT_LOCAL_WORKSPACE_KEY_PREFIX}${userId}`;
}

export function localWorkspaceKey(owner: LocalWorkspaceOwner): string {
  return owner.kind === "guest"
    ? GUEST_WORKSPACE_KEY
    : accountLocalWorkspaceKey(owner.userId);
}

export function migrateGuestEnvelope(value: unknown): GuestEnvelope {
  if (isRecord(value) && value.version === LOCAL_REPOSITORY_VERSION) {
    return {
      version: LOCAL_REPOSITORY_VERSION,
      state: normalizeAppState(value.state),
    };
  }
  if (isRecord(value)) {
    return {
      version: LOCAL_REPOSITORY_VERSION,
      state: normalizeAppState(value),
    };
  }
  return { version: LOCAL_REPOSITORY_VERSION, state: createEmptyState() };
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
