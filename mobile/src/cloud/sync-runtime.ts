import type { AppState } from "../domain/models.ts";
import { createUuidV4, isUuid } from "../domain/ids.ts";
import type { MobileRepository } from "../local/repository.ts";
import {
  CLOUD_WORKSPACE_STATUS_RPC,
  GET_CLOUD_WORKSPACE_RPC,
  type CloudHydrationState,
} from "./read-only-hydration.ts";
import {
  validateCanonicalWorkspace,
  type CanonicalWorkspace,
} from "./canonical-workspace.ts";
import {
  prepareSyncState,
  type MobileSyncQueue,
  type PendingWorkspaceMutation,
  type SyncAccountRecord,
} from "./sync-queue.ts";

export const SYNC_CLOUD_WORKSPACE_RPC = "sync_cloud_workspace_v1" as const;

export type MobileSyncStatus =
  | "loading"
  | "write-disabled"
  | "pending"
  | "syncing"
  | "synced"
  | "offline"
  | "error";

export interface MobileSyncSnapshot {
  userId: string;
  status: MobileSyncStatus;
  pendingCount: number;
  lastSuccessfulSyncAt?: string;
  message?: string;
}

export interface MobileSyncClient {
  auth: {
    getSession(): Promise<{
      data: { session: { user: { id: string } } | null };
      error: unknown | null;
    }>;
  };
  rpc(
    name:
      | typeof CLOUD_WORKSPACE_STATUS_RPC
      | typeof GET_CLOUD_WORKSPACE_RPC
      | typeof SYNC_CLOUD_WORKSPACE_RPC,
    parameters?: Record<string, unknown>,
  ): Promise<{ data: unknown; error: unknown | null }>;
}

export interface MobileSyncRuntimeDependencies {
  userId: string;
  client: MobileSyncClient;
  repository: MobileRepository;
  queue: MobileSyncQueue;
  isCurrent(): boolean;
  online(): boolean;
  timezone(): string;
  now(): string;
  uuid(): string;
  applyCanonical(
    workspace: CanonicalWorkspace,
    hydratedAt: string,
  ): Promise<void>;
  applyWorkingState(state: AppState): void;
  setCloudState(state: CloudHydrationState): void;
}

const SETUP_MESSAGE =
  "This account has no cloud workspace yet. Start fresh and Import this device are not available in Mobile M1E.";
const HYDRATION_ERROR_MESSAGE =
  "Cloud progress could not be loaded or verified. Local data and pending changes were not replaced.";
const SYNC_ERROR_MESSAGE =
  "Cloud sync needs attention. Saved local changes remain queued for retry.";
const OFFLINE_MESSAGE =
  "Cloud could not be reached. The owner-local working copy and any pending changes remain safe.";
const SESSION_ERROR_MESSAGE =
  "The current account session could not be verified. No queued write was sent.";

export class MobileSyncRuntime {
  private readonly dependencies: MobileSyncRuntimeDependencies;
  private record?: SyncAccountRecord;
  private initialized = false;
  private workingReady = false;
  private disposed = false;
  private flushPromise?: Promise<void>;
  private mutationTail: Promise<void> = Promise.resolve();
  private revision = 0;
  private workspaceDailyPlans: CanonicalWorkspace["dailyPlans"] = [];
  private snapshot: MobileSyncSnapshot;
  private listeners = new Set<(snapshot: MobileSyncSnapshot) => void>();

  constructor(dependencies: MobileSyncRuntimeDependencies) {
    this.dependencies = dependencies;
    this.snapshot = {
      userId: dependencies.userId,
      status: "loading",
      pendingCount: 0,
    };
  }

  getSnapshot(): MobileSyncSnapshot {
    return this.snapshot;
  }

