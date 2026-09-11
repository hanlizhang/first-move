import type { CatItemId } from "./cat-items.ts";

export const CAT_QA_PREVIEW_DAYS = [1, 3, 7, 14, 21, 35, 50, 70, 75, 100] as const;

export const CAT_QA_PREVIEW_ITEM_IDS = [
  "kitten-milk",
  "wet-kitten-food",
  "cat-food",
  "cat-treat",
  "freeze-dried-treat",
  "yarn-toy",
  "toy-mouse",
  "teaser-wand",
  "scratching-post",
  "cat-bed",
  "window-cushion",
  "cat-tree",
  "high-five",
  "paw-shake",
  "outdoor-garden",
  "butterfly",
] as const satisfies readonly CatItemId[];

export const CAT_FOOD_VISUAL_BY_ITEM_ID = {
  "kitten-milk": "milk",
  "wet-kitten-food": "wet-food",
  "cat-food": "kibble",
  "cat-treat": "soft-treat",
  "freeze-dried-treat": "freeze-dried-treat",
} as const satisfies Partial<Record<CatItemId, string>>;

export type CatFoodVisual = (typeof CAT_FOOD_VISUAL_BY_ITEM_ID)[keyof typeof CAT_FOOD_VISUAL_BY_ITEM_ID];

export function catFoodVisualFor(itemId: CatItemId): CatFoodVisual | undefined {
  return CAT_FOOD_VISUAL_BY_ITEM_ID[itemId as keyof typeof CAT_FOOD_VISUAL_BY_ITEM_ID];
}

export type CatQaPreviewDay = (typeof CAT_QA_PREVIEW_DAYS)[number];

export interface CatQaPreviewState {
  activeDay?: CatQaPreviewDay;
  ownedItemIds: readonly CatItemId[];
  selectedFurnitureId?: CatItemId | null;
}

export interface CatQaPreviewProjection {
  active: boolean;
  activeDays: number;
  ownedItemIds: readonly CatItemId[];
  selectedFurnitureId?: CatItemId;
}

export function catQaPreviewEnabled(isDevelopment: boolean): boolean {
  return isDevelopment;
}

export function projectCatQaPreview(
  canonical: Omit<CatQaPreviewProjection, "active">,
  preview: CatQaPreviewState,
  enabled: boolean,
): CatQaPreviewProjection {
  const active = enabled && (
    preview.activeDay !== undefined ||
    preview.ownedItemIds.length > 0 ||
    preview.selectedFurnitureId !== undefined
  );
  if (!active) {
    return {
      active: false,
      activeDays: canonical.activeDays,
      ownedItemIds: [...canonical.ownedItemIds],
      selectedFurnitureId: canonical.selectedFurnitureId,
    };
  }
  return {
    active: true,
    activeDays: preview.activeDay ?? canonical.activeDays,
    ownedItemIds: [...new Set([...canonical.ownedItemIds, ...preview.ownedItemIds])],
    selectedFurnitureId: preview.selectedFurnitureId === null
      ? undefined
      : preview.selectedFurnitureId ?? canonical.selectedFurnitureId,
  };
}

