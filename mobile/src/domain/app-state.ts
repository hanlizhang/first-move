import {
  createEmptyState,
  isDirection,
  isFocusDuration,
  isIntendedDuration,
  isStuckState,
  isWeekday,
  type ActivityIntent,
  type ActivitySession,
  type AppState,
  type Direction,
  type Habit,
  type HabitSchedule,
  type IntendedDuration,
  type JournalEntry,
  type MorningAttempt,
  type MorningCheck,
  type RewardEvent,
  type StuckState,
  type Task,
} from "./models.ts";
import { createUuidV4 } from "./ids.ts";

type Clock = () => string;
type IdFactory = () => string;

export interface CreateIntentInput {
  stuckState: StuckState;
  direction?: Direction;
  moveText: string;
  intendedDurationMinutes: IntendedDuration;
  linkedTaskId?: string;
  linkedHabitId?: string;
}

export function normalizeAppState(input: unknown): AppState {
  if (!isRecord(input)) return createEmptyState();

  const tasks = Array.isArray(input.tasks) ? input.tasks.filter(isTask) : [];
  const habits = Array.isArray(input.habits) ? input.habits.filter(isHabit) : [];
  const activityIntents = Array.isArray(input.activityIntents)
    ? input.activityIntents.filter(isActivityIntent)
    : [];
  const sessions = Array.isArray(input.sessions)
    ? input.sessions.filter(isActivitySession)
    : [];
  const rewardEvents = Array.isArray(input.rewardEvents)
    ? input.rewardEvents.filter(isRewardEvent)
    : [];
  const progress = isRecord(input.progress) ? input.progress : {};

  return {
    ...createEmptyState(),
    tasks: [...tasks]
      .sort((left, right) => left.order - right.order)
      .map((task, order) => ({ ...task, order })),
    habits,
    activityIntents: keepOnePendingIntent(activityIntents),
    sessions: keepOneOpenSession(sessions),
    rewardEvents,
    journalEntries: normalizeJournalEntries(input.journalEntries),
    morningChecks: normalizeMorningChecks(input.morningChecks),
    morningAttempts: normalizeMorningAttempts(input.morningAttempts),
    inventory: normalizeInventory(input.inventory),
    progress: {
      points: finiteNonnegativeNumber(progress.points),
      activeDateKeys: stringArray(progress.activeDateKeys),
      unlockedMilestones: milestones(progress.unlockedMilestones),
      grantedMilestones: milestones(progress.grantedMilestones),
      ...(typeof progress.firstUseDate === "string"
        ? { firstUseDate: progress.firstUseDate }
        : {}),
      ...(typeof progress.lastActiveDate === "string"
        ? { lastActiveDate: progress.lastActiveDate }
        : {}),
      journeyDay: finiteNonnegativeInteger(progress.journeyDay),
      totalActiveDays: finiteNonnegativeInteger(progress.totalActiveDays),
      gentleStreak: finiteNonnegativeInteger(progress.gentleStreak),
    },
  };
}

export function createPendingIntent(
  state: AppState,
  input: CreateIntentInput,
  clock: Clock = now,
  idFactory: IdFactory = createUuidV4,
): AppState {
  if (getPendingIntent(state)) return state;
  if (
    !isStuckState(input.stuckState) ||
    !isIntendedDuration(input.intendedDurationMinutes)
  ) {
    return state;
  }
  if (input.linkedTaskId && input.linkedHabitId) return state;

  const linkedTask = input.linkedTaskId
    ? state.tasks.find((task) => task.id === input.linkedTaskId)
    : undefined;
  const linkedHabit = input.linkedHabitId
    ? state.habits.find((habit) => habit.id === input.linkedHabitId)
    : undefined;
  if (input.linkedTaskId && !linkedTask) return state;
  if (input.linkedHabitId && !linkedHabit) return state;

  const direction = input.direction ?? linkedTask?.direction ?? linkedHabit?.direction;
  const moveText = cleanMoveText(input.moveText);
  if (!direction || !isDirection(direction) || !moveText) return state;

  const intent: ActivityIntent = {
    id: idFactory(),
    stuckState: input.stuckState,
    direction,
    moveText,
    intendedDurationMinutes: input.intendedDurationMinutes,
    linkedTaskId: linkedTask?.id,
    linkedHabitId: linkedHabit?.id,
    createdAt: clock(),
    status: "pending",
  };
  return {
    ...state,
    activityIntents: [...state.activityIntents, intent],
  };
}

