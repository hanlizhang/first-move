import {
  createEmptyState,
  isDirection,
  isIntendedDuration,
  isStuckState,
  isWeekday,
  type ActivityIntent,
  type ActivitySession,
  type AppState,
  type Direction,
  type Habit,
  type HabitSchedule,
  type RewardEvent,
  type IntendedDuration,
  type JournalEntry,
  type MorningCheck,
  type StuckState,
  type Task,
  type Weekday,
  WEEKDAYS,
} from "./models.ts";
import { catItem, isCatItemId } from "./cat-items.ts";
import { localDateKey } from "./dates.ts";
import { isDateKey } from "./dates.ts";
import { syncProgress } from "./progress.ts";
import { HABIT_REWARD_POINTS, TASK_REWARD_POINTS } from "./rewards.ts";

export { HABIT_REWARD_POINTS, TASK_REWARD_POINTS } from "./rewards.ts";
export { localDateKey } from "./dates.ts";

type Clock = () => string;

export function normalizeAppState(input: unknown): AppState {
  if (!isRecord(input)) return createEmptyState();

  const tasks = Array.isArray(input.tasks) ? input.tasks.filter(isTask) : [];
  const habits = Array.isArray(input.habits) ? input.habits.filter(isHabit) : [];
  const activityIntents = Array.isArray(input.activityIntents)
    ? input.activityIntents.filter(isActivityIntent)
    : [];
  const sessions = Array.isArray(input.sessions) ? input.sessions.filter(isActivitySession) : [];
  const rewardEvents = Array.isArray(input.rewardEvents)
    ? input.rewardEvents.filter(isRewardEvent)
    : [];
  const journalEntries = normalizeJournalEntries(input.journalEntries);
  const morningChecks = normalizeMorningChecks(input.morningChecks);
  const inventory = normalizeInventory(input.inventory);
  const progressInput = isRecord(input.progress) ? input.progress : {};
  const derivedPoints = rewardEvents.reduce((total, event) => total + event.points, 0);

  const state: AppState = {
    ...createEmptyState(),
    tasks: [...tasks].sort((a, b) => a.order - b.order).map((task, order) => ({ ...task, order })),
    habits,
    activityIntents: keepOnePendingIntent(activityIntents),
    sessions: keepOneOpenSession(sessions),
    rewardEvents,
    journalEntries,
    morningChecks,
    inventory,
    progress: {
      points:
        rewardEvents.some((event) => event.source === "store")
          ? typeof progressInput.points === "number" && Number.isFinite(progressInput.points)
            ? Math.max(0, progressInput.points)
            : Math.max(0, derivedPoints)
          : typeof progressInput.points === "number" && Number.isFinite(progressInput.points)
          ? Math.max(progressInput.points, derivedPoints)
          : Math.max(0, derivedPoints),
      activeDateKeys: stringArray(progressInput.activeDateKeys),
      unlockedMilestones: Array.isArray(progressInput.unlockedMilestones)
        ? progressInput.unlockedMilestones.filter(
            (value): value is 21 | 50 | 100 => value === 21 || value === 50 || value === 100,
          )
        : [],
      firstUseDate: typeof progressInput.firstUseDate === "string" ? progressInput.firstUseDate : undefined,
      lastActiveDate: typeof progressInput.lastActiveDate === "string" ? progressInput.lastActiveDate : undefined,
      journeyDay: finiteNonnegativeInteger(progressInput.journeyDay),
      totalActiveDays: finiteNonnegativeInteger(progressInput.totalActiveDays),
      gentleStreak: finiteNonnegativeInteger(progressInput.gentleStreak),
    },
  };
  return syncProgress(state, localDateKey(), false);
}

export interface CreateIntentInput {
  stuckState: StuckState;
  direction?: Direction;
  moveText: string;
  intendedDurationMinutes: IntendedDuration;
  linkedTaskId?: string;
  linkedHabitId?: string;
}

