import { isLocalDateKey } from "./dates.ts";
import { isHabitScheduled } from "./tasks-habits.ts";
import {
  DIRECTIONS,
  type ActivitySession,
  type AppState,
  type Direction,
  type Habit,
  type JournalEntry,
  type Task,
} from "./models.ts";

export interface TodayFocusItem {
  id: string;
  title: string;
  direction: Direction;
  status: "completed" | "stopped";
  durationMs: number;
  linkedKind?: "Task" | "Habit" | "First Move";
  linkedLabel?: string;
  endedAt: string;
  timezone?: string;
}

export type TodayTimelineKind = "Task" | "Habit" | "Focus";

export interface TodayTimelineItem {
  id: string;
  kind: TodayTimelineKind;
  label: string;
  direction: Direction;
  occurredAt?: string;
  timezone?: string;
  points?: number;
  durationMs?: number;
  sessionStatus?: "completed" | "stopped";
}

export interface TodayView {
  tasks: Task[];
  habits: Habit[];
  focusItems: TodayFocusItem[];
  totalFocusedMs: number;
  directionTotals: Record<Direction, number>;
  timeline: TodayTimelineItem[];
  reflection?: JournalEntry;
}

export function getTodayView(state: AppState, dateKey: string): TodayView {
  const focusItems = isLocalDateKey(dateKey)
    ? state.sessions
        .filter((session) => isSessionOnDate(state, session, dateKey))
        .map((session) => toFocusItem(state, session))
        .sort((left, right) => Date.parse(right.endedAt) - Date.parse(left.endedAt))
    : [];
  const directionTotals = emptyDirectionTotals();
  for (const item of focusItems) directionTotals[item.direction] += item.durationMs;

  return {
    tasks: [...state.tasks].sort((left, right) => left.order - right.order),
    habits: isLocalDateKey(dateKey)
      ? state.habits.filter((habit) => isHabitScheduled(habit, dateKey))
      : [],
    focusItems,
    totalFocusedMs: focusItems.reduce((total, item) => total + item.durationMs, 0),
    directionTotals,
    timeline: isLocalDateKey(dateKey)
      ? buildTimeline(state, focusItems, dateKey)
      : [],
    reflection: isLocalDateKey(dateKey)
      ? state.journalEntries.find((entry) => entry.dateKey === dateKey)
      : undefined,
  };
}

export function formatTimelineTime(timestamp?: string, timezone?: string): string {
  if (!timestamp || Number.isNaN(Date.parse(timestamp))) return "Today";
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      ...(timezone ? { timeZone: timezone } : {}),
    }).format(new Date(timestamp));
  } catch {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(timestamp));
  }
}

export function formatFocusedDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h${minutes > 0 ? ` ${minutes}m` : ""}`;
  if (minutes > 0) return `${minutes}m${seconds > 0 ? ` ${seconds}s` : ""}`;
  return `${seconds}s`;
}

function isSessionOnDate(
  state: AppState,
  session: ActivitySession,
  dateKey: string,
): session is ActivitySession & {
  status: "completed" | "stopped";
  endedAt: string;
  actualElapsedMs: number;
} {
  if (
    (session.status !== "completed" && session.status !== "stopped") ||
    typeof session.endedAt !== "string" ||
    typeof session.actualElapsedMs !== "number" ||
    !Number.isFinite(session.actualElapsedMs) ||
    session.actualElapsedMs < 0
  ) {
    return false;
  }

  const capturedDate = isLocalDateKey(session.localDate)
    ? session.localDate
    : state.rewardEvents.find(
        (event) => event.source === "session" && event.sourceId === session.id,
      )?.dateKey;
  return capturedDate === dateKey;
}

function toFocusItem(
  state: AppState,
  session: ActivitySession & {
    status: "completed" | "stopped";
    endedAt: string;
    actualElapsedMs: number;
  },
): TodayFocusItem {
  const linked = linkedItem(state, session);
  return {
    id: session.id,
    title: session.label,
    direction: session.direction,
    status: session.status,
    durationMs: session.actualElapsedMs,
    endedAt: session.endedAt,
    timezone: session.timezone,
    ...linked,
  };
}

function buildTimeline(
  state: AppState,
  focusItems: TodayFocusItem[],
  dateKey: string,
): TodayTimelineItem[] {
  const taskItems: TodayTimelineItem[] = state.tasks
    .filter((task) => task.completedOn.includes(dateKey))
    .map((task) => {
      const reward = matchingReward(state, "task", task.id, dateKey);
      return {
        id: `task:${task.id}:${dateKey}`,
        kind: "Task",
        label: task.title,
        direction: task.direction,
        occurredAt: reward?.createdAt,
        timezone: reward?.timezone,
        points: reward?.points,
      };
    });
  const habitItems: TodayTimelineItem[] = state.habits
    .filter((habit) => habit.completedOn.includes(dateKey))
    .map((habit) => {
      const reward = matchingReward(state, "habit", habit.id, dateKey);
      return {
        id: `habit:${habit.id}:${dateKey}`,
        kind: "Habit",
        label: habit.title,
        direction: habit.direction,
        occurredAt: reward?.createdAt,
        timezone: reward?.timezone,
        points: reward?.points,
      };
    });
  const sessionItems: TodayTimelineItem[] = focusItems.map((session) => {
    const reward = matchingReward(state, "session", session.id, dateKey);
    return {
      id: `session:${session.id}`,
      kind: "Focus",
      label: session.title,
      direction: session.direction,
      occurredAt: session.endedAt,
      timezone: session.timezone ?? reward?.timezone,
      points: reward?.points,
      durationMs: session.durationMs,
      sessionStatus: session.status,
    };
  });

  return [...taskItems, ...habitItems, ...sessionItems].sort(
    (left, right) => timestampValue(right.occurredAt) - timestampValue(left.occurredAt),
  );
}

function matchingReward(
  state: AppState,
  source: "task" | "habit" | "session",
  sourceId: string,
  dateKey: string,
) {
  return state.rewardEvents.find(
    (event) =>
      event.source === source && event.sourceId === sourceId && event.dateKey === dateKey,
  );
}

function emptyDirectionTotals(): Record<Direction, number> {
  return Object.fromEntries(DIRECTIONS.map((direction) => [direction, 0])) as Record<
    Direction,
    number
  >;
}

function timestampValue(value?: string): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function linkedItem(
  state: AppState,
  session: ActivitySession,
): Pick<TodayFocusItem, "linkedKind" | "linkedLabel"> {
  if (session.linkedTaskId) {
    const task = state.tasks.find((candidate) => candidate.id === session.linkedTaskId);
    return task ? { linkedKind: "Task", linkedLabel: task.title } : {};
  }
  if (session.linkedHabitId) {
    const habit = state.habits.find((candidate) => candidate.id === session.linkedHabitId);
    return habit ? { linkedKind: "Habit", linkedLabel: habit.title } : {};
  }
  if (session.linkedIntentId) {
    const intent = state.activityIntents.find(
      (candidate) => candidate.id === session.linkedIntentId,
    );
    return intent ? { linkedKind: "First Move", linkedLabel: intent.moveText } : {};
  }
  return {};
}
