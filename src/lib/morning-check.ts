import { isDateKey } from "./dates.ts";
import type { AppState, MorningCheck, RewardEvent } from "./models.ts";
import { syncProgress } from "./progress.ts";
import { MORNING_REWARD_POINTS, roundPoints } from "./rewards.ts";

export type VerificationResult = { outcome: "pass" } | { outcome: "fail"; message: string } | { outcome: "unavailable"; message: string };

export function morningVerificationMode(environment: Record<string, string | undefined> = process.env): "mock" | "live" {
  return environment.OPENAI_LIVE_VISION === "true" ? "live" : "mock";
}

export async function verifyToothbrushPhoto(_image: Blob, mockOutcome: "pass" | "fail" = "pass", environment: Record<string, string | undefined> = process.env): Promise<VerificationResult> {
  if (morningVerificationMode(environment) === "live") {
    return { outcome: "unavailable", message: "Live vision is not connected yet. Retry in mock mode or skip for today." };
  }
  await Promise.resolve();
  return mockOutcome === "pass" ? { outcome: "pass" } : { outcome: "fail", message: "The mock check did not find a toothbrush. Retake the photo or skip without a reward." };
}

export function completeMorningCheck(
  state: AppState,
  dateKey: string,
  captureMethod: MorningCheck["captureMethod"],
  verifierMode: MorningCheck["verifierMode"] = "mock",
  clock: () => string = () => new Date().toISOString(),
): AppState {
  if (!isDateKey(dateKey) || state.morningChecks.some((check) => check.dateKey === dateKey)) return state;
  const verifiedAt = clock();
  const check: MorningCheck = { dateKey, verifiedAt, captureMethod, verifierMode };
  const reward: RewardEvent = { id: `morning:${dateKey}`, source: "morning", sourceId: dateKey, dateKey, points: MORNING_REWARD_POINTS, createdAt: verifiedAt };
  const alreadyRewarded = state.rewardEvents.some((event) => event.id === reward.id);
  return syncProgress({
    ...state,
    morningChecks: [...state.morningChecks, check],
    rewardEvents: alreadyRewarded ? state.rewardEvents : [...state.rewardEvents, reward],
    progress: alreadyRewarded ? state.progress : { ...state.progress, points: roundPoints(state.progress.points + MORNING_REWARD_POINTS) },
  }, dateKey, true);
}
