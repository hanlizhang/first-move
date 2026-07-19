import { isDateKey, localDateKey } from "./dates.ts";
import { DIRECTIONS, type ActivitySession, type AppState, type Direction, type JournalEntry } from "./models.ts";
import { qualifyingActiveDates } from "./progress.ts";

export const HISTORY_CATEGORIES = [...DIRECTIONS, "Uncategorized"] as const;
export type HistoryCategory = (typeof HISTORY_CATEGORIES)[number];

export interface DailyTrackedTime { dateKey: string; totalMs: number }

export interface TrendSummary {
  daily: DailyTrackedTime[];
  byCategory: Record<HistoryCategory, number>;
  totalTrackedMs: number;
  activeDays: number;
  completedFirstMoves: number;
  completedSessions: number;
}

export interface DayDetail {
  dateKey: string;
  totalTrackedMs: number;
  byCategory: Record<HistoryCategory, number>;
  completedTasks: Array<{ id: string; title: string; direction: Direction }>;
  habitCheckIns: Array<{ id: string; title: string; direction: Direction }>;
  sessions: ActivitySession[];
  journalEntry?: JournalEntry;
}

export interface CalendarDay {
  dateKey: string;
  dayNumber: number;
  inMonth: boolean;
  isToday: boolean;
  isActive: boolean;
  trackedMs: number;
}

export function getTrendSummary(state: AppState, endDateKey: string, days: 7 | 30): TrendSummary {
  const daily = dateRange(endDateKey, days).map((dateKey) => ({ dateKey, totalMs: 0 }));
  const dailyMap = new Map(daily.map((day) => [day.dateKey, day]));
  const byCategory = emptyCategoryTotals();
  let completedFirstMoves = 0;
  let completedSessions = 0;
  for (const session of closedSessions(state)) {
    const dateKey = localDateKey(new Date(session.endedAt!));
    const day = dailyMap.get(dateKey);
    if (!day) continue;
    const duration = safeDuration(session.actualElapsedMs);
    day.totalMs += duration;
    byCategory[historyCategory(session.direction)] += duration;
    if (session.status === "completed") {
      completedSessions += 1;
      if (session.mode === "countdown") completedFirstMoves += 1;
    }
  }
  const rangeKeys = new Set(daily.map((day) => day.dateKey));
  return {
    daily,
    byCategory,
    totalTrackedMs: daily.reduce((total, day) => total + day.totalMs, 0),
    activeDays: qualifyingActiveDates(state).filter((dateKey) => rangeKeys.has(dateKey)).length,
    completedFirstMoves,
    completedSessions,
  };
}

export function getDayDetail(state: AppState, dateKey: string): DayDetail {
  const sessions = isDateKey(dateKey)
    ? closedSessions(state).filter((session) => localDateKey(new Date(session.endedAt!)) === dateKey)
    : [];
  const byCategory = emptyCategoryTotals();
  for (const session of sessions) byCategory[historyCategory(session.direction)] += safeDuration(session.actualElapsedMs);
  return {
    dateKey,
    totalTrackedMs: sessions.reduce((total, session) => total + safeDuration(session.actualElapsedMs), 0),
    byCategory,
    completedTasks: state.tasks.filter((task) => task.completedOn.includes(dateKey)).map(({ id, title, direction }) => ({ id, title, direction })),
    habitCheckIns: state.habits.filter((habit) => habit.completedOn.includes(dateKey)).map(({ id, title, direction }) => ({ id, title, direction })),
    sessions: [...sessions].sort((a, b) => Date.parse(a.endedAt!) - Date.parse(b.endedAt!)),
    journalEntry: state.journalEntries.find((entry) => entry.dateKey === dateKey),
  };
}

export function getCalendarMonth(state: AppState, year: number, monthIndex: number, today = localDateKey()): CalendarDay[] {
  const first = new Date(year, monthIndex, 1, 12);
  const gridStart = addDays(first, -first.getDay());
  const active = new Set(qualifyingActiveDates(state));
  const tracked = new Map<string, number>();
  for (const session of closedSessions(state)) {
    const key = localDateKey(new Date(session.endedAt!));
    tracked.set(key, (tracked.get(key) ?? 0) + safeDuration(session.actualElapsedMs));
  }
  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(gridStart, index);
    const dateKey = localDateKey(date);
    return { dateKey, dayNumber: date.getDate(), inMonth: date.getMonth() === monthIndex, isToday: dateKey === today, isActive: active.has(dateKey), trackedMs: tracked.get(dateKey) ?? 0 };
  });
}

export function dateRange(endDateKey: string, days: number): string[] {
  if (!isDateKey(endDateKey) || !Number.isInteger(days) || days < 1) return [];
  const end = new Date(`${endDateKey}T12:00:00`);
  return Array.from({ length: days }, (_, index) => localDateKey(addDays(end, index - days + 1)));
}

function closedSessions(state: AppState): ActivitySession[] {
  return state.sessions.filter((session) =>
    (session.status === "completed" || session.status === "stopped") &&
    typeof session.endedAt === "string" && Number.isFinite(Date.parse(session.endedAt)) &&
    typeof session.actualElapsedMs === "number" && Number.isFinite(session.actualElapsedMs) && session.actualElapsedMs >= 0,
  );
}

function historyCategory(value: unknown): HistoryCategory {
  return DIRECTIONS.includes(value as Direction) ? value as Direction : "Uncategorized";
}

function emptyCategoryTotals(): Record<HistoryCategory, number> {
  return Object.fromEntries(HISTORY_CATEGORIES.map((category) => [category, 0])) as Record<HistoryCategory, number>;
}

function safeDuration(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function addDays(date: Date, amount: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}
