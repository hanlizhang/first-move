export const CAT_POSES = ["sitting", "walking", "sleeping", "eating", "playing", "happy"] as const;
export type CatPose = (typeof CAT_POSES)[number];
export type CatAction = "food" | "toy" | "trick";
export type IdleAction = "walk" | "sleep" | "blink";

export const FIRST_IDLE_DELAY_MS = 5 * 60_000;
export const MIN_IDLE_DELAY_MS = 5 * 60_000;
export const MAX_IDLE_DELAY_MS = 10 * 60_000;
export const IDLE_ACTION_DURATION_MS = 6_500;
export const USER_ACTION_DURATION_MS = 6_500;
export const EATING_DURATION_MS = 5_000;
export const HAPPY_ROLL_DURATION_MS = 4_000;

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

interface ActionSequencer {
  startFoodSequence(onPose: (pose: CatPose) => void): boolean;
  startTemporary(pose: CatPose, durationMs: number, onPose: (pose: CatPose) => void): boolean;
  cancel(): void;
  isActive(): boolean;
}

export function createCatActionSequencer(
  setTimer: (callback: () => void, delayMs: number) => number,
  clearTimer: (timerId: number) => void,
): ActionSequencer {
  let active = false;
  let timers: number[] = [];

  const clearTimers = () => {
    for (const timer of timers) clearTimer(timer);
    timers = [];
  };
  const finish = (onPose: (pose: CatPose) => void) => {
    onPose("sitting");
    active = false;
    timers = [];
  };

  return {
    startFoodSequence(onPose) {
      if (active) return false;
      active = true;
      onPose("eating");
      timers.push(setTimer(() => {
        if (!active) return;
        onPose("happy");
        timers.push(setTimer(() => finish(onPose), HAPPY_ROLL_DURATION_MS));
      }, EATING_DURATION_MS));
      return true;
    },
    startTemporary(pose, durationMs, onPose) {
      if (active) return false;
      active = true;
      onPose(pose);
      timers.push(setTimer(() => finish(onPose), durationMs));
      return true;
    },
    cancel() {
      active = false;
      clearTimers();
    },
    isActive: () => active,
  };
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

export function messageForPose(pose: CatPose): string {
  if (pose === "walking") return "The kitten is exploring the room.";
  if (pose === "sleeping") return "The kitten is sleeping peacefully.";
  if (pose === "eating") return "The kitten is eating or drinking from its bowl.";
  if (pose === "playing") return "The kitten is playing with its yarn ball.";
  if (pose === "happy") return "The kitten rolls over, happy and content.";
  return "The kitten is sitting calmly nearby.";
}
