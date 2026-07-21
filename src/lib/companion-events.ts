import type { AppState } from "./models.ts";

export type CompanionReactionKind =
  | "morning"
  | "session-complete"
  | "session-stopped"
  | "task-complete"
  | "habit-complete"
  | "milestone";

export interface CompanionEvent {
  id: string;
  kind: CompanionReactionKind;
}

export interface CompanionReaction extends CompanionEvent {
  message: string;
  durationMs: number;
}

const REACTIONS: Record<CompanionReactionKind, Omit<CompanionReaction, "id" | "kind">> = {
  morning: { message: "Breakfast makes a gentle start.", durationMs: 4_500 },
  "session-complete": { message: "You started. That counts.", durationMs: 4_000 },
  "session-stopped": { message: "You chose when to stop.", durationMs: 4_000 },
  "task-complete": { message: "Nice work.", durationMs: 4_000 },
  "habit-complete": { message: "One more small step.", durationMs: 4_000 },
  milestone: { message: "A new adventure is opening up!", durationMs: 5_000 },
};

export function reactionFor(event: CompanionEvent): CompanionReaction {
  return { ...event, ...REACTIONS[event.kind] };
}

function addedValues(before: string[], after: string[]): string[] {
  const existing = new Set(before);
  return after.filter((value) => !existing.has(value));
}

export function companionEventsForTransition(before: AppState, after: AppState): CompanionEvent[] {
  const events: CompanionEvent[] = [];

  for (const check of after.morningChecks) {
    if (!before.morningChecks.some((current) => current.dateKey === check.dateKey)) {
      events.push({ id: `morning:${check.dateKey}`, kind: "morning" });
    }
  }
  for (const task of after.tasks) {
    const previous = before.tasks.find((current) => current.id === task.id);
    for (const dateKey of addedValues(previous?.completedOn ?? [], task.completedOn)) {
      events.push({ id: `task:${task.id}:${dateKey}`, kind: "task-complete" });
    }
  }
  for (const habit of after.habits) {
    const previous = before.habits.find((current) => current.id === habit.id);
    for (const dateKey of addedValues(previous?.completedOn ?? [], habit.completedOn)) {
      events.push({ id: `habit:${habit.id}:${dateKey}`, kind: "habit-complete" });
    }
  }
  for (const session of after.sessions) {
    const previous = before.sessions.find((current) => current.id === session.id);
    if (previous?.status !== session.status && session.status === "completed") {
      events.push({ id: `session:${session.id}:completed`, kind: "session-complete" });
    }
    if (previous?.status !== session.status && session.status === "stopped") {
      events.push({ id: `session:${session.id}:stopped`, kind: "session-stopped" });
    }
  }
  for (const day of after.progress.grantedMilestones) {
    if (!before.progress.grantedMilestones.includes(day)) {
      events.push({ id: `milestone:${day}`, kind: "milestone" });
    }
  }
  return events;
}

interface ControllerOptions {
  setTimer: (callback: () => void, delayMs: number) => number;
  clearTimer: (timerId: number) => void;
  onReaction: (reaction: CompanionReaction | undefined) => void;
}

export function createCompanionEventController(options: ControllerOptions) {
  const seen = new Set<string>();
  const queue: CompanionEvent[] = [];
  let timerId: number | undefined;
  let disposed = false;

  const playNext = () => {
    if (disposed) return;
    const event = queue.shift();
    if (!event) {
      timerId = undefined;
      options.onReaction(undefined);
      return;
    }
    const reaction = reactionFor(event);
    options.onReaction(reaction);
    timerId = options.setTimer(playNext, reaction.durationMs);
  };

  return {
    enqueue(events: CompanionEvent[]) {
      for (const event of events) {
        if (seen.has(event.id)) continue;
        seen.add(event.id);
        queue.push(event);
      }
      if (timerId === undefined && queue.length > 0) playNext();
    },
    dispose() {
      disposed = true;
      queue.length = 0;
      if (timerId !== undefined) options.clearTimer(timerId);
      timerId = undefined;
    },
  };
}

export function companionIdleAction(action: "walk" | "sleep" | "blink", focusActive: boolean) {
  return focusActive && action === "walk" ? "sleep" : action;
}

export function shouldShowCompanion(view: string): boolean {
  return view !== "cat";
}
