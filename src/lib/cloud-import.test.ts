import assert from "node:assert/strict";
import test from "node:test";

import { createImmutableBackup, type CloudBackup, type CloudBackupStore, type EntityMapping } from "./cloud-backup.ts";
import { prepareCloudImport } from "./cloud-import.ts";
import { createEmptyState, type AppState } from "./models.ts";
import { DAILY_PLAN_STORAGE_KEY } from "./daily-plan-state.ts";
import { STORAGE_KEY } from "./repository.ts";

function backupStore(): CloudBackupStore {
  const backups = new Map<string, CloudBackup>();
  const mappings = new Map<string, EntityMapping[]>();
  return {
    async addBackup(backup) { const value = backups.get(backup.hash) ?? structuredClone(backup); backups.set(backup.hash, value); return value; },
    async getBackup(hash) { return backups.get(hash); },
    async addMappings(hash, value) { const saved = mappings.get(hash) ?? structuredClone(value); mappings.set(hash, saved); return saved; },
    async getMappings(hash) { return mappings.get(hash); },
  };
}

function storage(values: Record<string, string>) {
  const entries = new Map(Object.entries(values));
  return {
    get length() { return entries.size; },
    key(index: number) { return [...entries.keys()][index] ?? null; },
    getItem(key: string) { return entries.get(key) ?? null; },
    setItem(key: string, value: string) { entries.set(key, value); },
    entries,
  };
}

function fixtureState(): AppState {
  return {
    ...createEmptyState(),
    tasks: [{ id: "task-local", title: "Task", direction: "Daily Life", order: 0, createdAt: "2026-07-29T08:00:00.000Z", updatedAt: "2026-07-29T08:00:00.000Z", completedOn: ["2026-07-29"] }],
    habits: [{ id: "habit-local", title: "Habit", direction: "Rest", schedule: { kind: "weekdays", weekdays: ["wed"] }, createdAt: "2026-07-29T08:00:00.000Z", updatedAt: "2026-07-29T08:00:00.000Z", completedOn: ["2026-07-29"] }],
    activityIntents: [{ id: "intent-local", stuckState: "unsure what is needed", direction: "Daily Life", moveText: "Open task", intendedDurationMinutes: 2, linkedTaskId: "task-local", createdAt: "2026-07-29T08:05:00.000Z", status: "pending" }],
    sessions: [{ id: "session-local", mode: "countdown", direction: "Daily Life", label: "Task", targetDurationMinutes: 2, linkedTaskId: "task-local", status: "completed", startedAt: "2026-07-29T08:10:00.000Z", accumulatedElapsedMs: 120000, endedAt: "2026-07-29T08:12:00.000Z", actualElapsedMs: 120000 }],
    journalEntries: [{ dateKey: "2026-07-29", whatHelped: "Water", freeText: "Private note", updatedAt: "2026-07-29T20:00:00.000Z" }],
    morningChecks: [{ dateKey: "2026-07-29", verifiedAt: "2026-07-29T07:00:00.000Z", captureMethod: "camera", verifierMode: "mock" }],
    morningAttempts: [{ dateKey: "2026-07-29", count: 1 }],
    rewardEvents: [
      { id: "task:task-local:2026-07-29", source: "task", sourceId: "task-local", dateKey: "2026-07-29", points: 5, createdAt: "2026-07-29T08:00:00.000Z" },
      { id: "session:session-local:time", source: "session", sourceId: "session-local", dateKey: "2026-07-29", points: 0.2, createdAt: "2026-07-29T08:12:00.000Z" },
    ],
    inventory: { items: [{ itemId: "kitten-milk", quantity: 2 }] },
    progress: { ...createEmptyState().progress, points: 5.2, activeDateKeys: ["2026-07-29"], firstUseDate: "2026-07-29", lastActiveDate: "2026-07-29", journeyDay: 1, totalActiveDays: 1, gentleStreak: 1, unlockedMilestones: [], grantedMilestones: [] },
  };
}

test("Import this device normalizes all current stores and preserves UUID relationships", async () => {
  const state = fixtureState();
  const local = storage({
    [STORAGE_KEY]: JSON.stringify(state),
    [DAILY_PLAN_STORAGE_KEY]: JSON.stringify([{ dateKey: "2026-07-29", items: [{ id: "first-move", group: "first-move", title: "Task", category: "Daily Life", durationMinutes: 2, firstStep: "Open task" }] }]),
    "first-move:toothbrush-photo": "data:image/jpeg;base64,secret",
  });
  const store = backupStore();
  const backup = await createImmutableBackup(local, store);
  let sequence = 0;
  const prepared = await prepareCloudImport(backup, store, "Europe/Berlin", () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`);
  const payload = prepared.payload as Record<string, unknown>;
  const tasks = payload.tasks as Array<Record<string, unknown>>;
  const completions = payload.task_completions as Array<Record<string, unknown>>;
  const sessions = payload.activity_sessions as Array<Record<string, unknown>>;

  assert.equal(completions[0].task_id, tasks[0].id);
  assert.equal(sessions[0].linked_task_id, tasks[0].id);
  assert.equal((payload.journal_entries as unknown[]).length, 1);
  assert.equal((payload.morning_checks as unknown[]).length, 1);
  assert.equal((payload.inventory_events as Array<Record<string, unknown>>)[0].kind, "correction");
  assert.doesNotMatch(JSON.stringify(payload), /data:image|toothbrush-photo/);
});

test("same immutable snapshot reuses durable mappings on retry", async () => {
  const local = storage({ [STORAGE_KEY]: JSON.stringify(fixtureState()), [DAILY_PLAN_STORAGE_KEY]: "[]" });
  const store = backupStore();
  const backup = await createImmutableBackup(local, store);
  let sequence = 0;
  const first = await prepareCloudImport(backup, store, "Europe/Berlin", () => `10000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`);
  const second = await prepareCloudImport(backup, store, "Europe/Berlin", () => `20000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`);
  assert.deepEqual(second.mappings, first.mappings);
});
