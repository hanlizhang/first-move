import assert from "node:assert/strict";
import test from "node:test";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createImmutableBackup, type CloudBackup, type CloudBackupStore, type EntityMapping } from "./cloud-backup.ts";
import { CLOUD_SETUP_LABELS, cloudSetupErrorMessage, copySafeCloudImportDiagnostic, detectAccountCloudState, hydrateCloudProgress, importThisDevice, startFresh, type CloudSetupDependencies } from "./cloud-setup.ts";
import { CloudImportDiagnosticError } from "./cloud-import.ts";
import { createEmptyState } from "./models.ts";
import { STORAGE_KEY } from "./repository.ts";

const emptyWorkspace = {
  profile: {}, settings: {}, tasks: [], task_completions: [], habits: [], habit_schedule_weekdays: [],
  habit_completions: [], activity_intents: [], activity_sessions: [], daily_plans: [], daily_plan_items: [],
  morning_checks: [], morning_attempts: [], journal_entries: [], reward_ledger: [], inventory_events: [],
  inventory_balances: [], milestone_grants: [], active_days: [], points_tenths: 0,
};

function store(): CloudBackupStore & { backups: Map<string, CloudBackup> } {
  const backups = new Map<string, CloudBackup>();
  const mappings = new Map<string, EntityMapping[]>();
  return {
    backups,
    async addBackup(backup) { const saved = backups.get(backup.hash) ?? structuredClone(backup); backups.set(backup.hash, saved); return saved; },
    async getBackup(hash) { return backups.get(hash); },
    async addMappings(hash, value) { const saved = mappings.get(hash) ?? structuredClone(value); mappings.set(hash, saved); return saved; },
    async mergeMappings(hash, value) {
      const saved = mappings.get(hash) ?? [];
      const merged = [...saved, ...value.filter((addition) => !saved.some((mapping) => mapping.entityType === addition.entityType && mapping.localId === addition.localId))];
      mappings.set(hash, structuredClone(merged));
      return merged;
    },
    async getMappings(hash) { return mappings.get(hash); },
  };
}

