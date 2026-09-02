import {
  isDirection,
  isFocusDuration,
  isIntendedDuration,
  type ActivitySession,
  type AppState,
  type Direction,
} from "./models.ts";

type IdFactory = () => string;

interface SessionLink {
  linkedTaskId?: string;
  linkedHabitId?: string;
  linkedIntentId?: string;
}

export interface SessionReference {
  id: string;
  title: string;
  direction: Direction;
}

export interface SessionReferenceCatalog {
  tasks?: readonly SessionReference[];
  habits?: readonly SessionReference[];
}

export interface StartCountdownInput extends SessionLink {
  direction?: Direction;
  label?: string;
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
  linkedHabitId?: string;
}

export function startCountdown(
  state: AppState,
  input: StartCountdownInput,
  nowMs = Date.now(),
  idFactory: IdFactory = makeSessionId,
  references: SessionReferenceCatalog = {},
): AppState {
  if (
    getOpenSession(state) ||
    !isFocusDuration(input.durationMinutes) ||
    hasMultipleLinks(input)
  ) {
    return state;
  }
  const linked = resolveLink(state, input, references);
  if (!linked.valid) return state;
  const direction = input.direction ?? linked.direction;
  if (!direction || !isDirection(direction)) return state;

  return appendSession(
    state,
    {
      id: idFactory(),
      mode: "countdown",
      direction,
      label: cleanLabel(input.label) || cleanLabel(linked.label) || "Focus time",
      targetDurationMinutes: input.durationMinutes,
      ...(input.linkedTaskId ? { linkedTaskId: input.linkedTaskId } : {}),
      ...(input.linkedHabitId ? { linkedHabitId: input.linkedHabitId } : {}),
      ...(input.linkedIntentId ? { linkedIntentId: input.linkedIntentId } : {}),
    },
    nowMs,
  );
}

export function startStopwatch(
  state: AppState,
  input: StartStopwatchInput,
  nowMs = Date.now(),
  idFactory: IdFactory = makeSessionId,
  references: SessionReferenceCatalog = {},
): AppState {
  if (getOpenSession(state) || hasMultipleLinks(input)) return state;
  const linked = resolveLink(state, input, references);
  if (!linked.valid) return state;
  const direction = input.direction ?? linked.direction;
  if (!direction || !isDirection(direction)) return state;

  return appendSession(
    state,
    {
      id: idFactory(),
      mode: "stopwatch",
      direction,
      label: cleanLabel(input.label) || cleanLabel(linked.label) || "Tracked time",
      ...(input.linkedTaskId ? { linkedTaskId: input.linkedTaskId } : {}),
      ...(input.linkedHabitId ? { linkedHabitId: input.linkedHabitId } : {}),
      ...(input.linkedIntentId ? { linkedIntentId: input.linkedIntentId } : {}),
    },
    nowMs,
  );
}

export function startCountdownFromIntent(
  state: AppState,
  intentId: string,
  nowMs = Date.now(),
  idFactory: IdFactory = makeSessionId,
): AppState {
  const intent = state.activityIntents.find(
    (candidate) => candidate.id === intentId && candidate.status === "pending",
  );
  if (!intent || !isIntendedDuration(intent.intendedDurationMinutes)) return state;
  return startCountdown(
    state,
    {
      durationMinutes: intent.intendedDurationMinutes,
      linkedIntentId: intent.id,
    },
    nowMs,
    idFactory,
  );
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
  _nowMs = Date.now(),
): AppState {
  // Product cancellation always removes an open record, even if the UI has not
  // yet reconciled a countdown whose wall-clock target just passed.
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

export function reviewSession(
  state: AppState,
  sessionId: string,
  input: ReviewSessionInput,
  nowMs = Date.now(),
  references: SessionReferenceCatalog = {},
): AppState {
  const label = cleanLabel(input.label);
  if (!label || !isDirection(input.direction)) return state;
  if (input.linkedTaskId && input.linkedHabitId) return state;
  const session = state.sessions.find((candidate) => candidate.id === sessionId);
  if (!session || (session.status !== "completed" && session.status !== "stopped")) {
    return state;
  }
  if (session.linkedIntentId && (input.linkedTaskId || input.linkedHabitId)) {
    return state;
  }

  const preservesUnavailableLink =
    input.linkedTaskId === session.linkedTaskId &&
    input.linkedHabitId === session.linkedHabitId;
  if (!session.linkedIntentId && !preservesUnavailableLink) {
    const linked = resolveLink(state, input, references);
    if (!linked.valid) return state;
  }

  return {
    ...state,
    sessions: state.sessions.map((candidate) =>
      candidate.id === sessionId
        ? {
            ...candidate,
            label,
            direction: input.direction,
            linkedTaskId: session.linkedIntentId
              ? undefined
              : input.linkedTaskId,
            linkedHabitId: session.linkedIntentId
              ? undefined
              : input.linkedHabitId,
            linkedIntentId: session.linkedIntentId,
            reviewedAt: new Date(nowMs).toISOString(),
          }
        : candidate,
    ),
  };
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

function appendSession(
  state: AppState,
  input: Pick<
    ActivitySession,
    | "id"
    | "mode"
    | "direction"
    | "label"
    | "targetDurationMinutes"
    | "linkedTaskId"
    | "linkedHabitId"
    | "linkedIntentId"
  >,
  nowMs: number,
): AppState {
  const timestamp = new Date(nowMs).toISOString();
  const session: ActivitySession = {
    ...input,
    status: "running",
    startedAt: timestamp,
    lastResumedAt: timestamp,
    accumulatedElapsedMs: 0,
  };
  return { ...state, sessions: [...state.sessions, session] };
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
            endedAt: new Date(nowMs).toISOString(),
          }
        : candidate,
    ),
  };
  if (!session.linkedIntentId) return closedState;
  return {
    ...closedState,
    activityIntents: closedState.activityIntents.map((intent) =>
      intent.id === session.linkedIntentId && intent.status === "pending"
        ? { ...intent, status: "consumed" }
        : intent,
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

function resolveLink(
  state: AppState,
  link: SessionLink,
  references: SessionReferenceCatalog,
): { valid: boolean; direction?: Direction; label?: string } {
  if (link.linkedTaskId) {
    const task = [...state.tasks, ...(references.tasks ?? [])].find(
      (candidate) => candidate.id === link.linkedTaskId,
    );
    return task
      ? { valid: true, direction: task.direction, label: task.title }
      : { valid: false };
  }
  if (link.linkedHabitId) {
    const habit = [...state.habits, ...(references.habits ?? [])].find(
      (candidate) => candidate.id === link.linkedHabitId,
    );
    return habit
      ? { valid: true, direction: habit.direction, label: habit.title }
      : { valid: false };
  }
  if (link.linkedIntentId) {
    const intent = state.activityIntents.find(
      (candidate) =>
        candidate.id === link.linkedIntentId && candidate.status === "pending",
    );
    return intent
      ? { valid: true, direction: intent.direction, label: intent.moveText }
      : { valid: false };
  }
  return { valid: true };
}

function hasMultipleLinks(link: SessionLink): boolean {
  return [link.linkedTaskId, link.linkedHabitId, link.linkedIntentId].filter(Boolean)
    .length > 1;
}

function cleanLabel(value?: string): string {
  return (value ?? "").trim().replace(/\s+/g, " ").slice(0, 160);
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
