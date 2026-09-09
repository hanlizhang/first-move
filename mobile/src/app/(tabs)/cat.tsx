import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useFocusEffect } from "expo-router";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from "react-native";

import {
  useFirstMoveApp,
  type AppSyncState,
  type CatEconomyActionOutcome,
} from "../../app-state/app-provider.tsx";
import { formatMobileSyncDiagnostic } from "../../cloud/sync-runtime.ts";
import { PixelKitten } from "../../components/pixel-kitten.tsx";
import { useCurrentLocalDate } from "../../components/use-current-local-date.ts";
import { Body, Card, LoadingState, Screen } from "../../components/ui.tsx";
import {
  catActionDisableState,
  catReactionCaption,
  canStartCatFoodInteraction,
  getCatRoomView,
  inventoryQuantity,
  purchaseAvailability,
  selectCatFurniture,
  type CatPose,
  type CatRoomView,
} from "../../domain/cat.ts";
import {
  CAT_HOME_POINT,
  CAT_INTERACTION_CAPTIONS,
  CAT_INTERACTION_SEQUENCES,
  catInteractionAvailability,
  clampNormalizedRoomPoint,
  createCatIdleScheduler,
  createCatSequenceScheduler,
  facingTowardRoomPoint,
  normalizedRoomPoint,
  shouldWandPounce,
  stepTowardRoomPoint,
  type CatFacing,
  type CatIdleAction,
  type CatInteractionPhase,
  type CatInteractionSequence,
  type NormalizedRoomPoint,
} from "../../domain/cat-interactions.ts";
import {
  CAT_STORE_CATEGORIES,
  CAT_STORE_ITEMS,
  catItem,
  isCatItemUnlocked,
  type CatCatalogItem,
  type CatItemId,
} from "../../domain/cat-items.ts";
import { colors, radii, spacing, touchTarget, typography } from "../../theme/tokens.ts";

type CatSection = "room" | "store";
type CatScene = "room" | "garden";
type CatTargetVisual = "wand" | "yarn" | "mouse" | "butterfly";
type CatActiveAction =
  | CatInteractionSequence
  | "food"
  | "garden"
  | "idle"
  | "nap"
  | "room-walk"
  | "wand";

interface CatVisualState {
  action?: CatActiveAction;
  blinking: boolean;
  caption: string;
  facing: CatFacing;
  pose: CatPose;
  scene: CatScene;
  target?: CatTargetVisual;
  temporaryFurniture?: CatItemId;
}

interface CatVisualStep {
  caption: string;
  discreteReducedMotionPlacement?: boolean;
  durationMs: number;
  facing?: CatFacing;
  phase?: CatInteractionPhase;
  point?: NormalizedRoomPoint;
  pose: CatPose;
  scene?: CatScene;
  target?: CatTargetVisual;
  targetPoint?: NormalizedRoomPoint;
  temporaryFurniture?: CatItemId;
}

const INITIAL_CAT_VISUAL: CatVisualState = {
  blinking: false,
  caption: CAT_INTERACTION_CAPTIONS.sitting,
  facing: "right",
  pose: "sitting",
  scene: "room",
};

const WAND_POUNCE_COOLDOWN_MS = 1_200;
const WAND_POUNCE_DURATION_MS = 520;
const CAT_SPRITE_WIDTH = 160;
const CAT_ROOM_VERTICAL_RESERVE = 150;

const ROOM_POINTS = {
  bed: { x: 0.28, y: 0.76 },
  butterflyFirst: { x: 0.38, y: 0.68 },
  butterflySecond: { x: 0.58, y: 0.62 },
  mouseFirst: { x: 0.34, y: 0.72 },
  mouseSecond: { x: 0.57, y: 0.7 },
  mouseThird: { x: 0.68, y: 0.72 },
  perch: { x: 0.3, y: 0.31 },
  roomWalk: { x: 0.74, y: 0.72 },
  scratch: { x: 0.3, y: 0.7 },
  treeClimb: { x: 0.34, y: 0.52 },
  treePerch: { x: 0.3, y: 0.24 },
  wandStart: { x: 0.69, y: 0.42 },
  yarnFirst: { x: 0.35, y: 0.72 },
  yarnSecond: { x: 0.61, y: 0.72 },
} as const satisfies Readonly<Record<string, NormalizedRoomPoint>>;

const TARGET_POINTS = {
  butterflyFirst: { x: 0.76, y: 0.28 },
  butterflySecond: { x: 0.7, y: 0.52 },
  mouseFirst: { x: 0.78, y: 0.74 },
  mouseSecond: { x: 0.7, y: 0.7 },
  mouseThird: { x: 0.73, y: 0.72 },
  yarn: { x: 0.72, y: 0.75 },
} as const satisfies Readonly<Record<string, NormalizedRoomPoint>>;

export default function CatScreen() {
  const {
    auth,
    buyCatItem,
    localWorkspace,
    localWorkspaceMessage,
    localWorkspaceStatus,
    sync,
    updateLocalWorkspace,
    feedCatFood,
    workspaceEditable,
  } = useFirstMoveApp();
  const today = useCurrentLocalDate();
  const room = useMemo(
    () => getCatRoomView(localWorkspace, today),
    [localWorkspace, today],
  );
  const [section, setSection] = useState<CatSection>("room");
  const [savingId, setSavingId] = useState<string>();
  const [queuedPurchase, setQueuedPurchase] = useState<{
    itemId: string;
    lastSuccessfulSyncAt?: string;
  }>();
  const [notice, setNotice] = useState("");
  const catInteractions = useCatRoomInteractions({
    enabled: localWorkspaceStatus === "ready",
    selectedFurnitureId: room.selectedFurniture?.id,
  });
  const pendingAuthenticatedWrite =
    auth.status === "authenticated" && sync.pendingCount > 0;
  const { transientInteractionDisabled, economicWriteDisabled } =
    catActionDisableState({
      localWorkspaceLoaded: localWorkspaceStatus === "ready",
      workspaceEditable,
      actionSaving: Boolean(savingId),
      pendingAuthenticatedWrite,
    });

  const currentLastSuccessfulSyncAt =
    "lastSuccessfulSyncAt" in sync ? sync.lastSuccessfulSyncAt : undefined;
  const queuedPurchaseItemId =
    pendingAuthenticatedWrite &&
    queuedPurchase &&
    queuedPurchase.lastSuccessfulSyncAt === currentLastSuccessfulSyncAt
      ? queuedPurchase.itemId
      : undefined;

  if (localWorkspaceStatus === "loading") {
    return (
      <Screen title="Cat Room">
        <LoadingState label="Opening the Cat Room…" />
      </Screen>
    );
  }

  async function buy(item: CatCatalogItem) {
    setSavingId(item.id);
    try {
      const outcome = await buyCatItem(item.id, today);
      setNotice(purchaseMessage(item, outcome));
      setQueuedPurchase(
        outcome === "queued" ||
          outcome === "queued-offline" ||
          outcome === "queued-blocked"
          ? { itemId: item.id, lastSuccessfulSyncAt: currentLastSuccessfulSyncAt }
          : undefined,
      );
    } finally {
      setSavingId(undefined);
    }
  }

  async function feed(item: CatCatalogItem) {
    if (!canStartCatFoodInteraction(localWorkspace, item.id)) {
      setNotice(consumptionMessage("empty"));
      return;
    }
    catInteractions.playFood(foodPose(item.id));
    setSavingId(item.id);
    try {
      const outcome = await feedCatFood(item.id, today);
      setNotice(outcome === "used" ? "" : consumptionMessage(outcome));
    } finally {
      setSavingId(undefined);
    }
  }

  async function chooseFurniture(itemId?: CatItemId) {
    catInteractions.returnToRoom();
    setSavingId(itemId ?? "room-clear");
    try {
      const next = await updateLocalWorkspace((state) =>
        selectCatFurniture(state, itemId),
      );
      setNotice(
        next
          ? itemId
            ? `${catItem(itemId)?.name ?? "Furniture"} is now in the room.`
            : "The room has a little more open space."
          : "That room choice could not be saved yet.",
      );
    } finally {
      setSavingId(undefined);
    }
  }

  return (
    <Screen
      eyebrow="Cat"
      title="Cat Room"
      description="A cozy companion and a few rewards for the steps you choose to take."
    >
      <View accessibilityRole="tablist" style={styles.sectionTabs}>
        <SectionTab active={section === "room"} label="Room" onPress={() => setSection("room")} />
        <SectionTab
          active={section === "store"}
          label="Store"
          onPress={() => {
            catInteractions.returnToRoom();
            setSection("store");
          }}
        />
      </View>

      {localWorkspaceMessage ? (
        <Card tone="warning"><Body>{localWorkspaceMessage}</Body></Card>
      ) : null}
      {!workspaceEditable && auth.status === "authenticated" ? (
        <Card tone="warning"><Body>The Cat Room will be ready when this account finishes loading.</Body></Card>
      ) : null}
      {pendingAuthenticatedWrite ? (
        <Card tone="warning"><Body>{catPendingSyncMessage(sync)}</Body></Card>
      ) : null}
      {__DEV__ && "queueSummary" in sync && (sync.pendingCount > 0 || sync.diagnostic) ? (
        <Card tone="warning">
          <Text style={styles.cardTitle}>Development sync diagnostic</Text>
          <Body>{formatMobileSyncDiagnostic(sync)}</Body>
        </Card>
      ) : null}
      {notice ? (
        <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>
      ) : null}

      {section === "room" ? (
        <CatRoom
          economicWriteDisabled={economicWriteDisabled}
          transientInteractionDisabled={transientInteractionDisabled}
          onChooseFurniture={(itemId) => void chooseFurniture(itemId)}
          onFeed={(item) => void feed(item)}
          interactions={catInteractions}
          room={room}
        />
      ) : (
        <CatStore
          disabled={economicWriteDisabled}
          onBuy={(item) => void buy(item)}
          pendingItemId={savingId}
          queuedItemId={queuedPurchaseItemId}
          room={room}
          state={localWorkspace}
          syncPending={pendingAuthenticatedWrite}
        />
      )}
    </Screen>
  );
}

