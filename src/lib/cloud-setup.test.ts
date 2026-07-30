import assert from "node:assert/strict";
import test from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createImmutableBackup, type CloudBackup, type CloudBackupStore, type EntityMapping } from "./cloud-backup.ts";
import { CLOUD_SETUP_LABELS, detectAccountCloudState, hydrateCloudProgress, importThisDevice, startFresh, type CloudSetupDependencies } from "./cloud-setup.ts";
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
    async getMappings(hash) { return mappings.get(hash); },
  };
}

function dependencies(rpc: (name: string, args?: unknown) => Promise<{ data: unknown; error: { message: string } | null }>) {
  const values = new Map([[STORAGE_KEY, JSON.stringify({ schemaVersion: 8 })]]);
  const backupStore = store();
  const storage = {
    get length() { return values.size; },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
  return {
    dependency: { client: { rpc } as unknown as Pick<SupabaseClient, "rpc">, storage, backupStore, timezone: "Europe/Berlin", deviceId: "90000000-0000-4000-8000-000000000009" } satisfies CloudSetupDependencies,
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

test("Import this device creates backup first, calls atomic import, and leaves localStorage unchanged", async () => {
  let called = false;
  const setup = dependencies(async (name, args) => {
    called = true;
    assert.equal(name, "initialize_cloud_workspace");
    assert.equal((args as Record<string, unknown>).p_choice, "import_local");
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