export function createPendingIntent(
  state: AppState,
  input: CreateIntentInput,
  clock: Clock = now,
  idFactory: () => string = () => makeId("intent"),
): AppState {
  if (state.activityIntents.some((intent) => intent.status === "pending")) return state;
  if (!isStuckState(input.stuckState) || !isIntendedDuration(input.intendedDurationMinutes)) return state;
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
  const moveText = cleanTitle(input.moveText);
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
  return { ...state, activityIntents: [...state.activityIntents, intent] };
}

export function cancelPendingIntent(state: AppState, intentId: string): AppState {
  return {
    ...state,
    activityIntents: state.activityIntents.filter(
      (intent) => !(intent.id === intentId && intent.status === "pending"),
    ),
  };
}

export function getPendingIntent(state: AppState): ActivityIntent | undefined {
  return state.activityIntents.find((intent) => intent.status === "pending");
}

export function addTask(
  state: AppState,
  input: { title: string; direction: Direction },
  clock: Clock = now,
): AppState {
  const title = cleanTitle(input.title);
  if (!title || !isDirection(input.direction)) return state;
  const timestamp = clock();
  const task: Task = {
    id: makeId("task"),
    title,
    direction: input.direction,
    order: state.tasks.length,
    createdAt: timestamp,
    updatedAt: timestamp,
    completedOn: [],
  };
  return { ...state, tasks: [...state.tasks, task] };
}

export function editTask(
  state: AppState,
  id: string,
  input: { title: string; direction: Direction },
  clock: Clock = now,
): AppState {
  const title = cleanTitle(input.title);
  if (!title || !isDirection(input.direction)) return state;
  return {
    ...state,
    tasks: state.tasks.map((task) =>
      task.id === id ? { ...task, title, direction: input.direction, updatedAt: clock() } : task,
    ),
  };
}

export function deleteTask(state: AppState, id: string): AppState {
  return {
    ...state,
    tasks: state.tasks.filter((task) => task.id !== id).map((task, order) => ({ ...task, order })),
  };
}

export function moveTask(state: AppState, id: string, offset: -1 | 1): AppState {
  const index = state.tasks.findIndex((task) => task.id === id);
  const destination = index + offset;
  if (index < 0 || destination < 0 || destination >= state.tasks.length) return state;
  const tasks = [...state.tasks];
  [tasks[index], tasks[destination]] = [tasks[destination], tasks[index]];
  return { ...state, tasks: tasks.map((task, order) => ({ ...task, order })) };
}

export function toggleTask(state: AppState, id: string, dateKey: string, clock: Clock = now): AppState {
  const task = state.tasks.find((candidate) => candidate.id === id);
  if (!task) return state;
  const completed = task.completedOn.includes(dateKey);
  const tasks = state.tasks.map((candidate) =>
    candidate.id === id
      ? {
          ...candidate,
          completedOn: completed
            ? candidate.completedOn.filter((date) => date !== dateKey)
            : unique([...candidate.completedOn, dateKey]),
          updatedAt: clock(),
        }
      : candidate,
  );
  return completed
    ? { ...state, tasks }
    : addReward({ ...state, tasks }, "task", task.id, dateKey, TASK_REWARD_POINTS, clock);
}

export function addHabit(
  state: AppState,
  input: { title: string; direction: Direction; schedule: HabitSchedule },
  clock: Clock = now,
): AppState {
  const title = cleanTitle(input.title);
  if (!title || !isDirection(input.direction) || !isSchedule(input.schedule)) return state;
  const timestamp = clock();
  const habit: Habit = {
    id: makeId("habit"),
    title,
    direction: input.direction,
    schedule: normalizeSchedule(input.schedule),
    createdAt: timestamp,
    updatedAt: timestamp,
    completedOn: [],
  };
  return { ...state, habits: [...state.habits, habit] };
}

export function editHabit(
  state: AppState,
  id: string,
  input: { title: string; direction: Direction; schedule: HabitSchedule },
  clock: Clock = now,
): AppState {
  const title = cleanTitle(input.title);
  if (!title || !isDirection(input.direction) || !isSchedule(input.schedule)) return state;
  return {
    ...state,
    habits: state.habits.map((habit) =>
      habit.id === id
        ? { ...habit, title, direction: input.direction, schedule: normalizeSchedule(input.schedule), updatedAt: clock() }
        : habit,
    ),
  };
}