export function cancelPendingIntent(
  state: AppState,
  intentId: string,
): AppState {
  return {
    ...state,
    activityIntents: state.activityIntents.filter(
      (intent) => intent.id !== intentId,
    ),
  };
}

export function getPendingIntent(
  state: AppState,
): ActivityIntent | undefined {
  return state.activityIntents.find((intent) => intent.status === "pending");
}

function isTask(value: unknown): value is Task {
  return (
    isRecord(value) &&
    nonemptyString(value.id) &&
    nonemptyBoundedString(value.title, 160) &&
    isDirection(value.direction) &&
    Number.isInteger(value.order) &&
    (value.order as number) >= 0 &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    stringArrayValue(value.completedOn)
  );
}

function isHabit(value: unknown): value is Habit {
  return (
    isRecord(value) &&
    nonemptyString(value.id) &&
    nonemptyBoundedString(value.title, 160) &&
    isDirection(value.direction) &&
    isSchedule(value.schedule) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    stringArrayValue(value.completedOn)
  );
}

function isActivityIntent(value: unknown): value is ActivityIntent {
  return (
    isRecord(value) &&
    nonemptyString(value.id) &&
    isStuckState(value.stuckState) &&
    isDirection(value.direction) &&
    nonemptyBoundedString(value.moveText, 160) &&
    isIntendedDuration(value.intendedDurationMinutes) &&
    optionalString(value.linkedTaskId) &&
    optionalString(value.linkedHabitId) &&
    !(value.linkedTaskId && value.linkedHabitId) &&
    typeof value.createdAt === "string" &&
    (value.status === "pending" ||
      value.status === "consumed" ||
      value.status === "cancelled")
  );
}

function isActivitySession(value: unknown): value is ActivitySession {
  if (!isRecord(value)) return false;
  const open = value.status === "running" || value.status === "paused";
  const closed = value.status === "completed" || value.status === "stopped";
  const links = [
    value.linkedTaskId,
    value.linkedHabitId,
    value.linkedIntentId,
  ].filter(Boolean);

  return (
    nonemptyString(value.id) &&
    (value.mode === "countdown" || value.mode === "stopwatch") &&
    isDirection(value.direction) &&
    nonemptyString(value.label) &&
    optionalSessionDuration(value.targetDurationMinutes) &&
    (value.mode !== "countdown" ||
      validSessionDuration(value.targetDurationMinutes)) &&
    optionalString(value.linkedTaskId) &&
    optionalString(value.linkedHabitId) &&
    optionalString(value.linkedIntentId) &&
    links.length <= 1 &&
    (open || closed) &&
    typeof value.startedAt === "string" &&
    optionalString(value.lastResumedAt) &&
    finiteNonnegative(value.accumulatedElapsedMs) &&
    optionalString(value.endedAt) &&
    optionalFiniteNonnegative(value.actualElapsedMs) &&
    optionalString(value.reviewedAt) &&
    (!closed ||
      (typeof value.endedAt === "string" &&
        typeof value.actualElapsedMs === "number")) &&
    (value.status !== "running" || typeof value.lastResumedAt === "string")
  );
}

function isRewardEvent(value: unknown): value is RewardEvent {
  return (
    isRecord(value) &&
    nonemptyString(value.id) &&
    (value.source === "task" ||
      value.source === "habit" ||
      value.source === "session" ||
      value.source === "morning" ||
      value.source === "reflection" ||
      value.source === "store") &&
    typeof value.sourceId === "string" &&
    typeof value.dateKey === "string" &&
    typeof value.points === "number" &&
    Number.isFinite(value.points) &&
    typeof value.createdAt === "string"
  );
}

function normalizeJournalEntries(value: unknown): JournalEntry[] {
  if (!Array.isArray(value)) return [];
  const entries = new Map<string, JournalEntry>();
  for (const candidate of value) {
    if (isJournalEntry(candidate)) entries.set(candidate.dateKey, candidate);
  }
  return [...entries.values()];
}

function isJournalEntry(value: unknown): value is JournalEntry {
  return (
    isRecord(value) &&
    isDateKey(value.dateKey) &&
    typeof value.updatedAt === "string" &&
    optionalText(value.whatHelped) &&
    optionalText(value.completed) &&
    optionalText(value.difficult) &&
    optionalText(value.nextStep) &&
    optionalText(value.freeText) &&
    optionalRating(value.mood) &&
    optionalRating(value.energy)
  );
}