  subscribe(listener: (snapshot: MobileSyncSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
  }

  canWrite(): boolean {
    return Boolean(
      !this.disposed &&
        this.dependencies.isCurrent() &&
        this.initialized &&
        this.workingReady &&
        this.record?.active,
    );
  }

  async start(): Promise<void> {
    if (!this.isCurrent()) return;
    this.setSnapshot({ status: "loading", pendingCount: 0 });
    this.dependencies.setCloudState({ status: "loading" });

    try {
      this.record = await this.dependencies.queue.load(this.dependencies.userId);
      if (!this.isCurrent()) return;
      await this.dependencies.queue.save(this.record);
      if (!this.isCurrent()) return;

      await this.restoreWorkingCopy();
      if (!this.isCurrent()) return;
      if (!this.dependencies.online()) {
        if (this.record.active && this.workingReady) {
          this.initialized = true;
          this.offlineFailure();
        } else {
          this.hydrationFailure(true);
        }
        return;
      }

      const statusResponse = await this.authorizedRpc(CLOUD_WORKSPACE_STATUS_RPC);
      if (!this.isCurrent() || !statusResponse) return;
      if (statusResponse.error || !isRecord(statusResponse.data)) {
        if (
          this.record.active &&
          this.workingReady &&
          isLikelyNetworkError(statusResponse.error)
        ) {
          this.initialized = true;
          this.offlineFailure();
        } else {
          this.hydrationFailure();
        }
        return;
      }
      if (statusResponse.data.initialized !== true) {
        this.initialized = false;
        this.workingReady = false;
        this.dependencies.setCloudState({
          status: "setup-unavailable",
          message: SETUP_MESSAGE,
        });
        this.setSnapshot({
          status: "write-disabled",
          pendingCount: this.record.pending.length,
          message: SETUP_MESSAGE,
        });
        return;
      }

      this.initialized = true;
      if (this.record.active && this.record.pending.length > 0) {
        this.workspaceDailyPlans = structuredClone(
          this.record.pending.at(-1)?.dailyPlans ?? [],
        );
        this.setPendingStatus();
        await this.refresh();
        return;
      }

      await this.readAndApplyCanonical();
    } catch {
      if (this.record?.active && this.workingReady) this.offlineFailure();
      else this.hydrationFailure(true);
    }
  }

  mutate(
    recipe: (current: AppState) => AppState,
  ): Promise<AppState | undefined> {
    this.revision += 1;
    const operation = this.mutationTail.then(() => this.persistMutation(recipe));
    this.mutationTail = operation.then(
      () => undefined,
      () => undefined,
    );
    void operation.then(
      (state) => {
        if (state) void this.flush();
      },
      () => undefined,
    );
    return operation;
  }

  async refresh(): Promise<void> {
    if (!this.canWrite()) return;
    await this.mutationTail;
    const revisionBeforeRead = this.revision;
    await this.flush();
    if (!this.isCurrent() || !this.record || this.record.pending.length > 0) return;

    this.setSnapshot({
      status: "syncing",
      pendingCount: 0,
      lastSuccessfulSyncAt: this.record?.lastSuccessfulSyncAt,
    });
    const workspace = await this.readCanonical();
    if (!workspace || !this.isCurrent()) return;
    await this.mutationTail;
    if (revisionBeforeRead !== this.revision || this.record.pending.length > 0) {
      await this.flush();
      if (this.isCurrent() && this.record.pending.length === 0) {
        await this.refresh();
      }
      return;
    }
    await this.applyValidatedWorkspace(workspace);
    await this.markSuccess();
  }

  async retry(): Promise<void> {
    if (!this.initialized || !this.record?.active) {
      await this.start();
      return;
    }
    await this.refresh();
  }

  private async persistMutation(
    recipe: (current: AppState) => AppState,
  ): Promise<AppState | undefined> {
    if (!this.canWrite() || !this.record) return undefined;
    const record = this.record;
    const current = await this.dependencies.repository.loadLocalWorkspace(
      { kind: "account", userId: this.dependencies.userId },
    );
    if (!this.isCurrent()) return undefined;
    const next = recipe(current);
    if (next === current) return current;
    const snapshot = prepareSyncState(next);

    const mutationId = this.dependencies.uuid();
    if (!isUuid(mutationId)) throw new Error("Mutation identity is invalid.");
    const mutation: PendingWorkspaceMutation = {
      mutationId,
      state: snapshot,
      dailyPlans: structuredClone(this.workspaceDailyPlans),
      commands: { purchases: [], consumptions: [] },
      queuedAt: this.dependencies.now(),
    };
    record.pending.push(mutation);
    await this.dependencies.queue.save(record);
    this.setPendingStatus();
    await this.dependencies.repository.saveLocalWorkspace(
      { kind: "account", userId: this.dependencies.userId },
      next,
    );
    if (!this.isCurrent()) return next;
    this.dependencies.applyWorkingState(next);
    return next;
  }

  private async flush(): Promise<void> {
    if (this.flushPromise) return this.flushPromise;
    this.flushPromise = this.flushPending();
    try {
      await this.flushPromise;
    } catch {
      this.syncFailure();
    } finally {
      this.flushPromise = undefined;
      if (
        this.isCurrent() &&
        this.record &&
        this.record.pending.length > 0 &&
        (this.snapshot.status === "pending" || this.snapshot.status === "syncing")
      ) {
        this.setPendingStatus();
      }
    }
  }

  private async flushPending(): Promise<void> {
    if (!this.canWrite() || !this.record || this.record.pending.length === 0) return;
    if (!this.dependencies.online()) {
      this.setSnapshot({
        status: "offline",
        pendingCount: this.record.pending.length,
        message: OFFLINE_MESSAGE,
        lastSuccessfulSyncAt: this.record.lastSuccessfulSyncAt,
      });
      return;
    }

    let latestWorkspace: CanonicalWorkspace | undefined;
    this.setSnapshot({
      status: "syncing",
      pendingCount: this.record.pending.length,
      lastSuccessfulSyncAt: this.record.lastSuccessfulSyncAt,
    });

    while (this.record.pending.length > 0) {
      const mutation = this.record.pending[0]!;
      let response: { data: unknown; error: unknown | null } | undefined;
      try {
        response = await this.authorizedRpc(SYNC_CLOUD_WORKSPACE_RPC, {
          p_mutation_id: mutation.mutationId,
          p_device_id: this.record.deviceId,
          p_timezone: this.dependencies.timezone(),
          p_state: mutation.state,
          p_daily_plans: mutation.dailyPlans,
          p_commands: mutation.commands,
        });
      } catch {
        this.offlineFailure();
        return;
      }
      if (!response || !this.isCurrent()) return;
      if (response.error) {
        if (isLikelyNetworkError(response.error)) this.offlineFailure();
        else this.syncFailure();
        return;
      }

      try {
        latestWorkspace = validateCanonicalWorkspace(response.data);
      } catch {
        this.syncFailure();
        return;
      }
      if (!(await this.currentSessionMatches()) || !this.isCurrent()) return;

      this.record.pending.shift();
      await this.dependencies.queue.save(this.record);
      if (!this.isCurrent()) return;
      this.setSnapshot({
        status: this.record.pending.length > 0 ? "syncing" : "pending",
        pendingCount: this.record.pending.length,
        lastSuccessfulSyncAt: this.record.lastSuccessfulSyncAt,
      });
    }

    await this.mutationTail;
    if (!this.isCurrent() || !this.record) return;
    if (this.record.pending.length > 0) {
      await this.flushPending();
      return;
    }
    if (latestWorkspace) await this.applyValidatedWorkspace(latestWorkspace);
    await this.markSuccess();
  }

  private async readAndApplyCanonical(): Promise<void> {
    this.setSnapshot({
      status: "syncing",
      pendingCount: 0,
      lastSuccessfulSyncAt: this.record?.lastSuccessfulSyncAt,
    });
    const workspace = await this.readCanonical();
    if (!workspace || !this.isCurrent() || !this.record) return;
    await this.applyValidatedWorkspace(workspace);
    this.workingReady = true;
    this.record.active = true;
    await this.markSuccess();
  }

  private async readCanonical(): Promise<CanonicalWorkspace | undefined> {
    let response: { data: unknown; error: unknown | null } | undefined;
    try {
      response = await this.authorizedRpc(GET_CLOUD_WORKSPACE_RPC);
    } catch {
      this.hydrationFailure(true);
      return undefined;
    }
    if (!response || !this.isCurrent()) return undefined;
    if (response.error) {
      this.hydrationFailure(isLikelyNetworkError(response.error));
      return undefined;
    }
    try {
      return validateCanonicalWorkspace(response.data);
    } catch {
      this.hydrationFailure();
      return undefined;
    }
  }

  private async applyValidatedWorkspace(workspace: CanonicalWorkspace): Promise<void> {
    const hydratedAt = this.dependencies.now();
    await this.dependencies.applyCanonical(workspace, hydratedAt);
    if (!this.isCurrent()) return;
    this.workingReady = true;
    this.workspaceDailyPlans = structuredClone(workspace.dailyPlans);
    this.dependencies.setCloudState({
      status: "ready",
      userId: this.dependencies.userId,
      workspace,
      hydratedAt,
    });
  }

  private async authorizedRpc(
    name:
      | typeof CLOUD_WORKSPACE_STATUS_RPC
      | typeof GET_CLOUD_WORKSPACE_RPC
      | typeof SYNC_CLOUD_WORKSPACE_RPC,
    parameters?: Record<string, unknown>,
  ): Promise<{ data: unknown; error: unknown | null } | undefined> {
    if (!(await this.currentSessionMatches()) || !this.isCurrent()) {
      this.sessionFailure();
      return undefined;
    }
    return this.dependencies.client.rpc(name, parameters);
  }

  private async currentSessionMatches(): Promise<boolean> {
    try {
      const { data, error } = await this.dependencies.client.auth.getSession();
      return !error && data.session?.user.id === this.dependencies.userId;
    } catch {
      return false;
    }
  }

  private async markSuccess(): Promise<void> {
    if (!this.record || !this.isCurrent()) return;
    const completedAt = this.dependencies.now();
    this.record.lastSuccessfulSyncAt = completedAt;
    await this.dependencies.queue.save(this.record);
    if (!this.isCurrent()) return;
    this.setSnapshot({
      status: "synced",
      pendingCount: 0,
      lastSuccessfulSyncAt: completedAt,
    });
  }

  private setPendingStatus(): void {
    if (!this.record) return;
    this.setSnapshot({
      status: this.dependencies.online() ? "pending" : "offline",
      pendingCount: this.record.pending.length,
      message: this.dependencies.online() ? undefined : OFFLINE_MESSAGE,
      lastSuccessfulSyncAt: this.record.lastSuccessfulSyncAt,
    });
  }

  private async restoreWorkingCopy(): Promise<void> {
    if (!this.record?.active) return;
    this.initialized = true;
    const latestPending = this.record.pending.at(-1);
    if (latestPending) {
      this.workspaceDailyPlans = structuredClone(latestPending.dailyPlans);
      await this.dependencies.repository.saveLocalWorkspace(
        { kind: "account", userId: this.dependencies.userId },
        latestPending.state,
      );
      if (!this.isCurrent()) return;
      this.dependencies.applyWorkingState(latestPending.state);
      this.workingReady = true;
      return;
    }

    const cached = await this.dependencies.repository.loadCloudWorkspace(
      this.dependencies.userId,
    );
    if (!cached || !this.isCurrent()) return;
    await this.applyValidatedWorkspace(cached);
  }

  private hydrationFailure(offline = false): void {
    if (!this.isCurrent()) return;
    const pendingCount = this.record?.pending.length ?? 0;
    const hasSafeOfflineCopy = Boolean(
      offline && this.record?.active && this.workingReady,
    );
    this.dependencies.setCloudState({
      status: "error",
      message: HYDRATION_ERROR_MESSAGE,
    });
    this.setSnapshot({
      status: hasSafeOfflineCopy ? "offline" : "error",
      pendingCount,
      message: hasSafeOfflineCopy ? OFFLINE_MESSAGE : HYDRATION_ERROR_MESSAGE,
      lastSuccessfulSyncAt: this.record?.lastSuccessfulSyncAt,
    });
  }

  private offlineFailure(): void {
    if (!this.isCurrent()) return;
    this.setSnapshot({
      status: "offline",
      pendingCount: this.record?.pending.length ?? 0,
      message: OFFLINE_MESSAGE,
      lastSuccessfulSyncAt: this.record?.lastSuccessfulSyncAt,
    });
  }

  private syncFailure(): void {
    if (!this.isCurrent()) return;
    this.setSnapshot({
      status: "error",
      pendingCount: this.record?.pending.length ?? 0,
      message: SYNC_ERROR_MESSAGE,
      lastSuccessfulSyncAt: this.record?.lastSuccessfulSyncAt,
    });
  }

  private sessionFailure(): void {
    if (!this.isCurrent()) return;
    this.setSnapshot({
      status: "error",
      pendingCount: this.record?.pending.length ?? 0,
      message: SESSION_ERROR_MESSAGE,
      lastSuccessfulSyncAt: this.record?.lastSuccessfulSyncAt,
    });
  }

  private setSnapshot(
    update: Omit<MobileSyncSnapshot, "userId">,
  ): void {
    if (!this.isCurrent()) return;
    this.snapshot = { userId: this.dependencies.userId, ...update };
    this.listeners.forEach((listener) => listener(this.snapshot));
  }

  private isCurrent(): boolean {
    return !this.disposed && this.dependencies.isCurrent();
  }
}

function isLikelyNetworkError(error: unknown): boolean {
  if (!isRecord(error)) return true;
  const message = typeof error.message === "string" ? error.message : "";
  return !error.code || /network|fetch|offline|timeout/i.test(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function defaultMobileSyncDependencies() {
  return {
    online: () => {
      const navigatorValue = (
        globalThis as typeof globalThis & { navigator?: { onLine?: boolean } }
      ).navigator;
      return navigatorValue?.onLine !== false;
    },
    timezone: () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    now: () => new Date().toISOString(),
    uuid: createUuidV4,
  };
}