function useCatRoomInteractions({
  enabled,
  selectedFurnitureId,
}: {
  enabled: boolean;
  selectedFurnitureId?: CatItemId;
}) {
  const [visual, setVisual] = useState<CatVisualState>(INITIAL_CAT_VISUAL);
  const visualRef = useRef<CatVisualState>(INITIAL_CAT_VISUAL);
  const mountedRef = useRef(true);
  const focusedRef = useRef(false);
  const enabledRef = useRef(enabled);
  const reducedMotionRef = useRef(false);
  const selectedFurnitureRef = useRef(selectedFurnitureId);
  const roomLayoutRef = useRef({ height: 0, width: 0 });
  const catPointRef = useRef<NormalizedRoomPoint>({ ...CAT_HOME_POINT });
  const targetPointRef = useRef<NormalizedRoomPoint>({ ...ROOM_POINTS.wandStart });
  const activeActionRef = useRef<CatActiveAction | undefined>(undefined);
  const lastWandPounceAtRef = useRef(Number.NEGATIVE_INFINITY);
  const pounceTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const catAnimationRef = useRef<Animated.CompositeAnimation | undefined>(undefined);
  const targetAnimationRef = useRef<Animated.CompositeAnimation | undefined>(undefined);
  const idleSchedulerRef = useRef<ReturnType<typeof createCatIdleScheduler> | undefined>(undefined);
  const [catTranslateX] = useState(() => new Animated.Value(0));
  const [catTranslateY] = useState(() => new Animated.Value(0));
  const [targetTranslateX] = useState(() => new Animated.Value(0));
  const [targetTranslateY] = useState(() => new Animated.Value(0));

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    selectedFurnitureRef.current = selectedFurnitureId;
  }, [selectedFurnitureId]);

  const sequenceScheduler = useMemo(
    () =>
      createCatSequenceScheduler<ReturnType<typeof setTimeout>, CatVisualStep>(
        (callback, delayMs) => setTimeout(callback, delayMs),
        (timerId) => clearTimeout(timerId),
      ),
    [],
  );

  const commitVisual = useCallback((nextVisual: CatVisualState) => {
    visualRef.current = nextVisual;
    if (mountedRef.current && focusedRef.current && enabledRef.current) {
      setVisual(nextVisual);
    }
  }, []);

  const clearPounceTimer = useCallback(() => {
    if (pounceTimerRef.current !== undefined) {
      clearTimeout(pounceTimerRef.current);
      pounceTimerRef.current = undefined;
    }
  }, []);

  const stopAnimations = useCallback(() => {
    catAnimationRef.current?.stop();
    targetAnimationRef.current?.stop();
    catAnimationRef.current = undefined;
    targetAnimationRef.current = undefined;
  }, []);

  const setCatPoint = useCallback(
    (
      point: NormalizedRoomPoint,
      durationMs = 320,
      discreteReducedMotionPlacement = false,
    ) => {
      const nextPoint = clampNormalizedRoomPoint(point);
      if (reducedMotionRef.current) {
        catAnimationRef.current?.stop();
        catAnimationRef.current = undefined;
        if (discreteReducedMotionPlacement) {
          catPointRef.current = nextPoint;
          const translation = catTranslationFor(
            nextPoint,
            roomLayoutRef.current.width,
            roomLayoutRef.current.height,
          );
          catTranslateX.setValue(translation.x);
          catTranslateY.setValue(translation.y);
        }
        return;
      }
      catPointRef.current = nextPoint;
      const translation = catTranslationFor(
        nextPoint,
        roomLayoutRef.current.width,
        roomLayoutRef.current.height,
      );
      catAnimationRef.current?.stop();
      catAnimationRef.current = Animated.parallel([
        Animated.timing(catTranslateX, {
          duration: durationMs,
          easing: Easing.out(Easing.quad),
          toValue: translation.x,
          useNativeDriver: true,
        }),
        Animated.timing(catTranslateY, {
          duration: durationMs,
          easing: Easing.out(Easing.quad),
          toValue: translation.y,
          useNativeDriver: true,
        }),
      ]);
      catAnimationRef.current.start();
    },
    [catTranslateX, catTranslateY],
  );

  const setTargetPoint = useCallback(
    (point: NormalizedRoomPoint, durationMs = 90) => {
      const nextPoint = clampNormalizedRoomPoint(point);
      targetPointRef.current = nextPoint;
      const translation = targetTranslationFor(
        nextPoint,
        roomLayoutRef.current.width,
        roomLayoutRef.current.height,
      );
      targetAnimationRef.current?.stop();
      if (reducedMotionRef.current || durationMs === 0) {
        targetAnimationRef.current = undefined;
        targetTranslateX.setValue(translation.x);
        targetTranslateY.setValue(translation.y);
        return;
      }
      targetAnimationRef.current = Animated.parallel([
        Animated.timing(targetTranslateX, {
          duration: durationMs,
          easing: Easing.out(Easing.quad),
          toValue: translation.x,
          useNativeDriver: true,
        }),
        Animated.timing(targetTranslateY, {
          duration: durationMs,
          easing: Easing.out(Easing.quad),
          toValue: translation.y,
          useNativeDriver: true,
        }),
      ]);
      targetAnimationRef.current.start();
    },
    [targetTranslateX, targetTranslateY],
  );

  const cancelActive = useCallback(
    (noteUserInteraction: boolean) => {
      sequenceScheduler.cancel();
      clearPounceTimer();
      stopAnimations();
      activeActionRef.current = undefined;
      if (noteUserInteraction) idleSchedulerRef.current?.noteUserInteraction();
    },
    [clearPounceTimer, sequenceScheduler, stopAnimations],
  );

  const settle = useCallback(
    (scene: CatScene, animate = true) => {
      activeActionRef.current = scene === "garden" ? "garden" : undefined;
      clearPounceTimer();
      setCatPoint(CAT_HOME_POINT, animate ? 360 : 0, true);
      commitVisual({
        ...INITIAL_CAT_VISUAL,
        action: scene === "garden" ? "garden" : undefined,
        caption:
          scene === "garden"
            ? CAT_INTERACTION_CAPTIONS.garden
            : CAT_INTERACTION_CAPTIONS.sitting,
        facing: visualRef.current.facing,
        scene,
      });
    },
    [clearPounceTimer, commitVisual, setCatPoint],
  );

  const startSteps = useCallback(
    (
      action: CatActiveAction,
      steps: readonly CatVisualStep[],
      settleScene: CatScene,
      userInitiated = true,
    ) => {
      if (!enabledRef.current || !focusedRef.current) return;
      cancelActive(userInitiated);
      activeActionRef.current = action;
      const scheduledSteps =
        reducedMotionRef.current && action === "scratch" && steps[0]
          ? [
              {
                ...steps[0],
                durationMs: steps.reduce((total, step) => total + step.durationMs, 0),
              },
            ]
          : steps;
      sequenceScheduler.start(
        scheduledSteps,
        (step) => {
          if (
            !mountedRef.current ||
            !focusedRef.current ||
            !enabledRef.current ||
            activeActionRef.current !== action
          ) {
            return;
          }
          const scene = step.scene ?? settleScene;
          const currentPoint = catPointRef.current;
          const facing =
            step.facing ??
            (step.targetPoint
              ? facingTowardRoomPoint(currentPoint, step.targetPoint, visualRef.current.facing)
              : visualRef.current.facing);
          if (step.targetPoint) setTargetPoint(step.targetPoint, 260);
          if (step.point) {
            setCatPoint(
              step.point,
              Math.min(440, Math.round(step.durationMs * 0.45)),
              userInitiated && step.discreteReducedMotionPlacement,
            );
          }
          commitVisual({
            action,
            blinking: false,
            caption: step.caption,
            facing,
            pose: step.pose,
            scene,
            target: step.target,
            temporaryFurniture: step.temporaryFurniture,
          });
        },
        () => {
          if (
            mountedRef.current &&
            focusedRef.current &&
            enabledRef.current &&
            activeActionRef.current === action
          ) {
            settle(settleScene);
          }
        },
      );
    },
    [cancelActive, commitVisual, sequenceScheduler, setCatPoint, setTargetPoint, settle],
  );

  const playSequence = useCallback(
    (sequence: CatInteractionSequence) => {
      const settleScene = sequence === "butterfly" ? "garden" : "room";
      startSteps(sequence, catVisualSteps(sequence), settleScene);
    },
    [startSteps],
  );

  const sitTogether = useCallback(() => {
    if (!enabledRef.current || !focusedRef.current) return;
    cancelActive(true);
    settle("room");
  }, [cancelActive, settle]);

  const exploreRoom = useCallback(() => {
    startSteps(
      "room-walk",
      [
        {
          caption: CAT_INTERACTION_CAPTIONS.walking,
          durationMs: 3_200,
          point: ROOM_POINTS.roomWalk,
          pose: "walking",
          scene: "room",
        },
      ],
      "room",
    );
  }, [startSteps]);

  const nap = useCallback(
    (furnitureId?: CatItemId) => {
      if (furnitureId === "cat-bed") {
        playSequence("bed-nap");
        return;
      }
      if (furnitureId === "window-cushion") {
        playSequence("perch");
        return;
      }
      startSteps(
        "nap",
        [
          {
            caption: catReactionCaption("sleeping", furnitureId),
            durationMs: 5_000,
            pose: "sleeping",
            scene: "room",
          },
        ],
        "room",
      );
    },
    [playSequence, startSteps],
  );

  const playFood = useCallback(
    (pose: CatPose) => {
      startSteps(
        "food",
        [
          {
            caption: catReactionCaption(pose, selectedFurnitureRef.current),
            durationMs: 5_000,
            pose,
            scene: "room",
          },
        ],
        "room",
      );
    },
    [startSteps],
  );

  const visitGarden = useCallback(() => {
    if (!enabledRef.current || !focusedRef.current) return;
    cancelActive(true);
    activeActionRef.current = "garden";
    setCatPoint(CAT_HOME_POINT, 320, true);
    commitVisual({
      ...INITIAL_CAT_VISUAL,
      action: "garden",
      caption: CAT_INTERACTION_CAPTIONS.garden,
      facing: visualRef.current.facing,
      scene: "garden",
    });
  }, [cancelActive, commitVisual, setCatPoint]);

  const returnToRoom = useCallback(() => {
    if (!enabledRef.current || !focusedRef.current) return;
    cancelActive(true);
    settle("room");
  }, [cancelActive, settle]);

  const startWand = useCallback(() => {
    if (!enabledRef.current || !focusedRef.current) return;
    cancelActive(true);
    activeActionRef.current = "wand";
    lastWandPounceAtRef.current = Number.NEGATIVE_INFINITY;
    setTargetPoint(ROOM_POINTS.wandStart, 0);
    const facing = facingTowardRoomPoint(
      catPointRef.current,
      ROOM_POINTS.wandStart,
      visualRef.current.facing,
    );
    commitVisual({
      action: "wand",
      blinking: false,
      caption: CAT_INTERACTION_CAPTIONS["wand-follow"],
      facing,
      pose: "wand",
      scene: "room",
      target: "wand",
    });
  }, [cancelActive, commitVisual, setTargetPoint]);

  const toggleWand = useCallback(() => {
    if (activeActionRef.current === "wand") {
      cancelActive(true);
      settle("room");
      return;
    }
    startWand();
  }, [cancelActive, settle, startWand]);

  const updateWandTarget = useCallback(
    (x: number, y: number) => {
      if (activeActionRef.current !== "wand") return;
      const nextTarget = normalizedRoomPoint(
        x,
        y,
        roomLayoutRef.current.width,
        roomLayoutRef.current.height,
      );
      const currentCatPoint = catPointRef.current;
      const nextCatPoint = stepTowardRoomPoint(
        currentCatPoint,
        nextTarget,
        undefined,
        !reducedMotionRef.current,
      );
      const facing = facingTowardRoomPoint(
        currentCatPoint,
        nextTarget,
        visualRef.current.facing,
      );
      setTargetPoint(nextTarget);
      setCatPoint(nextCatPoint, 180);

      const now = Date.now();
      const pouncing = visualRef.current.pose === "pouncing";
      if (
        !pouncing &&
        now - lastWandPounceAtRef.current >= WAND_POUNCE_COOLDOWN_MS &&
        shouldWandPounce(nextCatPoint, nextTarget, Math.random())
      ) {
        lastWandPounceAtRef.current = now;
        commitVisual({
          action: "wand",
          blinking: false,
          caption: CAT_INTERACTION_CAPTIONS["wand-pounce"],
          facing,
          pose: "pouncing",
          scene: "room",
          target: "wand",
        });
        clearPounceTimer();
        pounceTimerRef.current = setTimeout(() => {
          pounceTimerRef.current = undefined;
          if (
            mountedRef.current &&
            focusedRef.current &&
            enabledRef.current &&
            activeActionRef.current === "wand"
          ) {
            commitVisual({
              action: "wand",
              blinking: false,
              caption: CAT_INTERACTION_CAPTIONS["wand-follow"],
              facing: visualRef.current.facing,
              pose: "wand",
              scene: "room",
              target: "wand",
            });
          }
        }, WAND_POUNCE_DURATION_MS);
        return;
      }

      if (!pouncing && facing !== visualRef.current.facing) {
        commitVisual({ ...visualRef.current, facing });
      }
    },
    [clearPounceTimer, commitVisual, setCatPoint, setTargetPoint],
  );

  const wandResponderEnabled = visual.action === "wand";
  const moveWandFromTouch = useCallback(
    (event: GestureResponderEvent) => {
      updateWandTarget(event.nativeEvent.locationX, event.nativeEvent.locationY);
    },
    [updateWandTarget],
  );

  const onRoomLayout = useCallback(
    (event: LayoutChangeEvent) => {
      roomLayoutRef.current = {
        height: event.nativeEvent.layout.height,
        width: event.nativeEvent.layout.width,
      };
      const catTranslation = catTranslationFor(
        catPointRef.current,
        roomLayoutRef.current.width,
        roomLayoutRef.current.height,
      );
      const targetTranslation = targetTranslationFor(
        targetPointRef.current,
        roomLayoutRef.current.width,
        roomLayoutRef.current.height,
      );
      catTranslateX.setValue(reducedMotionRef.current ? 0 : catTranslation.x);
      catTranslateY.setValue(reducedMotionRef.current ? 0 : catTranslation.y);
      targetTranslateX.setValue(targetTranslation.x);
      targetTranslateY.setValue(targetTranslation.y);
    },
    [catTranslateX, catTranslateY, targetTranslateX, targetTranslateY],
  );

  const runIdleAction = useCallback(
    (action: CatIdleAction) => {
      if (!mountedRef.current || !focusedRef.current || !enabledRef.current) return;
      const scene = visualRef.current.scene;
      if (action === "blink") {
        startSteps(
          "idle",
          [
            {
              caption: scene === "garden" ? CAT_INTERACTION_CAPTIONS.garden : CAT_INTERACTION_CAPTIONS.sitting,
              durationMs: 260,
              pose: "sitting",
              scene,
            },
          ],
          scene,
          false,
        );
        commitVisual({ ...visualRef.current, action: "idle", blinking: true });
        return;
      }
      if (action === "walk") {
        startSteps(
          "idle",
          [
            {
              caption: CAT_INTERACTION_CAPTIONS.walking,
              durationMs: 2_200,
              point: { x: 0.28 + Math.random() * 0.44, y: CAT_HOME_POINT.y },
              pose: "walking",
              scene,
            },
          ],
          scene,
          false,
        );
        return;
      }
      if (
        scene === "room" &&
        !reducedMotionRef.current &&
        selectedFurnitureRef.current === "cat-bed"
      ) {
        startSteps("idle", catVisualSteps("bed-nap"), "room", false);
        return;
      }
      if (
        scene === "room" &&
        !reducedMotionRef.current &&
        selectedFurnitureRef.current === "window-cushion"
      ) {
        startSteps("idle", catVisualSteps("perch"), "room", false);
        return;
      }
      startSteps(
        "idle",
        [
          {
            caption: CAT_INTERACTION_CAPTIONS.sleeping,
            durationMs: 4_500,
            pose: "sleeping",
            scene,
          },
        ],
        scene,
        false,
      );
    },
    [commitVisual, startSteps],
  );

  useEffect(() => {
    let subscribed = true;
    const applyReducedMotion = (value: boolean) => {
      reducedMotionRef.current = value;
      if (!subscribed || !mountedRef.current) return;
      if (value) {
        catAnimationRef.current?.stop();
        catAnimationRef.current = undefined;
        catPointRef.current = { ...CAT_HOME_POINT };
        catTranslateX.setValue(0);
        catTranslateY.setValue(0);
      }
    };
    void AccessibilityInfo.isReduceMotionEnabled().then(applyReducedMotion);
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      applyReducedMotion,
    );
    return () => {
      subscribed = false;
      subscription.remove();
    };
  }, [catTranslateX, catTranslateY]);

  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      const idleScheduler = createCatIdleScheduler({
        clearTimer: (timerId: ReturnType<typeof setTimeout>) => clearTimeout(timerId),
        isInteractionActive: () => activeActionRef.current !== undefined,
        onAction: runIdleAction,
        random: Math.random,
        reducedMotion: () => reducedMotionRef.current,
        setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
      });
      idleSchedulerRef.current = idleScheduler;
      if (enabled) {
        catPointRef.current = { ...CAT_HOME_POINT };
        targetPointRef.current = { ...ROOM_POINTS.wandStart };
        catTranslateX.setValue(0);
        catTranslateY.setValue(0);
        commitVisual(INITIAL_CAT_VISUAL);
        idleScheduler.start();
      }
      return () => {
        focusedRef.current = false;
        idleScheduler.cancel();
        if (idleSchedulerRef.current === idleScheduler) {
          idleSchedulerRef.current = undefined;
        }
        cancelActive(false);
      };
    }, [cancelActive, catTranslateX, catTranslateY, commitVisual, enabled, runIdleAction]),
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      focusedRef.current = false;
      idleSchedulerRef.current?.cancel();
      idleSchedulerRef.current = undefined;
      cancelActive(false);
    };
  }, [cancelActive]);

  return {
    catTranslateX,
    catTranslateY,
    exploreRoom,
    nap,
    onRoomLayout,
    panHandlers: {
      onMoveShouldSetResponder: () => wandResponderEnabled,
      onResponderGrant: moveWandFromTouch,
      onResponderMove: moveWandFromTouch,
      onResponderTerminationRequest: () => true,
      onStartShouldSetResponder: () => wandResponderEnabled,
    },
    playFood,
    playSequence,
    returnToRoom,
    sitTogether,
    targetTranslateX,
    targetTranslateY,
    toggleWand,
    visitGarden,
    visual,
  };
}

