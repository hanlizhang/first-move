import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { CloudSyncStatus } from "./account-sync-status.ts";
import { loadDailyPlans, type DailyPlanRecord } from "./daily-plan-state.ts";
import { replaceLocalWorkspace, validateCanonicalWorkspace, type CanonicalWorkspace } from "./cloud-hydration.ts";
import { detectAccountCloudState } from "./cloud-setup.ts";
import { createClient } from "./supabase/client.ts";
import { loadAppState, type StorageLike } from "./repository.ts";
import { replaceAppState, subscribeAppStateMutations } from "./store.ts";
import type { AppState } from "./models.ts";
import { isCatItemId } from "./cat-items.ts";
import { localDateKey } from "./dates.ts";

export const CLOUD_RUNTIME_STORAGE_KEY = "first-move:cloud-runtime:v1";

interface EconomicCommands {
  purchases: Array<{ mutationId: string; itemId: string; localDate: string }>;
  consumptions: Array<{ itemId: string; quantity: number; localDate: string }>;
}

interface PendingWorkspaceMutation {
  mutationId: string;
  state: AppState;
  dailyPlans: DailyPlanRecord[];
  commands: EconomicCommands;
  queuedAt: string;
}

interface AccountRuntimeMeta {
  active: boolean;
  deviceId: string;
  lastSuccessfulSyncAt?: string;
  pending: PendingWorkspaceMutation[];
}

interface CloudRuntimeMeta {
  version: 1;
  accounts: Record<string, AccountRuntimeMeta>;
}

export interface CloudRuntimeSnapshot {
  active: boolean;
  status: CloudSyncStatus;
  lastSuccessfulSyncAt?: string;
}

type CloudClient = Pick<SupabaseClient, "auth" | "rpc">;

export interface CloudRuntimeDependencies {
  client: CloudClient;
  storage: StorageLike;
  online: () => boolean;
  timezone: () => string;
  now: () => string;
  uuid: () => string;
  applyWorkspace: (workspace: CanonicalWorkspace) => void;
}

const inactiveSnapshot: CloudRuntimeSnapshot = { active: false, status: "not-initialized" };

export class CloudRuntime {
  private readonly dependencies: CloudRuntimeDependencies;
  private snapshot: CloudRuntimeSnapshot = inactiveSnapshot;
  private listeners = new Set<(snapshot: CloudRuntimeSnapshot) => void>();
  private userId?: string;
  private account?: AccountRuntimeMeta;
  private flushPromise?: Promise<void>;
  private starting = true;
  private bufferedMutations: Array<Pick<PendingWorkspaceMutation, "state" | "dailyPlans" | "commands">> = [];

  constructor(dependencies: CloudRuntimeDependencies) { this.dependencies = dependencies; }

  getSnapshot(): CloudRuntimeSnapshot { return this.snapshot; }

