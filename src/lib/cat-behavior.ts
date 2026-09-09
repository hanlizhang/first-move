import {
  CAT_INTERACTION_CAPTIONS,
  CAT_INTERACTION_SEQUENCES,
  FIRST_CAT_IDLE_DELAY_MS,
  MAX_CAT_IDLE_DELAY_MS,
  MIN_CAT_IDLE_DELAY_MS,
  idleActionFor as semanticIdleActionFor,
  randomCatIdleDelay,
  type CatInteractionPhase,
} from "./cat-interactions.ts";

export const CAT_POSES = [
  "sitting", "walking", "sleeping", "drinking", "eating", "licking",
  "yarn-anticipate", "yarn", "yarn-settle",
  "mouse-stalk", "mouse-chase", "mouse-pounce",
  "wand", "wand-pounce", "scratching", "bed-nap", "perch",
  "tree-climb", "tree-perch", "high-five", "paw-shake",
  "butterfly-spot", "butterfly", "happy", "proud", "milestone",
] as const;
export type CatPose = (typeof CAT_POSES)[number];
export type IdleAction = "walk" | "sleep" | "blink";
export type CatInteraction = "milk" | "food" | "treat" | "wand" | "garden" | keyof typeof CAT_INTERACTION_SEQUENCES;

export const FIRST_IDLE_DELAY_MS = FIRST_CAT_IDLE_DELAY_MS;
export const MIN_IDLE_DELAY_MS = MIN_CAT_IDLE_DELAY_MS;
export const MAX_IDLE_DELAY_MS = MAX_CAT_IDLE_DELAY_MS;
export const IDLE_ACTION_DURATION_MS = 6_500;
export const USER_ACTION_DURATION_MS = 6_500;
export const EATING_DURATION_MS = 5_000;
export const HAPPY_ROLL_DURATION_MS = 4_000;

interface IdleSchedulerOptions { reducedMotion: boolean; random: () => number; setTimer: (callback: () => void, delayMs: number) => number; clearTimer: (timerId: number) => void; onAction: (action: IdleAction) => void; onSit: () => void; isInteractionActive?: () => boolean }
export function scheduleIdleBehavior(options: IdleSchedulerOptions): () => void {
  let nextTimer: number | undefined, actionTimer: number | undefined, disposed = false;
  const scheduleNext = (delayMs: number) => { nextTimer = options.setTimer(() => { if (disposed) return; nextTimer = undefined; if (!options.isInteractionActive?.()) { options.onAction(idleActionFor(options.random(), options.reducedMotion)); actionTimer = options.setTimer(() => { if (disposed) return; actionTimer = undefined; options.onSit(); }, IDLE_ACTION_DURATION_MS); } scheduleNext(randomIdleDelay(options.random())); }, delayMs); };
  scheduleNext(FIRST_IDLE_DELAY_MS);
  return () => { disposed = true; if (nextTimer !== undefined) options.clearTimer(nextTimer); if (actionTimer !== undefined) options.clearTimer(actionTimer); };
}

export function scheduleReturnToSitting(setTimer: (callback: () => void, delayMs: number) => number, clearTimer: (timerId: number) => void, onSit: () => void, durationMs = USER_ACTION_DURATION_MS): () => void { const timer = setTimer(onSit, durationMs); return () => clearTimer(timer); }