function catVisualSteps(sequence: CatInteractionSequence): CatVisualStep[] {
  return CAT_INTERACTION_SEQUENCES[sequence].map((step, index) => {
    const common = {
      caption: CAT_INTERACTION_CAPTIONS[step.phase],
      durationMs: step.durationMs,
      phase: step.phase,
    };
    if (sequence === "yarn") {
      return {
        ...common,
        point: index === 0 ? ROOM_POINTS.yarnFirst : ROOM_POINTS.yarnSecond,
        pose: index === 0 ? "anticipating" : index === 1 ? "yarn" : "sitting",
        target: "yarn",
        targetPoint: TARGET_POINTS.yarn,
      };
    }
    if (sequence === "mouse") {
      return {
        ...common,
        point:
          index === 0
            ? ROOM_POINTS.mouseFirst
            : index === 1
              ? ROOM_POINTS.mouseSecond
              : ROOM_POINTS.mouseThird,
        pose: index === 0 ? "anticipating" : index === 1 ? "walking" : "mouse",
        target: "mouse",
        targetPoint:
          index === 0
            ? TARGET_POINTS.mouseFirst
            : index === 1
              ? TARGET_POINTS.mouseSecond
              : TARGET_POINTS.mouseThird,
      };
    }
    if (sequence === "scratch") {
      return {
        ...common,
        discreteReducedMotionPlacement: true,
        facing: "left" as const,
        point: ROOM_POINTS.scratch,
        pose: index % 2 === 0 ? "scratching-left" : "scratching-right",
        temporaryFurniture: "scratching-post" as const,
      };
    }
    if (sequence === "bed-nap") {
      return {
        ...common,
        discreteReducedMotionPlacement: true,
        point: ROOM_POINTS.bed,
        pose: "sleeping" as const,
      };
    }
    if (sequence === "perch") {
      return {
        ...common,
        discreteReducedMotionPlacement: true,
        facing: "left" as const,
        point: ROOM_POINTS.perch,
        pose: "watching" as const,
      };
    }
    if (sequence === "tree") {
      return {
        ...common,
        discreteReducedMotionPlacement: true,
        facing: "left" as const,
        point: index === 0 ? ROOM_POINTS.treeClimb : ROOM_POINTS.treePerch,
        pose: index === 0 ? "climbing" : "perched",
      };
    }
    if (sequence === "high-five") {
      return { ...common, pose: "high-five" as const };
    }
    if (sequence === "paw-shake") {
      return { ...common, pose: "paw-shake" as const };
    }
    return {
      ...common,
      point: index === 0 ? ROOM_POINTS.butterflyFirst : ROOM_POINTS.butterflySecond,
      pose: index === 0 ? "anticipating" : "butterfly",
      scene: "garden" as const,
      target: "butterfly" as const,
      targetPoint:
        index === 0 ? TARGET_POINTS.butterflyFirst : TARGET_POINTS.butterflySecond,
    };
  });
}