  subscribe(listener: (snapshot: CloudRuntimeSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  async start(): Promise<void> {
    const session = await this.sessionUser();
    if (!session) { this.stopBuffering(); return; }
    this.userId = session;
    const meta = loadRuntimeMeta(this.dependencies.storage);
    this.account = meta.accounts[session];
    if (this.account?.active) {
      this.starting = false;
      this.setSnapshot({ active: true, status: this.dependencies.online() ? "syncing" : "offline", lastSuccessfulSyncAt: this.account.lastSuccessfulSyncAt });
      const buffered = this.bufferedMutations.splice(0);
      for (const mutation of buffered) this.enqueue(mutation.state, mutation.dailyPlans, mutation.commands);
      if (this.dependencies.online()) await this.refresh();
      return;
    }

    const accountState = await detectAccountCloudState(this.dependencies.client);
    if (accountState !== "existing") { this.stopBuffering(); return; }
    const canonical = await this.readCanonical();
    if (!canonical || !workspaceMatchesLocalCache(this.dependencies.storage, canonical)) {
      this.stopBuffering();
      return;
    }
    await this.activate(canonical, false);
  }

  async activate(workspace: CanonicalWorkspace, replaceCache: boolean): Promise<void> {
    const userId = this.userId ?? await this.sessionUser();
    if (!userId) throw new Error("Your sign-in session is not available.");
    if (!replaceCache && !workspaceMatchesLocalCache(this.dependencies.storage, workspace)) {
      throw new Error("The local cache does not match the verified cloud workspace.");
    }
    this.userId = userId;
    const meta = loadRuntimeMeta(this.dependencies.storage);
    const existing = meta.accounts[userId];
    this.stopBuffering();
    this.account = {
      active: true,
      deviceId: existing?.deviceId ?? this.dependencies.uuid(),
      pending: existing?.pending ?? [],
      lastSuccessfulSyncAt: this.dependencies.now(),
    };
    meta.accounts[userId] = this.account;
    saveRuntimeMeta(this.dependencies.storage, meta);
    if (replaceCache) this.dependencies.applyWorkspace(workspace);
    this.setSnapshot({ active: true, status: "synced", lastSuccessfulSyncAt: this.account.lastSuccessfulSyncAt });
  }

  queueState(previous: AppState, next: AppState, dailyPlans: DailyPlanRecord[]): void {
    const mutation = { state: next, dailyPlans, commands: economicCommands(previous, next) };
    if (!this.account?.active || !this.userId) {
      if (!this.starting) return;
      this.bufferedMutations.push(structuredClone(mutation));
      return;
    }
    this.enqueue(mutation.state, mutation.dailyPlans, mutation.commands);
  }

  queueDailyPlans(dailyPlans: DailyPlanRecord[]): void {
    const mutation = { state: loadAppState(this.dependencies.storage), dailyPlans, commands: { purchases: [], consumptions: [] } };
    if (!this.account?.active || !this.userId) {
      if (!this.starting) return;
      this.bufferedMutations.push(structuredClone(mutation));
      return;
    }
    this.enqueue(mutation.state, mutation.dailyPlans, mutation.commands);
  }

  async refresh(): Promise<void> {
    if (!this.account?.active) return;
    if (!this.dependencies.online()) {
      this.setSnapshot({ ...this.snapshot, active: true, status: "offline" });
      return;
    }
    await this.flush();
    if (this.account.pending.length > 0) return;
    this.setSnapshot({ ...this.snapshot, active: true, status: "syncing" });
    const workspace = await this.readCanonical();
    if (!workspace) {
      this.setSnapshot({ ...this.snapshot, active: true, status: "error" });
      return;
    }
    if (this.account.pending.length > 0) {
      await this.flush();
      return;
    }
    try {
      this.dependencies.applyWorkspace(workspace);
      this.markSuccess();
    } catch {
      this.reportFailure();
    }
  }

  async retry(): Promise<void> {
    if (!this.account?.active) return;
    if (!this.dependencies.online()) {
      this.setSnapshot({ ...this.snapshot, active: true, status: "offline" });
      return;
    }
    await this.refresh();
  }

  setOnline(online: boolean): void {
    if (!this.account?.active) return;
    if (!online) this.setSnapshot({ ...this.snapshot, active: true, status: "offline" });
    else void this.retry();
  }

  reportFailure(): void {
    if (this.account?.active) this.setSnapshot({ ...this.snapshot, active: true, status: "error" });
    else this.stopBuffering();
  }

  private enqueue(state: AppState, dailyPlans: DailyPlanRecord[], commands: EconomicCommands): void {
    try {
      this.account!.pending.push({
        mutationId: this.dependencies.uuid(),
        state: structuredClone(state),
        dailyPlans: structuredClone(dailyPlans),
        commands,
        queuedAt: this.dependencies.now(),
      });
      this.persistAccount();
      this.setSnapshot({ ...this.snapshot, active: true, status: this.dependencies.online() ? "syncing" : "offline" });
      if (this.dependencies.online()) void this.flush().catch(() => this.reportFailure());
    } catch {
      this.reportFailure();
    }
  }

  private async flush(): Promise<void> {
    if (this.flushPromise) return this.flushPromise;
    this.flushPromise = this.flushPending();
    try { await this.flushPromise; }
    catch { this.reportFailure(); }
    finally { this.flushPromise = undefined; }
  }

  private async flushPending(): Promise<void> {
    if (!this.account || !this.userId || !this.dependencies.online()) return;
    let latestWorkspace: CanonicalWorkspace | undefined;
    while (this.account.pending.length > 0) {
      const mutation = this.account.pending[0];
      let response: Awaited<ReturnType<CloudRuntimeDependencies["client"]["rpc"]>>;
      try {
        response = await this.dependencies.client.rpc("sync_cloud_workspace_v1", {
          p_mutation_id: mutation.mutationId,
          p_device_id: this.account.deviceId,
          p_timezone: this.dependencies.timezone(),
          p_state: mutation.state,
          p_daily_plans: mutation.dailyPlans,
          p_commands: mutation.commands,
        });
      } catch {
        this.setSnapshot({ ...this.snapshot, active: true, status: this.dependencies.online() ? "error" : "offline" });
        return;
      }
      const { data, error } = response;
      if (error) {
        this.setSnapshot({ ...this.snapshot, active: true, status: this.dependencies.online() ? "error" : "offline" });
        return;
      }
      try { latestWorkspace = validateCanonicalWorkspace(data); }
      catch {
        this.setSnapshot({ ...this.snapshot, active: true, status: "error" });
        return;
      }
      this.account.pending.shift();
      this.persistAccount();
    }
    if (latestWorkspace) this.dependencies.applyWorkspace(latestWorkspace);
    this.markSuccess();
  }

  private async readCanonical(): Promise<CanonicalWorkspace | undefined> {
    let response: Awaited<ReturnType<CloudRuntimeDependencies["client"]["rpc"]>>;
    try { response = await this.dependencies.client.rpc("get_cloud_workspace_v2"); }
    catch { return undefined; }
    const { data, error } = response;
    if (error) return undefined;
    try { return validateCanonicalWorkspace(data); } catch { return undefined; }
  }

  private async sessionUser(): Promise<string | undefined> {
    let response: Awaited<ReturnType<CloudRuntimeDependencies["client"]["auth"]["getSession"]>>;
    try { response = await this.dependencies.client.auth.getSession(); }
    catch { return undefined; }
    const { data, error } = response;
    return error ? undefined : data.session?.user.id;
  }

  private markSuccess(): void {
    if (!this.account) return;
    this.account.lastSuccessfulSyncAt = this.dependencies.now();
    this.persistAccount();
    this.setSnapshot({ active: true, status: "synced", lastSuccessfulSyncAt: this.account.lastSuccessfulSyncAt });
  }

  private persistAccount(): void {
    if (!this.userId || !this.account) return;
    const meta = loadRuntimeMeta(this.dependencies.storage);
    meta.accounts[this.userId] = this.account;
    saveRuntimeMeta(this.dependencies.storage, meta);
  }

  private setSnapshot(snapshot: CloudRuntimeSnapshot): void {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener(snapshot));
  }

  private stopBuffering(): void {
    this.starting = false;
    this.bufferedMutations = [];
  }
}

export function useCloudRuntime(
  authenticatedEmail: string | null,
  onWorkspace: (workspace: CanonicalWorkspace) => void,
  enabled = true,
) {
  const runtimeRef = useRef<CloudRuntime | undefined>(undefined);
  const onWorkspaceRef = useRef(onWorkspace);
  const [snapshot, setSnapshot] = useState<CloudRuntimeSnapshot>(inactiveSnapshot);

  useEffect(() => {
    onWorkspaceRef.current = onWorkspace;
  }, [onWorkspace]);

  useEffect(() => {
    if (!authenticatedEmail || !enabled) return;
    const storage = window.localStorage;
    const runtime = new CloudRuntime({
      client: createClient(), storage,
      online: () => navigator.onLine,
      timezone: () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      now: () => new Date().toISOString(), uuid: () => crypto.randomUUID(),
      applyWorkspace: (workspace) => {
        replaceLocalWorkspace(storage, workspace);
        replaceAppState(workspace.state, false);
        onWorkspaceRef.current(workspace);
      },
    });
    runtimeRef.current = runtime;
    const unsubscribeRuntime = runtime.subscribe(setSnapshot);
    const unsubscribeMutations = subscribeAppStateMutations((previous, next) => {
      runtime.queueState(previous, next, loadDailyPlans(storage));
    });
    const focus = () => void runtime.refresh().catch(() => runtime.reportFailure());
    const online = () => runtime.setOnline(true);
    const offline = () => runtime.setOnline(false);
    window.addEventListener("focus", focus);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    void runtime.start().catch(() => runtime.reportFailure());
    return () => {
      unsubscribeRuntime(); unsubscribeMutations();
      window.removeEventListener("focus", focus);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      if (runtimeRef.current === runtime) runtimeRef.current = undefined;
    };
  }, [authenticatedEmail, enabled]);

  const activate = useCallback((workspace: CanonicalWorkspace, replaceCache: boolean) => {
    const runtime = runtimeRef.current;
    if (!runtime) return Promise.reject(new Error("Cloud sync is not ready."));
    return runtime.activate(workspace, replaceCache);
  }, []);
  const refresh = useCallback(() => runtimeRef.current?.refresh() ?? Promise.resolve(), []);
  const retry = useCallback(() => runtimeRef.current?.retry() ?? Promise.resolve(), []);
  const queueDailyPlan = useCallback((plans: DailyPlanRecord[]) => runtimeRef.current?.queueDailyPlans(plans), []);
  const visibleSnapshot = authenticatedEmail && enabled ? snapshot : inactiveSnapshot;
  return { ...visibleSnapshot, activate, refresh, retry, queueDailyPlan };
}

export function workspaceMatchesLocalCache(storage: StorageLike, workspace: CanonicalWorkspace): boolean {
  const localState = loadAppState(storage);
  const localPlans = loadDailyPlans(storage);
  return JSON.stringify(localState) === JSON.stringify(workspace.state) && JSON.stringify(localPlans) === JSON.stringify(workspace.dailyPlans);
}

function economicCommands(previous: AppState, next: AppState): EconomicCommands {
  const previousRewards = new Set(previous.rewardEvents.map((event) => event.id));
  const purchases = next.rewardEvents.flatMap((event) => {
    if (event.source !== "store" || previousRewards.has(event.id) || !isCatItemId(event.sourceId)) return [];
    const mutationId = event.id.startsWith("store:") ? event.id.slice("store:".length) : "";
    return isUuid(mutationId) ? [{ mutationId, itemId: event.sourceId, localDate: event.dateKey }] : [];
  });
  const quantities = (state: AppState) => new Map(state.inventory.items.map((item) => [item.itemId, item.quantity]));
  const before = quantities(previous);
  const after = quantities(next);
  const localDate = next.progress.lastActiveDate ?? localDateKey();
  const consumptions = [...before].flatMap(([itemId, quantity]) => {
    const consumed = quantity - (after.get(itemId) ?? 0);
    return consumed > 0 ? [{ itemId, quantity: consumed, localDate }] : [];
  });
  return { purchases, consumptions };
}

function loadRuntimeMeta(storage: Pick<StorageLike, "getItem">): CloudRuntimeMeta {
  try {
    const value: unknown = JSON.parse(storage.getItem(CLOUD_RUNTIME_STORAGE_KEY) ?? "null");
    if (!isRecord(value) || value.version !== 1 || !isRecord(value.accounts)) return emptyMeta();
    const accounts: Record<string, AccountRuntimeMeta> = {};
    for (const [userId, raw] of Object.entries(value.accounts)) {
      if (!isUuid(userId) || !isRecord(raw) || raw.active !== true || !isUuid(raw.deviceId) || !Array.isArray(raw.pending)) continue;
      accounts[userId] = {
        active: true, deviceId: raw.deviceId,
        lastSuccessfulSyncAt: typeof raw.lastSuccessfulSyncAt === "string" ? raw.lastSuccessfulSyncAt : undefined,
        pending: raw.pending.filter(isPendingMutation),
      };
    }
    return { version: 1, accounts };
  } catch { return emptyMeta(); }
}

function saveRuntimeMeta(storage: Pick<StorageLike, "setItem">, meta: CloudRuntimeMeta): void {
  storage.setItem(CLOUD_RUNTIME_STORAGE_KEY, JSON.stringify(meta));
}

function isPendingMutation(value: unknown): value is PendingWorkspaceMutation {
  return isRecord(value) && isUuid(value.mutationId) && isRecord(value.state) && Array.isArray(value.dailyPlans) && isRecord(value.commands) && typeof value.queuedAt === "string";
}

function emptyMeta(): CloudRuntimeMeta { return { version: 1, accounts: {} }; }
function isUuid(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
