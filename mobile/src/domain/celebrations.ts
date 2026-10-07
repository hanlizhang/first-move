import { catGrowthStory } from "./cat.ts";
import { CAT_CATALOG, type CatItemId } from "./cat-items.ts";
import type {
  ActivitySession,
  AppState,
  RewardEvent,
  RewardSource,
} from "./models.ts";

export type CelebrationLevel = 1 | 2 | 3;
export type CelebrationKind =
  | "points"
  | "active-day"
  | "milestone"
  | "focus-completion";

export interface CelebrationMilestone {
  chapter: string;
  day: number;
  reward: string;
  unlockedItemIds: CatItemId[];
}

export interface CelebrationFocus {
  durationMs: number;
  label: string;
  linkedFirstMove: boolean;
  outcome: "completed" | "stopped";
}

export interface CelebrationEvent {
  accessibleLabel: string;
  id: string;
  kind: CelebrationKind;
  level: CelebrationLevel;
  points?: number;
  activeDayDelta?: number;
  activeDayTotal?: number;
  milestone?: CelebrationMilestone;
  focus?: CelebrationFocus;
  priority: number;
  sourceKey: string;
  sourceLabel: string;
}

export interface CelebrationQueueState {
  current?: CelebrationEvent;
  ownerKey?: string;
  pending: CelebrationEvent[];
  seenIds: string[];
  completedSources: Partial<Record<string, CelebrationLevel>>;
}

export function createCelebrationQueueState(ownerKey?: string): CelebrationQueueState {
  return { ownerKey, pending: [], seenIds: [], completedSources: {} };
}

export function setCelebrationQueueOwner(
  state: CelebrationQueueState,
  ownerKey?: string,
): CelebrationQueueState {
  return state.ownerKey === ownerKey ? state : createCelebrationQueueState(ownerKey);
}

export function enqueueCelebrations(
  state: CelebrationQueueState,
  events: readonly CelebrationEvent[],
): CelebrationQueueState {
  const seenIds = new Set([
    ...state.seenIds,
    ...(state.current ? [state.current.id] : []),
    ...state.pending.map((event) => event.id),
  ]);
  let current = state.current;
  const pending = [...state.pending];
  let changed = false;

  for (const event of events) {
    if (seenIds.has(event.id)) continue;

    if (current && celebrationsShareSource(current.sourceKey, event.sourceKey)) {
      current = mergeCelebrationEvents(current, event);
      seenIds.add(event.id);
      changed = true;
      continue;
    }

    const pendingIndex = pending.findIndex(
      (candidate) => celebrationsShareSource(candidate.sourceKey, event.sourceKey),
    );
    if (pendingIndex >= 0) {
      pending[pendingIndex] = mergeCelebrationEvents(
        pending[pendingIndex]!,
        event,
      );
      seenIds.add(event.id);
      changed = true;
      continue;
    }

    const completedLevel = Object.entries(state.completedSources).reduce<
      CelebrationLevel | undefined
    >((highest, [sourceKey, level]) => {
      if (!level || !celebrationsShareSource(sourceKey, event.sourceKey)) {
        return highest;
      }
      return Math.max(highest ?? 0, level) as CelebrationLevel;
    }, undefined);
    seenIds.add(event.id);
    changed = true;
    if (completedLevel !== undefined && completedLevel >= event.level) continue;
    pending.push(event);
  }

  if (!changed) return state;
  const ordered = pending.sort(
    (left, right) => right.priority - left.priority,
  );
  if (current) {
    return { ...state, current, pending: ordered, seenIds: [...seenIds] };
  }
  const [nextCurrent, ...nextPending] = ordered;
  return {
    ...state,
    current: nextCurrent,
    pending: nextPending,
    seenIds: [...seenIds],
  };
}

function celebrationsShareSource(left: string, right: string): boolean {
  if (left === right) return true;
  const leftSessionIds = sessionSourceIds(left);
  if (leftSessionIds.length === 0) return false;
  const rightSessionIds = new Set(sessionSourceIds(right));
  return leftSessionIds.some((sessionId) => rightSessionIds.has(sessionId));
}

function sessionSourceIds(sourceKey: string): string[] {
  return sourceKey
    .split("|")
    .map((source) => /^session:([^:]+):/.exec(source)?.[1])
    .filter((sessionId): sessionId is string => Boolean(sessionId));
}

