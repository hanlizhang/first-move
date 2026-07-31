import assert from "node:assert/strict";
import test from "node:test";

import { createImmutableBackup, type CloudBackup, type CloudBackupStore, type EntityMapping } from "./cloud-backup.ts";
import { buildCompletionPreflightReport, prepareCloudImport } from "./cloud-import.ts";
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
    async mergeMappings(hash, value) {
      const saved = mappings.get(hash) ?? [];
      const merged = [...saved, ...value.filter((addition) => !saved.some((mapping) => mapping.entityType === addition.entityType && mapping.localId === addition.localId))];
      mappings.set(hash, structuredClone(merged));
      return merged;
    },
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

async function prepareState(state: AppState, store = backupStore()) {
  const local = storage({ [STORAGE_KEY]: JSON.stringify(state), [DAILY_PLAN_STORAGE_KEY]: "[]" });
  const backup = await createImmutableBackup(local, store);
  let sequence = 0;
  return {
    prepared: await prepareCloudImport(backup, store, "Europe/Berlin", () =>
      `30000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`),
    store,
    backup,
  };
}

test("one task completedOn date gets one child mapping after its parent", async () => {
  const state = createEmptyState();
  state.tasks = [{ id: "legacy-task_01", title: "Task", direction: "Daily Life", order: 0, createdAt: "2026-07-01T08:00:00Z", updatedAt: "2026-07-01T08:00:00Z", completedOn: ["2026-07-03"] }];
  const { prepared } = await prepareState(state);
  const mappings = prepared.payload.mappings as Array<Record<string, unknown>>;
  const parent = mappings.findIndex((row) => row.entity_type === "task" && row.local_id === "legacy-task_01");
  const child = mappings.findIndex((row) => row.entity_type === "task_completion" && row.local_id === "legacy-task_01:2026-07-03");
  assert.ok(parent >= 0 && child > parent);
  assert.equal((prepared.payload.task_completions as unknown[]).length, 1);
});

test("multiple and overlapping task dates remain unique per task and date", async () => {
  const state = createEmptyState();
  state.tasks = [
    { id: "task:a:legacy", title: "A", direction: "Daily Life", order: 0, createdAt: "2026-07-01T08:00:00Z", updatedAt: "2026-07-01T08:00:00Z", completedOn: ["2026-07-03", "2026-07-04", "2026-07-03"] },
    { id: "task-b", title: "B", direction: "Rest", order: 1, createdAt: "2026-07-01T08:00:00Z", updatedAt: "2026-07-01T08:00:00Z", completedOn: ["2026-07-03"] },
    { id: "task-empty", title: "C", direction: "Work & Study", order: 2, createdAt: "2026-07-01T08:00:00Z", updatedAt: "2026-07-01T08:00:00Z", completedOn: [] },
  ];
  const { prepared } = await prepareState(state);
  const rows = prepared.payload.task_completions as Array<Record<string, unknown>>;
  assert.equal(rows.length, 3);
  assert.equal(new Set(rows.map((row) => `${row.task_id}:${row.local_date}`)).size, 3);
});

test("historical task and habit rewards receive completion mappings without recreating active completions", async () => {
  const state = createEmptyState();
  state.tasks = [{ id: "old:task", title: "Task", direction: "Daily Life", order: 0, createdAt: "2026-07-01T08:00:00Z", updatedAt: "2026-07-01T08:00:00Z", completedOn: [] }];
  state.habits = [{ id: "old-habit", title: "Habit", direction: "Rest", schedule: { kind: "daily" }, createdAt: "2026-07-01T08:00:00Z", updatedAt: "2026-07-01T08:00:00Z", completedOn: [] }];
  state.rewardEvents = [
    { id: "task:old:task:2026-07-02", source: "task", sourceId: "old:task", dateKey: "2026-07-02", points: 5, createdAt: "2026-07-02T10:00:00Z" },
    { id: "habit:old-habit:2026-07-02", source: "habit", sourceId: "old-habit", dateKey: "2026-07-02", points: 3, createdAt: "2026-07-02T11:00:00Z" },
  ];
  const { prepared } = await prepareState(state);
  const mappings = prepared.payload.mappings as Array<Record<string, unknown>>;
  assert.ok(mappings.some((row) => row.entity_type === "task_completion" && row.local_id === "old:task:2026-07-02"));
  assert.ok(mappings.some((row) => row.entity_type === "habit_completion" && row.local_id === "old-habit:2026-07-02"));
  const taskCompletion = (prepared.payload.task_completions as Array<Record<string, unknown>>)[0];
  const habitCompletion = (prepared.payload.habit_completions as Array<Record<string, unknown>>)[0];
  assert.equal(taskCompletion.deleted_at, "2026-07-02T10:00:00Z");
  assert.equal(habitCompletion.deleted_at, "2026-07-02T11:00:00Z");
  const rewards = prepared.payload.reward_ledger as Array<Record<string, unknown>>;
  assert.equal(rewards[0].source_id, taskCompletion.id);
  assert.equal(rewards[1].source_id, habitCompletion.id);
  assert.equal((prepared.payload.reward_ledger as unknown[]).length, 2);
});

