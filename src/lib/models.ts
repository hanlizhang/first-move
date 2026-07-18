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

export type SessionStatus = "planned" | "active" | "paused" | "completed" | "cancelled";

export interface ActivitySession {
  id: string;
  direction: Direction;
  firstMove: string;
  durationMinutes: 2 | 5 | 10 | 25;
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
  schemaVersion: 1;
  tasks: Task[];
  habits: Habit[];
  sessions: ActivitySession[];
  rewardEvents: RewardEvent[];
  journalEntries: JournalEntry[];
  inventory: Inventory;
  progress: UserProgress;
}

export const SCHEMA_VERSION = 1 as const;

export function createEmptyState(): AppState {
  return {
    schemaVersion: SCHEMA_VERSION,
    tasks: [],
    habits: [],
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

export function isWeekday(value: unknown): value is Weekday {
  return typeof value === "string" && WEEKDAYS.includes(value as Weekday);
}