export function deleteHabit(state: AppState, id: string): AppState {
  return { ...state, habits: state.habits.filter((habit) => habit.id !== id) };
}

export function toggleHabit(state: AppState, id: string, dateKey: string, clock: Clock = now): AppState {
  const habit = state.habits.find((candidate) => candidate.id === id);
  if (!habit) return state;
  const completed = habit.completedOn.includes(dateKey);
  const habits = state.habits.map((candidate) =>
    candidate.id === id
      ? {
          ...candidate,
          completedOn: completed
            ? candidate.completedOn.filter((date) => date !== dateKey)
            : unique([...candidate.completedOn, dateKey]),
          updatedAt: clock(),
        }
      : candidate,
  );
  return completed
    ? { ...state, habits }
    : addReward({ ...state, habits }, "habit", habit.id, dateKey, HABIT_REWARD_POINTS, clock);
}

export function isHabitScheduled(habit: Habit, dateKey: string): boolean {
  if (habit.schedule.kind === "daily") return true;
  const date = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) return false;
  return habit.schedule.weekdays.includes(WEEKDAYS[date.getDay()]);
}

function addReward(
  state: AppState,
  source: "task" | "habit",
  sourceId: string,
  dateKey: string,
  points: number,
  clock: Clock,
): AppState {
  const id = `${source}:${sourceId}:${dateKey}`;
  if (state.rewardEvents.some((event) => event.id === id)) return state;
  const event: RewardEvent = { id, source, sourceId, dateKey, points, createdAt: clock() };
  return syncProgress({
    ...state,
    rewardEvents: [...state.rewardEvents, event],
    progress: {
      ...state.progress,
      points: state.progress.points + points,
      activeDateKeys: unique([...state.progress.activeDateKeys, dateKey]),
    },
  }, dateKey, true);
}

function isTask(value: unknown): value is Task {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    value.title.trim().length > 0 &&
    isDirection(value.direction) &&
    typeof value.order === "number" &&
    Number.isInteger(value.order) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    Array.isArray(value.completedOn) &&
    value.completedOn.every((item) => typeof item === "string")
  );
}

function isHabit(value: unknown): value is Habit {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    value.title.trim().length > 0 &&
    isDirection(value.direction) &&
    isSchedule(value.schedule) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    Array.isArray(value.completedOn) &&
    value.completedOn.every((item) => typeof item === "string")
  );
}

function isRewardEvent(value: unknown): value is RewardEvent {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    (value.source === "task" || value.source === "habit" || value.source === "session" || value.source === "morning" || value.source === "reflection" || value.source === "store") &&
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
    if (!isJournalEntry(candidate)) continue;
    entries.set(candidate.dateKey, candidate);
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
  for (const candidate of value) if (isMorningCheck(candidate)) checks.set(candidate.dateKey, candidate);
  return [...checks.values()];
}

function isMorningCheck(value: unknown): value is MorningCheck {
  return isRecord(value) && isDateKey(value.dateKey) && typeof value.verifiedAt === "string" &&
    (value.captureMethod === "camera" || value.captureMethod === "upload") &&
    (value.verifierMode === "mock" || value.verifierMode === "live");
}

function optionalText(value: unknown): boolean {
  return value === undefined || (typeof value === "string" && value.length <= 1000);
}

function optionalRating(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5);
}

function normalizeInventory(value: unknown): AppState["inventory"] {
  if (!isRecord(value)) return { items: [] };
  const quantities = new Map<string, number>();
  if (Array.isArray(value.items)) {
    for (const entry of value.items) {
      if (!isRecord(entry) || !isCatItemId(entry.itemId) || !Number.isInteger(entry.quantity) || (entry.quantity as number) < 1) continue;
      const item = catItem(entry.itemId);
      const next = (quantities.get(entry.itemId) ?? 0) + (entry.quantity as number);
      quantities.set(entry.itemId, item?.kind === "food" ? Math.min(next, 999) : 1);
    }
  }
  const items = [...quantities].map(([itemId, quantity]) => ({ itemId, quantity }));
  const selectedFurnitureId = isCatItemId(value.selectedFurnitureId) &&
    catItem(value.selectedFurnitureId)?.kind === "furniture" && quantities.has(value.selectedFurnitureId)
    ? value.selectedFurnitureId
    : undefined;
  return { items, selectedFurnitureId };
}