function catTranslationFor(
  point: NormalizedRoomPoint,
  roomWidth: number,
  roomHeight: number,
): NormalizedRoomPoint {
  const horizontalTravel = Math.max(0, roomWidth - CAT_SPRITE_WIDTH - spacing.lg * 2);
  const verticalTravel = Math.max(0, roomHeight - CAT_ROOM_VERTICAL_RESERVE);
  return {
    x: (point.x - CAT_HOME_POINT.x) * horizontalTravel,
    y: (point.y - CAT_HOME_POINT.y) * verticalTravel,
  };
}

function targetTranslationFor(
  point: NormalizedRoomPoint,
  roomWidth: number,
  roomHeight: number,
): NormalizedRoomPoint {
  return {
    x: (point.x - 0.5) * Math.max(0, roomWidth - 42),
    y: (point.y - 0.5) * Math.max(0, roomHeight - 110),
  };
}

function CatRoom({
  economicWriteDisabled,
  interactions,
  onChooseFurniture,
  onFeed,
  room,
  transientInteractionDisabled,
}: {
  economicWriteDisabled: boolean;
  interactions: ReturnType<typeof useCatRoomInteractions>;
  onChooseFurniture(itemId?: CatItemId): void;
  onFeed(item: CatCatalogItem): void;
  room: CatRoomView;
  transientInteractionDisabled: boolean;
}) {
  const ownedItemIds = [
    ...room.ownedFood,
    ...room.ownedToys,
    ...room.ownedFurniture,
    ...room.ownedTricks,
    ...room.ownedScenes,
    ...room.ownedInteractions,
  ].map(({ item }) => item.id);
  const available = catInteractionAvailability(ownedItemIds, room.selectedFurniture?.id);
  const { visual } = interactions;
  const garden = visual.scene === "garden";
  const furnitureInteractionAvailable = available.scratch || available.perch || available.tree;

  return (
    <>
      <View style={styles.statGrid}>
        <Stat label="Current points" value={formatPoints(room.points)} />
        <Stat label="Growth chapter" value={room.stage} />
      </View>
      <Card>
        <Text style={styles.progressTitle}>
          {room.activeDays} active day{room.activeDays === 1 ? "" : "s"}
        </Text>
        <Body muted>
          {room.nextUnlock
            ? `Next: ${room.nextUnlock.label} at ${room.nextUnlock.day} active days.`
            : "All core Cat Room adventures are unlocked."}
        </Body>
        <View style={styles.growthStory}>
          <Text style={styles.growthTitle}>{room.growthStory.title}</Text>
          <Body>{room.growthStory.description}</Body>
          {room.growthStory.nextMilestone ? (
            <Body muted>
              Next story chapter: {room.growthStory.nextMilestone.label} around day {room.growthStory.nextMilestone.day}.
            </Body>
          ) : null}
          <Text style={styles.symbolicNote}>
            Active days are a symbolic journey, not a literal kitten age.
          </Text>
        </View>
      </Card>

      {room.returnMessage ? (
        <Card tone="success">
          <Text accessibilityLiveRegion="polite" style={styles.returnMessage}>
            {room.returnMessage}
          </Text>
        </Card>
      ) : null}

      <View
        {...interactions.panHandlers}
        accessibilityHint={visual.action === "wand" ? "Drag anywhere inside the room to move the teaser." : undefined}
        accessibilityLabel={`${room.stage}. ${visual.caption}`}
        onLayout={interactions.onRoomLayout}
        style={[styles.room, garden && styles.gardenRoom]}
      >
        {garden ? (
          <>
            <View style={styles.gardenSky} />
            <Text style={styles.gardenDetail}>✿ ･ﾟ ✿ ･ﾟ ✿</Text>
          </>
        ) : (
          <View style={styles.window}><View style={styles.windowPane} /><View style={styles.windowPane} /></View>
        )}
        <View style={[styles.roomFloor, garden && styles.gardenFloor]}>
          <View style={[styles.roomFloorHighlight, garden && styles.gardenFloorHighlight]} />
        </View>
        {!garden ? <FurnitureVisual itemId={room.selectedFurniture?.id} /> : null}
        {!garden &&
        available.scratch &&
        room.selectedFurniture?.id !== "scratching-post" &&
        visual.temporaryFurniture !== "scratching-post" ? (
          <FurnitureVisual itemId="scratching-post" secondary />
        ) : null}
        {!garden && visual.temporaryFurniture && visual.temporaryFurniture !== room.selectedFurniture?.id ? (
          <FurnitureVisual itemId={visual.temporaryFurniture} />
        ) : null}
        <RoomToyVisuals
          activeTarget={visual.target}
          ownsMouse={available.mouse && !garden}
          ownsYarn={available.yarn && !garden}
          targetTranslateX={interactions.targetTranslateX}
          targetTranslateY={interactions.targetTranslateY}
        />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.kittenLayer,
            {
              transform: [
                { translateX: interactions.catTranslateX },
                { translateY: interactions.catTranslateY },
              ],
            },
          ]}
        >
          <PixelKitten
            accessibilityLabel={visual.caption}
            blinking={visual.blinking}
            facing={visual.facing}
            pose={visual.pose}
            showFloor={false}
          />
        </Animated.View>
        <View style={styles.roomMessage}>
          <Text accessibilityLiveRegion="polite" style={styles.roomMessageText}>{visual.caption}</Text>
        </View>
      </View>

      <Card>
        <Text style={styles.cardTitle}>Spend time together</Text>
        <ActionGroup label="Kitten moments">
          <ActionButton disabled={transientInteractionDisabled} label="Sit together" onPress={interactions.sitTogether} />
          <ActionButton disabled={transientInteractionDisabled} label="Explore room" onPress={interactions.exploreRoom} />
          <ActionButton
            disabled={transientInteractionDisabled}
            label="Nap"
            onPress={() => interactions.nap(room.selectedFurniture?.id)}
          />
        </ActionGroup>
        {room.ownedFood.length > 0 ? (
          <ActionGroup label="Food">
            {room.ownedFood.map(({ item, quantity }) => (
              <ActionButton
                disabled={economicWriteDisabled}
                key={item.id}
                label={`Feed ${item.name} · ${quantity}`}
                onPress={() => onFeed(item)}
              />
            ))}
          </ActionGroup>
        ) : (
          <Body muted>Food you buy will appear here.</Body>
        )}
        {available.yarn || available.mouse || available.wand ? (
          <ActionGroup label="Toys">
            {available.yarn ? (
              <ActionButton
                disabled={transientInteractionDisabled}
                label="Play with yarn"
                onPress={() => interactions.playSequence("yarn")}
              />
            ) : null}
            {available.mouse ? (
              <ActionButton
                disabled={transientInteractionDisabled}
                label="Chase toy mouse"
                onPress={() => interactions.playSequence("mouse")}
              />
            ) : null}
            {available.wand ? (
              <ActionButton
                disabled={transientInteractionDisabled}
                label={visual.action === "wand" ? "End wand play" : "Play with teaser wand"}
                onPress={interactions.toggleWand}
              />
            ) : null}
          </ActionGroup>
        ) : null}
        {furnitureInteractionAvailable ? (
          <ActionGroup label="Furniture moments">
            {available.scratch ? (
              <ActionButton
                disabled={transientInteractionDisabled}
                label="Scratch"
                onPress={() => interactions.playSequence("scratch")}
              />
            ) : null}
            {available.perch ? (
              <ActionButton
                disabled={transientInteractionDisabled}
                label="Watch from perch"
                onPress={() => interactions.playSequence("perch")}
              />
            ) : null}
            {available.tree ? (
              <ActionButton
                disabled={transientInteractionDisabled}
                label="Climb / perch"
                onPress={() => interactions.playSequence("tree")}
              />
            ) : null}
          </ActionGroup>
        ) : null}
        {available.highFive || available.pawShake || available.butterfly || available.garden ? (
          <ActionGroup label="Tricks & adventures">
            {available.highFive ? (
              <ActionButton disabled={transientInteractionDisabled} label="High-five" onPress={() => interactions.playSequence("high-five")} />
            ) : null}
            {available.pawShake ? (
              <ActionButton disabled={transientInteractionDisabled} label="Paw shake" onPress={() => interactions.playSequence("paw-shake")} />
            ) : null}
            {available.garden ? (
              <ActionButton
                disabled={transientInteractionDisabled}
                label={garden ? "Return to room" : "Visit garden"}
                onPress={garden ? interactions.returnToRoom : interactions.visitGarden}
              />
            ) : null}
            {available.butterfly && garden ? (
              <ActionButton disabled={transientInteractionDisabled} label="Follow butterfly" onPress={() => interactions.playSequence("butterfly")} />
            ) : null}
          </ActionGroup>
        ) : null}
      </Card>

      <Inventory room={room} />

      {room.ownedFurniture.length > 0 ? (
        <Card>
          <Text style={styles.cardTitle}>Room furniture</Text>
          <Body muted>Choose one owned furnishing to show in the room.</Body>
          <View style={styles.actionWrap}>
            {room.ownedFurniture.map(({ item }) => (
              <ActionButton
                disabled={economicWriteDisabled || room.selectedFurniture?.id === item.id}
                key={item.id}
                label={room.selectedFurniture?.id === item.id ? `${item.name} · In room` : item.name}
                onPress={() => onChooseFurniture(item.id)}
              />
            ))}
            {room.selectedFurniture ? (
              <ActionButton disabled={economicWriteDisabled} label="Clear furnishing" onPress={() => onChooseFurniture(undefined)} />
            ) : null}
          </View>
        </Card>
      ) : null}
    </>
  );
}