test("active completion and matching historical reward share one non-tombstoned row", async () => {
  const state = createEmptyState();
  state.tasks = [{ id: "task-active", title: "Task", direction: "Daily Life", order: 0, createdAt: "2026-07-01T08:00:00Z", updatedAt: "2026-07-01T08:00:00Z", completedOn: ["2026-07-03"] }];
  state.rewardEvents = [{ id: "task:task-active:2026-07-03", source: "task", sourceId: "task-active", dateKey: "2026-07-03", points: 5, createdAt: "2026-07-03T10:00:00Z" }];
  const { prepared } = await prepareState(state);
  const completions = prepared.payload.task_completions as Array<Record<string, unknown>>;
  assert.equal(completions.length, 1);
  assert.equal(completions[0].deleted_at, null);
  assert.equal((prepared.payload.reward_ledger as Array<Record<string, unknown>>)[0].source_id, completions[0].id);
});

test("multiple historical rewards for a deleted task create one tombstone per date and one deleted parent", async () => {
  const state = createEmptyState();
  state.rewardEvents = ["2026-07-02", "2026-07-03"].map((dateKey) => ({
    id: `task:deleted:legacy:${dateKey}`, source: "task" as const, sourceId: "deleted:legacy",
    dateKey, points: 5, createdAt: `${dateKey}T10:00:00Z`,
  }));
  const { prepared } = await prepareState(state);
  const tasks = prepared.payload.tasks as Array<Record<string, unknown>>;
  const completions = prepared.payload.task_completions as Array<Record<string, unknown>>;
  assert.equal(tasks.length, 1);
  assert.ok(tasks[0].deleted_at);
  assert.equal(completions.length, 2);
  assert.equal(new Set(completions.map((row) => `${row.task_id}:${row.local_date}`)).size, 2);
});

test("safe preflight describes an orphaned production-shaped reward without exposing its raw ID", async () => {
  const state = createEmptyState();
  state.rewardEvents = [{ id: "task:private-local-id:2026-07-02", source: "task", sourceId: "private-local-id", dateKey: "2026-07-02", points: 5, createdAt: "2026-07-02T10:00:00Z" }];
  const { prepared } = await prepareState(state);
  const report = await buildCompletionPreflightReport(
    prepared.localState,
    prepared.mappings,
    prepared.payload.task_completions as Array<Record<string, unknown>>,
  );
  assert.equal(report[0].parentExists, false);
  assert.equal(report[0].activeCompletionContainsDate, false);
  assert.equal(report[0].completionMappingExists, true);
  assert.equal(report[0].completionPayloadRowExists, true);
  assert.doesNotMatch(JSON.stringify(report), /private-local-id/);
});

