import {
  isIntendedDuration,
  type ActivitySession,
  type AppState,
} from "./models.ts";

type IdFactory = () => string;

export function startCountdownFromIntent(
  state: AppState,
  intentId: string,
  nowMs = Date.now(),
  idFactory: IdFactory = makeSessionId,
): AppState {
  if (getOpenSession(state)) return state;
  const intent = state.activityIntents.find(
    (candidate) => candidate.id === intentId && candidate.status === "pending",
  );
  if (!intent || !isIntendedDuration(intent.intendedDurationMinutes)) return state;

  const timestamp = new Date(nowMs).toISOString();
  const session: ActivitySession = {
    id: idFactory(),
    mode: "countdown",
    direction: intent.direction,
    label: intent.moveText,
    targetDurationMinutes: intent.intendedDurationMinutes,
    linkedIntentId: intent.id,
    status: "running",
    startedAt: timestamp,
    lastResumedAt: timestamp,
    accumulatedElapsedMs: 0,
  };
  return { ...state, sessions: [...state.sessions, session] };
}

export function pauseSession(
  state: AppState,
  sessionId: string,
  nowMs = Date.now(),
): AppState {
  const completed = completeSessionIfElapsed(state, sessionId, nowMs);
  if (completed !== state) return completed;
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

export function resumeSession(
  state: AppState,
  sessionId: string,
  nowMs = Date.now(),
): AppState {
  return updateOpenSession(state, sessionId, (session) => {
    if (session.status !== "paused") return session;
    return {
      ...session,
      status: "running",
      lastResumedAt: new Date(nowMs).toISOString(),
    };
  });
}

export function stopSession(
  state: AppState,
  sessionId: string,
  nowMs = Date.now(),
): AppState {
  const completed = completeSessionIfElapsed(state, sessionId, nowMs);
  return completed !== state
    ? completed
    : closeSession(state, sessionId, "stopped", nowMs);
}

export function cancelSession(
  state: AppState,
  sessionId: string,
  nowMs = Date.now(),
): AppState {
  const completed = completeSessionIfElapsed(state, sessionId, nowMs);
  if (completed !== state) return completed;
  const session = getOpenSession(state);
  if (!session || session.id !== sessionId) return state;
  return {
    ...state,
    sessions: state.sessions.filter((candidate) => candidate.id !== sessionId),
  };
}

export function completeSessionIfElapsed(
  state: AppState,
  sessionId: string,
  nowMs = Date.now(),
): AppState {
  const session = state.sessions.find((candidate) => candidate.id === sessionId);
  if (
    !session ||
    session.status === "completed" ||
    session.status === "stopped" ||
    session.mode !== "countdown" ||
    remainingMs(session, nowMs) !== 0
  ) {
    return state;
  }
  return closeSession(state, sessionId, "completed", nowMs);
}

export function reconcileRunningCountdown(
  state: AppState,
  nowMs = Date.now(),
): AppState {
  const session = getOpenSession(state);
  return session ? completeSessionIfElapsed(state, session.id, nowMs) : state;
}

export function getOpenSession(state: AppState): ActivitySession | undefined {
  return state.sessions.find(
    (session) => session.status === "running" || session.status === "paused",
  );
}

export function getLatestClosedSession(
  state: AppState,
  linkedIntentId?: string,
): ActivitySession | undefined {
  return [...state.sessions].reverse().find(
    (session) =>
      (session.status === "completed" || session.status === "stopped") &&
      (linkedIntentId === undefined || session.linkedIntentId === linkedIntentId),
  );
}

export function elapsedMs(
  session: ActivitySession,
  nowMs = Date.now(),
): number {
  if (session.status !== "running" || !session.lastResumedAt) {
    return session.actualElapsedMs ?? session.accumulatedElapsedMs;
  }
  const resumedAt = Date.parse(session.lastResumedAt);
  if (!Number.isFinite(resumedAt)) return session.accumulatedElapsedMs;
  return Math.max(0, session.accumulatedElapsedMs + nowMs - resumedAt);
}

export function remainingMs(
  session: ActivitySession,
  nowMs = Date.now(),
): number | undefined {
  if (session.mode !== "countdown" || !session.targetDurationMinutes) {
    return undefined;
  }
  return Math.max(
    0,
    session.targetDurationMinutes * 60_000 - elapsedMs(session, nowMs),
  );
}

function closeSession(
  state: AppState,
  sessionId: string,
  outcome: "completed" | "stopped",
  nowMs: number,
): AppState {
  const session = state.sessions.find((candidate) => candidate.id === sessionId);
  if (!session || session.status === "completed" || session.status === "stopped") {
    return state;
  }
  const measured = elapsedMs(session, nowMs);
  const actualElapsedMs =
    outcome === "completed" &&
    session.mode === "countdown" &&
    session.targetDurationMinutes
      ? Math.min(measured, session.targetDurationMinutes * 60_000)
      : measured;
  return {
    ...state,
    sessions: state.sessions.map((candidate) =>
      candidate.id === sessionId
        ? {
            ...candidate,
            status: outcome,
            accumulatedElapsedMs: actualElapsedMs,
            actualElapsedMs,
            lastResumedAt: undefined,
            endedAt: new Date(nowMs).toISOString(),
          }
        : candidate,
    ),
  };
}

function updateOpenSession(
  state: AppState,
  sessionId: string,
  update: (session: ActivitySession) => ActivitySession,
): AppState {
  const current = state.sessions.find((session) => session.id === sessionId);
  if (!current || current.status === "completed" || current.status === "stopped") {
    return state;
  }
  const next = update(current);
  if (next === current) return state;
  return {
    ...state,
    sessions: state.sessions.map((session) =>
      session.id === sessionId ? next : session,
    ),
  };
}

function makeSessionId(): string {
  const cryptoValue = (
    globalThis as typeof globalThis & {
      crypto?: { randomUUID?: () => string };
    }
  ).crypto;
  return (
    cryptoValue?.randomUUID?.() ??
    `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
  );
}
