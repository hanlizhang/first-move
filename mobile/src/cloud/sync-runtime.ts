import type { AppState } from "../domain/models.ts";
import type { CatItemId } from "../domain/cat-items.ts";
import { isLocalDateKey } from "../domain/dates.ts";
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
  type SyncEconomicCommands,
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

export type MobileSyncFailureClass =
  | "offline"
  | "network"
  | "auth-session"
  | "rpc-server"
  | "canonical-validation"
  | "local-runtime";

export type PendingMutationType =
  | "workspace"
  | "purchase"
  | "consumption"
  | "mixed-economic";

export interface MobileSyncQueueSummary {
  totalCount: number;
  workspaceCount: number;
  purchaseCount: number;
  consumptionCount: number;
  mixedEconomicCount: number;
  headType?: PendingMutationType;
  blockedFollowerCount: number;
}

export interface MobileSyncDiagnostic {
  failureClass: MobileSyncFailureClass;
  safeErrorCode: string;
  safeMessageClass: string;
}

export interface MobileSyncSnapshot {
  userId: string;
  status: MobileSyncStatus;
  pendingCount: number;
  queueSummary: MobileSyncQueueSummary;
  lastSuccessfulSyncAt?: string;
  message?: string;
  diagnostic?: MobileSyncDiagnostic;
}

export type AuthenticatedCatEconomyOutcome =
  | "applied"
  | "queued"
  | "insufficient"
  | "already-owned"
  | "locked"
  | "empty"
  | "invalid"
  | "error";

export interface AuthenticatedCatEconomyResult {
  outcome: AuthenticatedCatEconomyOutcome;
  state?: AppState;
  queueReason?: "offline" | "blocked-by-earlier" | "sync-failure" | "pending";
  blockedByEarlierCount?: number;
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
  private readonly economicResults = new Map<
    string,
    Exclude<AuthenticatedCatEconomyOutcome, "applied" | "queued">
  >();
  private snapshot: MobileSyncSnapshot;
  private listeners = new Set<(snapshot: MobileSyncSnapshot) => void>();