test("completion mappings added after a failed preflight are durable across retry", async () => {
  const state = createEmptyState();
  state.tasks = [{ id: "task-retry", title: "Task", direction: "Daily Life", order: 0, createdAt: "2026-07-01T08:00:00Z", updatedAt: "2026-07-01T08:00:00Z", completedOn: ["2026-07-03"] }];
  const store = backupStore();
  const local = storage({ [STORAGE_KEY]: JSON.stringify(state), [DAILY_PLAN_STORAGE_KEY]: "[]" });
  const backup = await createImmutableBackup(local, store);
  await store.addMappings(backup.hash, []);
  let sequence = 0;
  const first = await prepareCloudImport(backup, store, "Europe/Berlin", () => `40000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`);
  const second = await prepareCloudImport(backup, store, "Europe/Berlin", () => `50000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`);
  assert.deepEqual(second.mappings, first.mappings);
});

test("every production RewardEvent source has a mapped source row", async () => {
  const state = createEmptyState();
  state.rewardEvents = [
    { id: "task:gone-task:2026-07-01", source: "task", sourceId: "gone-task", dateKey: "2026-07-01", points: 5, createdAt: "2026-07-01T10:00:00Z" },
    { id: "habit:gone-habit:2026-07-01", source: "habit", sourceId: "gone-habit", dateKey: "2026-07-01", points: 3, createdAt: "2026-07-01T10:00:00Z" },
    { id: "session:gone-session:time", source: "session", sourceId: "gone-session", dateKey: "2026-07-01", points: 1, createdAt: "2026-07-01T10:00:00Z" },
    { id: "morning:2026-07-01", source: "morning", sourceId: "2026-07-01", dateKey: "2026-07-01", points: 5, createdAt: "2026-07-01T10:00:00Z" },
    { id: "reflection:2026-07-01", source: "reflection", sourceId: "2026-07-01", dateKey: "2026-07-01", points: 2, createdAt: "2026-07-01T10:00:00Z" },
    { id: "store:purchase-id", source: "store", sourceId: "cat-food", dateKey: "2026-07-01", points: -1, createdAt: "2026-07-01T10:00:00Z" },
  ];
  const { prepared } = await prepareState(state);
  const types = new Set(prepared.mappings.map((mapping) => mapping.entityType));
  for (const type of ["task_completion", "habit_completion", "activity_session", "morning_check", "journal_entry", "reward_event"]) assert.ok(types.has(type));
  assert.equal((prepared.payload.reward_ledger as unknown[]).length, 6);
  assert.ok((prepared.payload.activity_sessions as Array<Record<string, unknown>>)[0].deleted_at);
  assert.ok((prepared.payload.journal_entries as Array<Record<string, unknown>>)[0].deleted_at);
});

test("session intent references import current and removed intents before session rows", async () => {
  const state = createEmptyState();
  state.activityIntents = [{ id: "intent:active", stuckState: "unsure what is needed", direction: "Daily Life", moveText: "Open it", intendedDurationMinutes: 2, createdAt: "2026-07-01T09:00:00Z", status: "pending" }];
  state.sessions = [
    { id: "session-a", mode: "countdown", direction: "Daily Life", label: "A", targetDurationMinutes: 2, linkedIntentId: "intent:active", status: "completed", startedAt: "2026-07-01T09:00:00Z", accumulatedElapsedMs: 120000, endedAt: "2026-07-01T09:02:00Z", actualElapsedMs: 120000 },
    { id: "session-b", mode: "countdown", direction: "Daily Life", label: "B", targetDurationMinutes: 2, linkedIntentId: "intent:removed", status: "completed", startedAt: "2026-07-02T09:00:00Z", accumulatedElapsedMs: 120000, endedAt: "2026-07-02T09:02:00Z", actualElapsedMs: 120000 },
    { id: "session-c", mode: "countdown", direction: "Daily Life", label: "C", targetDurationMinutes: 2, linkedIntentId: "intent:removed", status: "completed", startedAt: "2026-07-03T09:00:00Z", accumulatedElapsedMs: 120000, endedAt: "2026-07-03T09:02:00Z", actualElapsedMs: 120000 },
    { id: "session-d", mode: "stopwatch", direction: "Rest", label: "D", status: "stopped", startedAt: "2026-07-04T09:00:00Z", accumulatedElapsedMs: 0, endedAt: "2026-07-04T09:00:00Z", actualElapsedMs: 0 },
  ];
  const { prepared } = await prepareState(state);
  const intents = prepared.payload.activity_intents as Array<Record<string, unknown>>;
  const sessions = prepared.payload.activity_sessions as Array<Record<string, unknown>>;
  assert.equal(intents.length, 2);
  assert.equal(intents.filter((intent) => intent.deleted_at).length, 1);
  assert.equal(intents.find((intent) => intent.deleted_at)?.status, "consumed");
  assert.equal(sessions[1].linked_intent_id, sessions[2].linked_intent_id);
  assert.equal(sessions[3].linked_intent_id, null);
  const mappingOrder = (prepared.payload.mappings as Array<Record<string, unknown>>).map((row) => row.entity_type);
  assert.ok(mappingOrder.lastIndexOf("activity_intent") < mappingOrder.indexOf("activity_session"));
});