export function dismissCurrentCelebration(
  state: CelebrationQueueState,
): CelebrationQueueState {
  const [current, ...pending] = state.pending;
  const completedSources = state.current
    ? {
        ...state.completedSources,
        [state.current.sourceKey]: Math.max(
          state.completedSources[state.current.sourceKey] ?? 0,
          state.current.level,
        ) as CelebrationLevel,
      }
    : state.completedSources;
  return { ...state, current, pending, completedSources };
}

export function focusCompletionCelebration(
  session: ActivitySession,
): CelebrationEvent | undefined {
  if (session.status !== "completed" && session.status !== "stopped") {
    return undefined;
  }
  const dateKey =
    session.localDate ??
    session.endedAt?.slice(0, 10) ??
    session.startedAt.slice(0, 10);
  const sourceKey = `session:${session.id}:${dateKey}`;
  const focus: CelebrationFocus = {
    durationMs: Math.max(0, session.actualElapsedMs ?? session.accumulatedElapsedMs),
    label: session.label,
    linkedFirstMove: Boolean(session.linkedIntentId),
    outcome: session.status,
  };
  const sourceLabel = session.status === "completed" ? "Focus complete" : "Focus saved";
  const event: CelebrationEvent = {
    accessibleLabel: "",
    focus,
    id: `celebration:${sourceKey}:focus-completion`,
    kind: "focus-completion",
    level: 2,
    priority: 210,
    sourceKey,
    sourceLabel,
  };
  return { ...event, accessibleLabel: celebrationAccessibleLabel(event) };
}

export function deriveCelebrations(
  before: AppState,
  after: AppState,
): CelebrationEvent[] {
  if (before === after) return [];

  const beforeRewardIds = new Set(before.rewardEvents.map((event) => event.id));
  const positiveRewards = after.rewardEvents.filter(
    (event) =>
      !beforeRewardIds.has(event.id) &&
      event.source !== "store" &&
      Number.isFinite(event.points) &&
      event.points > 0,
  );
  const points = roundPoints(
    positiveRewards.reduce((total, event) => total + event.points, 0),
  );
  const activeDayDelta = Math.max(
    0,
    after.progress.totalActiveDays - before.progress.totalActiveDays,
  );
  const milestone = deriveMilestone(before, after);

  if (points <= 0 && activeDayDelta <= 0 && !milestone) return [];

  const sourceKey = celebrationSourceKey(
    positiveRewards,
    after.progress.totalActiveDays,
    milestone?.day,
  );
  const sourceLabel = rewardSourceLabel(positiveRewards);
  const level: CelebrationLevel = milestone ? 3 : activeDayDelta > 0 ? 2 : 1;
  const kind: CelebrationKind = milestone
    ? "milestone"
    : activeDayDelta > 0
      ? "active-day"
      : "points";
  const event: CelebrationEvent = {
    accessibleLabel: "",
    id: `celebration:${sourceKey}:${kind}:${after.progress.totalActiveDays}`,
    kind,
    level,
    ...(points > 0 ? { points } : {}),
    ...(activeDayDelta > 0
      ? { activeDayDelta, activeDayTotal: after.progress.totalActiveDays }
      : {}),
    ...(milestone ? { milestone } : {}),
    priority: level * 100,
    sourceKey,
    sourceLabel,
  };
  return [{ ...event, accessibleLabel: celebrationAccessibleLabel(event) }];
}