function CatStore({
  disabled,
  onBuy,
  pendingItemId,
  queuedItemId,
  room,
  state,
  syncPending,
}: {
  disabled: boolean;
  onBuy(item: CatCatalogItem): void;
  pendingItemId?: string;
  queuedItemId?: string;
  room: CatRoomView;
  state: Parameters<typeof purchaseAvailability>[0];
  syncPending: boolean;
}) {
  return (
    <>
      <View style={styles.storeBalance}>
        <Text style={styles.storeBalanceLabel}>Current points</Text>
        <Text style={styles.storeBalanceValue}>{formatPoints(room.points)}</Text>
      </View>
      <Body muted>
        Food and treats can be bought again. Toys, furniture, and tricks stay yours. Locked rewards open with active days, never streaks.
      </Body>
      {CAT_STORE_CATEGORIES.map((category) => (
        <View key={category} style={styles.storeSection}>
          <Text accessibilityRole="header" style={styles.categoryTitle}>{category}</Text>
          {CAT_STORE_ITEMS.filter((item) => item.category === category).map((item) => {
            const quantity = inventoryQuantity(state, item.id);
            const availability = purchaseAvailability(state, item.id);
            const unlocked = isCatItemUnlocked(item, room.activeDays);
            return (
              <View key={item.id} style={styles.storeItem}>
                <View style={styles.storeItemCopy}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemDescription}>
                    {unlocked ? item.description : `Unlocks at ${item.unlockActiveDays} active days`}
                  </Text>
                  {item.kind === "food" && quantity > 0 ? (
                    <Text style={styles.ownedText}>Owned: {quantity}</Text>
                  ) : null}
                </View>
                <View style={styles.priceColumn}>
                  <Text style={styles.price}>{formatPoints(item.price)}</Text>
                  <ActionButton
                    disabled={disabled || availability !== "available"}
                    label={
                      pendingItemId === item.id
                        ? `Buying ${item.name}…`
                        : queuedItemId === item.id
                          ? "Waiting to sync…"
                          : syncPending && availability === "available"
                            ? "Sync pending…"
                        : purchaseButtonLabel(availability)
                    }
                    onPress={() => onBuy(item)}
                  />
                </View>
              </View>
            );
          })}
        </View>
      ))}
      <Card tone="success">
        <Text style={styles.cardTitle}>Build a room at your pace</Text>
        <Body>
          Consumables can be replenished. Every toy, furnishing, and trick you buy stays yours.
        </Body>
      </Card>
    </>
  );
}