interface ActionSequencer { startInteraction(interaction: CatInteraction, onPose: (pose: CatPose) => void, onPhase?: (phase: CatInteractionPhase) => void): boolean; startTemporary(pose: CatPose, durationMs: number, onPose: (pose: CatPose) => void): boolean; cancel(): void; isActive(): boolean }
export function createCatActionSequencer(setTimer: (callback: () => void, delayMs: number) => number, clearTimer: (timerId: number) => void): ActionSequencer {
  let active = false;
  let revision = 0;
  let timer: number | undefined;
  const phasePose: Record<CatInteractionPhase, CatPose> = {
    sitting: "sitting", walking: "walking", sleeping: "sleeping",
    milk: "drinking", food: "eating", treat: "licking",
    "wand-follow": "wand", "wand-pounce": "wand-pounce",
    "yarn-anticipate": "yarn-anticipate", "yarn-action": "yarn", "yarn-settle": "yarn-settle",
    "mouse-stalk": "mouse-stalk", "mouse-chase": "mouse-chase", "mouse-pounce": "mouse-pounce",
    scratch: "scratching", "bed-nap": "bed-nap", perch: "perch",
    "tree-climb": "tree-climb", "tree-perch": "tree-perch",
    "high-five": "high-five", "paw-shake": "paw-shake", garden: "walking",
    "butterfly-spot": "butterfly-spot", "butterfly-chase": "butterfly",
  };
  const cancel = () => {
    revision += 1;
    active = false;
    if (timer !== undefined) clearTimer(timer);
    timer = undefined;
  };
  const sequence = (steps: readonly { pose: CatPose; phase?: CatInteractionPhase; durationMs: number }[], onPose: (pose: CatPose) => void, onPhase?: (phase: CatInteractionPhase) => void) => {
    cancel();
    if (steps.length === 0) return false;
    active = true;
    const sequenceRevision = revision;
    const run = (index: number) => {
      if (!active || revision !== sequenceRevision) return;
      const step = steps[index];
      if (!step) return;
      onPose(step.pose);
      if (step.phase) onPhase?.(step.phase);
      timer = setTimer(() => {
        timer = undefined;
        if (!active || revision !== sequenceRevision) return;
        if (index + 1 < steps.length) run(index + 1);
        else {
          active = false;
          onPose("sitting");
          onPhase?.("sitting");
        }
      }, step.durationMs);
    };
    run(0);
    return true;
  };
  return {
    startInteraction(interaction, onPose, onPhase) {
      if (interaction === "milk") return sequence([{ pose: "drinking", phase: "milk", durationMs: EATING_DURATION_MS }], onPose, onPhase);
      if (interaction === "food") return sequence([{ pose: "eating", phase: "food", durationMs: EATING_DURATION_MS }], onPose, onPhase);
      if (interaction === "treat") return sequence([{ pose: "licking", phase: "treat", durationMs: EATING_DURATION_MS }, { pose: "happy", phase: "treat", durationMs: HAPPY_ROLL_DURATION_MS }], onPose, onPhase);
      if (interaction === "wand") return sequence([{ pose: "wand", phase: "wand-follow", durationMs: USER_ACTION_DURATION_MS }], onPose, onPhase);
      if (interaction === "garden") return sequence([{ pose: "walking", phase: "garden", durationMs: USER_ACTION_DURATION_MS }], onPose, onPhase);
      return sequence(CAT_INTERACTION_SEQUENCES[interaction].map((step) => ({ ...step, pose: phasePose[step.phase] })), onPose, onPhase);
    },
    startTemporary(pose, durationMs, onPose) { return sequence([{ pose, durationMs }], onPose); },
    cancel,
    isActive: () => active,
  };
}

export function clampRoomPoint(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }) { return { x: Math.max(8, Math.min(rect.width - 8, clientX - rect.left)), y: Math.max(8, Math.min(rect.height - 8, clientY - rect.top)) }; }
export const randomIdleDelay = randomCatIdleDelay;
export function idleActionFor(value: number, reducedMotion = false): IdleAction { return semanticIdleActionFor(value, reducedMotion); }
export function previewPose(pose: CatPose): CatPose { return pose; }
export function messageForPose(pose: CatPose): string {
  const messages: Record<CatPose, string> = { sitting: CAT_INTERACTION_CAPTIONS.sitting, walking: CAT_INTERACTION_CAPTIONS.walking, sleeping: CAT_INTERACTION_CAPTIONS.sleeping, drinking: CAT_INTERACTION_CAPTIONS.milk, eating: CAT_INTERACTION_CAPTIONS.food, licking: CAT_INTERACTION_CAPTIONS.treat, "yarn-anticipate": CAT_INTERACTION_CAPTIONS["yarn-anticipate"], yarn: CAT_INTERACTION_CAPTIONS["yarn-action"], "yarn-settle": CAT_INTERACTION_CAPTIONS["yarn-settle"], "mouse-stalk": CAT_INTERACTION_CAPTIONS["mouse-stalk"], "mouse-chase": CAT_INTERACTION_CAPTIONS["mouse-chase"], "mouse-pounce": CAT_INTERACTION_CAPTIONS["mouse-pounce"], wand: CAT_INTERACTION_CAPTIONS["wand-follow"], "wand-pounce": CAT_INTERACTION_CAPTIONS["wand-pounce"], scratching: CAT_INTERACTION_CAPTIONS.scratch, "bed-nap": CAT_INTERACTION_CAPTIONS["bed-nap"], perch: CAT_INTERACTION_CAPTIONS.perch, "tree-climb": CAT_INTERACTION_CAPTIONS["tree-climb"], "tree-perch": CAT_INTERACTION_CAPTIONS["tree-perch"], "high-five": CAT_INTERACTION_CAPTIONS["high-five"], "paw-shake": CAT_INTERACTION_CAPTIONS["paw-shake"], "butterfly-spot": CAT_INTERACTION_CAPTIONS["butterfly-spot"], butterfly: CAT_INTERACTION_CAPTIONS["butterfly-chase"], happy: "The kitten rolls over, happy and content.", proud: "The kitten closes its eyes and purrs proudly.", milestone: "The kitten celebrates a new adventure milestone." };
  return messages[pose];
}