export function celebrationPreviewEvent(
  kind:
    | "points"
    | "active-day"
    | "milestone"
    | "combined"
    | "focus-completed"
    | "focus-stopped",
): CelebrationEvent {
  if (kind === "points") {
    return {
      accessibleLabel: "Task complete. Plus 5 points.",
      id: "qa:points",
      kind: "points",
      level: 1,
      points: 5,
      priority: 100,
      sourceKey: "qa:points",
      sourceLabel: "Task complete",
    };
  }
  if (kind === "active-day") {
    return {
      accessibleLabel: "You showed up today. Active Day plus 1. Plus 5 points.",
      id: "qa:active-day",
      kind: "active-day",
      level: 2,
      points: 5,
      activeDayDelta: 1,
      activeDayTotal: 22,
      priority: 200,
      sourceKey: "qa:active-day",
      sourceLabel: "Progress saved",
    };
  }
  if (kind === "focus-completed" || kind === "focus-stopped") {
    return focusCompletionCelebration({
      id: `qa-${kind}`,
      mode: kind === "focus-completed" ? "countdown" : "stopwatch",
      direction: "Work & Study",
      label: kind === "focus-completed" ? "Focus time" : "Intentional focus",
      status: kind === "focus-completed" ? "completed" : "stopped",
      startedAt: "2026-10-05T11:55:00.000Z",
      localDate: "2026-10-05",
      accumulatedElapsedMs: kind === "focus-completed" ? 300_000 : 150_000,
      actualElapsedMs: kind === "focus-completed" ? 300_000 : 150_000,
      endedAt: "2026-10-05T12:00:00.000Z",
    })!;
  }
  const combined = kind === "combined";
  return {
    accessibleLabel: `Day 35. Curious kitten. Cat food unlocked.${
      combined ? " Active Day plus 1. Plus 10 points." : ""
    }`,
    id: combined ? "qa:combined" : "qa:milestone",
    kind: "milestone",
    level: 3,
    points: combined ? 10 : undefined,
    activeDayDelta: combined ? 1 : undefined,
    activeDayTotal: 35,
    milestone: {
      chapter: "Curious kitten",
      day: 35,
      reward: "Cat food unlocked",
      unlockedItemIds: ["cat-food"],
    },
    priority: 300,
    sourceKey: combined ? "qa:combined" : "qa:milestone",
    sourceLabel: "Cat Room milestone",
  };
}

function mergeCelebrationEvents(
  existing: CelebrationEvent,
  incoming: CelebrationEvent,
): CelebrationEvent {
  const milestone = incoming.milestone ?? existing.milestone;
  const focus = incoming.focus ?? existing.focus;
  const activeDayDelta = incoming.activeDayDelta ?? existing.activeDayDelta;
  const activeDayTotal = incoming.activeDayTotal ?? existing.activeDayTotal;
  const points = incoming.points ?? existing.points;
  const level: CelebrationLevel = milestone ? 3 : activeDayDelta || focus ? 2 : 1;
  const kind: CelebrationKind = milestone
    ? "milestone"
    : activeDayDelta
      ? "active-day"
      : focus
        ? "focus-completion"
        : "points";
  const dominant = incoming.priority >= existing.priority ? incoming : existing;
  const merged: CelebrationEvent = {
    accessibleLabel: "",
    // The current event ID is also the renderer's presentation identity. Keep it
    // stable while later canonical rewards enrich the same logical source so a
    // single completion cannot restart its already-visible celebration.
    id: existing.id,
    kind,
    level,
    ...(points !== undefined ? { points } : {}),
    ...(activeDayDelta !== undefined ? { activeDayDelta } : {}),
    ...(activeDayTotal !== undefined ? { activeDayTotal } : {}),
    ...(milestone ? { milestone } : {}),
    ...(focus ? { focus } : {}),
    priority: Math.max(existing.priority, incoming.priority, level * 100),
    sourceKey: existing.sourceKey,
    sourceLabel: dominant.sourceLabel,
  };
  return { ...merged, accessibleLabel: celebrationAccessibleLabel(merged) };
}

function celebrationAccessibleLabel(event: CelebrationEvent): string {
  const focusCopy = event.focus
    ? event.focus.linkedFirstMove
      ? event.focus.outcome === "completed"
        ? `You made the first move. ${event.focus.label}. Focus saved.`
        : `You stopped when you chose. Your time is saved. ${event.focus.label}.`
      : event.focus.outcome === "completed"
        ? "Session complete. Focus saved."
        : "You stopped intentionally. Focus saved."
    : undefined;
  const activeDayCopy = event.activeDayDelta
    ? `Active Day +${event.activeDayDelta}.`
    : undefined;
  const pointsCopy = event.points
    ? `${formatPositivePoints(event.points)}.`
    : undefined;
  if (event.milestone) {
    return [
      focusCopy,
      `Day ${event.milestone.day}.`,
      `${event.milestone.chapter}.`,
      `${event.milestone.reward}.`,
      activeDayCopy,
      pointsCopy,
    ].filter(Boolean).join(" ");
  }
  if (event.activeDayDelta) {
    return [
      focusCopy,
      "You showed up today.",
      activeDayCopy,
      pointsCopy,
    ].filter(Boolean).join(" ");
  }
  if (event.focus) {
    return [focusCopy, formatFocusDuration(event.focus.durationMs), pointsCopy]
      .filter(Boolean)
      .join(" ");
  }
  return `${event.sourceLabel}. ${pointsCopy}`;
}

