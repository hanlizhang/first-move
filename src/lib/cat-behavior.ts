export const CAT_POSES = ["sitting", "walking", "sleeping", "eating", "playing", "happy"] as const;
export type CatPose = (typeof CAT_POSES)[number];
export type CatAction = "food" | "toy" | "trick";
export type IdleAction = "walk" | "sleep" | "blink";

export const FIRST_IDLE_DELAY_MS = 5 * 60_000;
export const MIN_IDLE_DELAY_MS = 5 * 60_000;
export const MAX_IDLE_DELAY_MS = 10 * 60_000;
export const IDLE_ACTION_DURATION_MS = 6_500;
export const USER_ACTION_DURATION_MS = 6_500;

interface IdleSchedulerOptions {
  reducedMotion: boolean;
  random: () => number;
  setTimer: (callback: () => void, delayMs: number) => number;
  clearTimer: (timerId: number) => void;
  onAction: (action: IdleAction) => void;
  onSit: () => void;
}

export function scheduleIdleBehavior(options: IdleSchedulerOptions): () => void {
  if (options.reducedMotion) return () => undefined;
  let nextTimer: number | undefined;
  let actionTimer: number | undefined;
  let disposed = false;

  const scheduleNext = (delayMs: number) => {
    nextTimer = options.setTimer(() => {
      if (disposed) return;
      options.onAction(idleActionFor(options.random()));
      actionTimer = options.setTimer(() => {
        if (disposed) return;
        options.onSit();
        scheduleNext(randomIdleDelay(options.random()));
      }, IDLE_ACTION_DURATION_MS);
    }, delayMs);
  };

  scheduleNext(FIRST_IDLE_DELAY_MS);
  return () => {
    disposed = true;
    if (nextTimer !== undefined) options.clearTimer(nextTimer);
    if (actionTimer !== undefined) options.clearTimer(actionTimer);
  };
}

export function scheduleReturnToSitting(
  setTimer: (callback: () => void, delayMs: number) => number,
  clearTimer: (timerId: number) => void,
  onSit: () => void,
  durationMs = USER_ACTION_DURATION_MS,
): () => void {
  const timer = setTimer(onSit, durationMs);
  return () => clearTimer(timer);
}

export function randomIdleDelay(randomValue: number): number {
  const bounded = Math.max(0, Math.min(1, randomValue));
  return Math.round(MIN_IDLE_DELAY_MS + bounded * (MAX_IDLE_DELAY_MS - MIN_IDLE_DELAY_MS));
}

export function idleActionFor(randomValue: number): IdleAction {
  const bounded = Math.max(0, Math.min(0.999, randomValue));
  return (["walk", "sleep", "blink"] as const)[Math.floor(bounded * 3)];
}

export function poseForAction(action: CatAction): CatPose {
  if (action === "food") return "eating";
  if (action === "toy") return "playing";
  return "happy";
}

export function previewPose(pose: CatPose): CatPose {
  return pose;
}