function Inventory({ room }: { room: CatRoomView }) {
  const groups = [
    ["Food & treats", room.ownedFood],
    ["Toys", room.ownedToys],
    ["Furniture", room.ownedFurniture],
    ["Tricks", room.ownedTricks],
    ["Adventures", [...room.ownedScenes, ...room.ownedInteractions]],
  ] as const;
  const hasAnything = groups.some(([, entries]) => entries.length > 0);
  return (
    <Card>
      <Text style={styles.cardTitle}>Owned things</Text>
      {!hasAnything ? (
        <Body muted>Your first Cat Store reward will appear here.</Body>
      ) : (
        groups.map(([label, entries]) =>
          entries.length > 0 ? (
            <View key={label} style={styles.inventoryGroup}>
              <Text style={styles.inventoryLabel}>{label}</Text>
              <Text style={styles.inventoryText}>
                {entries.map(({ item, quantity }) => item.durable ? item.name : `${item.name} × ${quantity}`).join(" · ")}
              </Text>
            </View>
          ) : null,
        )
      )}
    </Card>
  );
}

function SectionTab({ active, label, onPress }: { active: boolean; label: string; onPress(): void }) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.sectionTab, active && styles.sectionTabActive, pressed && styles.pressed]}
    >
      <Text style={[styles.sectionTabText, active && styles.sectionTabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <View style={styles.stat}><Text style={styles.statLabel}>{label}</Text><Text style={styles.statValue}>{value}</Text></View>;
}

function ActionGroup({ children, label }: { children: ReactNode; label: string }) {
  return <View style={styles.actionGroup}><Text style={styles.actionLabel}>{label}</Text><View style={styles.actionWrap}>{children}</View></View>;
}

function ActionButton({ disabled, label, onPress }: { disabled?: boolean; label: string; onPress(): void }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.actionButton, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Text style={styles.actionButtonText}>{label}</Text>
    </Pressable>
  );
}