export function formatFocusDuration(durationMs: number): string {
  const minutes = Math.max(1, Math.round(durationMs / 60_000));
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"} saved.`;
}

export function formatPositivePoints(points: number): string {
  const value = Number.isInteger(points) ? String(points) : points.toFixed(1);
  return `+${value} ${points === 1 ? "point" : "points"}`;
}

function deriveMilestone(
  before: AppState,
  after: AppState,
): CelebrationMilestone | undefined {
  const beforeDays = before.progress.totalActiveDays;
  const afterDays = after.progress.totalActiveDays;
  const newMilestoneDays = uniqueNumbers([
    ...newValues(before.progress.unlockedMilestones, after.progress.unlockedMilestones),
    ...newValues(before.progress.grantedMilestones, after.progress.grantedMilestones),
  ]);
  const newlyUnlocked = afterDays > beforeDays
    ? CAT_CATALOG.filter(
        (item) => item.active && item.unlockActiveDays > beforeDays && item.unlockActiveDays <= afterDays,
      )
    : [];
  const newlyGrantedMilestoneItems = CAT_CATALOG.filter(
    (item) =>
      item.milestoneOnly &&
      inventoryQuantity(before, item.id) < 1 &&
      inventoryQuantity(after, item.id) > 0,
  );
  const unlockedItems = uniqueItems([...newlyUnlocked, ...newlyGrantedMilestoneItems]);
  const milestoneDay = Math.max(
    0,
    ...newMilestoneDays,
    ...unlockedItems.map((item) => item.unlockActiveDays),
  );
  if (milestoneDay < 1) return undefined;

  const previousChapter = catGrowthStory(beforeDays).title;
  const nextChapter = catGrowthStory(afterDays).title;
  const itemNames = unlockedItems.map((item) => item.name);
  return {
    chapter:
      previousChapter !== nextChapter
        ? nextChapter
        : "Something new for your kitten",
    day: milestoneDay,
    reward:
      itemNames.length > 0
        ? `${formatList(itemNames)} unlocked`
        : "Active Day milestone reached",
    unlockedItemIds: unlockedItems.map((item) => item.id),
  };
}

function celebrationSourceKey(
  rewards: readonly RewardEvent[],
  activeDayTotal: number,
  milestoneDay?: number,
): string {
  if (rewards.length > 0) {
    return rewards
      .map((reward) => `${reward.source}:${reward.sourceId}:${reward.dateKey}`)
      .sort()
      .join("|");
  }
  if (milestoneDay) return `milestone:${milestoneDay}`;
  return `active-day:${activeDayTotal}`;
}

function rewardSourceLabel(rewards: readonly RewardEvent[]): string {
  const sources = [...new Set(rewards.map((reward) => reward.source))];
  if (sources.length !== 1) return "Progress saved";
  return SOURCE_LABELS[sources[0]!] ?? "Progress saved";
}

const SOURCE_LABELS: Readonly<Partial<Record<RewardSource, string>>> = {
  task: "Task complete",
  habit: "Habit checked",
  session: "Focus complete",
  morning: "Morning Start complete",
  reflection: "Reflection saved",
};

function inventoryQuantity(state: AppState, itemId: CatItemId): number {
  return state.inventory.items.find((entry) => entry.itemId === itemId)?.quantity ?? 0;
}

function newValues<T>(before: readonly T[], after: readonly T[]): T[] {
  const previous = new Set(before);
  return after.filter((value) => !previous.has(value));
}

function uniqueNumbers(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function uniqueItems<T extends { id: string }>(values: readonly T[]): T[] {
  return [...new Map(values.map((value) => [value.id, value])).values()];
}

function formatList(values: readonly string[]): string {
  if (values.length < 2) return values[0] ?? "Cat milestone";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function roundPoints(value: number): number {
  return Math.round(value * 10) / 10;
}
