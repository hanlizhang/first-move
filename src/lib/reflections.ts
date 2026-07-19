import { isDateKey } from "./dates.ts";
import type { AppState, JournalEntry, RewardEvent } from "./models.ts";
import { syncProgress } from "./progress.ts";
import { REFLECTION_REWARD_POINTS } from "./rewards.ts";

type Rating = 1 | 2 | 3 | 4 | 5;

export interface ReflectionInput {
  mood?: Rating;
  energy?: Rating;
  completed?: string;
  difficult?: string;
  nextStep?: string;
  freeText?: string;
}

export function saveReflection(
  state: AppState,
  dateKey: string,
  input: ReflectionInput,
  clock: () => string = () => new Date().toISOString(),
): AppState {
  const cleaned = cleanInput(input);
  if (!isDateKey(dateKey) || !hasReflectionContent(cleaned)) return state;
  const entry: JournalEntry = { dateKey, ...cleaned, updatedAt: clock() };
  const rewardId = `reflection:${dateKey}`;
  const hasReward = state.rewardEvents.some((event) => event.id === rewardId);
  const reward: RewardEvent = {
    id: rewardId,
    source: "reflection",
    sourceId: dateKey,
    dateKey,
    points: REFLECTION_REWARD_POINTS,
    createdAt: entry.updatedAt,
  };
  return syncProgress({
    ...state,
    journalEntries: [...state.journalEntries.filter((candidate) => candidate.dateKey !== dateKey), entry],
    rewardEvents: hasReward ? state.rewardEvents : [...state.rewardEvents, reward],
    progress: hasReward ? state.progress : { ...state.progress, points: state.progress.points + REFLECTION_REWARD_POINTS },
  }, dateKey, true);
}

export function deleteReflection(state: AppState, dateKey: string): AppState {
  if (!state.journalEntries.some((entry) => entry.dateKey === dateKey)) return state;
  return syncProgress({
    ...state,
    journalEntries: state.journalEntries.filter((entry) => entry.dateKey !== dateKey),
  }, dateKey, true);
}

export function hasReflectionContent(input: ReflectionInput): boolean {
  return Boolean(input.mood || input.energy || input.completed || input.difficult || input.nextStep || input.freeText);
}

function cleanInput(input: ReflectionInput): ReflectionInput {
  return {
    mood: validRating(input.mood) ? input.mood : undefined,
    energy: validRating(input.energy) ? input.energy : undefined,
    completed: cleanText(input.completed),
    difficult: cleanText(input.difficult),
    nextStep: cleanText(input.nextStep),
    freeText: cleanText(input.freeText),
  };
}

function cleanText(value: string | undefined): string | undefined {
  const cleaned = value?.trim().slice(0, 1000);
  return cleaned || undefined;
}

function validRating(value: unknown): value is Rating {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
}
