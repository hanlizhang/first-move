import type { SessionStatus } from "./models.ts";

export const TASK_REWARD_POINTS = 5;
export const HABIT_REWARD_POINTS = 3;
export const REFLECTION_REWARD_POINTS = 2;
export const MORNING_REWARD_POINTS = 5;
export const COMPLETED_SESSION_POINTS_PER_MINUTE = 0.1;
export const STOPPED_SESSION_RATE_MULTIPLIER = 0.3;
export const MINIMUM_REWARDED_SESSION_MS = 60_000;

export function calculateSessionReward(
  actualElapsedMs: number,
  status: Extract<SessionStatus, "completed" | "stopped">,
): number {
  if (!Number.isFinite(actualElapsedMs) || actualElapsedMs < MINIMUM_REWARDED_SESSION_MS) return 0;
  const completedRate = (actualElapsedMs / 60_000) * COMPLETED_SESSION_POINTS_PER_MINUTE;
  const points = status === "stopped" ? completedRate * STOPPED_SESSION_RATE_MULTIPLIER : completedRate;
  return roundPoints(points);
}

export function roundPoints(points: number): number {
  return Math.round((points + Number.EPSILON) * 10) / 10;
}