function isActivityIntent(value: unknown): value is ActivityIntent {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    isStuckState(value.stuckState) &&
    isDirection(value.direction) &&
    typeof value.moveText === "string" &&
    value.moveText.trim().length > 0 &&
    value.moveText.length <= 160 &&
    isIntendedDuration(value.intendedDurationMinutes) &&
    (value.linkedTaskId === undefined || typeof value.linkedTaskId === "string") &&
    (value.linkedHabitId === undefined || typeof value.linkedHabitId === "string") &&
    !(value.linkedTaskId && value.linkedHabitId) &&
    typeof value.createdAt === "string" &&
    value.status === "pending"
  );
}

function isActivitySession(value: unknown): value is ActivitySession {
  const open = valueStatus(value) === "running" || valueStatus(value) === "paused";
  const closed = valueStatus(value) === "completed" || valueStatus(value) === "stopped";
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    (value.mode === "countdown" || value.mode === "stopwatch") &&
    isDirection(value.direction) &&
    typeof value.label === "string" &&
    value.label.trim().length > 0 &&
    (value.targetDurationMinutes === undefined || isValidSessionDuration(value.targetDurationMinutes)) &&
    (value.mode !== "countdown" || isValidSessionDuration(value.targetDurationMinutes)) &&
    (value.linkedTaskId === undefined || typeof value.linkedTaskId === "string") &&
    (value.linkedHabitId === undefined || typeof value.linkedHabitId === "string") &&
    (value.linkedIntentId === undefined || typeof value.linkedIntentId === "string") &&
    [value.linkedTaskId, value.linkedHabitId, value.linkedIntentId].filter(Boolean).length <= 1 &&
    (open || closed) &&
    typeof value.startedAt === "string" &&
    (value.lastResumedAt === undefined || typeof value.lastResumedAt === "string") &&
    typeof value.accumulatedElapsedMs === "number" &&
    Number.isFinite(value.accumulatedElapsedMs) &&
    value.accumulatedElapsedMs >= 0 &&
    (value.endedAt === undefined || typeof value.endedAt === "string") &&
    (value.actualElapsedMs === undefined ||
      (typeof value.actualElapsedMs === "number" && Number.isFinite(value.actualElapsedMs) && value.actualElapsedMs >= 0)) &&
    (value.reviewedAt === undefined || typeof value.reviewedAt === "string") &&
    (!closed || (typeof value.endedAt === "string" && typeof value.actualElapsedMs === "number")) &&
    (value.status !== "running" || typeof value.lastResumedAt === "string")
  );
}

function keepOnePendingIntent(intents: ActivityIntent[]): ActivityIntent[] {
  const pending = intents.find((intent) => intent.status === "pending");
  return pending ? [pending] : [];
}

function keepOneOpenSession(sessions: ActivitySession[]): ActivitySession[] {
  let keptOpen = false;
  return sessions.filter((session) => {
    if (session.status === "completed" || session.status === "stopped") return true;
    if (keptOpen) return false;
    keptOpen = true;
    return true;
  });
}

function valueStatus(value: unknown): unknown {
  return isRecord(value) ? value.status : undefined;
}

function isValidSessionDuration(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 720;
}

function isSchedule(value: unknown): value is HabitSchedule {
  if (!isRecord(value)) return false;
  if (value.kind === "daily") return true;
  return value.kind === "weekdays" && Array.isArray(value.weekdays) && value.weekdays.length > 0 && value.weekdays.every(isWeekday);
}

function normalizeSchedule(schedule: HabitSchedule): HabitSchedule {
  return schedule.kind === "daily"
    ? { kind: "daily" }
    : { kind: "weekdays", weekdays: unique(schedule.weekdays) as Weekday[] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? unique(value.filter((item): item is string => typeof item === "string")) : [];
}

function finiteNonnegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function cleanTitle(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 160);
}

function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function now(): string {
  return new Date().toISOString();
}