test("removed intent UUIDs, including colon IDs, remain stable across retry", async () => {
  const state = createEmptyState();
  state.sessions = [{ id: "session-legacy", mode: "countdown", direction: "Daily Life", label: "Legacy", targetDurationMinutes: 2, linkedIntentId: "legacy:intent:42", status: "completed", startedAt: "2026-07-01T09:00:00Z", accumulatedElapsedMs: 120000, endedAt: "2026-07-01T09:02:00Z", actualElapsedMs: 120000 }];
  const store = backupStore();
  const first = await prepareState(state, store);
  const second = await prepareCloudImport(first.backup, store, "Europe/Berlin", () => crypto.randomUUID());
  const firstMapping = first.prepared.mappings.find((mapping) => mapping.entityType === "activity_intent");
  const secondMapping = second.mappings.find((mapping) => mapping.entityType === "activity_intent");
  assert.equal(secondMapping?.cloudId, firstMapping?.cloudId);
});

test("empty linkedIntentId is normalized to an absent cloud reference", async () => {
  const state = createEmptyState();
  state.sessions = [{ id: "session-empty", mode: "stopwatch", direction: "Rest", label: "Empty", linkedIntentId: "", status: "stopped", startedAt: "2026-07-01T09:00:00Z", accumulatedElapsedMs: 0, endedAt: "2026-07-01T09:00:00Z", actualElapsedMs: 0 }];
  const { prepared } = await prepareState(state);
  assert.equal((prepared.payload.activity_sessions as Array<Record<string, unknown>>)[0].linked_intent_id, null);
  assert.equal(prepared.mappings.some((mapping) => mapping.entityType === "activity_intent"), false);
});

test("missing historical intent mapping reports hashed structural relationship data", async () => {
  const state = createEmptyState();
  state.sessions = [{ id: "session-diagnostic", mode: "countdown", direction: "Daily Life", label: "History", targetDurationMinutes: 2, linkedIntentId: "removed:intent", status: "completed", startedAt: "2026-07-01T09:00:00Z", accumulatedElapsedMs: 120000, endedAt: "2026-07-01T09:02:00Z", actualElapsedMs: 120000 }];
  const base = backupStore();
  const local = storage({ [STORAGE_KEY]: JSON.stringify(state), [DAILY_PLAN_STORAGE_KEY]: "[]" });
  const backup = await createImmutableBackup(local, base);
  await base.addMappings(backup.hash, []);
  const broken: CloudBackupStore = {
    ...base,
    async mergeMappings(hash, mappings) { return base.mergeMappings(hash, mappings.filter((mapping) => mapping.entityType !== "activity_intent")); },
  };
  await assert.rejects(prepareCloudImport(backup, broken, "Europe/Berlin"), (error) => {
    const diagnostic = (error as { safeDiagnostic?: Record<string, unknown> }).safeDiagnostic;
    assert.equal((error as { code?: string }).code, "IMPORT_ACTIVITY_INTENT_MAPPING_MISSING");
    assert.equal(diagnostic?.rpcAttempted, false);
    assert.equal(diagnostic?.currentIntentRecordExists, false);
    assert.equal(diagnostic?.placeholderIntentCreated, true);
    assert.equal(diagnostic?.placeholderIntentCount, 1);
    assert.notEqual(diagnostic?.hashedLinkedIntentId, "unavailable");
    assert.doesNotMatch(JSON.stringify(diagnostic), /removed:intent|History/);
    return true;
  });
});
