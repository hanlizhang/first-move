import { normalizeAppState } from "../domain/app-state.ts";
import { createUuidV4, isUuid } from "../domain/ids.ts";
import type { AppState, DailyPlanRecord } from "../domain/models.ts";
import type { AsyncKeyValueStore } from "../local/repository.ts";

export const MOBILE_SYNC_QUEUE_KEY_PREFIX = "first-move:mobile:cloud-sync:v1:";
export const MOBILE_SYNC_QUEUE_VERSION = 1 as const;

export interface SyncEconomicCommands {
  purchases: [];
  consumptions: [];
}

export interface PendingWorkspaceMutation {
  mutationId: string;
  state: AppState;
  dailyPlans: DailyPlanRecord[];
  commands: SyncEconomicCommands;
  queuedAt: string;
}

export interface SyncAccountRecord {
  version: 1;
  userId: string;
  active: boolean;
  deviceId: string;
  lastSuccessfulSyncAt?: string;
  pending: PendingWorkspaceMutation[];
}

export interface MobileSyncQueue {
  load(userId: string): Promise<SyncAccountRecord>;
  save(record: SyncAccountRecord): Promise<void>;
}

export function createMobileSyncQueue(
  store: AsyncKeyValueStore,
  uuid: () => string = createUuidV4,
): MobileSyncQueue {
  return {
    async load(userId) {
      const raw = await store.getItem(mobileSyncQueueKey(userId));
      if (raw === null) return emptyRecord(userId, uuid);
      return parseSyncAccountRecord(raw, userId);
    },

    async save(record) {
      validateSyncAccountRecord(record, record.userId);
      await store.setItem(mobileSyncQueueKey(record.userId), JSON.stringify(record));
    },
  };
}

export function mobileSyncQueueKey(userId: string): string {
  return `${MOBILE_SYNC_QUEUE_KEY_PREFIX}${userId}`;
}

export function prepareSyncState(state: AppState): AppState {
  const normalized = normalizeAppState(state);
  const pendingOnly = {
    ...normalized,
    activityIntents: normalized.activityIntents.filter(
      (intent) => intent.status === "pending",
    ),
  };
  validateSyncState(pendingOnly);
  return structuredClone(pendingOnly);
}

function emptyRecord(
  userId: string,
  uuid: () => string,
): SyncAccountRecord {
  const deviceId = uuid();
  if (!isUuid(deviceId)) throw new Error("Device identity is invalid.");
  return {
    version: MOBILE_SYNC_QUEUE_VERSION,
    userId,
    active: false,
    deviceId,
    pending: [],
  };
}

function parseSyncAccountRecord(raw: string, userId: string): SyncAccountRecord {
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("The local sync queue is invalid.");
  }
  validateSyncAccountRecord(value, userId);
  return structuredClone(value);
}

function validateSyncAccountRecord(
  value: unknown,
  userId: string,
): asserts value is SyncAccountRecord {
  if (
    !isRecord(value) ||
    value.version !== MOBILE_SYNC_QUEUE_VERSION ||
    value.userId !== userId ||
    typeof value.active !== "boolean" ||
    !isUuidValue(value.deviceId) ||
    !Array.isArray(value.pending) ||
    (value.lastSuccessfulSyncAt !== undefined &&
      typeof value.lastSuccessfulSyncAt !== "string")
  ) {
    throw new Error("The local sync queue is invalid.");
  }
  for (const mutation of value.pending) validatePendingMutation(mutation);
}

function validatePendingMutation(
  value: unknown,
): asserts value is PendingWorkspaceMutation {
  if (
    !isRecord(value) ||
    !isUuidValue(value.mutationId) ||
    typeof value.queuedAt !== "string" ||
    !Array.isArray(value.dailyPlans) ||
    !isRecord(value.commands) ||
    !Array.isArray(value.commands.purchases) ||
    value.commands.purchases.length !== 0 ||
    !Array.isArray(value.commands.consumptions) ||
    value.commands.consumptions.length !== 0
  ) {
    throw new Error("The local pending mutation is invalid.");
  }
  validateSyncState(value.state);
}

function validateSyncState(value: unknown): asserts value is AppState {
  if (!isRecord(value) || value.schemaVersion !== 8) {
    throw new Error("The local sync workspace is invalid.");
  }
  const state = normalizeAppState(value);
  if (
    state.tasks.length !== collectionLength(value.tasks) ||
    state.habits.length !== collectionLength(value.habits) ||
    state.activityIntents.length !== collectionLength(value.activityIntents) ||
    state.sessions.length !== collectionLength(value.sessions)
  ) {
    throw new Error("The local sync workspace is invalid.");
  }

  for (const task of state.tasks) requireUuid(task.id);
  for (const habit of state.habits) requireUuid(habit.id);
  for (const intent of state.activityIntents) {
    if (intent.status !== "pending") {
      throw new Error("Only pending Intent rows may be synchronized.");
    }
    requireUuid(intent.id);
    optionalUuid(intent.linkedTaskId);
    optionalUuid(intent.linkedHabitId);
  }
  for (const session of state.sessions) {
    requireUuid(session.id);
    optionalUuid(session.linkedTaskId);
    optionalUuid(session.linkedHabitId);
    optionalUuid(session.linkedIntentId);
  }
}

function collectionLength(value: unknown): number {
  return Array.isArray(value) ? value.length : -1;
}

function optionalUuid(value?: string): void {
  if (value !== undefined) requireUuid(value);
}

function requireUuid(value: string): void {
  if (!isUuid(value)) throw new Error("A synchronized relationship ID is invalid.");
}

function isUuidValue(value: unknown): value is string {
  return typeof value === "string" && isUuid(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
