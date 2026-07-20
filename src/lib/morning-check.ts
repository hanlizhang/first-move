import { isDateKey } from "./dates.ts";
import type { AppState, MorningCheck, RewardEvent } from "./models.ts";
import { syncProgress } from "./progress.ts";
import { MORNING_REWARD_POINTS, roundPoints } from "./rewards.ts";

export type VerificationResult = { outcome: "pass"; mode: "mock" | "live" } | { outcome: "fail"; message: string } | { outcome: "unavailable"; message: string };
export const MAX_MORNING_ATTEMPTS = 3;

export function morningVerificationMode(environment: Record<string, string | undefined> = process.env): "mock" | "live" {
  return environment.OPENAI_LIVE_VISION === "true" ? "live" : "mock";
}

export async function verifyToothbrushPhoto(image: Blob, mockOutcome: "pass" | "fail" = "pass", request: typeof fetch = fetch): Promise<VerificationResult> {
  try {
    const response = await request("/api/verify-toothbrush", { method: "POST", headers: { "Content-Type": image.type || "image/jpeg", "X-Mock-Outcome": mockOutcome }, body: image });
    const value = await response.json() as unknown;
    if (!response.ok || !isVerificationPayload(value)) return { outcome: "unavailable", message: response.status === 429 ? "You have used today’s three verification attempts. You can skip without a reward." : "Verification is unavailable right now. Retry manually or skip for today." };
    const mode = response.headers.get("x-verification-mode") === "live" ? "live" : "mock";
    return value.passed ? { outcome: "pass", mode } : { outcome: "fail", message: value.shortMessage };
  } catch {
    return { outcome: "unavailable", message: "Verification is unavailable right now. No retry was made. Retry manually or skip for today." };
  }
}

export function morningAttemptCount(state: AppState, dateKey: string): number { return state.morningAttempts.find((attempt) => attempt.dateKey === dateKey)?.count ?? 0; }

export function recordMorningAttempt(state: AppState, dateKey: string): AppState {
  if (!isDateKey(dateKey) || morningAttemptCount(state, dateKey) >= MAX_MORNING_ATTEMPTS || state.morningChecks.some((check) => check.dateKey === dateKey)) return state;
  const count = morningAttemptCount(state, dateKey) + 1;
  return { ...state, morningAttempts: [...state.morningAttempts.filter((attempt) => attempt.dateKey !== dateKey), { dateKey, count }] };
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

export function resetMorningCheck(state: AppState, dateKey: string): AppState {
  if (!isDateKey(dateKey)) return state;
  const rewardId = `morning:${dateKey}`;
  const reward = state.rewardEvents.find((event) => event.id === rewardId && event.source === "morning" && event.dateKey === dateKey);
  const hasCheck = state.morningChecks.some((check) => check.dateKey === dateKey);
  if (!hasCheck && !reward) return state;
  return syncProgress({
    ...state,
    morningChecks: state.morningChecks.filter((check) => check.dateKey !== dateKey),
    rewardEvents: state.rewardEvents.filter((event) => event !== reward),
    progress: reward ? { ...state.progress, points: roundPoints(Math.max(0, state.progress.points - reward.points)) } : state.progress,
  }, dateKey, false);
}

function isVerificationPayload(value: unknown): value is { passed: boolean; detectedObject: string; shortMessage: string } {
  return typeof value === "object" && value !== null && typeof (value as { passed?: unknown }).passed === "boolean" && typeof (value as { detectedObject?: unknown }).detectedObject === "string" && typeof (value as { shortMessage?: unknown }).shortMessage === "string";
}
