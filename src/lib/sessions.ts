import {
  isDirection,
  type ActivitySession,
  type AppState,
  type Direction,
} from "./models.ts";
import { calculateSessionReward, roundPoints } from "./rewards.ts";

type IdFactory = () => string;

interface SessionLink {
  linkedTaskId?: string;
  linkedHabitId?: string;
  linkedIntentId?: string;
}

export interface StartCountdownInput extends SessionLink {
  linkedIntentId: string;
  direction?: Direction;
  durationMinutes: number;
}

export interface StartStopwatchInput extends SessionLink {
  direction?: Direction;
  label?: string;
}

export interface ReviewSessionInput {
  label: string;
  direction: Direction;
  linkedTaskId?: string;
}

export function startCountdown(
  state: AppState,
  input: StartCountdownInput,
  nowMs = Date.now(),
  idFactory: IdFactory = () => makeSessionId(),
): AppState {
  if (getOpenSession(state) || !validDuration(input.durationMinutes)) return state;
  const intent = state.activityIntents.find((candidate) => candidate.id === input.linkedIntentId);
  if (!intent || hasMultipleLinks(input)) return state;
  const direction = input.direction ?? intent.direction;
  if (!isDirection(direction)) return state;
  const timestamp = new Date(nowMs).toISOString();
  const session: ActivitySession = {
    id: idFactory(),
    mode: "countdown",
    direction,
    label: intent.moveText,
    targetDurationMinutes: input.durationMinutes,
    linkedIntentId: intent.id,
    status: "running",
    startedAt: timestamp,
    lastResumedAt: timestamp,
    accumulatedElapsedMs: 0,
  };
  return { ...state, sessions: [...state.sessions, session] };
}

export function startStopwatch(
  state: AppState,
  input: StartStopwatchInput,
  nowMs = Date.now(),
  idFactory: IdFactory = () => makeSessionId(),
): AppState {
  if (getOpenSession(state) || hasMultipleLinks(input)) return state;
  const linked = resolveLink(state, input);
  if (!linked.valid) return state;
  const direction = input.direction ?? linked.direction;
  if (!direction || !isDirection(direction)) return state;
  const label = cleanLabel(input.label || linked.label || "Tracked time");
  if (!label) return state;
  const timestamp = new Date(nowMs).toISOString();
  const session: ActivitySession = {
    id: idFactory(),
    mode: "stopwatch",
    direction,
    label,
    linkedTaskId: input.linkedTaskId,
    linkedHabitId: input.linkedHabitId,
    linkedIntentId: input.linkedIntentId,
    status: "running",
    startedAt: timestamp,
    lastResumedAt: timestamp,
    accumulatedElapsedMs: 0,
  };
  return { ...state, sessions: [...state.sessions, session] };
}

export function pauseSession(state: AppState, sessionId: string, nowMs = Date.now()): AppState {
  return updateOpenSession(state, sessionId, (session) => {
    if (session.status !== "running") return session;
    return {
      ...session,
      status: "paused",
      accumulatedElapsedMs: elapsedMs(session, nowMs),
      lastResumedAt: undefined,
    };
  });
}

export function resumeSession(state: AppState, sessionId: string, nowMs = Date.now()): AppState {
  return updateOpenSession(state, sessionId, (session) => {
    if (session.status !== "paused") return session;
    return { ...session, status: "running", lastResumedAt: new Date(nowMs).toISOString() };
  });
}

export function stopSession(state: AppState, sessionId: string, nowMs = Date.now()): AppState {
  return closeSession(state, sessionId, "stopped", nowMs);
}

export function completeSession(state: AppState, sessionId: string, nowMs = Date.now()): AppState {
  return closeSession(state, sessionId, "completed", nowMs);
}

export function reviewSession(
  state: AppState,
  sessionId: string,
  input: ReviewSessionInput,
  nowMs = Date.now(),
): AppState {
  const label = cleanLabel(input.label);
  if (!label || !isDirection(input.direction)) return state;
  if (input.linkedTaskId && !state.tasks.some((task) => task.id === input.linkedTaskId)) return state;
  const session = state.sessions.find((candidate) => candidate.id === sessionId);
  if (!session || (session.status !== "completed" && session.status !== "stopped")) return state;
  return {
    ...state,
    sessions: state.sessions.map((candidate) =>
      candidate.id === sessionId
        ? {
            ...candidate,
            label,
            direction: input.direction,
            linkedTaskId: input.linkedTaskId,
            linkedHabitId: undefined,
            linkedIntentId: undefined,
            reviewedAt: new Date(nowMs).toISOString(),
          }
        : candidate,
    ),
  };
}

