import { isLocalDateKey } from "./dates.ts";
import { isHabitScheduled } from "./tasks-habits.ts";
import type {
  ActivitySession,
  AppState,
  Direction,
  Habit,
  JournalEntry,
  Task,
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
}

export interface TodayView {
  tasks: Task[];
  habits: Habit[];
  focusItems: TodayFocusItem[];
  totalFocusedMs: number;
  reflection?: JournalEntry;
}

export function getTodayView(state: AppState, dateKey: string): TodayView {
  const focusItems = isLocalDateKey(dateKey)
    ? state.sessions
        .filter((session) => isSessionOnDate(state, session, dateKey))
        .map((session) => toFocusItem(state, session))
        .sort((left, right) => Date.parse(right.endedAt) - Date.parse(left.endedAt))
    : [];

  return {
    tasks: [...state.tasks].sort((left, right) => left.order - right.order),
    habits: isLocalDateKey(dateKey)
      ? state.habits.filter((habit) => isHabitScheduled(habit, dateKey))
      : [],
    focusItems,
    totalFocusedMs: focusItems.reduce((total, item) => total + item.durationMs, 0),
    reflection: isLocalDateKey(dateKey)
      ? state.journalEntries.find((entry) => entry.dateKey === dateKey)
      : undefined,
  };
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
    ...linked,
  };
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