  constructor(dependencies: MobileSyncRuntimeDependencies) {
    this.dependencies = dependencies;
    this.snapshot = {
      userId: dependencies.userId,
      status: "loading",
      pendingCount: 0,
      queueSummary: emptyQueueSummary(),
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

      let statusResponse: { data: unknown; error: unknown | null } | undefined;
      try {
        statusResponse = await this.authorizedRpc(CLOUD_WORKSPACE_STATUS_RPC);
      } catch (error) {
        const diagnostic = safeRpcDiagnostic(error);
        if (
          diagnostic.failureClass === "network" &&
          !this.dependencies.online()
        ) {
          if (this.record.active && this.workingReady) {
            this.initialized = true;
            this.offlineFailure();
          } else {
            this.hydrationFailure(true);
          }
        } else if (this.record.active && this.workingReady) {
          this.initialized = true;
          this.recordOnlineRpcFailure(diagnostic);
        } else {
          this.hydrationFailure(false, diagnostic);
        }
        return;
      }
      if (!this.isCurrent() || !statusResponse) return;
      if (statusResponse.error) {
        const diagnostic = safeRpcDiagnostic(statusResponse.error);
        if (
          diagnostic.failureClass === "network" &&
          !this.dependencies.online()
        ) {
          if (this.record.active && this.workingReady) {
            this.initialized = true;
            this.offlineFailure();
          } else {
            this.hydrationFailure(true);
          }
        } else if (this.record.active && this.workingReady) {
          this.initialized = true;
          this.recordOnlineRpcFailure(diagnostic);
        } else {
          this.hydrationFailure(false, diagnostic);
        }
        return;
      }
      if (!isRecord(statusResponse.data)) {
        this.hydrationFailure(false, {
          failureClass: "canonical-validation",
          safeErrorCode: "STATUS_INVALID",
          safeMessageClass: "workspace-status-response-invalid",
        });
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
      const diagnostic: MobileSyncDiagnostic = {
        failureClass: "local-runtime",
        safeErrorCode: "START_FAILURE",
        safeMessageClass: "sync-start-failed",
      };
      if (!this.dependencies.online()) this.offlineFailure();
      else if (this.record?.active && this.workingReady) {
        this.syncFailure(diagnostic);
      } else {
        this.hydrationFailure(false, diagnostic);
      }
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

  purchaseInventoryItem(
    itemId: CatItemId,
    localDate: string,
  ): Promise<AuthenticatedCatEconomyResult> {
    if (!isLocalDateKey(localDate)) return Promise.resolve({ outcome: "invalid" });
    const purchaseMutationId = this.dependencies.uuid();
    if (!isUuid(purchaseMutationId)) return Promise.resolve({ outcome: "invalid" });
    return this.queueEconomicCommands({
      purchases: [{ mutationId: purchaseMutationId, itemId, localDate }],
      consumptions: [],
    });
  }

  consumeInventoryItem(
    itemId: CatItemId,
    localDate: string,
  ): Promise<AuthenticatedCatEconomyResult> {
    if (!isLocalDateKey(localDate)) return Promise.resolve({ outcome: "invalid" });
    return this.queueEconomicCommands({
      purchases: [],
      consumptions: [{ itemId, quantity: 1, localDate }],
    });
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

  private async queueEconomicCommands(
    commands: SyncEconomicCommands,
  ): Promise<AuthenticatedCatEconomyResult> {
    this.revision += 1;
    const operation = this.mutationTail.then(() =>
      this.persistEconomicMutation(commands),
    );
    this.mutationTail = operation.then(
      () => undefined,
      () => undefined,
    );
    const queued = await operation;
    if (!queued) return { outcome: "error" };
    await this.flush();
    if (!this.record || !this.isCurrent()) return { outcome: "error" };
    const pendingIndex = this.record.pending.findIndex(
      (mutation) => mutation.mutationId === queued.mutationId,
    );
    if (pendingIndex >= 0) {
      return {
        outcome: "queued",
        state: queued.state,
        queueReason:
          this.snapshot.status === "offline"
            ? "offline"
            : pendingIndex > 0
              ? "blocked-by-earlier"
              : this.snapshot.status === "error"
                ? "sync-failure"
                : "pending",
        blockedByEarlierCount: pendingIndex,
      };
    }
    const rejected = this.economicResults.get(queued.mutationId);
    this.economicResults.delete(queued.mutationId);
    if (rejected) return { outcome: rejected, state: queued.state };
    return {
      outcome: "applied",
      state: await this.dependencies.repository.loadLocalWorkspace({
        kind: "account",
        userId: this.dependencies.userId,
      }),
    };
  }

  private async persistEconomicMutation(
    commands: SyncEconomicCommands,
  ): Promise<{ mutationId: string; state: AppState } | undefined> {
    if (!this.canWrite() || !this.record) return undefined;
    const state = await this.dependencies.repository.loadLocalWorkspace({
      kind: "account",
      userId: this.dependencies.userId,
    });
    if (!this.isCurrent()) return undefined;
    const mutationId = this.dependencies.uuid();
    if (!isUuid(mutationId)) throw new Error("Mutation identity is invalid.");
    const mutation: PendingWorkspaceMutation = {
      mutationId,
      state: prepareSyncState(state),
      dailyPlans: structuredClone(this.workspaceDailyPlans),
      commands: structuredClone(commands),
      queuedAt: this.dependencies.now(),
    };
    this.record.pending.push(mutation);
    await this.dependencies.queue.save(this.record);
    this.setPendingStatus();
    return { mutationId, state };
  }

  private async flush(): Promise<void> {
    if (this.flushPromise) return this.flushPromise;
    this.flushPromise = this.flushPending();
    try {
      await this.flushPromise;
    } catch {
      this.syncFailure({
        failureClass: "local-runtime",
        safeErrorCode: "LOCAL_RUNTIME_FAILURE",
        safeMessageClass: "local-sync-operation-failed",
      });
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
        diagnostic: offlineDiagnostic(),
      });
      return;
    }

    let latestWorkspace: CanonicalWorkspace | undefined;
    let refreshAfterEconomicRejection = false;
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
      } catch (error) {
        const diagnostic = safeRpcDiagnostic(error);
        if (
          diagnostic.failureClass === "network" &&
          !this.dependencies.online()
        ) {
          this.offlineFailure();
        } else {
          this.recordOnlineRpcFailure(diagnostic);
        }
        return;
      }
      if (!response || !this.isCurrent()) return;
      if (response.error) {
        const economicOutcome = economicOutcomeForError(
          response.error,
          mutation.commands,
        );
        if (economicOutcome) {
          this.economicResults.set(mutation.mutationId, economicOutcome);
          this.record.pending.shift();
          await this.dependencies.queue.save(this.record);
          refreshAfterEconomicRejection = true;
          continue;
        }
        const diagnostic = safeRpcDiagnostic(response.error);
        if (
          diagnostic.failureClass === "network" &&
          !this.dependencies.online()
        ) {
          this.offlineFailure();
        } else {
          this.recordOnlineRpcFailure(diagnostic);
        }
        return;
      }

      try {
        latestWorkspace = validateCanonicalWorkspace(response.data);
      } catch {
        this.syncFailure({
          failureClass: "canonical-validation",
          safeErrorCode: "CANONICAL_INVALID",
          safeMessageClass: "canonical-response-invalid",
        });
        return;
      }
      const sessionMatches = await this.currentSessionMatches();
      if (!sessionMatches) {
        if (this.isCurrent()) this.sessionFailure();
        return;
      }
      if (!this.isCurrent()) return;

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
    if (refreshAfterEconomicRejection) {
      const refreshed = await this.readCanonical();
      if (!refreshed || !this.isCurrent()) return;
      latestWorkspace = refreshed;
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
    } catch (error) {
      const diagnostic = safeRpcDiagnostic(error);
      this.hydrationFailure(
        diagnostic.failureClass === "network" && !this.dependencies.online(),
        diagnostic,
      );
      return undefined;
    }
    if (!response || !this.isCurrent()) return undefined;
    if (response.error) {
      const diagnostic = safeRpcDiagnostic(response.error);
      this.hydrationFailure(
        diagnostic.failureClass === "network" && !this.dependencies.online(),
        diagnostic,
      );
      return undefined;
    }
    try {
      return validateCanonicalWorkspace(response.data);
    } catch {
      this.hydrationFailure(false, {
        failureClass: "canonical-validation",
        safeErrorCode: "CANONICAL_INVALID",
        safeMessageClass: "canonical-response-invalid",
      });
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
    const offline = !this.dependencies.online();
    this.setSnapshot({
      status: offline ? "offline" : "pending",
      pendingCount: this.record.pending.length,
      message: offline ? OFFLINE_MESSAGE : undefined,
      lastSuccessfulSyncAt: this.record.lastSuccessfulSyncAt,
      diagnostic: offline ? offlineDiagnostic() : undefined,
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

  private hydrationFailure(
    offline = false,
    diagnostic?: MobileSyncDiagnostic,
  ): void {
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
      diagnostic: hasSafeOfflineCopy
        ? offlineDiagnostic()
        : diagnostic ?? {
            failureClass: "canonical-validation",
            safeErrorCode: "HYDRATION_FAILED",
            safeMessageClass: "canonical-hydration-failed",
          },
    });
  }

  private offlineFailure(): void {
    if (!this.isCurrent()) return;
    this.setSnapshot({
      status: "offline",
      pendingCount: this.record?.pending.length ?? 0,
      message: OFFLINE_MESSAGE,
      lastSuccessfulSyncAt: this.record?.lastSuccessfulSyncAt,
      diagnostic: offlineDiagnostic(),
    });
  }

  private networkFailure(
    diagnostic: MobileSyncDiagnostic = {
      failureClass: "network",
      safeErrorCode: "TRANSPORT_FAILURE",
      safeMessageClass: "rpc-transport-failed",
    },
  ): void {
    if (!this.isCurrent()) return;
    this.setSnapshot({
      status: "error",
      pendingCount: this.record?.pending.length ?? 0,
      message: SYNC_ERROR_MESSAGE,
      lastSuccessfulSyncAt: this.record?.lastSuccessfulSyncAt,
      diagnostic,
    });
  }

  private recordOnlineRpcFailure(diagnostic: MobileSyncDiagnostic): void {
    if (diagnostic.failureClass === "network") {
      this.networkFailure(diagnostic);
    } else if (diagnostic.failureClass === "auth-session") {
      this.sessionFailure(diagnostic);
    } else {
      this.syncFailure(diagnostic);
    }
  }

  private syncFailure(
    diagnostic: MobileSyncDiagnostic = {
      failureClass: "rpc-server",
      safeErrorCode: "RPC_FAILURE",
      safeMessageClass: "unclassified-rpc-error",
    },
  ): void {
    if (!this.isCurrent()) return;
    this.setSnapshot({
      status: "error",
      pendingCount: this.record?.pending.length ?? 0,
      message: SYNC_ERROR_MESSAGE,
      lastSuccessfulSyncAt: this.record?.lastSuccessfulSyncAt,
      diagnostic,
    });
  }

  private sessionFailure(
    diagnostic: MobileSyncDiagnostic = {
      failureClass: "auth-session",
      safeErrorCode: "SESSION_MISMATCH",
      safeMessageClass: "authenticated-owner-session-mismatch",
    },
  ): void {
    if (!this.isCurrent()) return;
    this.setSnapshot({
      status: "error",
      pendingCount: this.record?.pending.length ?? 0,
      message: SESSION_ERROR_MESSAGE,
      lastSuccessfulSyncAt: this.record?.lastSuccessfulSyncAt,
      diagnostic,
    });
  }

  private setSnapshot(
    update: Omit<MobileSyncSnapshot, "userId" | "queueSummary">,
  ): void {
    if (!this.isCurrent()) return;
    this.snapshot = {
      userId: this.dependencies.userId,
      ...update,
      queueSummary: summarizePendingMutations(this.record?.pending ?? []),
    };
    this.listeners.forEach((listener) => listener(this.snapshot));
  }

  private isCurrent(): boolean {
    return !this.disposed && this.dependencies.isCurrent();
  }
}

export function summarizePendingMutations(
  pending: readonly PendingWorkspaceMutation[],
): MobileSyncQueueSummary {
  const summary: MobileSyncQueueSummary = {
    totalCount: pending.length,
    workspaceCount: 0,
    purchaseCount: 0,
    consumptionCount: 0,
    mixedEconomicCount: 0,
    headType: pending[0] ? pendingMutationType(pending[0]) : undefined,
    blockedFollowerCount: Math.max(0, pending.length - 1),
  };
  for (const mutation of pending) {
    const type = pendingMutationType(mutation);
    if (type === "workspace") summary.workspaceCount += 1;
    else if (type === "purchase") summary.purchaseCount += 1;
    else if (type === "consumption") summary.consumptionCount += 1;
    else summary.mixedEconomicCount += 1;
  }
  return summary;
}

export function formatMobileSyncDiagnostic(snapshot: MobileSyncSnapshot): string {
  const { queueSummary, diagnostic } = snapshot;
  const failure = diagnostic
    ? `${diagnostic.failureClass}; code ${diagnostic.safeErrorCode}; class ${diagnostic.safeMessageClass}`
    : "none";
  const head = queueSummary.headType ?? "none";
  return [
    `Failure: ${failure}.`,
    `Queue mutations: ${queueSummary.totalCount} total, ${queueSummary.workspaceCount} workspace, ${queueSummary.purchaseCount} purchase, ${queueSummary.consumptionCount} consumption, ${queueSummary.mixedEconomicCount} mixed-economic.`,
    `FIFO head: ${head}; blocked followers: ${queueSummary.blockedFollowerCount}.`,
  ].join(" ");
}

function pendingMutationType(
  mutation: PendingWorkspaceMutation,
): PendingMutationType {
  const hasPurchases = mutation.commands.purchases.length > 0;
  const hasConsumptions = mutation.commands.consumptions.length > 0;
  if (hasPurchases && hasConsumptions) return "mixed-economic";
  if (hasPurchases) return "purchase";
  if (hasConsumptions) return "consumption";
  return "workspace";
}

function emptyQueueSummary(): MobileSyncQueueSummary {
  return summarizePendingMutations([]);
}

function offlineDiagnostic(): MobileSyncDiagnostic {
  return {
    failureClass: "offline",
    safeErrorCode: "OFFLINE_DETECTED",
    safeMessageClass: "device-reported-offline",
  };
}

function safeRpcDiagnostic(error: unknown): MobileSyncDiagnostic {
  const record = isRecord(error) ? error : {};
  const message = typeof record.message === "string" ? record.message : "";
  const rawCode = typeof record.code === "string" ? record.code : "";
  const safeErrorCode = /^[A-Za-z0-9_-]{1,32}$/.test(rawCode)
    ? rawCode
    : "NO_ERROR_CODE";
  if (
    safeErrorCode === "PGRST301" ||
    /jwt|not_authenticated|authentication required/i.test(message)
  ) {
    return {
      failureClass: "auth-session",
      safeErrorCode,
      safeMessageClass: "server-session-rejected",
    };
  }

  let safeMessageClass = "unclassified-rpc-error";
  if (/^PGRST2/.test(safeErrorCode) || /^(42703|42883|42P01)$/.test(safeErrorCode)) {
    safeMessageClass = "rpc-contract-mismatch";
  } else if (safeErrorCode === "42702") {
    safeMessageClass = "database-query-definition-error";
  } else if (/^23/.test(safeErrorCode)) {
    safeMessageClass = "database-constraint-rejected";
  } else if (/^(22023|22P02)$/.test(safeErrorCode)) {
    safeMessageClass = "invalid-rpc-input";
  } else if (safeErrorCode === "42501") {
    safeMessageClass = "authorization-rejected";
  } else if (safeErrorCode === "57014") {
    safeMessageClass = "server-timeout";
  } else if (safeErrorCode === "XX000") {
    safeMessageClass = "server-internal-error";
  } else if (/network|failed to fetch|offline|timed?\s*out|timeout/i.test(message)) {
    return {
      failureClass: "network",
      safeErrorCode,
      safeMessageClass: "rpc-transport-failed",
    };
  }
  return {
    failureClass: "rpc-server",
    safeErrorCode,
    safeMessageClass,
  };
}

function economicOutcomeForError(
  error: unknown,
  commands: SyncEconomicCommands,
): Exclude<AuthenticatedCatEconomyOutcome, "applied" | "queued"> | undefined {
  if (commands.purchases.length + commands.consumptions.length === 0) return undefined;
  if (!isRecord(error)) return undefined;
  const code = typeof error.code === "string" ? error.code : "";
  const message = typeof error.message === "string" ? error.message : "";
  if (code === "P0001" && message === "insufficient_points") return "insufficient";
  if (code === "P0001" && message === "already_owned") return "already-owned";
  if (code === "P0001" && message === "item_locked") return "locked";
  if (code === "P0001" && message === "insufficient_inventory") return "empty";
  if (
    code === "22023" &&
    (message === "invalid_item" ||
      message === "invalid_consumable" ||
      message === "invalid_consumption_quantity")
  ) {
    return "invalid";
  }
  return undefined;
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