function normalizeMorningChecks(value: unknown): MorningCheck[] {
  if (!Array.isArray(value)) return [];
  const checks = new Map<string, MorningCheck>();
  for (const candidate of value) {
    if (isMorningCheck(candidate)) checks.set(candidate.dateKey, candidate);
  }
  return [...checks.values()];
}

function isMorningCheck(value: unknown): value is MorningCheck {
  return (
    isRecord(value) &&
    isDateKey(value.dateKey) &&
    typeof value.verifiedAt === "string" &&
    (value.captureMethod === "camera" || value.captureMethod === "upload") &&
    (value.verifierMode === "mock" || value.verifierMode === "live")
  );
}

function normalizeMorningAttempts(value: unknown): MorningAttempt[] {
  if (!Array.isArray(value)) return [];
  const attempts = new Map<string, MorningAttempt>();
  for (const candidate of value) {
    if (
      !isRecord(candidate) ||
      !isDateKey(candidate.dateKey) ||
      !Number.isInteger(candidate.count)
    ) {
      continue;
    }
    attempts.set(candidate.dateKey, {
      dateKey: candidate.dateKey,
      count: Math.min(3, Math.max(0, candidate.count as number)),
    });
  }
  return [...attempts.values()];
}

function normalizeInventory(value: unknown): AppState["inventory"] {
  if (!isRecord(value)) return { items: [] };
  const quantities = new Map<string, number>();
  if (Array.isArray(value.items)) {
    for (const item of value.items) {
      if (
        !isRecord(item) ||
        !nonemptyString(item.itemId) ||
        !Number.isInteger(item.quantity) ||
        (item.quantity as number) < 1
      ) {
        continue;
      }
      const quantity = Math.min(
        999,
        (quantities.get(item.itemId) ?? 0) + (item.quantity as number),
      );
      quantities.set(item.itemId, quantity);
    }
  }
  const items = [...quantities].map(([itemId, quantity]) => ({
    itemId,
    quantity,
  }));
  const selectedFurnitureId =
    typeof value.selectedFurnitureId === "string" &&
    quantities.has(value.selectedFurnitureId)
      ? value.selectedFurnitureId
      : undefined;
  return { items, selectedFurnitureId };
}

function isSchedule(value: unknown): value is HabitSchedule {
  if (!isRecord(value)) return false;
  if (value.kind === "daily") return true;
  return (
    value.kind === "weekdays" &&
    Array.isArray(value.weekdays) &&
    value.weekdays.length > 0 &&
    value.weekdays.every(isWeekday)
  );
}

function keepOnePendingIntent(
  intents: ActivityIntent[],
): ActivityIntent[] {
  let keptPending = false;
  return intents.filter((intent) => {
    if (intent.status !== "pending") return true;
    if (keptPending) return false;
    keptPending = true;
    return true;
  });
}

function keepOneOpenSession(sessions: ActivitySession[]): ActivitySession[] {
  let keptOpen = false;
  return sessions.filter((session) => {
    if (session.status === "completed" || session.status === "stopped") {
      return true;
    }
    if (keptOpen) return false;
    keptOpen = true;
    return true;
  });
}

function milestones(value: unknown): (21 | 50 | 100)[] {
  if (!Array.isArray(value)) return [];
  return unique(
    value.filter(
      (item): item is 21 | 50 | 100 =>
        item === 21 || item === 50 || item === 100,
    ),
  );
}

function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function cleanMoveText(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 160);
}

function now(): string {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function nonemptyBoundedString(value: unknown, limit: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= limit
  );
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function stringArrayValue(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? unique(value.filter((item): item is string => typeof item === "string"))
    : [];
}

function optionalText(value: unknown): boolean {
  return value === undefined || (typeof value === "string" && value.length <= 1000);
}

function optionalRating(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === "number" &&
      Number.isInteger(value) &&
      value >= 1 &&
      value <= 5)
  );
}

function validSessionDuration(value: unknown): value is number {
  return isFocusDuration(value);
}

function optionalSessionDuration(value: unknown): boolean {
  return value === undefined || validSessionDuration(value);
}

function finiteNonnegative(value: unknown): boolean {
  return (
    typeof value === "number" && Number.isFinite(value) && value >= 0
  );
}

function optionalFiniteNonnegative(value: unknown): boolean {
  return value === undefined || finiteNonnegative(value);
}

function finiteNonnegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : 0;
}

function finiteNonnegativeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
