export const CAT_POSES = ["sitting", "walking", "sleeping", "drinking", "eating", "licking", "yarn", "wand", "high-five", "paw-shake", "butterfly", "happy"] as const;
export type CatPose = (typeof CAT_POSES)[number];
export type IdleAction = "walk" | "sleep" | "blink";
export type CatInteraction = "milk" | "food" | "treat" | "yarn" | "wand" | "high-five" | "paw-shake" | "butterfly";

export const FIRST_IDLE_DELAY_MS = 5 * 60_000;
export const MIN_IDLE_DELAY_MS = 5 * 60_000;
export const MAX_IDLE_DELAY_MS = 10 * 60_000;
export const IDLE_ACTION_DURATION_MS = 6_500;
export const USER_ACTION_DURATION_MS = 6_500;
export const EATING_DURATION_MS = 5_000;
export const HAPPY_ROLL_DURATION_MS = 4_000;

interface IdleSchedulerOptions { reducedMotion: boolean; random: () => number; setTimer: (callback: () => void, delayMs: number) => number; clearTimer: (timerId: number) => void; onAction: (action: IdleAction) => void; onSit: () => void }
export function scheduleIdleBehavior(options: IdleSchedulerOptions): () => void {
  if (options.reducedMotion) return () => undefined;
  let nextTimer: number | undefined, actionTimer: number | undefined, disposed = false;
  const scheduleNext = (delayMs: number) => { nextTimer = options.setTimer(() => { if (disposed) return; options.onAction(idleActionFor(options.random())); actionTimer = options.setTimer(() => { if (disposed) return; options.onSit(); scheduleNext(randomIdleDelay(options.random())); }, IDLE_ACTION_DURATION_MS); }, delayMs); };
  scheduleNext(FIRST_IDLE_DELAY_MS);
  return () => { disposed = true; if (nextTimer !== undefined) options.clearTimer(nextTimer); if (actionTimer !== undefined) options.clearTimer(actionTimer); };
}

export function scheduleReturnToSitting(setTimer: (callback: () => void, delayMs: number) => number, clearTimer: (timerId: number) => void, onSit: () => void, durationMs = USER_ACTION_DURATION_MS): () => void { const timer = setTimer(onSit, durationMs); return () => clearTimer(timer); }

interface ActionSequencer { startInteraction(interaction: CatInteraction, onPose: (pose: CatPose) => void): boolean; startTemporary(pose: CatPose, durationMs: number, onPose: (pose: CatPose) => void): boolean; cancel(): void; isActive(): boolean }
export function createCatActionSequencer(setTimer: (callback: () => void, delayMs: number) => number, clearTimer: (timerId: number) => void): ActionSequencer {
  let active = false; let timers: number[] = [];
  const finish = (onPose: (pose: CatPose) => void) => { onPose("sitting"); active = false; timers = []; };
  const sequence = (poses: Array<{ pose: CatPose; duration: number }>, onPose: (pose: CatPose) => void) => {
    if (active) return false; active = true;
    const run = (index: number) => { const step = poses[index]; onPose(step.pose); timers.push(setTimer(() => index === poses.length - 1 ? finish(onPose) : run(index + 1), step.duration)); };
    run(0); return true;
  };
  return {
    startInteraction(interaction, onPose) {
      if (interaction === "milk") return sequence([{ pose: "drinking", duration: EATING_DURATION_MS }], onPose);
      if (interaction === "food") return sequence([{ pose: "eating", duration: EATING_DURATION_MS }], onPose);
      if (interaction === "treat") return sequence([{ pose: "licking", duration: EATING_DURATION_MS }, { pose: "happy", duration: HAPPY_ROLL_DURATION_MS }], onPose);
      return sequence([{ pose: interaction, duration: USER_ACTION_DURATION_MS }], onPose);
    },
    startTemporary(pose, durationMs, onPose) { return sequence([{ pose, duration: durationMs }], onPose); },
    cancel() { active = false; for (const timer of timers) clearTimer(timer); timers = []; },
    isActive: () => active,
  };
}

export function clampRoomPoint(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }) { return { x: Math.max(8, Math.min(rect.width - 8, clientX - rect.left)), y: Math.max(8, Math.min(rect.height - 8, clientY - rect.top)) }; }
export function randomIdleDelay(value: number) { return Math.round(MIN_IDLE_DELAY_MS + Math.max(0, Math.min(1, value)) * (MAX_IDLE_DELAY_MS - MIN_IDLE_DELAY_MS)); }
export function idleActionFor(value: number): IdleAction { return (["walk", "sleep", "blink"] as const)[Math.floor(Math.max(0, Math.min(.999, value)) * 3)]; }
export function previewPose(pose: CatPose): CatPose { return pose; }
export function messageForPose(pose: CatPose): string {
  const messages: Record<CatPose, string> = { sitting: "The kitten is sitting calmly nearby.", walking: "The kitten is exploring the room.", sleeping: "The kitten is sleeping peacefully.", drinking: "The kitten laps milk from a shallow dish.", eating: "The kitten crunches kibble from its bowl.", licking: "The kitten licks a treat from the pouch.", yarn: "The kitten pounces and bats the yarn ball.", wand: "The kitten watches the teaser wand closely.", "high-five": "The kitten raises a paw to meet your hand.", "paw-shake": "The kitten places one paw gently in your hand.", butterfly: "The kitten follows a butterfly through the garden.", happy: "The kitten rolls over, happy and content." };
  return messages[pose];
}
