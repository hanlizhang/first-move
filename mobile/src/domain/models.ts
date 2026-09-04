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

export const FOCUS_COUNTDOWN_PRESETS = [2, 5, 10, 25, 50] as const;
export const MIN_FOCUS_DURATION_MINUTES = 1;
export const MAX_FOCUS_DURATION_MINUTES = 720;

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
  status: "pending" | "consumed" | "cancelled";
}

export type SessionStatus = "running" | "paused" | "completed" | "stopped";
export type SessionMode = "countdown" | "stopwatch";

export interface ActivitySession {
  id: string;
  mode: SessionMode;
  direction: Direction;
  label: string;
  targetDurationMinutes?: number;
  linkedTaskId?: string;
  linkedHabitId?: string;
  linkedIntentId?: string;
  status: SessionStatus;
  startedAt: string;
  /** Captured when the Session starts; never recompute historical membership. */
  localDate?: string;
  timezone?: string;
  lastResumedAt?: string;
  accumulatedElapsedMs: number;
  endedAt?: string;
  actualElapsedMs?: number;
  reviewedAt?: string;
}

export type RewardSource = "task" | "habit" | "session" | "morning" | "reflection" | "store";

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

export interface MorningCheck {
  dateKey: string;
  verifiedAt: string;
  captureMethod: "camera" | "upload";
  verifierMode: "mock" | "live";
}

export interface MorningAttempt {
  dateKey: string;
  count: number;
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
  unlockedMilestones: (21 | 50 | 100)[];
  grantedMilestones: (21 | 50 | 100)[];
  firstUseDate?: string;
  lastActiveDate?: string;
  journeyDay: number;
  totalActiveDays: number;
  gentleStreak: number;
}

export interface AppState {
  schemaVersion: 8;
  tasks: Task[];
  habits: Habit[];
  activityIntents: ActivityIntent[];
  sessions: ActivitySession[];
  rewardEvents: RewardEvent[];
  journalEntries: JournalEntry[];
  morningChecks: MorningCheck[];
  morningAttempts: MorningAttempt[];
  inventory: Inventory;
  progress: UserProgress;
}

export interface PlanningReviewItem {
  id: string;
  group: "first-move" | "priority" | "optional";
  title: string;
  firstStep: string;
  category: Direction;
  durationMinutes: IntendedDuration;
}

export interface DailyPlanRecord {
  dateKey: string;
  items: PlanningReviewItem[];
}

export const SCHEMA_VERSION = 8 as const;

export function createEmptyState(): AppState {
  return {
    schemaVersion: SCHEMA_VERSION,
    tasks: [],
    habits: [],
    activityIntents: [],
    sessions: [],
    rewardEvents: [],
    journalEntries: [],
    morningChecks: [],
    morningAttempts: [],
    inventory: { items: [] },
    progress: {
      points: 0,
      activeDateKeys: [],
      unlockedMilestones: [],
      grantedMilestones: [],
      journeyDay: 0,
      totalActiveDays: 0,
      gentleStreak: 0,
    },
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

export function isFocusDuration(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_FOCUS_DURATION_MINUTES &&
    value <= MAX_FOCUS_DURATION_MINUTES
  );
}

export function isWeekday(value: unknown): value is Weekday {
  return typeof value === "string" && WEEKDAYS.includes(value as Weekday);
}