function RoomToyVisuals({
  activeTarget,
  ownsMouse,
  ownsYarn,
  targetTranslateX,
  targetTranslateY,
}: {
  activeTarget?: CatTargetVisual;
  ownsMouse: boolean;
  ownsYarn: boolean;
  targetTranslateX: Animated.Value;
  targetTranslateY: Animated.Value;
}) {
  const movingTarget = {
    transform: [
      { translateX: targetTranslateX },
      { translateY: targetTranslateY },
    ],
  };

  return (
    <>
      {ownsYarn ? (
        <Animated.View
          accessibilityLabel="Yarn ball in room"
          pointerEvents="none"
          style={activeTarget === "yarn" ? [styles.movingTarget, movingTarget] : styles.yarnHome}
        >
          <View style={styles.yarnBall}>
            <View style={[styles.yarnStripe, styles.yarnStripeOne]} />
            <View style={[styles.yarnStripe, styles.yarnStripeTwo]} />
          </View>
          <View style={styles.yarnTail} />
        </Animated.View>
      ) : null}
      {ownsMouse ? (
        <Animated.View
          accessibilityLabel="Toy mouse in room"
          pointerEvents="none"
          style={activeTarget === "mouse" ? [styles.movingTarget, movingTarget] : styles.mouseHome}
        >
          <View style={styles.mouseTail} />
          <View style={styles.mouseBody}>
            <View style={styles.mouseEar} />
            <View style={styles.mouseEye} />
            <View style={styles.mouseNose} />
          </View>
        </Animated.View>
      ) : null}
      {activeTarget === "wand" ? (
        <Animated.View
          accessibilityLabel="Moving teaser wand target"
          pointerEvents="none"
          style={[styles.movingTarget, styles.wandTarget, movingTarget]}
        >
          <View style={styles.wandHandle} />
          <View style={styles.wandString} />
          <View style={styles.wandTip} />
        </Animated.View>
      ) : null}
      {activeTarget === "butterfly" ? (
        <Animated.View
          accessibilityLabel="Butterfly in garden"
          pointerEvents="none"
          style={[styles.movingTarget, styles.butterflyTarget, movingTarget]}
        >
          <View style={[styles.butterflyWing, styles.butterflyWingLeft]} />
          <View style={styles.butterflyBody} />
          <View style={[styles.butterflyWing, styles.butterflyWingRight]} />
        </Animated.View>
      ) : null}
    </>
  );
}

function FurnitureVisual({ itemId, secondary = false }: { itemId?: CatItemId; secondary?: boolean }) {
  if (itemId === "cat-bed") return <View accessibilityLabel="Cat bed in room" style={styles.catBed} />;
  if (itemId === "window-cushion") return <View accessibilityLabel="Window perch in room" style={styles.windowCushion} />;
  if (itemId === "scratching-post") {
    return (
      <View
        accessibilityLabel="Scratching post in room"
        style={[styles.scratchingPost, secondary && styles.scratchingPostSecondary]}
      >
        <View style={styles.scratchingPostTop} />
        <View style={styles.scratchingPostColumn} />
        <View style={styles.scratchingPostBase} />
      </View>
    );
  }
  if (itemId === "cat-tree") {
    return (
      <View accessibilityLabel="Cat tree in room" style={styles.catTree}>
        <View style={styles.catTreeTop} />
        <View style={styles.catTreeUpperPost} />
        <View style={styles.catTreeMiddle} />
        <View style={styles.catTreeLowerPost} />
        <View style={styles.catTreeBase} />
      </View>
    );
  }
  return null;
}

function purchaseButtonLabel(availability: ReturnType<typeof purchaseAvailability>): string {
  if (availability === "available") return "Buy";
  if (availability === "locked") return "Locked";
  if (availability === "already-owned") return "Owned";
  if (availability === "insufficient") return "Need more points";
  return "Unavailable";
}

function purchaseMessage(item: CatCatalogItem, outcome: CatEconomyActionOutcome): string {
  if (outcome === "purchased") return `${item.name} is yours.`;
  if (outcome === "queued-offline") return `${item.name} is saved for purchase and will sync when you’re back online.`;
  if (outcome === "queued-blocked") return `${item.name} is saved behind an earlier change and waiting to sync.`;
  if (outcome === "queued") return "Purchase is saved and waiting to sync.";
  if (outcome === "insufficient") return "Not enough points yet. Nothing was lost.";
  if (outcome === "already-owned") return `${item.name} is already yours.`;
  if (outcome === "locked") return `This opens at ${item.unlockActiveDays} active days.`;
  return "That purchase could not be completed. Your points and items are safe.";
}

function consumptionMessage(outcome: CatEconomyActionOutcome): string {
  if (outcome === "queued-offline") return "Feeding is saved and will finish when you’re back online.";
  if (outcome === "queued-blocked") return "Feeding is saved behind an earlier change and waiting to sync.";
  if (outcome === "queued") return "Feeding is saved and waiting to sync.";
  if (outcome === "empty") return "There is none of that food in the cupboard yet.";
  return "That snack could not be used. Your inventory is safe.";
}

function catPendingSyncMessage(sync: AppSyncState): string {
  if (sync.status === "offline") {
    return "Your Cat Room change is safe on this device and will retry when the connection returns.";
  }
  if (sync.status === "error") {
    return "Your Cat Room change is safe and waiting for retry.";
  }
  if (sync.status === "syncing") {
    return "Your Cat Room change is safe and syncing now.";
  }
  return "Your Cat Room change is safe and waiting to sync.";
}

function foodPose(itemId: CatItemId): CatPose {
  if (itemId === "kitten-milk") return "milk";
  if (itemId === "cat-treat" || itemId === "freeze-dried-treat") return "treat";
  return "food";
}

function formatPoints(points: number): string {
  return `${Number.isInteger(points) ? points.toFixed(0) : points.toFixed(1)} points`;
}

