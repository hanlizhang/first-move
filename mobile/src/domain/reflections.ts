import { isLocalDateKey } from "./dates.ts";
import type { AppState, JournalEntry, RewardEvent } from "./models.ts";

type Rating = 1 | 2 | 3 | 4 | 5;

export const REFLECTION_REWARD_POINTS = 2;

export interface ReflectionInput {
  mood?: Rating;
  energy?: Rating;
  whatHelped?: string;
  completed?: string;
  difficult?: string;
  nextStep?: string;
  freeText?: string;
}

export type ReflectionRewardAuthority = "guest-local" | "server-authoritative";

export interface ReflectionMutationOptions {
  rewardAuthority: ReflectionRewardAuthority;
  clock?: () => string;
  timezone?: string;
}

/**
 * Account snapshots contain only the Journal change. The existing cloud RPC
 * creates the first-save reward and returns the resulting canonical balance.
 * Guest workspaces have no server, so their non-authoritative local ledger
 * retains the existing Web first-save behavior.
 */
export function saveReflection(
  state: AppState,
  dateKey: string,
  input: ReflectionInput,
  options: ReflectionMutationOptions,
): AppState {
  const cleaned = cleanInput(input);
  if (!isLocalDateKey(dateKey) || !hasReflectionContent(cleaned)) return state;

  const timestamp = (options.clock ?? now)();
  const entry: JournalEntry = { dateKey, ...cleaned, updatedAt: timestamp };
  const withEntry: AppState = {
    ...state,
    journalEntries: [
      ...state.journalEntries.filter((candidate) => candidate.dateKey !== dateKey),
      entry,
    ],
  };
  if (options.rewardAuthority === "server-authoritative") return withEntry;

  const rewardId = `reflection:${dateKey}`;
  if (state.rewardEvents.some((event) => event.id === rewardId)) return withEntry;
  const reward: RewardEvent = {
    id: rewardId,
    source: "reflection",
    sourceId: dateKey,
    dateKey,
    timezone: options.timezone,
    points: REFLECTION_REWARD_POINTS,
    createdAt: timestamp,
  };
  return {
    ...withEntry,
    rewardEvents: [...state.rewardEvents, reward],
    progress: {
      ...state.progress,
      points: roundPoints(state.progress.points + REFLECTION_REWARD_POINTS),
      activeDateKeys: [...new Set([...state.progress.activeDateKeys, dateKey])].sort(),
      firstUseDate: state.progress.firstUseDate ?? dateKey,
      lastActiveDate:
        !state.progress.lastActiveDate || state.progress.lastActiveDate < dateKey
          ? dateKey
          : state.progress.lastActiveDate,
    },
  };
}

export function deleteReflection(state: AppState, dateKey: string): AppState {
  if (!state.journalEntries.some((entry) => entry.dateKey === dateKey)) return state;
  return {
    ...state,
    journalEntries: state.journalEntries.filter((entry) => entry.dateKey !== dateKey),
  };
}

export function hasReflectionContent(input: ReflectionInput): boolean {
  return Boolean(
    input.mood ||
      input.energy ||
      input.whatHelped ||
      input.completed ||
      input.difficult ||
      input.nextStep ||
      input.freeText,
  );
}

function cleanInput(input: ReflectionInput): ReflectionInput {
  return {
    mood: validRating(input.mood) ? input.mood : undefined,
    energy: validRating(input.energy) ? input.energy : undefined,
    whatHelped: cleanText(input.whatHelped),
    completed: cleanText(input.completed),
    difficult: cleanText(input.difficult),
    nextStep: cleanText(input.nextStep),
    freeText: cleanText(input.freeText),
  };
}

function cleanText(value: string | undefined): string | undefined {
  const cleaned = value?.trim().slice(0, 1_000);
  return cleaned || undefined;
}

function validRating(value: unknown): value is Rating {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
}

function roundPoints(value: number): number {
  return Math.round(value * 10) / 10;
}

function now(): string {
  return new Date().toISOString();
}