function dependencies(rpc: (name: string, args?: unknown) => Promise<{ data: unknown; error: { message: string } | null }>, authenticated = true) {
  const values = new Map([[STORAGE_KEY, JSON.stringify({ schemaVersion: 8 })]]);
  const backupStore = store();
  const storage = {
    get length() { return values.size; },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
  return {
    dependency: { client: { rpc, auth: { async getSession() { return { data: { session: authenticated ? { access_token: "test" } : null }, error: null }; } } } as unknown as Pick<SupabaseClient, "rpc" | "auth">, storage, backupStore, timezone: "Europe/Berlin", deviceId: "90000000-0000-4000-8000-000000000009" } satisfies CloudSetupDependencies,
    values,
    backupStore,
  };
}

test("account detection distinguishes empty and existing cloud workspaces", async () => {
  const empty = dependencies(async () => ({ data: { initialized: false }, error: null }));
  const existing = dependencies(async () => ({ data: { initialized: true }, error: null }));
  assert.equal(await detectAccountCloudState(empty.dependency.client), "empty");
  assert.equal(await detectAccountCloudState(existing.dependency.client), "existing");
});

test("account detection waits for auth and distinguishes missing auth from request failure", async () => {
  let rpcCalls = 0;
  const missing = dependencies(async () => { rpcCalls += 1; return { data: null, error: null }; }, false);
  const failed = dependencies(async () => ({ data: null, error: { message: "No API key found" } }));
  assert.equal(await detectAccountCloudState(missing.dependency.client), "unauthenticated");
  assert.equal(rpcCalls, 0);
  assert.equal(await detectAccountCloudState(failed.dependency.client), "request-failed");
});

test("workspace status waits for the authenticated Supabase client and uses its RPC transport", async () => {
  const order: string[] = [];
  const client = {
    auth: { async getSession() { order.push("auth"); return { data: { session: { access_token: "test" } }, error: null }; } },
    async rpc(name: string) { order.push(`rpc:${name}`); return { data: { initialized: true }, error: null }; },
  } as unknown as Pick<SupabaseClient, "rpc" | "auth">;
  assert.equal(await detectAccountCloudState(client), "existing");
  assert.deepEqual(order, ["auth", "rpc:cloud_workspace_status"]);
});

test("authenticated Supabase RPC transport supplies apikey and Authorization for workspace status", async () => {
  let requestHeaders = new Headers();
  const transport = createBrowserClient("https://supabase.test", "publishable-test", {
    isSingleton: false,
    accessToken: async () => "session-test",
    global: {
      fetch: async (_input, init) => {
        requestHeaders = new Headers(init?.headers);
        return new Response(JSON.stringify({ initialized: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  });
  const client = {
    auth: { async getSession() { return { data: { session: { access_token: "session-test" } }, error: null }; } },
    rpc: transport.rpc.bind(transport),
  } as unknown as Pick<SupabaseClient, "rpc" | "auth">;
  assert.equal(await detectAccountCloudState(client), "existing");
  assert.equal(requestHeaders.get("apikey"), "publishable-test");
  assert.equal(requestHeaders.get("authorization"), "Bearer session-test");
});

test("Import this device creates backup first, calls atomic import, and leaves localStorage unchanged", async () => {
  let called = false;
  const setup = dependencies(async (name, args) => {
    if (name === "initialize_cloud_workspace_v2") {
      called = true;
      assert.equal((args as Record<string, unknown>).p_choice, "import_local");
    }
    return { data: emptyWorkspace, error: null };
  });
  const original = setup.values.get(STORAGE_KEY);
  const phases: string[] = [];
  await importThisDevice(setup.dependency, (phase) => phases.push(phase));
  assert.equal(called, true);
  assert.equal(setup.values.get(STORAGE_KEY), original);
  assert.equal(setup.backupStore.backups.size, 1);
  assert.deepEqual(phases, ["preparing-backup", "importing", "verifying", "cloud-copy-ready"]);
});

test("Start fresh sends an empty payload and preserves guest progress", async () => {
  const setup = dependencies(async (_name, args) => {
    assert.deepEqual((args as Record<string, unknown>).p_payload, {});
    assert.equal((args as Record<string, unknown>).p_choice, "start_fresh");
    return { data: emptyWorkspace, error: null };
  });
  const original = setup.values.get(STORAGE_KEY);
  await startFresh(setup.dependency, () => undefined);
  assert.equal(setup.values.get(STORAGE_KEY), original);
});

test("failed import leaves local state and immutable backup recoverable", async () => {
  const setup = dependencies(async () => ({ data: null, error: { message: "workspace_not_empty" } }));
  const original = setup.values.get(STORAGE_KEY);
  await assert.rejects(importThisDevice(setup.dependency, () => undefined), /already has cloud progress/);
  assert.equal(setup.values.get(STORAGE_KEY), original);
  assert.equal(setup.backupStore.backups.size, 1);
});

test("Use cloud progress backs up before replacing and setup labels never say Synced", async () => {
  const setup = dependencies(async () => ({ data: emptyWorkspace, error: null }));
  const original = setup.values.get(STORAGE_KEY);
  await createImmutableBackup(setup.dependency.storage, setup.backupStore);
  await hydrateCloudProgress(setup.dependency, () => undefined);
  assert.notEqual(setup.values.get(STORAGE_KEY), original);
  assert.equal(setup.backupStore.backups.size, 1);
  assert.equal(Object.values(CLOUD_SETUP_LABELS).includes("Synced"), false);
});

test("invalid completion preflight leaves the remote account untouched and exposes only a safe development code", async () => {
  let calls = 0;
  const setup = dependencies(async () => { calls += 1; return { data: null, error: null }; });
  const state = createEmptyState();
  state.rewardEvents = [{ id: "task:missing:not-a-date", source: "task", sourceId: "missing", dateKey: "not-a-date", points: 5, createdAt: "2026-07-30T10:00:00Z" }];
  setup.values.set(STORAGE_KEY, JSON.stringify(state));
  await assert.rejects(importThisDevice(setup.dependency, () => undefined), (error) => {
    assert.equal(error instanceof CloudImportDiagnosticError, true);
    assert.match(cloudSetupErrorMessage(error, true), /IMPORT_TASK_COMPLETION_MAPPING_MISSING/);
    return true;
  });
  assert.equal(calls, 0);
  assert.equal(setup.backupStore.backups.size, 1);
  assert.equal(setup.values.get(STORAGE_KEY), JSON.stringify(state));
});

test("committed import followed by a client timeout fetches and verifies the completed workspace", async () => {
  const calls: string[] = [];
  const setup = dependencies(async (name) => {
    calls.push(name);
    if (name === "initialize_cloud_workspace_v2") return { data: null, error: { message: "network timeout" } };
    if (name === "cloud_workspace_status") return { data: { initialized: true, choice: "import_local", status: "completed" }, error: null };
    return { data: emptyWorkspace, error: null };
  });
  const original = setup.values.get(STORAGE_KEY);
  const phases: string[] = [];
  await importThisDevice(setup.dependency, (phase) => phases.push(phase));
  assert.deepEqual(calls, ["initialize_cloud_workspace_v2", "cloud_workspace_status", "get_cloud_workspace_v2"]);
  assert.deepEqual(phases, ["preparing-backup", "importing", "verifying", "cloud-copy-ready"]);
  assert.equal(setup.values.get(STORAGE_KEY), original);
  assert.equal(setup.backupStore.backups.size, 1);
});

test("committed import followed by an invalid canonical response is detected without another import", async () => {
  const calls: string[] = [];
  let workspaceReads = 0;
  const setup = dependencies(async (name) => {
    calls.push(name);
    if (name === "initialize_cloud_workspace_v2") return { data: emptyWorkspace, error: null };
    if (name === "cloud_workspace_status") return { data: { initialized: true, choice: "import_local", status: "completed" }, error: null };
    workspaceReads += 1;
    return workspaceReads === 1
      ? { data: { ...emptyWorkspace, activity_sessions: [{ linked_task_id: "missing" }] }, error: null }
      : { data: emptyWorkspace, error: null };
  });
  await importThisDevice(setup.dependency, () => undefined);
  assert.deepEqual(calls, [
    "initialize_cloud_workspace_v2",
    "get_cloud_workspace_v2",
    "cloud_workspace_status",
    "get_cloud_workspace_v2",
  ]);
  assert.equal(calls.filter((name) => name === "initialize_cloud_workspace_v2").length, 1);
});

test("development preflight reports orphan structure before the RPC without exposing a raw source ID", async () => {
  let called = false;
  const setup = dependencies(async () => { called = true; return { data: emptyWorkspace, error: null }; });
  const state = createEmptyState();
  state.rewardEvents = [{ id: "task:private-orphan:2026-07-30", source: "task", sourceId: "private-orphan", dateKey: "2026-07-30", points: 5, createdAt: "2026-07-30T10:00:00Z" }];
  setup.values.set(STORAGE_KEY, JSON.stringify(state));
  let safeReport: unknown;
  (setup.dependency as CloudSetupDependencies).reportSafeDiagnostic = (report) => { safeReport = report; };
  await importThisDevice(setup.dependency, () => undefined);
  assert.equal(called, true);
  assert.match(JSON.stringify(safeReport), /"errorCode":"IMPORT_PREFLIGHT_OK"/);
  assert.doesNotMatch(JSON.stringify(safeReport), /private-orphan/);
});

test("Copy safe diagnostics writes formatted private-free JSON", async () => {
  let copied = "";
  await copySafeCloudImportDiagnostic({
    errorCode: "IMPORT_SESSION_SOURCE_MAPPING_MISSING", phase: "mapping", rpcAttempted: false,
    entityType: "activity_session", hashedSourceId: "abc", mappingEntityTypesPresent: [],
    mappingCountByEntityType: {}, localCountsByEntityType: { sessions: 1 }, rewardCountsBySourceType: { session: 1 },
  }, async (value) => { copied = value; });
  assert.match(copied, /IMPORT_SESSION_SOURCE_MAPPING_MISSING/);
  assert.doesNotMatch(copied, /title|journal|email|token|payload/i);
});