export const CAT_INTERACTION_CAPTIONS = {
  sitting: "The kitten sits nearby, cozy and curious.",
  walking: "The kitten pads softly around the room.",
  sleeping: "The kitten curls up for a peaceful nap.",
  milk: "The kitten laps milk from a shallow dish.",
  "wet-food": "The kitten licks a soft meal from the shallow bowl.",
  kibble: "Tiny bites make a cheerful crunch.",
  "soft-treat": "The kitten reaches up to lick the soft treat.",
  "freeze-dried-treat": "A careful sniff, then one crunchy little bite.",
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
    { phase: "scratch", durationMs: 550 },
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

export interface NormalizedRoomArea {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export interface CatRoomLayout {
  bedAnchor: NormalizedRoomPoint;
  butterflyFollowAnchor: NormalizedRoomPoint;
  butterflySpotAnchor: NormalizedRoomPoint;
  catHome: NormalizedRoomPoint;
  catTreeFloorAnchor: NormalizedRoomPoint;
  catTreeMidAnchor: NormalizedRoomPoint;
  catTreeMidPlatform: NormalizedRoomArea;
  catTreeTopAnchor: NormalizedRoomPoint;
  catTreeTopPlatform: NormalizedRoomArea;
  floorY: number;
  mousePlayArea: NormalizedRoomArea;
  scratchingPostAnchor: NormalizedRoomPoint;
  toyPlayArea: NormalizedRoomArea;
  wandHandleAnchor: NormalizedRoomPoint;
  wandPlayArea: NormalizedRoomArea;
  wandStart: NormalizedRoomPoint;
  windowPerchAnchor: NormalizedRoomPoint;
}

export const CAT_ROOM_LAYOUT: CatRoomLayout = {
  bedAnchor: { x: 0.34, y: 0.78 },
  butterflyFollowAnchor: { x: 0.6, y: 0.52 },
  butterflySpotAnchor: { x: 0.68, y: 0.28 },
  catHome: { x: 0.5, y: 0.78 },
  catTreeFloorAnchor: { x: 0.28, y: 0.78 },
  catTreeMidAnchor: { x: 0.31, y: 0.485 },
  catTreeMidPlatform: { left: 0.18, right: 0.42, top: 0.47, bottom: 0.54 },
  catTreeTopAnchor: { x: 0.23, y: 0.245 },
  catTreeTopPlatform: { left: 0.12, right: 0.4, top: 0.23, bottom: 0.31 },
  floorY: 0.78,
  mousePlayArea: { left: 0.28, right: 0.72, top: 0.62, bottom: 0.78 },
  scratchingPostAnchor: { x: 0.76, y: 0.78 },
  toyPlayArea: { left: 0.34, right: 0.66, top: 0.62, bottom: 0.78 },
  wandHandleAnchor: { x: 0.82, y: 0.16 },
  wandPlayArea: { left: 0.22, right: 0.78, top: 0.22, bottom: 0.7 },
  wandStart: { x: 0.66, y: 0.38 },
  windowPerchAnchor: { x: 0.28, y: 0.38 },
};

export const CAT_HOME_POINT: NormalizedRoomPoint = CAT_ROOM_LAYOUT.catHome;
export const CAT_TARGET_PADDING = 0.06;
export const CAT_WAND_STEP = 0.12;
export const CAT_WAND_POUNCE_DISTANCE = 0.14;
export const FIRST_CAT_IDLE_DELAY_MS = 5 * 60_000;
export const MIN_CAT_IDLE_DELAY_MS = 5 * 60_000;
export const MAX_CAT_IDLE_DELAY_MS = 10 * 60_000;

export function roomPointInArea(
  area: NormalizedRoomArea,
  horizontalRatio: number,
  verticalRatio: number,
): NormalizedRoomPoint {
  const xRatio = clampNumber(horizontalRatio, 0, 1);
  const yRatio = clampNumber(verticalRatio, 0, 1);
  return {
    x: area.left + (area.right - area.left) * xRatio,
    y: area.top + (area.bottom - area.top) * yRatio,
  };
}

export function clampRoomPointToArea(
  point: NormalizedRoomPoint,
  area: NormalizedRoomArea,
): NormalizedRoomPoint {
  return {
    x: clampNumber(point.x, area.left, area.right),
    y: clampNumber(point.y, area.top, area.bottom),
  };
}

export function isRoomPointInArea(point: NormalizedRoomPoint, area: NormalizedRoomArea): boolean {
  return point.x >= area.left && point.x <= area.right && point.y >= area.top && point.y <= area.bottom;
}

export function offsetRoomPoint(point: NormalizedRoomPoint, x: number, y: number): NormalizedRoomPoint {
  return clampNormalizedRoomPoint({ x: point.x + x, y: point.y + y });
}

export function catScratchingPostPlacement(layout = CAT_ROOM_LAYOUT): CatTargetStep {
  return {
    cat: offsetRoomPoint(layout.scratchingPostAnchor, -0.1, 0),
    target: layout.scratchingPostAnchor,
  };
}

export function catButterflyFollowSteps(layout = CAT_ROOM_LAYOUT): readonly CatTargetStep[] {
  return [
    {
      cat: offsetRoomPoint(layout.butterflySpotAnchor, -0.12, 0.16),
      target: layout.butterflySpotAnchor,
    },
    {
      cat: offsetRoomPoint(layout.butterflyFollowAnchor, -0.12, 0.16),
      target: layout.butterflyFollowAnchor,
    },
  ];
}

export interface CatTargetStep {
  cat: NormalizedRoomPoint;
  target: NormalizedRoomPoint;
}

export function catMouseChaseSteps(layout = CAT_ROOM_LAYOUT): readonly CatTargetStep[] {
  const stalkTarget = roomPointInArea(layout.mousePlayArea, 0.22, 0.9);
  const chaseTarget = roomPointInArea(layout.mousePlayArea, 0.78, 0.86);
  const pounceTarget = roomPointInArea(layout.mousePlayArea, 0.88, 0.92);
  return [
    { cat: layout.catHome, target: stalkTarget },
    { cat: roomPointInArea(layout.mousePlayArea, 0.58, 0.92), target: chaseTarget },
    { cat: offsetRoomPoint(pounceTarget, -0.055, 0), target: pounceTarget },
  ];
}

export function catYarnPlaySteps(layout = CAT_ROOM_LAYOUT): readonly CatTargetStep[] {
  const noticeTarget = roomPointInArea(layout.toyPlayArea, 0.58, 0.92);
  const batTarget = roomPointInArea(layout.toyPlayArea, 0.68, 0.9);
  const settleTarget = roomPointInArea(layout.toyPlayArea, 0.62, 0.94);
  return [
    { cat: offsetRoomPoint(noticeTarget, -0.1, 0), target: noticeTarget },
    { cat: offsetRoomPoint(batTarget, -0.075, 0), target: batTarget },
    { cat: offsetRoomPoint(settleTarget, -0.07, 0), target: settleTarget },
  ];
}

export function catRoomScrollTarget({
  currentScrollY,
  padding = 16,
  roomHeight,
  roomTop,
  viewportHeight,
}: {
  currentScrollY: number;
  padding?: number;
  roomHeight: number;
  roomTop: number;
  viewportHeight: number;
}): number | undefined {
  if (roomHeight <= 0 || viewportHeight <= 0) return undefined;
  const visibleTop = Math.max(roomTop, padding);
  const visibleBottom = Math.min(roomTop + roomHeight, viewportHeight - padding);
  const visibleHeight = Math.max(0, visibleBottom - visibleTop);
  if (visibleHeight / roomHeight >= 0.72) return undefined;
  return Math.max(0, currentScrollY + roomTop - padding);
}

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
