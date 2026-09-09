import type { CatItemId } from "./cat-items.ts";

export const CAT_INTERACTION_CAPTIONS = {
  sitting: "The kitten sits nearby, cozy and curious.",
  walking: "The kitten pads softly around the room.",
  sleeping: "The kitten curls up for a peaceful nap.",
  milk: "The kitten laps milk from a shallow dish.",
  food: "The kitten eats from the little bowl.",
  treat: "The kitten tastes a treat from the pouch.",
  "wand-follow": "Eyes locked on the moving teaser.",
  "wand-pounce": "Almost got it.",
  "yarn-anticipate": "The yarn ball has the kitten's full attention.",
  "yarn-action": "A paw bats the yarn across the floor.",
  "yarn-settle": "The kitten settles beside the yarn ball.",
  "mouse-stalk": "The toy mouse has been spotted.",
  "mouse-chase": "A quiet stalk turns into a quick chase.",
  "mouse-pounce": "Paws land beside the toy mouse.",
  scratch: "Scratch, stretch, scratch.",
  "bed-nap": "This looks like a good place for a nap.",
  perch: "The kitten watches the world from the window.",
  "tree-climb": "Up the cat tree, one step at a time.",
  "tree-perch": "Higher is apparently better.",
  "high-five": "One tiny paw meets your hand.",
  "paw-shake": "The kitten places one paw gently in your hand.",
  garden: "The kitten explores the garden, one soft step at a time.",
  "butterfly-spot": "Something fluttered past.",
  "butterfly-chase": "The kitten follows the butterfly through the garden.",
} as const;

export type CatInteractionPhase = keyof typeof CAT_INTERACTION_CAPTIONS;

export interface CatInteractionSequenceStep {
  durationMs: number;
  phase: CatInteractionPhase;
}

export const CAT_INTERACTION_SEQUENCES = {
  yarn: [
    { phase: "yarn-anticipate", durationMs: 700 },
    { phase: "yarn-action", durationMs: 1_600 },
    { phase: "yarn-settle", durationMs: 1_000 },
  ],
  mouse: [
    { phase: "mouse-stalk", durationMs: 900 },
    { phase: "mouse-chase", durationMs: 1_600 },
    { phase: "mouse-pounce", durationMs: 900 },
  ],
  scratch: [
    { phase: "scratch", durationMs: 450 },
    { phase: "scratch", durationMs: 450 },
    { phase: "scratch", durationMs: 450 },
    { phase: "scratch", durationMs: 450 },
  ],
  "bed-nap": [{ phase: "bed-nap", durationMs: 5_000 }],
  perch: [{ phase: "perch", durationMs: 5_000 }],
  tree: [
    { phase: "tree-climb", durationMs: 1_000 },
    { phase: "tree-perch", durationMs: 4_500 },
  ],
  "high-five": [{ phase: "high-five", durationMs: 2_600 }],
  "paw-shake": [{ phase: "paw-shake", durationMs: 2_600 }],
  butterfly: [
    { phase: "butterfly-spot", durationMs: 750 },
    { phase: "butterfly-chase", durationMs: 2_800 },
  ],
} as const satisfies Readonly<Record<string, readonly CatInteractionSequenceStep[]>>;

export const CAT_ITEM_INTERACTION_MAP = {
  "yarn-toy": "yarn",
  "toy-mouse": "mouse",
  "teaser-wand": "wand",
  "scratching-post": "scratch",
  "cat-bed": "bed-nap",
  "window-cushion": "perch",
  "cat-tree": "tree",
  "high-five": "high-five",
  "paw-shake": "paw-shake",
  "outdoor-garden": "garden",
  butterfly: "butterfly",
} as const satisfies Partial<Record<CatItemId, string>>;

export type CatInteractionSequence = keyof typeof CAT_INTERACTION_SEQUENCES;
export type CatFacing = "left" | "right";
export type CatIdleAction = "blink" | "walk" | "sleep";

export interface NormalizedRoomPoint {
  x: number;
  y: number;
}

export const CAT_HOME_POINT: NormalizedRoomPoint = { x: 0.5, y: 0.72 };
export const CAT_TARGET_PADDING = 0.06;
export const CAT_WAND_STEP = 0.12;
export const CAT_WAND_POUNCE_DISTANCE = 0.14;
export const FIRST_CAT_IDLE_DELAY_MS = 5 * 60_000;
export const MIN_CAT_IDLE_DELAY_MS = 5 * 60_000;
export const MAX_CAT_IDLE_DELAY_MS = 10 * 60_000;

export interface CatInteractionAvailability {
  butterfly: boolean;
  garden: boolean;
  highFive: boolean;
  mouse: boolean;
  pawShake: boolean;
  perch: boolean;
  scratch: boolean;
  tree: boolean;
  wand: boolean;
  yarn: boolean;
}

export function catInteractionAvailability(
  ownedItemIds: readonly CatItemId[],
  selectedFurnitureId?: CatItemId,
): CatInteractionAvailability {
  const owned = new Set<CatItemId>(ownedItemIds);
  return {
    butterfly: owned.has("butterfly") && owned.has("outdoor-garden"),
    garden: owned.has("outdoor-garden"),
    highFive: owned.has("high-five"),
    mouse: owned.has("toy-mouse"),
    pawShake: owned.has("paw-shake"),
    perch: selectedFurnitureId === "window-cushion" && owned.has("window-cushion"),
    scratch: owned.has("scratching-post"),
    tree: selectedFurnitureId === "cat-tree" && owned.has("cat-tree"),
    wand: owned.has("teaser-wand"),
    yarn: owned.has("yarn-toy"),
  };
}

