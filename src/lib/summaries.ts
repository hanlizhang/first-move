import { DIRECTIONS, type AppState, type Direction } from "./models.ts";

export interface TodaySummary {
  totalTrackedMs: number;
  byDirection: Record<Direction, number>;
}

export type TimelineEntry =
  | { id: string; kind: "session"; timestamp: string; title: string; direction: Direction; durationMs: number; outcome: "completed" | "stopped"; points: number }
  | { id: string; kind: "task" | "habit"; timestamp: string; title: string; direction: Direction; points: number };

export function getTodaySummary(state: AppState, dateKey: string): TodaySummary {
  const byDirection = Object.fromEntries(DIRECTIONS.map((direction) => [direction, 0])) as Record<Direction, number>;
  let totalTrackedMs = 0;
  for (const session of closedSessionsOn(state, dateKey)) {
    const duration = session.actualElapsedMs ?? 0;
    totalTrackedMs += duration;
    byDirection[session.direction] += duration;
  }
  return { totalTrackedMs, byDirection };
}

export function getTaskTrackedMs(state: AppState, taskId: string): number {
  return state.sessions.reduce(
    (total, session) => total + (isClosed(session.status) && session.linkedTaskId === taskId ? session.actualElapsedMs ?? 0 : 0),
    0,
  );
}

export function getTodayTimeline(state: AppState, dateKey: string): TimelineEntry[] {
  const entries: TimelineEntry[] = closedSessionsOn(state, dateKey).map((session) => ({
    id: `timeline:${session.id}`,
    kind: "session",
    timestamp: session.endedAt!,
    title: session.label,
    direction: session.direction,
    durationMs: session.actualElapsedMs ?? 0,
    outcome: session.status as "completed" | "stopped",
    points: state.rewardEvents.find((event) => event.source === "session" && event.sourceId === session.id)?.points ?? 0,
  }));
  for (const event of state.rewardEvents) {
    if (event.dateKey !== dateKey || (event.source !== "task" && event.source !== "habit")) continue;
    const item = event.source === "task"
      ? state.tasks.find((task) => task.id === event.sourceId)
      : state.habits.find((habit) => habit.id === event.sourceId);
    if (item) entries.push({ id: `timeline:${event.id}`, kind: event.source, timestamp: event.createdAt, title: item.title, direction: item.direction, points: event.points });
  }
  return entries.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
}

function closedSessionsOn(state: AppState, dateKey: string) {
  return state.sessions.filter((session) => isClosed(session.status) && session.endedAt && localDateKey(new Date(session.endedAt)) === dateKey);
}

function isClosed(status: string): status is "completed" | "stopped" {
  return status === "completed" || status === "stopped";
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