const styles = StyleSheet.create({
  sectionTabs: { backgroundColor: colors.surfaceMuted, borderRadius: radii.pill, flexDirection: "row", gap: spacing.xs, padding: spacing.xs },
  sectionTab: { alignItems: "center", borderRadius: radii.pill, flex: 1, justifyContent: "center", minHeight: touchTarget },
  sectionTabActive: { backgroundColor: colors.primary },
  sectionTabText: { color: colors.text, fontSize: typography.body, fontWeight: "800" },
  sectionTabTextActive: { color: "#FFFFFF" },
  notice: { backgroundColor: colors.primarySoft, borderRadius: radii.sm, color: colors.text, fontSize: typography.small, lineHeight: 20, padding: spacing.md },
  statGrid: { flexDirection: "row", gap: spacing.sm },
  stat: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, flex: 1, gap: spacing.xs, minHeight: 92, padding: spacing.md },
  statLabel: { color: colors.textMuted, fontSize: typography.label, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase" },
  statValue: { color: colors.text, fontSize: 20, fontWeight: "900" },
  progressTitle: { color: colors.text, fontSize: typography.body, fontWeight: "800" },
  growthStory: { borderTopColor: colors.border, borderTopWidth: 1, gap: spacing.xs, marginTop: spacing.md, paddingTop: spacing.md },
  growthTitle: { color: colors.text, fontSize: typography.body, fontWeight: "900" },
  symbolicNote: { color: colors.textMuted, fontSize: typography.small, fontStyle: "italic", lineHeight: 20 },
  returnMessage: { color: colors.success, fontSize: typography.body, fontWeight: "700", lineHeight: 22 },
  room: { alignItems: "center", backgroundColor: "#FDECCB", borderColor: "#D9A86C", borderRadius: radii.lg, borderWidth: 1, height: 310, justifyContent: "flex-end", overflow: "hidden", padding: spacing.md, position: "relative" },
  gardenRoom: { backgroundColor: "#DFF2D0", borderColor: "#79A96B" },
  gardenSky: { backgroundColor: "#CDECF4", height: 190, left: 0, position: "absolute", right: 0, top: 0 },
  window: { backgroundColor: "#BFE5F5", borderColor: "#FFFFFF", borderWidth: 5, flexDirection: "row", height: 75, left: spacing.lg, position: "absolute", top: spacing.lg, width: 108 },
  windowPane: { borderColor: "#FFFFFF", borderRightWidth: 2, flex: 1 },
  gardenDetail: { color: "#3B6B3B", fontSize: 20, left: 20, letterSpacing: 7, position: "absolute", right: 20, textAlign: "center", top: 50 },
  roomFloor: { backgroundColor: "#E8C895", bottom: 0, height: 118, left: 0, position: "absolute", right: 0 },
  roomFloorHighlight: { backgroundColor: "#F4DDB7", height: 8, left: 0, position: "absolute", right: 0, top: 0 },
  gardenFloor: { backgroundColor: "#A9CF83" },
  gardenFloorHighlight: { backgroundColor: "#C7E4A9" },
  kittenLayer: { bottom: 66, height: 110, left: "50%", marginLeft: -80, position: "absolute", width: CAT_SPRITE_WIDTH, zIndex: 3 },
  roomMessage: { backgroundColor: "rgba(255,255,255,0.92)", borderRadius: radii.sm, marginTop: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, width: "100%", zIndex: 10 },
  roomMessageText: { color: colors.text, fontSize: typography.small, textAlign: "center" },
  movingTarget: { height: 38, left: "50%", marginLeft: -19, marginTop: -19, position: "absolute", top: "43%", width: 38, zIndex: 6 },
  yarnHome: { bottom: 70, height: 38, position: "absolute", right: 24, width: 44, zIndex: 2 },
  yarnBall: { backgroundColor: "#9C6644", borderColor: "#6F422A", borderRadius: 16, borderWidth: 2, height: 32, left: 2, position: "absolute", top: 2, width: 32 },
  yarnStripe: { backgroundColor: "#F0D5B5", height: 2, left: 5, position: "absolute", top: 13, width: 20 },
  yarnStripeOne: { transform: [{ rotate: "28deg" }] },
  yarnStripeTwo: { transform: [{ rotate: "-35deg" }] },
  yarnTail: { borderBottomColor: "#9C6644", borderBottomWidth: 2, borderRadius: 10, bottom: 0, height: 11, position: "absolute", right: 0, transform: [{ rotate: "14deg" }], width: 18 },
  mouseHome: { bottom: 72, height: 26, position: "absolute", right: 82, width: 48, zIndex: 2 },
  mouseBody: { backgroundColor: "#817A85", borderColor: "#514B55", borderRadius: 12, borderWidth: 2, height: 22, left: 13, position: "absolute", top: 2, width: 30 },
  mouseEar: { backgroundColor: "#C58B9A", borderColor: "#514B55", borderRadius: 6, borderWidth: 1, height: 11, left: 3, position: "absolute", top: -5, width: 11 },
  mouseEye: { backgroundColor: "#2E2930", borderRadius: 2, height: 4, position: "absolute", right: 6, top: 5, width: 4 },
  mouseNose: { backgroundColor: "#C66F7C", borderRadius: 3, height: 5, position: "absolute", right: -4, top: 9, width: 5 },
  mouseTail: { borderColor: "#A36D78", borderRadius: 12, borderTopWidth: 2, height: 15, left: 0, position: "absolute", top: 6, transform: [{ rotate: "-12deg" }], width: 18 },
  wandTarget: { height: 64, marginLeft: -26, marginTop: -32, width: 52 },
  wandHandle: { backgroundColor: "#6D4C41", borderRadius: 3, height: 42, position: "absolute", right: 5, top: 0, transform: [{ rotate: "24deg" }], width: 5 },
  wandString: { backgroundColor: "#715B77", height: 35, position: "absolute", right: 18, top: 26, transform: [{ rotate: "38deg" }], width: 2 },
  wandTip: { backgroundColor: "#E76F51", borderColor: "#A83D31", borderRadius: 8, borderWidth: 2, bottom: 0, height: 16, left: 5, position: "absolute", width: 16 },
  butterflyTarget: { alignItems: "center", flexDirection: "row", height: 30, justifyContent: "center", marginLeft: -21, marginTop: -15, width: 42 },
  butterflyWing: { borderRadius: 10, height: 20, width: 17 },
  butterflyWingLeft: { backgroundColor: "#F4A261", transform: [{ rotate: "-18deg" }] },
  butterflyWingRight: { backgroundColor: "#E76F51", transform: [{ rotate: "18deg" }] },
  butterflyBody: { backgroundColor: "#50394C", borderRadius: 2, height: 22, marginHorizontal: -1, width: 4, zIndex: 2 },
  catBed: { backgroundColor: "#D9A4C4", borderColor: "#8C5177", borderRadius: 34, borderWidth: 5, bottom: 59, height: 55, left: 18, position: "absolute", width: 112 },
  windowCushion: { backgroundColor: "#D79B62", borderColor: "#8F5C32", borderRadius: 8, borderWidth: 3, height: 24, left: 20, position: "absolute", top: 92, width: 116 },
  scratchingPost: { bottom: 58, height: 135, left: 26, position: "absolute", width: 82, zIndex: 1 },
  scratchingPostSecondary: { left: undefined, right: 20 },
  scratchingPostTop: { backgroundColor: "#8F5C32", borderRadius: 7, height: 14, left: 25, position: "absolute", top: 0, width: 32 },
  scratchingPostColumn: { backgroundColor: "#C59A6D", borderColor: "#8F5C32", borderWidth: 3, height: 108, left: 31, position: "absolute", top: 10, width: 20 },
  scratchingPostBase: { backgroundColor: "#8F5C32", borderRadius: 8, bottom: 0, height: 18, left: 2, position: "absolute", width: 78 },
  catTree: { bottom: 57, height: 170, left: 16, position: "absolute", width: 130, zIndex: 1 },
  catTreeTop: { backgroundColor: "#B8865B", borderColor: "#70452B", borderRadius: 9, borderWidth: 3, height: 22, left: 12, position: "absolute", top: 0, width: 74 },
  catTreeUpperPost: { backgroundColor: "#C59A6D", borderColor: "#70452B", borderWidth: 3, height: 62, left: 42, position: "absolute", top: 19, width: 18 },
  catTreeMiddle: { backgroundColor: "#B8865B", borderColor: "#70452B", borderRadius: 8, borderWidth: 3, height: 20, left: 28, position: "absolute", top: 75, width: 92 },
  catTreeLowerPost: { backgroundColor: "#C59A6D", borderColor: "#70452B", borderWidth: 3, height: 63, left: 76, position: "absolute", top: 92, width: 20 },
  catTreeBase: { backgroundColor: "#8F5C32", borderRadius: 8, bottom: 0, height: 18, left: 16, position: "absolute", width: 110 },
  cardTitle: { color: colors.text, fontSize: typography.heading, fontWeight: "800" },
  actionGroup: { gap: spacing.sm, marginTop: spacing.sm },
  actionLabel: { color: colors.textMuted, fontSize: typography.label, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase" },
  actionWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  actionButton: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: "#C4B5FD", borderRadius: radii.sm, borderWidth: 1, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  actionButtonText: { color: colors.primaryPressed, fontSize: typography.small, fontWeight: "800" },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.5 },
  inventoryGroup: { gap: spacing.xs },
  inventoryLabel: { color: colors.textMuted, fontSize: typography.small, fontWeight: "800" },
  inventoryText: { color: colors.text, fontSize: typography.body, lineHeight: 22 },
  storeBalance: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radii.lg, padding: spacing.lg },
  storeBalanceLabel: { color: "#EDE9FE", fontSize: typography.small, fontWeight: "800" },
  storeBalanceValue: { color: "#FFFFFF", fontSize: 30, fontWeight: "900", marginTop: spacing.xs },
  storeSection: { gap: spacing.sm },
  categoryTitle: { color: colors.text, fontSize: typography.heading, fontWeight: "900" },
  storeItem: { alignItems: "flex-start", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, flexDirection: "row", gap: spacing.md, justifyContent: "space-between", padding: spacing.md },
  storeItemCopy: { flex: 1, gap: spacing.xs },
  itemName: { color: colors.text, fontSize: typography.body, fontWeight: "800" },
  itemDescription: { color: colors.textMuted, fontSize: typography.small, lineHeight: 20 },
  ownedText: { color: colors.success, fontSize: typography.small, fontWeight: "800" },
  priceColumn: { alignItems: "flex-end", gap: spacing.sm, maxWidth: 145 },
  price: { color: colors.text, fontSize: typography.body, fontWeight: "900" },
});