export function clampNormalizedRoomPoint(
  point: NormalizedRoomPoint,
  padding = CAT_TARGET_PADDING,
): NormalizedRoomPoint {
  const safePadding = clampNumber(padding, 0, 0.49);
  return {
    x: clampNumber(point.x, safePadding, 1 - safePadding),
    y: clampNumber(point.y, safePadding, 1 - safePadding),
  };
}

export function normalizedRoomPoint(
  x: number,
  y: number,
  width: number,
  height: number,
): NormalizedRoomPoint {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { ...CAT_HOME_POINT };
  }
  return clampNormalizedRoomPoint({ x: x / width, y: y / height });
}

export function roomPointDistance(
  first: NormalizedRoomPoint,
  second: NormalizedRoomPoint,
): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

export function stepTowardRoomPoint(
  current: NormalizedRoomPoint,
  target: NormalizedRoomPoint,
  maxStep = CAT_WAND_STEP,
  translationEnabled = true,
): NormalizedRoomPoint {
  if (!translationEnabled) return { ...current };
  const safeTarget = clampNormalizedRoomPoint(target);
  const distance = roomPointDistance(current, safeTarget);
  if (distance === 0 || distance <= maxStep) return safeTarget;
  const ratio = Math.max(0, maxStep) / distance;
  return clampNormalizedRoomPoint({
    x: current.x + (safeTarget.x - current.x) * ratio,
    y: current.y + (safeTarget.y - current.y) * ratio,
  });
}

export function facingTowardRoomPoint(
  current: NormalizedRoomPoint,
  target: NormalizedRoomPoint,
  fallback: CatFacing = "right",
): CatFacing {
  if (Math.abs(target.x - current.x) < 0.005) return fallback;
  return target.x < current.x ? "left" : "right";
}

export function shouldWandPounce(
  catPoint: NormalizedRoomPoint,
  targetPoint: NormalizedRoomPoint,
  randomValue: number,
): boolean {
  return (
    roomPointDistance(catPoint, targetPoint) <= CAT_WAND_POUNCE_DISTANCE &&
    clampNumber(randomValue, 0, 1) >= 0.72
  );
}

interface CatSequenceScheduler<
  Step extends { durationMs: number } = CatInteractionSequenceStep,
> {
  start(
    steps: readonly Step[],
    onStep: (step: Step, index: number) => void,
    onComplete: () => void,
  ): void;
  cancel(): void;
  isActive(): boolean;
}

export function createCatSequenceScheduler<
  TimerId,
  Step extends { durationMs: number } = CatInteractionSequenceStep,
>(
  setTimer: (callback: () => void, delayMs: number) => TimerId,
  clearTimer: (timerId: TimerId) => void,
): CatSequenceScheduler<Step> {
  let timerId: TimerId | undefined;
  let active = false;
  let revision = 0;

  function cancel() {
    revision += 1;
    active = false;
    if (timerId !== undefined) clearTimer(timerId);
    timerId = undefined;
  }

  return {
    start(steps, onStep, onComplete) {
      cancel();
      if (steps.length === 0) {
        onComplete();
        return;
      }
      active = true;
      const scheduledRevision = revision;
      const run = (index: number) => {
        if (!active || scheduledRevision !== revision) return;
        const step = steps[index];
        if (!step) return;
        onStep(step, index);
        timerId = setTimer(() => {
          if (!active || scheduledRevision !== revision) return;
          timerId = undefined;
          if (index + 1 < steps.length) {
            run(index + 1);
          } else {
            active = false;
            onComplete();
          }
        }, step.durationMs);
      };
      run(0);
    },
    cancel,
    isActive: () => active,
  };
}

interface CatIdleSchedulerOptions<TimerId> {
  clearTimer(timerId: TimerId): void;
  isInteractionActive(): boolean;
  onAction(action: CatIdleAction): void;
  random(): number;
  reducedMotion(): boolean;
  setTimer(callback: () => void, delayMs: number): TimerId;
}

export interface CatIdleScheduler {
  noteUserInteraction(): void;
  start(): void;
  cancel(): void;
}

export function createCatIdleScheduler<TimerId>(
  options: CatIdleSchedulerOptions<TimerId>,
): CatIdleScheduler {
  let timerId: TimerId | undefined;
  let disposed = false;

  function clear() {
    if (timerId !== undefined) options.clearTimer(timerId);
    timerId = undefined;
  }

  function schedule(delayMs: number) {
    clear();
    if (disposed) return;
    timerId = options.setTimer(() => {
      timerId = undefined;
      if (disposed) return;
      if (!options.isInteractionActive()) {
        options.onAction(idleActionFor(options.random(), options.reducedMotion()));
      }
      schedule(randomCatIdleDelay(options.random()));
    }, delayMs);
  }

  return {
    start() {
      disposed = false;
      schedule(FIRST_CAT_IDLE_DELAY_MS);
    },
    noteUserInteraction() {
      if (disposed) return;
      schedule(randomCatIdleDelay(options.random()));
    },
    cancel() {
      disposed = true;
      clear();
    },
  };
}

export function randomCatIdleDelay(value: number): number {
  const normalized = clampNumber(value, 0, 1);
  return Math.round(
    MIN_CAT_IDLE_DELAY_MS + normalized * (MAX_CAT_IDLE_DELAY_MS - MIN_CAT_IDLE_DELAY_MS),
  );
}

export function idleActionFor(value: number, reducedMotion = false): CatIdleAction {
  const actions = reducedMotion
    ? (["blink", "sleep"] as const)
    : (["blink", "walk", "sleep"] as const);
  const normalized = clampNumber(value, 0, 0.999_999);
  return actions[Math.floor(normalized * actions.length)] ?? "blink";
}

function clampNumber(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.max(minimum, Math.min(maximum, value));
}
