export const DIRECTIONS = [
  "Work & Study",
  "Daily Life",
  "Exercise & Movement",
  "Intentional Entertainment",
  "Rest",
] as const;

export type Direction = (typeof DIRECTIONS)[number];

export const STUCK_STATES = [
  "scrolling and unable to stop",
  "in bed and unable to get up",
  "knows what to do but cannot start",
  "overwhelmed by a large task",
  "needs intentional rest",
  "unsure what is needed",
] as const;

export type StuckState = (typeof STUCK_STATES)[number];

export const INTENDED_DURATIONS = [2, 5, 10, 25] as const;
export type IntendedDuration = (typeof INTENDED_DURATIONS)[number];

export const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export type HabitSchedule =
  | { kind: "daily" }
  | { kind: "weekdays"; weekdays: Weekday[] };

export interface Task {
  id: string;
  title: string;
  direction: Direction;
  order: number;
  createdAt: string;
  updatedAt: string;
  completedOn: string[];
}

export interface Habit {
  id: string;
  title: string;
  direction: Direction;
  schedule: HabitSchedule;
  createdAt: string;
  updatedAt: string;
  completedOn: string[];
}

export interface ActivityIntent {
  id: string;
  stuckState: StuckState;
  direction: Direction;
  moveText: string;
  intendedDurationMinutes: IntendedDuration;
  linkedTaskId?: string;
  linkedHabitId?: string;
  createdAt: string;
  status: "pending";
}

export type SessionStatus = "planned" | "active" | "paused" | "completed" | "cancelled";

export interface ActivitySession {
  id: string;
  direction: Direction;
  firstMove: string;
  durationMinutes: IntendedDuration;
  status: SessionStatus;
  startedAt?: string;
  endedAt?: string;
}

export type RewardSource = "task" | "habit" | "session" | "morning";

export interface RewardEvent {
  id: string;
  source: RewardSource;
  sourceId: string;
  dateKey: string;
  points: number;
  createdAt: string;
}

export interface JournalEntry {
  dateKey: string;
  whatHelped?: string;
  completed?: string;
  difficult?: string;
  nextStep?: string;
  mood?: 1 | 2 | 3 | 4 | 5;
  energy?: 1 | 2 | 3 | 4 | 5;
  freeText?: string;
  updatedAt: string;
}

export interface InventoryItem {
  itemId: string;
  quantity: number;
}

export interface Inventory {
  items: InventoryItem[];
  selectedFurnitureId?: string;
}

export interface UserProgress {
  points: number;
  activeDateKeys: string[];
  unlockedMilestones: Array<21 | 50 | 100>;
}

export interface AppState {
  schemaVersion: 2;
  tasks: Task[];
  habits: Habit[];
  activityIntents: ActivityIntent[];
  sessions: ActivitySession[];
  rewardEvents: RewardEvent[];
  journalEntries: JournalEntry[];
  inventory: Inventory;
  progress: UserProgress;
}

export const SCHEMA_VERSION = 2 as const;

export function createEmptyState(): AppState {
  return {
    schemaVersion: SCHEMA_VERSION,
    tasks: [],
    habits: [],
    activityIntents: [],
    sessions: [],
    rewardEvents: [],
    journalEntries: [],
    inventory: { items: [] },
    progress: { points: 0, activeDateKeys: [], unlockedMilestones: [] },
  };
}

export function isDirection(value: unknown): value is Direction {
  return typeof value === "string" && DIRECTIONS.includes(value as Direction);
}

export function isStuckState(value: unknown): value is StuckState {
  return typeof value === "string" && STUCK_STATES.includes(value as StuckState);
}

export function isIntendedDuration(value: unknown): value is IntendedDuration {
  return typeof value === "number" && INTENDED_DURATIONS.includes(value as IntendedDuration);
}

export function isWeekday(value: unknown): value is Weekday {
  return typeof value === "string" && WEEKDAYS.includes(value as Weekday);
}
