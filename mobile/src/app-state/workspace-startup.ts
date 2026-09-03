import type { AuthEvent } from "../auth/auth-state.ts";
import { createEmptyState, type AppState } from "../domain/models.ts";
import { reconcileRunningCountdown } from "../domain/sessions.ts";
import type {
  AsyncKeyValueStore,
  MobileRepository,
} from "../local/repository-core.ts";

export const WORKSPACE_STARTUP_SELECTION_KEY =
  "first-move:mobile:workspace-startup:v1";

type WorkspaceStartupSelection = "guest" | "account";

export type WorkspaceStartupResult =
  | {
      mode: "guest";
      status: "ready";
      state: AppState;
    }
  | {
      mode: "guest";
      status: "error";
      state: AppState;
    }
  | {
      mode: "account";
      authEvent: AuthEvent;
    };

interface WorkspaceStartupController {
  start(
    restoreAccount: () => Promise<AuthEvent>,
  ): Promise<WorkspaceStartupResult | undefined>;
  enterGuest(): Promise<WorkspaceStartupResult | undefined>;
  enterAccount(
    restoreAccount: () => Promise<AuthEvent>,
  ): Promise<WorkspaceStartupResult | undefined>;
  selectAccount(): void;
  cancel(): void;
}

export function createWorkspaceStartupController(
  store: AsyncKeyValueStore,
  repository: MobileRepository,
  now: () => number = Date.now,
): WorkspaceStartupController {
  let requestId = 0;

  return {
    async start(restoreAccount) {
      const request = nextRequest();
      const selection = await loadSelection(store);
      if (!isCurrent(request)) return undefined;
      return selection === "guest"
        ? loadGuest(request)
        : loadAccount(request, restoreAccount);
    },

    async enterGuest() {
      const request = nextRequest();
      await saveSelection(store, "guest");
      if (!isCurrent(request)) return undefined;
      return loadGuest(request);
    },

    async enterAccount(restoreAccount) {
      const request = nextRequest();
      await saveSelection(store, "account");
      if (!isCurrent(request)) return undefined;
      return loadAccount(request, restoreAccount);
    },

    selectAccount() {
      nextRequest();
      void saveSelection(store, "account");
    },

    cancel() {
      nextRequest();
    },
  };

  function nextRequest(): number {
    requestId += 1;
    return requestId;
  }

  function isCurrent(request: number): boolean {
    return request === requestId;
  }

  async function loadGuest(
    request: number,
  ): Promise<WorkspaceStartupResult | undefined> {
    try {
      const loaded = await repository.loadGuestWorkspace();
      const reconciled = reconcileRunningCountdown(loaded, now());
      if (reconciled !== loaded) {
        await repository.saveGuestWorkspace(reconciled);
      }
      return isCurrent(request)
        ? { mode: "guest", status: "ready", state: reconciled }
        : undefined;
    } catch {
      return isCurrent(request)
        ? { mode: "guest", status: "error", state: createEmptyState() }
        : undefined;
    }
  }

  async function loadAccount(
    request: number,
    restoreAccount: () => Promise<AuthEvent>,
  ): Promise<WorkspaceStartupResult | undefined> {
    const authEvent = await restoreAccount();
    return isCurrent(request)
      ? { mode: "account", authEvent }
      : undefined;
  }
}

async function loadSelection(
  store: AsyncKeyValueStore,
): Promise<WorkspaceStartupSelection> {
  try {
    const value = await store.getItem(WORKSPACE_STARTUP_SELECTION_KEY);
    return value === "guest" ? "guest" : "account";
  } catch {
    return "account";
  }
}

async function saveSelection(
  store: AsyncKeyValueStore,
  selection: WorkspaceStartupSelection,
): Promise<void> {
  try {
    await store.setItem(WORKSPACE_STARTUP_SELECTION_KEY, selection);
  } catch {
    // The active in-memory choice remains usable when its local preference cannot be saved.
  }
}