export function getOpenSession(state: AppState): ActivitySession | undefined {
  return state.sessions.find((session) => session.status === "running" || session.status === "paused");
}

export function elapsedMs(session: ActivitySession, nowMs = Date.now()): number {
  if (session.status !== "running" || !session.lastResumedAt) {
    return session.actualElapsedMs ?? session.accumulatedElapsedMs;
  }
  const resumedAt = Date.parse(session.lastResumedAt);
  if (!Number.isFinite(resumedAt)) return session.accumulatedElapsedMs;
  return Math.max(0, session.accumulatedElapsedMs + nowMs - resumedAt);
}

export function remainingMs(session: ActivitySession, nowMs = Date.now()): number | undefined {
  if (session.mode !== "countdown" || !session.targetDurationMinutes) return undefined;
  return Math.max(0, session.targetDurationMinutes * 60_000 - elapsedMs(session, nowMs));
}

function closeSession(
  state: AppState,
  sessionId: string,
  outcome: "completed" | "stopped",
  nowMs: number,
): AppState {
  const session = state.sessions.find((candidate) => candidate.id === sessionId);
  if (!session || session.status === "completed" || session.status === "stopped") return state;
  const measured = elapsedMs(session, nowMs);
  const actualElapsedMs =
    outcome === "completed" && session.mode === "countdown" && session.targetDurationMinutes
      ? Math.min(measured, session.targetDurationMinutes * 60_000)
      : measured;
  const endedAt = new Date(nowMs).toISOString();
  const closedState: AppState = {
    ...state,
    sessions: state.sessions.map((candidate) =>
      candidate.id === sessionId
        ? {
            ...candidate,
            status: outcome,
            accumulatedElapsedMs: actualElapsedMs,
            actualElapsedMs,
            lastResumedAt: undefined,
            endedAt,
          }
        : candidate,
    ),
  };
  return addSessionReward(closedState, sessionId, actualElapsedMs, outcome, endedAt);
}

function addSessionReward(
  state: AppState,
  sessionId: string,
  actualElapsedMs: number,
  outcome: "completed" | "stopped",
  createdAt: string,
): AppState {
  const id = `session:${sessionId}:time`;
  const points = calculateSessionReward(actualElapsedMs, outcome);
  if (points === 0 || state.rewardEvents.some((event) => event.id === id)) return state;
  const date = new Date(createdAt);
  const dateKey = localDateKey(date);
  return {
    ...state,
    rewardEvents: [...state.rewardEvents, { id, source: "session", sourceId: sessionId, dateKey, points, createdAt }],
    progress: {
      ...state.progress,
      points: roundPoints(state.progress.points + points),
      activeDateKeys: [...new Set([...state.progress.activeDateKeys, dateKey])],
    },
  };
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function updateOpenSession(
  state: AppState,
  sessionId: string,
  update: (session: ActivitySession) => ActivitySession,
): AppState {
  const current = state.sessions.find((session) => session.id === sessionId);
  if (!current || current.status === "completed" || current.status === "stopped") return state;
  const next = update(current);
  if (next === current) return state;
  return { ...state, sessions: state.sessions.map((session) => (session.id === sessionId ? next : session)) };
}

function resolveLink(state: AppState, link: SessionLink): { valid: boolean; direction?: Direction; label?: string } {
  if (link.linkedTaskId) {
    const task = state.tasks.find((candidate) => candidate.id === link.linkedTaskId);
    return task ? { valid: true, direction: task.direction, label: task.title } : { valid: false };
  }
  if (link.linkedHabitId) {
    const habit = state.habits.find((candidate) => candidate.id === link.linkedHabitId);
    return habit ? { valid: true, direction: habit.direction, label: habit.title } : { valid: false };
  }
  if (link.linkedIntentId) {
    const intent = state.activityIntents.find((candidate) => candidate.id === link.linkedIntentId);
    return intent ? { valid: true, direction: intent.direction, label: intent.moveText } : { valid: false };
  }
  return { valid: true };
}

function hasMultipleLinks(link: SessionLink): boolean {
  return [link.linkedTaskId, link.linkedHabitId, link.linkedIntentId].filter(Boolean).length > 1;
}

function validDuration(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 720;
}

function cleanLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 160);
}

function makeSessionId(): string {
  return `session-${crypto.randomUUID()}`;
}
