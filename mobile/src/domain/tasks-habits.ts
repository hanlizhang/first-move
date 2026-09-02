import { isLocalDateKey } from "./dates.ts";
import { createUuidV4, isUuidV4 } from "./ids.ts";
import {
  WEEKDAYS,
  isDirection,
  isWeekday,
  type AppState,
  type Direction,
  type Habit,
  type HabitSchedule,
  type Task,
  type Weekday,
} from "./models.ts";

type Clock = () => string;
type IdFactory = () => string;

export function addTask(
  state: AppState,
  input: { title: string; direction: Direction },
  clock: Clock = now,
  idFactory: IdFactory = createUuidV4,
): AppState {
  const title = cleanTitle(input.title);
  if (!title || !isDirection(input.direction)) return state;
  const timestamp = clock();
  const id = idFactory();
  if (!isUuidV4(id)) return state;
  const task: Task = {
    id,
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
  const task = state.tasks.find((candidate) => candidate.id === id);
  if (!task) return state;
  return {
    ...state,
    tasks: state.tasks.map((candidate) =>
      candidate.id === id
        ? { ...candidate, title, direction: input.direction, updatedAt: clock() }
        : candidate,
    ),
  };
}

/**
 * Schema v8 stores only active parents. The existing Web cloud snapshot contract
 * interprets an omitted canonical parent as a tombstone; M1D performs only the
 * local active-list removal. Historical Session and Intent link IDs stay intact.
 */
export function softDeleteTask(state: AppState, id: string): AppState {
  if (!state.tasks.some((task) => task.id === id)) return state;
  return {
    ...state,
    tasks: state.tasks
      .filter((task) => task.id !== id)
      .map((task, order) => ({ ...task, order })),
  };
}

export function toggleTaskCompletion(
  state: AppState,
  id: string,
  dateKey: string,
  clock: Clock = now,
): AppState {
  if (!isLocalDateKey(dateKey)) return state;
  const task = state.tasks.find((candidate) => candidate.id === id);
  if (!task) return state;
  const completed = task.completedOn.includes(dateKey);
  return {
    ...state,
    tasks: state.tasks.map((candidate) =>
      candidate.id === id
        ? {
            ...candidate,
            completedOn: completed
              ? candidate.completedOn.filter((date) => date !== dateKey)
              : unique([...candidate.completedOn, dateKey]),
            updatedAt: clock(),
          }
        : candidate,
    ),
  };
}

export function addHabit(
  state: AppState,
  input: { title: string; direction: Direction; schedule: HabitSchedule },
  clock: Clock = now,
  idFactory: IdFactory = createUuidV4,
): AppState {
  const title = cleanTitle(input.title);
  if (!title || !isDirection(input.direction) || !isHabitSchedule(input.schedule)) {
    return state;
  }
  const timestamp = clock();
  const id = idFactory();
  if (!isUuidV4(id)) return state;
  const habit: Habit = {
    id,
    title,
    direction: input.direction,
    schedule: normalizeHabitSchedule(input.schedule),
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
  if (!title || !isDirection(input.direction) || !isHabitSchedule(input.schedule)) {
    return state;
  }
  const habit = state.habits.find((candidate) => candidate.id === id);
  if (!habit) return state;
  return {
    ...state,
    habits: state.habits.map((candidate) =>
      candidate.id === id
        ? {
            ...candidate,
            title,
            direction: input.direction,
            schedule: normalizeHabitSchedule(input.schedule),
            updatedAt: clock(),
          }
        : candidate,
    ),
  };
}

export function softDeleteHabit(state: AppState, id: string): AppState {
  if (!state.habits.some((habit) => habit.id === id)) return state;
  return { ...state, habits: state.habits.filter((habit) => habit.id !== id) };
}

export function toggleHabitCompletion(
  state: AppState,
  id: string,
  dateKey: string,
  clock: Clock = now,
): AppState {
  if (!isLocalDateKey(dateKey)) return state;
  const habit = state.habits.find((candidate) => candidate.id === id);
  if (!habit) return state;
  const completed = habit.completedOn.includes(dateKey);
  return {
    ...state,
    habits: state.habits.map((candidate) =>
      candidate.id === id
        ? {
            ...candidate,
            completedOn: completed
              ? candidate.completedOn.filter((date) => date !== dateKey)
              : unique([...candidate.completedOn, dateKey]),
            updatedAt: clock(),
          }
        : candidate,
    ),
  };
}

export function isHabitScheduled(habit: Habit, dateKey: string): boolean {
  if (!isLocalDateKey(dateKey)) return false;
  if (habit.schedule.kind === "daily") return true;
  const date = new Date(`${dateKey}T12:00:00`);
  return habit.schedule.weekdays.includes(WEEKDAYS[date.getDay()]!);
}

export function isHabitSchedule(value: unknown): value is HabitSchedule {
  if (!isRecord(value)) return false;
  if (value.kind === "daily") return true;
  return (
    value.kind === "weekdays" &&
    Array.isArray(value.weekdays) &&
    value.weekdays.length > 0 &&
    value.weekdays.every(isWeekday)
  );
}

function normalizeHabitSchedule(schedule: HabitSchedule): HabitSchedule {
  if (schedule.kind === "daily") return { kind: "daily" };
  const selected = new Set(schedule.weekdays);
  return {
    kind: "weekdays",
    weekdays: WEEKDAYS.filter((weekday) => selected.has(weekday)) as Weekday[],
  };
}

function cleanTitle(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 160);
}

function now(): string {
  return new Date().toISOString();
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
