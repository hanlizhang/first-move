import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  useFirstMoveApp,
  type AppSyncState,
  type CatEconomyActionOutcome,
} from "../../app-state/app-provider.tsx";
import { formatMobileSyncDiagnostic } from "../../cloud/sync-runtime.ts";
import { PixelKitten } from "../../components/pixel-kitten.tsx";
import {
  PixelCollectionIcon,
  PixelCoinIcon,
  PixelItemIcon,
  PixelMilestoneIcon,
  PixelStoreIcon,
} from "../../components/pixel-scenes.tsx";
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
  CAT_QA_PREVIEW_DAYS,
  CAT_QA_PREVIEW_ITEM_IDS,
  CAT_ROOM_LAYOUT,
  catButterflyFollowSteps,
  catFoodVisualFor,
  catMouseChaseSteps,
  catQaPreviewEnabled,
  catRoomScrollTarget,
  catScratchingPostPlacement,
  catTreePlacementSteps,
  catInteractionAvailability,
  catYarnPlaySteps,
  clampNormalizedRoomPoint,
  clampRoomPointToArea,
  createCatIdleScheduler,
  createCatSequenceScheduler,
  facingTowardRoomPoint,
  normalizedRoomPoint,
  normalizedRoomPointFromTranslation,
  projectCatQaPreview,
  roomPointInArea,
  shouldWandPounce,
  stepTowardRoomPoint,
  type CatFacing,
  type CatFoodVisual,
  type CatIdleAction,
  type CatInteractionPhase,
  type CatInteractionSequence,
  type CatQaPreviewDay,
  type NormalizedRoomPoint,
} from "../../domain/cat-interactions.ts";
import {
  CAT_STORE_CATEGORIES,
  CAT_STORE_ITEMS,
  catItem,
  isCatItemId,
  isCatItemUnlocked,
  type CatCatalogItem,
  type CatItemId,
} from "../../domain/cat-items.ts";
import { createCatQaPreviewWorkspace } from "../../domain/cat-qa-preview.ts";
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
  catOffsetPx?: { x: number; y: number };
  caption: string;
  discreteReducedMotionPlacement?: boolean;
  durationMs: number;
  facing?: CatFacing;
  phase?: CatInteractionPhase;
  point?: NormalizedRoomPoint;
  pose: CatPose;
  scene?: CatScene;
  snapTarget?: boolean;
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
const MOBILE_MOUSE_STEPS = catMouseChaseSteps();
const MOBILE_YARN_STEPS = catYarnPlaySteps();
const MOBILE_SCRATCH_PLACEMENT = catScratchingPostPlacement();
const MOBILE_TREE_STEPS = catTreePlacementSteps();
const MOBILE_BUTTERFLY_STEPS = catButterflyFollowSteps();

export default function CatScreen() {
  const { height: windowHeight } = useWindowDimensions();
  const { visualPreview } = useLocalSearchParams<{ visualPreview?: string }>();
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
  const qaPreviewAvailable = catQaPreviewEnabled(__DEV__);
  const canonicalRoom = useMemo(
    () => getCatRoomView(localWorkspace, today),
    [localWorkspace, today],
  );
  const [section, setSection] = useState<CatSection>(
    __DEV__ && visualPreview === "store-food" ? "store" : "room",
  );
  const [savingId, setSavingId] = useState<string>();
  const [queuedPurchase, setQueuedPurchase] = useState<{
    itemId: string;
    lastSuccessfulSyncAt?: string;
  }>();
  const [notice, setNotice] = useState("");
  const [qaPreviewActiveDay, setQaPreviewActiveDay] = useState<CatQaPreviewDay>();
  const [qaPreviewOwnedItemIds, setQaPreviewOwnedItemIds] = useState<CatItemId[]>([]);
  const [qaPreviewFurnitureId, setQaPreviewFurnitureId] = useState<CatItemId | null>();
  const canonicalOwnedItemIds = useMemo(
    () => localWorkspace.inventory.items
      .filter((entry) => entry.quantity > 0)
      .map((entry) => entry.itemId)
      .filter(isCatItemId),
    [localWorkspace.inventory.items],
  );
  const qaProjection = useMemo(
    () => projectCatQaPreview(
      {
        activeDays: localWorkspace.progress.totalActiveDays,
        ownedItemIds: canonicalOwnedItemIds,
        selectedFurnitureId: canonicalRoom.selectedFurniture?.id,
      },
      {
        activeDay: qaPreviewActiveDay,
        ownedItemIds: qaPreviewOwnedItemIds,
        selectedFurnitureId: qaPreviewFurnitureId,
      },
      qaPreviewAvailable,
    ),
    [canonicalOwnedItemIds, canonicalRoom.selectedFurniture?.id, localWorkspace.progress.totalActiveDays, qaPreviewActiveDay, qaPreviewAvailable, qaPreviewFurnitureId, qaPreviewOwnedItemIds],
  );
  const qaPreviewActive = qaProjection.active;
  const previewWorkspace = useMemo(
    () => createCatQaPreviewWorkspace(localWorkspace, qaProjection),
    [localWorkspace, qaProjection],
  );
  const room = useMemo(
    () => getCatRoomView(previewWorkspace, today),
    [previewWorkspace, today],
  );
  const catInteractions = useCatRoomInteractions({
    enabled: localWorkspaceStatus === "ready",
    selectedFurnitureId: room.selectedFurniture?.id,
  });
  const scrollViewRef = useRef<ScrollView>(null);
  const catRoomRef = useRef<View>(null);
  const scrollYRef = useRef(0);
  const viewportHeightRef = useRef(0);
  const roomHeight = Math.min(600, Math.max(460, windowHeight - 220));

  const playVisualPreviewFood = catInteractions.playFood;
  const playVisualPreviewSequence = catInteractions.playSequence;
  useEffect(() => {
    if (!__DEV__ || !visualPreview || localWorkspaceStatus !== "ready") return undefined;
    let secondFrame: number | undefined;
    const firstFrame = requestAnimationFrame(() => {
      if (["collection", "food", "furniture", "scratch", "tree", "yarn"].includes(visualPreview)) {
        setQaPreviewActiveDay(100);
        setQaPreviewOwnedItemIds(
          visualPreview === "collection"
            ? [...CAT_QA_PREVIEW_ITEM_IDS]
            : [
              visualPreview === "food"
                ? "kitten-milk"
                : visualPreview === "yarn"
                  ? "yarn-toy"
                  : visualPreview === "scratch"
                    ? "scratching-post"
                    : "cat-tree",
            ],
        );
        setQaPreviewFurnitureId(
          visualPreview === "scratch"
            ? "scratching-post"
            : visualPreview === "tree" || visualPreview === "furniture"
              ? "cat-tree"
              : null,
        );
      }
      setSection(visualPreview === "store-food" ? "store" : "room");
      secondFrame = requestAnimationFrame(() => {
        if (visualPreview === "food") {
          playVisualPreviewFood("milk");
          scrollViewRef.current?.scrollTo({ animated: false, y: 0 });
        } else if (visualPreview === "scratch" || visualPreview === "tree" || visualPreview === "yarn") {
          playVisualPreviewSequence(visualPreview);
          scrollViewRef.current?.scrollTo({ animated: false, y: 0 });
        } else if (visualPreview === "collection") {
          scrollViewRef.current?.scrollTo({ animated: false, y: 0 });
        } else if (visualPreview === "store-food") {
          scrollViewRef.current?.scrollTo({ animated: false, y: 330 });
        } else {
          scrollViewRef.current?.scrollTo({ animated: false, y: 0 });
        }
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame !== undefined) cancelAnimationFrame(secondFrame);
    };
  }, [localWorkspaceStatus, playVisualPreviewFood, playVisualPreviewSequence, visualPreview]);
  const bringCatRoomIntoView = useCallback(() => {
    catRoomRef.current?.measureInWindow((_x, roomTop, _width, roomHeight) => {
      const targetY = catRoomScrollTarget({
        currentScrollY: scrollYRef.current,
        padding: spacing.md,
        roomHeight,
        roomTop,
        viewportHeight: viewportHeightRef.current,
      });
      if (targetY === undefined) return;
      scrollViewRef.current?.scrollTo({
        animated: !catInteractions.reducedMotion,
        y: targetY,
      });
    });
  }, [catInteractions.reducedMotion]);

  useFocusEffect(useCallback(() => {
    if (!qaPreviewAvailable) return undefined;
    return () => {
      setQaPreviewActiveDay(undefined);
      setQaPreviewOwnedItemIds([]);
      setQaPreviewFurnitureId(undefined);
    };
  }, [qaPreviewAvailable]));
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
    if (qaPreviewActive) {
      setNotice("QA preview is transient. Use the ownership controls to preview this item.");
      return;
    }
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
    const foodVisual = catFoodVisualFor(item.id);
    if (!foodVisual) return;
    if (qaPreviewActive) {
      const previewFood = room.ownedFood.find((entry) => entry.item.id === item.id);
      if (!previewFood || previewFood.quantity < 1) {
        setNotice(consumptionMessage("empty"));
        return;
      }
      catInteractions.playFood(foodPose(foodVisual));
      setNotice("");
      return;
    }
    if (!canStartCatFoodInteraction(localWorkspace, item.id)) {
      setNotice(consumptionMessage("empty"));
      return;
    }
    catInteractions.playFood(foodPose(foodVisual));
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
    if (qaPreviewActive) {
      setQaPreviewFurnitureId(itemId ?? null);
      setNotice(
        itemId
          ? `${catItem(itemId)?.name ?? "Furniture"} is temporarily shown for QA.`
          : "The furnishing is temporarily hidden for QA.",
      );
      return;
    }
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

  function toggleQaPreviewOwnership(itemId: CatItemId) {
    if (qaPreviewOwnedItemIds.includes(itemId) && qaPreviewFurnitureId === itemId) {
      setQaPreviewFurnitureId(undefined);
    }
    setQaPreviewOwnedItemIds((current) => current.includes(itemId)
      ? current.filter((candidate) => candidate !== itemId)
      : [...current, itemId]);
  }

  function resetQaPreview() {
    setQaPreviewActiveDay(undefined);
    setQaPreviewOwnedItemIds([]);
    setQaPreviewFurnitureId(undefined);
    catInteractions.returnToRoom();
    setNotice("");
  }

  function showSection(nextSection: CatSection) {
    if (nextSection === "store") catInteractions.returnToRoom();
    setSection(nextSection);
    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({
        animated: !catInteractions.reducedMotion,
        y: 0,
      });
    });
  }

  const statusNotices = (
    <>
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
    </>
  );

  if (section === "store") {
    return (
      <Screen
        eyebrow="Cat"
        title="Cat Store"
        description="Choose something useful or cozy for your kitten."
        scrollViewRef={scrollViewRef}
      >
        {statusNotices}
        <Pressable
          accessibilityRole="button"
          onPress={() => showSection("room")}
          style={({ pressed }) => [styles.backToRoom, pressed && styles.pressed]}
        >
          <Text style={styles.backToRoomArrow}>‹</Text>
          <Text style={styles.backToRoomText}>Back to Cat Room</Text>
        </Pressable>
        <CatStore
          disabled={economicWriteDisabled}
          onBuy={(item) => void buy(item)}
          pendingItemId={savingId}
          queuedItemId={queuedPurchaseItemId}
          previewActive={qaPreviewActive}
          room={room}
          state={previewWorkspace}
          syncPending={pendingAuthenticatedWrite}
        />
      </Screen>
    );
  }

  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.roomSafeArea}>
      <ScrollView
        contentContainerStyle={styles.roomScreenContent}
        onLayout={(event) => {
          viewportHeightRef.current = event.nativeEvent.layout.height;
        }}
        onScroll={(event) => {
          scrollYRef.current = event.nativeEvent.contentOffset.y;
        }}
        ref={scrollViewRef}
        scrollEventThrottle={16}
      >
        <View style={styles.roomScreenHeader}>
          <Text accessibilityRole="header" style={styles.roomScreenTitle}>Cat Room</Text>
          <Text style={styles.roomScreenStage}>{room.stage}</Text>
        </View>
        {statusNotices}
        <CatRoom
          economicWriteDisabled={economicWriteDisabled}
          transientInteractionDisabled={transientInteractionDisabled}
          onChooseFurniture={(itemId) => void chooseFurniture(itemId)}
          onFeed={(item) => void feed(item)}
          interactions={catInteractions}
          initialItemsExpanded={__DEV__ && visualPreview === "collection"}
          onOpenStore={() => showSection("store")}
          onVisualCommandStart={bringCatRoomIntoView}
          previewActive={qaPreviewActive}
          roomHeight={roomHeight}
          roomRef={catRoomRef}
          room={room}
        />
        {__DEV__ && !visualPreview ? (
          <CatQaPreviewPanel
            active={qaPreviewActive}
            activeDay={qaPreviewActiveDay}
            onActiveDayChange={setQaPreviewActiveDay}
            onReset={resetQaPreview}
            onToggleOwnership={toggleQaPreviewOwnership}
            ownedItemIds={qaPreviewOwnedItemIds}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function CatQaPreviewPanel({
  active,
  activeDay,
  onActiveDayChange,
  onReset,
  onToggleOwnership,
  ownedItemIds,
}: {
  active: boolean;
  activeDay?: CatQaPreviewDay;
  onActiveDayChange(day?: CatQaPreviewDay): void;
  onReset(): void;
  onToggleOwnership(itemId: CatItemId): void;
  ownedItemIds: readonly CatItemId[];
}) {
  const [expanded, setExpanded] = useState(false);
  const previewSummary = [
    activeDay === undefined ? "Real Active Day" : `Day ${activeDay}`,
    ...ownedItemIds.map((itemId) => catItem(itemId)?.name ?? itemId),
  ].join(" · ");

  return (
    <View accessibilityLabel="Cat QA development preview" style={styles.qaPanel}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((current) => !current)}
        style={({ pressed }) => [styles.qaDisclosure, pressed && styles.qaChipPressed]}
      >
        <Text style={styles.qaTitle}>Cat QA · DEV ONLY</Text>
        <Text style={styles.qaDisclosureIcon}>{expanded ? "−" : "+"}</Text>
      </Pressable>
      <Text style={styles.qaSummary}>Preview: {previewSummary}</Text>
      {expanded ? (
        <>
          <Text style={styles.qaDescription}>
            Preview only. Does not change your real account, points, inventory, or cloud data.
          </Text>
          <Text style={styles.qaDescription}>
            Preview Active Day controls store eligibility. Preview ownership controls interaction availability.
          </Text>
          <View style={styles.qaHeader}>
            <Text style={styles.qaLabel}>Preview Active Day</Text>
            <ActionButton disabled={!active} label="Reset Preview" onPress={onReset} />
          </View>
          <View style={styles.qaChipWrap}>
            <CatQaChip label="Real" onPress={() => onActiveDayChange(undefined)} selected={activeDay === undefined} />
            {CAT_QA_PREVIEW_DAYS.map((day) => (
              <CatQaChip key={day} label={`${day}`} onPress={() => onActiveDayChange(day)} selected={activeDay === day} />
            ))}
          </View>
          <Text style={styles.qaLabel}>Preview ownership</Text>
          <View style={styles.qaChipWrap}>
            {CAT_QA_PREVIEW_ITEM_IDS.map((itemId) => (
              <CatQaChip
                key={itemId}
                label={catItem(itemId)?.name ?? itemId}
                onPress={() => onToggleOwnership(itemId)}
                selected={ownedItemIds.includes(itemId)}
              />
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

function CatQaChip({ label, onPress, selected }: { label: string; onPress(): void; selected: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.qaChip, selected && styles.qaChipSelected, pressed && styles.qaChipPressed]}
    >
      <Text style={[styles.qaChipText, selected && styles.qaChipTextSelected]}>{label}</Text>
    </Pressable>
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
  const [reducedMotion, setReducedMotion] = useState(false);
  const reducedMotionRef = useRef(false);
  const selectedFurnitureRef = useRef(selectedFurnitureId);
  const roomLayoutRef = useRef({ height: 0, width: 0 });
  const catPointRef = useRef<NormalizedRoomPoint>({ ...CAT_HOME_POINT });
  const catPixelOffsetRef = useRef({ x: 0, y: 0 });
  const renderedCatTranslationRef = useRef({ x: 0, y: 0 });
  const targetPointRef = useRef<NormalizedRoomPoint>({ ...CAT_ROOM_LAYOUT.wandStart });
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
    const xListener = catTranslateX.addListener(({ value }) => {
      renderedCatTranslationRef.current.x = value;
    });
    const yListener = catTranslateY.addListener(({ value }) => {
      renderedCatTranslationRef.current.y = value;
    });
    return () => {
      catTranslateX.removeListener(xListener);
      catTranslateY.removeListener(yListener);
    };
  }, [catTranslateX, catTranslateY]);

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
      pixelOffset = { x: 0, y: 0 },
    ) => {
      const nextPoint = clampNormalizedRoomPoint(point);
      const baseTranslation = catTranslationFor(
        nextPoint,
        roomLayoutRef.current.width,
        roomLayoutRef.current.height,
      );
      const translation = {
        x: baseTranslation.x + pixelOffset.x,
        y: baseTranslation.y + pixelOffset.y,
      };
      if (reducedMotionRef.current) {
        catAnimationRef.current?.stop();
        catAnimationRef.current = undefined;
        if (discreteReducedMotionPlacement) {
          catPointRef.current = nextPoint;
          catPixelOffsetRef.current = pixelOffset;
          renderedCatTranslationRef.current = translation;
          catTranslateX.setValue(translation.x);
          catTranslateY.setValue(translation.y);
        }
        return;
      }
      catAnimationRef.current?.stop();
      // Keep relayouts anchored to the active destination. Facing uses the
      // listener-backed rendered position instead of this planned point.
      catPointRef.current = nextPoint;
      catPixelOffsetRef.current = pixelOffset;
      if (durationMs === 0) {
        catAnimationRef.current = undefined;
        renderedCatTranslationRef.current = translation;
        catTranslateX.setValue(translation.x);
        catTranslateY.setValue(translation.y);
        return;
      }
      const animation = Animated.parallel([
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
      catAnimationRef.current = animation;
      animation.start(({ finished }) => {
        if (finished && catAnimationRef.current === animation) {
          catAnimationRef.current = undefined;
        }
      });
    },
    [catTranslateX, catTranslateY],
  );

  const renderedCatPoint = useCallback(
    () => normalizedRoomPointFromTranslation(
      renderedCatTranslationRef.current.x,
      renderedCatTranslationRef.current.y,
      roomLayoutRef.current.width,
      roomLayoutRef.current.height,
      CAT_SPRITE_WIDTH / 2,
      94,
    ),
    [],
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
    (scene: CatScene, animate = true, facing = visualRef.current.facing) => {
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
        facing,
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
      if (!steps[0]?.point) setCatPoint(CAT_HOME_POINT, 0, true);
      activeActionRef.current = action;
      sequenceScheduler.start(
        steps,
        (step, index) => {
          if (
            !mountedRef.current ||
            !focusedRef.current ||
            !enabledRef.current ||
            activeActionRef.current !== action
          ) {
            return;
          }
          const scene = step.scene ?? settleScene;
          const renderedPoint = renderedCatPoint();
          const facing =
            step.facing ??
            (step.targetPoint
              ? facingTowardRoomPoint(renderedPoint, step.targetPoint, visualRef.current.facing)
              : visualRef.current.facing);
          if (step.targetPoint) {
            setTargetPoint(step.targetPoint, index === 0 || step.snapTarget ? 0 : 260);
          }
          if (step.point) {
            setCatPoint(
              step.point,
              Math.min(440, Math.round(step.durationMs * 0.45)),
              userInitiated && step.discreteReducedMotionPlacement,
              step.catOffsetPx,
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
    [cancelActive, commitVisual, renderedCatPoint, sequenceScheduler, setCatPoint, setTargetPoint, settle],
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
    settle("room", true, "right");
  }, [cancelActive, settle]);

  const exploreRoom = useCallback(() => {
    const destination = roomPointInArea(CAT_ROOM_LAYOUT.mousePlayArea, 0.92, 1);
    startSteps(
      "room-walk",
      [
        {
          caption: CAT_INTERACTION_CAPTIONS.walking,
          durationMs: 3_200,
          discreteReducedMotionPlacement: true,
          facing: facingTowardRoomPoint(CAT_HOME_POINT, destination, "right"),
          point: destination,
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
        playSequence("perch-nap");
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
            facing: "right",
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
    setTargetPoint(CAT_ROOM_LAYOUT.wandStart, 0);
    const currentCatPoint = renderedCatPoint();
    const facing = facingTowardRoomPoint(
      currentCatPoint,
      CAT_ROOM_LAYOUT.wandStart,
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
  }, [cancelActive, commitVisual, renderedCatPoint, setTargetPoint]);

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
      const nextTarget = clampRoomPointToArea(
        normalizedRoomPoint(
          x,
          y,
          roomLayoutRef.current.width,
          roomLayoutRef.current.height,
        ),
        CAT_ROOM_LAYOUT.wandPlayArea,
      );
      const currentCatPoint = renderedCatPoint();
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
      setTargetPoint(nextTarget, 0);
      setCatPoint(nextCatPoint, 180);

      const now = Date.now();
      const pouncing = visualRef.current.pose === "pouncing";
      if (pouncing) {
        if (facing !== visualRef.current.facing) {
          commitVisual({ ...visualRef.current, facing });
        }
        return;
      }
      if (
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

      if (facing !== visualRef.current.facing) {
        commitVisual({ ...visualRef.current, facing });
      }
    },
    [clearPounceTimer, commitVisual, renderedCatPoint, setCatPoint, setTargetPoint],
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
      catTranslation.x += catPixelOffsetRef.current.x;
      catTranslation.y += catPixelOffsetRef.current.y;
      const targetTranslation = targetTranslationFor(
        targetPointRef.current,
        roomLayoutRef.current.width,
        roomLayoutRef.current.height,
      );
      renderedCatTranslationRef.current = catTranslation;
      catTranslateX.setValue(catTranslation.x);
      catTranslateY.setValue(catTranslation.y);
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
      setReducedMotion(value);
      if (value) {
        catAnimationRef.current?.stop();
        catAnimationRef.current = undefined;
        catPointRef.current = { ...CAT_HOME_POINT };
        catPixelOffsetRef.current = { x: 0, y: 0 };
        const homeTranslation = catTranslationFor(
          CAT_HOME_POINT,
          roomLayoutRef.current.width,
          roomLayoutRef.current.height,
        );
        renderedCatTranslationRef.current = homeTranslation;
        catTranslateX.setValue(homeTranslation.x);
        catTranslateY.setValue(homeTranslation.y);
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
        catPixelOffsetRef.current = { x: 0, y: 0 };
        targetPointRef.current = { ...CAT_ROOM_LAYOUT.wandStart };
        const homeTranslation = catTranslationFor(
          CAT_HOME_POINT,
          roomLayoutRef.current.width,
          roomLayoutRef.current.height,
        );
        renderedCatTranslationRef.current = homeTranslation;
        catTranslateX.setValue(homeTranslation.x);
        catTranslateY.setValue(homeTranslation.y);
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
    reducedMotion,
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
      discreteReducedMotionPlacement: true,
      durationMs: step.durationMs,
      phase: step.phase,
    };
    if (sequence === "yarn") {
      const placement = MOBILE_YARN_STEPS[index] ?? MOBILE_YARN_STEPS[0]!;
      return {
        ...common,
        point: placement.cat,
        pose: index === 0 ? "anticipating" : index === 1 ? "yarn" : "sitting",
        snapTarget: true,
        target: "yarn",
        targetPoint: placement.target,
      };
    }
    if (sequence === "mouse") {
      const placement = MOBILE_MOUSE_STEPS[index] ?? MOBILE_MOUSE_STEPS[0]!;
      return {
        ...common,
        point: placement.cat,
        pose: index === 0 ? "anticipating" : index === 1 ? "walking" : "mouse",
        snapTarget: true,
        target: "mouse",
        targetPoint: placement.target,
      };
    }
    if (sequence === "scratch") {
      return {
        ...common,
        catOffsetPx: MOBILE_SCRATCH_PLACEMENT.catOffsetPx,
        facing: "right" as const,
        point: MOBILE_SCRATCH_PLACEMENT.cat,
        pose: index % 2 === 0 ? "scratching-left" : "scratching-right",
        targetPoint: MOBILE_SCRATCH_PLACEMENT.target,
        temporaryFurniture: "scratching-post" as const,
      };
    }
    if (sequence === "bed-nap") {
      return {
        ...common,
        point: CAT_ROOM_LAYOUT.bedAnchor,
        pose: "sleeping" as const,
      };
    }
    if (sequence === "perch-nap") {
      return {
        ...common,
        facing: "left" as const,
        point: CAT_ROOM_LAYOUT.windowPerchAnchor,
        pose: "sleeping" as const,
      };
    }
    if (sequence === "perch") {
      return {
        ...common,
        facing: "left" as const,
        point: CAT_ROOM_LAYOUT.windowPerchAnchor,
        pose: "watching" as const,
      };
    }
    if (sequence === "tree") {
      const placement = MOBILE_TREE_STEPS[index] ?? MOBILE_TREE_STEPS[0]!;
      return {
        ...common,
        catOffsetPx: placement.catOffsetPx,
        facing: "left" as const,
        point: placement.cat,
        pose: index === 0 ? "climbing" : "perched",
        targetPoint: placement.target,
      };
    }
    if (sequence === "high-five") {
      return { ...common, point: CAT_ROOM_LAYOUT.catHome, pose: "high-five" as const };
    }
    if (sequence === "paw-shake") {
      return { ...common, point: CAT_ROOM_LAYOUT.catHome, pose: "paw-shake" as const };
    }
    const placement = MOBILE_BUTTERFLY_STEPS[index] ?? MOBILE_BUTTERFLY_STEPS[0]!;
    return {
      ...common,
      point: placement.cat,
      pose: index === 0 ? "anticipating" : "butterfly",
      scene: "garden" as const,
      snapTarget: true,
      target: "butterfly" as const,
      targetPoint: placement.target,
    };
  });
}

function catTranslationFor(
  point: NormalizedRoomPoint,
  roomWidth: number,
  roomHeight: number,
): NormalizedRoomPoint {
  return {
    x: point.x * roomWidth - CAT_SPRITE_WIDTH / 2,
    y: point.y * roomHeight - 94,
  };
}

function targetTranslationFor(
  point: NormalizedRoomPoint,
  roomWidth: number,
  roomHeight: number,
): NormalizedRoomPoint {
  return {
    x: point.x * roomWidth,
    y: point.y * roomHeight,
  };
}

function CatRoom({
  economicWriteDisabled,
  interactions,
  initialItemsExpanded,
  onChooseFurniture,
  onFeed,
  onOpenStore,
  onVisualCommandStart,
  previewActive,
  room,
  roomHeight,
  roomRef,
  transientInteractionDisabled,
}: {
  economicWriteDisabled: boolean;
  interactions: ReturnType<typeof useCatRoomInteractions>;
  initialItemsExpanded: boolean;
  onChooseFurniture(itemId?: CatItemId): void;
  onFeed(item: CatCatalogItem): void;
  onOpenStore(): void;
  onVisualCommandStart(): void;
  previewActive: boolean;
  room: CatRoomView;
  roomHeight: number;
  roomRef: RefObject<View | null>;
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
  const [itemsExpanded, setItemsExpanded] = useState(initialItemsExpanded);
  const [growthExpanded, setGrowthExpanded] = useState(false);
  const [furnitureChoice, setFurnitureChoice] = useState<CatItemId>();
  const previewSafeEconomicDisabled = previewActive ? false : economicWriteDisabled;
  const beginVisualCommand = (command: () => void) => {
    setFurnitureChoice(undefined);
    setItemsExpanded(false);
    onVisualCommandStart();
    command();
  };
  const chooseFurnitureAndClose = (itemId?: CatItemId) => {
    setFurnitureChoice(undefined);
    setItemsExpanded(false);
    onChooseFurniture(itemId);
  };
  const feedAndClose = (item: CatCatalogItem) => {
    setItemsExpanded(false);
    onVisualCommandStart();
    onFeed(item);
  };
  const activateToy = (itemId: CatItemId) => {
    if (itemId === "yarn-toy") {
      beginVisualCommand(() => interactions.playSequence("yarn"));
    } else if (itemId === "toy-mouse") {
      beginVisualCommand(() => interactions.playSequence("mouse"));
    } else if (itemId === "teaser-wand") {
      setFurnitureChoice(undefined);
      setItemsExpanded(false);
      if (visual.action !== "wand") onVisualCommandStart();
      interactions.toggleWand();
    }
  };
  const activateActivity = (itemId: CatItemId) => {
    if (itemId === "high-five") {
      beginVisualCommand(() => interactions.playSequence("high-five"));
    } else if (itemId === "paw-shake") {
      beginVisualCommand(() => interactions.playSequence("paw-shake"));
    } else if (itemId === "outdoor-garden") {
      beginVisualCommand(garden ? interactions.returnToRoom : interactions.visitGarden);
    } else if (itemId === "butterfly" && garden) {
      beginVisualCommand(() => interactions.playSequence("butterfly"));
    }
  };
  const activatePlacedFurniture = (itemId: CatItemId) => {
    if (itemId === "scratching-post") {
      beginVisualCommand(() => interactions.playSequence("scratch"));
    } else if (itemId === "cat-tree") {
      beginVisualCommand(() => interactions.playSequence("tree"));
    } else if (itemId === "cat-bed") {
      beginVisualCommand(() => interactions.nap("cat-bed"));
    } else if (itemId === "window-cushion") {
      setGrowthExpanded(false);
      setItemsExpanded(false);
      setFurnitureChoice("window-cushion");
    }
  };

  return (
    <View style={styles.roomExperience}>
      {room.returnMessage ? (
        <Card tone="success">
          <Text accessibilityLiveRegion="polite" style={styles.returnMessage}>
            {room.returnMessage}
          </Text>
        </Card>
      ) : null}

      <View style={[styles.roomFrame, garden && styles.gardenRoomFrame]}>
        <View pointerEvents="box-none" style={styles.roomHud}>
          <View
            accessibilityLabel={`${formatPointAmount(room.points)} points`}
            accessible
            style={styles.pointsHud}
          >
            <PixelCoinIcon size={30} />
            <Text style={styles.pointsHudValue}>{formatPointAmount(room.points)}</Text>
          </View>
          <View style={styles.roomHudActions}>
            <Pressable
              accessibilityHint="Shows Active Days and the kitten growth chapter"
              accessibilityLabel="Growth and milestones"
              accessibilityRole="button"
              accessibilityState={{ expanded: growthExpanded }}
              onPress={() => {
                setItemsExpanded(false);
                setGrowthExpanded((current) => !current);
              }}
              style={({ pressed }) => [styles.hudButton, pressed && styles.pressed]}
            >
              <PixelMilestoneIcon size={28} />
            </Pressable>
            <Pressable
              accessibilityHint="Shows owned actions, toys, food, and furniture"
              accessibilityLabel="Open Items"
              accessibilityRole="button"
              accessibilityState={{ expanded: itemsExpanded }}
              onPress={() => {
                setGrowthExpanded(false);
                setItemsExpanded((current) => !current);
              }}
              style={({ pressed }) => [styles.hudButton, itemsExpanded && styles.hudButtonActive, pressed && styles.pressed]}
            >
              <PixelCollectionIcon size={28} />
            </Pressable>
            <Pressable
              accessibilityLabel="Open Cat Store"
              accessibilityRole="button"
              onPress={() => {
                setGrowthExpanded(false);
                setItemsExpanded(false);
                onOpenStore();
              }}
              style={({ pressed }) => [styles.hudButton, pressed && styles.pressed]}
            >
              <PixelStoreIcon size={28} />
            </Pressable>
          </View>
        </View>
        <View
          {...interactions.panHandlers}
          accessibilityHint={visual.action === "wand" ? "Drag anywhere inside the room to move the teaser." : undefined}
          accessibilityLabel={`${room.stage}. ${visual.caption}`}
          accessibilityRole="image"
          onLayout={interactions.onRoomLayout}
          ref={roomRef}
          style={[styles.room, { height: roomHeight }, garden && styles.gardenRoom]}
          testID="cat-room-scene"
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
          {!garden ? (
            <FurnitureVisual
              itemId={room.selectedFurniture?.id}
              onPress={activatePlacedFurniture}
            />
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
          {furnitureChoice === "window-cushion" && !garden ? (
            <View
              accessibilityLabel="Window perch actions"
              style={[styles.furnitureChoice, { top: roomHeight * 0.43 }]}
            >
              <ContextChoiceButton
                disabled={transientInteractionDisabled}
                label="Watch"
                onPress={() => beginVisualCommand(() => interactions.playSequence("perch"))}
              />
              <ContextChoiceButton
                disabled={transientInteractionDisabled}
                label="Nap"
                onPress={() => beginVisualCommand(() => interactions.nap("window-cushion"))}
              />
              <SheetCloseButton label="Close perch actions" onPress={() => setFurnitureChoice(undefined)} />
            </View>
          ) : null}
        </View>
        {growthExpanded ? (
          <View accessibilityLabel="Growth and milestone details" style={styles.floatingSheet}>
            <View style={styles.sheetHeader}>
              <View style={styles.growthDetailHeader}>
                <PixelMilestoneIcon size={34} />
                <View style={styles.growthDetailTitleGroup}>
                  <Text style={styles.growthTitle}>{room.growthStory.title}</Text>
                  <Text style={styles.progressTitle}>
                    {room.activeDays} active day{room.activeDays === 1 ? "" : "s"}{previewActive ? " · Preview" : ""}
                  </Text>
                </View>
              </View>
              <SheetCloseButton label="Close milestones" onPress={() => setGrowthExpanded(false)} />
            </View>
            <Body>{room.growthStory.description}</Body>
            <Body muted>
              {room.nextUnlock
                ? `Next: ${room.nextUnlock.label} at ${room.nextUnlock.day} active days.`
                : "All core Cat Room adventures are unlocked."}
            </Body>
            <Text style={styles.symbolicNote}>Active days are a symbolic journey, not a literal kitten age.</Text>
          </View>
        ) : null}

        {itemsExpanded ? (
          <View accessibilityLabel="Items tray" style={[styles.floatingSheet, styles.itemTray]}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetTitleGroup}>
                <PixelCollectionIcon size={30} />
                <Text accessibilityRole="header" style={styles.sheetTitle}>Items</Text>
              </View>
              <SheetCloseButton label="Close Items" onPress={() => setItemsExpanded(false)} />
            </View>
            <ScrollView
              contentContainerStyle={styles.itemTrayContent}
              nestedScrollEnabled
              showsVerticalScrollIndicator
              style={styles.itemTrayScroll}
            >
              {room.ownedFood.length > 0 ? (
                <ItemTraySection label="Food">
                  {room.ownedFood.map(({ item, quantity }) => (
                    <ItemTrayButton
                      disabled={previewSafeEconomicDisabled}
                      item={item}
                      key={item.id}
                      onPress={() => feedAndClose(item)}
                      quantity={quantity}
                    />
                  ))}
                </ItemTraySection>
              ) : null}

              {room.ownedToys.length > 0 ? (
                <ItemTraySection label="Toys">
                  {room.ownedToys.map(({ item }) => (
                    <ItemTrayButton
                      disabled={transientInteractionDisabled}
                      item={item}
                      key={item.id}
                      onPress={() => activateToy(item.id)}
                    />
                  ))}
                </ItemTraySection>
              ) : null}

              {room.ownedFurniture.length > 0 ? (
                <ItemTraySection label="Furniture">
                  {room.ownedFurniture.map(({ item }) => (
                    <ItemTrayButton
                      disabled={previewSafeEconomicDisabled || room.selectedFurniture?.id === item.id}
                      item={item}
                      key={item.id}
                      onPress={() => chooseFurnitureAndClose(item.id)}
                      selected={room.selectedFurniture?.id === item.id}
                    />
                  ))}
                  {room.selectedFurniture ? (
                    <TrayUtilityButton
                      disabled={previewSafeEconomicDisabled}
                      label="Clear room"
                      onPress={() => chooseFurnitureAndClose(undefined)}
                    />
                  ) : null}
                </ItemTraySection>
              ) : null}

              {[...room.ownedTricks, ...room.ownedScenes, ...room.ownedInteractions]
                .filter(({ item }) => item.id !== "butterfly" || garden).length > 0 ? (
                <ItemTraySection label="Activities">
                  {[...room.ownedTricks, ...room.ownedScenes, ...room.ownedInteractions]
                    .filter(({ item }) => item.id !== "butterfly" || garden)
                    .map(({ item }) => (
                      <ItemTrayButton
                        disabled={transientInteractionDisabled}
                        item={item}
                        key={item.id}
                        onPress={() => activateActivity(item.id)}
                      />
                    ))}
                </ItemTraySection>
              ) : null}
            </ScrollView>
          </View>
        ) : null}
      </View>

      <TransientCatCaption
        caption={visual.caption}
        reducedMotion={interactions.reducedMotion}
        visible={Boolean(visual.action)}
      />
    </View>
  );
}

function SheetCloseButton({ label, onPress }: { label: string; onPress(): void }) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.sheetCloseButton, pressed && styles.pressed]}
    >
      <Text style={styles.sheetCloseText}>×</Text>
    </Pressable>
  );
}

function ItemTraySection({ children, label }: { children: ReactNode; label: string }) {
  return (
    <View style={styles.itemTraySection}>
      <Text style={styles.itemTraySectionLabel}>{label}</Text>
      <View style={styles.itemTrayGrid}>{children}</View>
    </View>
  );
}

function ItemTrayButton({
  disabled = false,
  item,
  onPress,
  quantity,
  selected = false,
}: {
  disabled?: boolean;
  item: CatCatalogItem;
  onPress(): void;
  quantity?: number;
  selected?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={quantity === undefined ? item.name : `${item.name}, quantity ${quantity}`}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.itemTrayButton,
        selected && styles.itemTrayButtonSelected,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <View style={styles.itemTrayIcon}>
        <PixelItemIcon itemId={item.id} size={48} />
        {quantity !== undefined ? (
          <View style={styles.itemTrayQuantity}>
            <Text style={styles.itemTrayQuantityText}>×{quantity}</Text>
          </View>
        ) : null}
      </View>
      <Text numberOfLines={2} style={styles.itemTrayLabel}>{itemTrayLabel(item.id)}</Text>
    </Pressable>
  );
}

function TrayUtilityButton({
  disabled = false,
  label,
  onPress,
}: {
  disabled?: boolean;
  label: string;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.trayUtilityButton, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Text style={styles.trayUtilityIcon}>×</Text>
      <Text style={styles.itemTrayLabel}>{label}</Text>
    </Pressable>
  );
}

function ContextChoiceButton({
  disabled = false,
  label,
  onPress,
}: {
  disabled?: boolean;
  label: string;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.contextChoiceButton, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Text style={styles.contextChoiceText}>{label}</Text>
    </Pressable>
  );
}

function itemTrayLabel(itemId: CatItemId): string {
  const labels: Partial<Record<CatItemId, string>> = {
    "kitten-milk": "Milk",
    "wet-kitten-food": "Wet food",
    "cat-food": "Kibble",
    "cat-treat": "Soft treat",
    "freeze-dried-treat": "Freeze-dried",
    "yarn-toy": "Yarn",
    "toy-mouse": "Mouse",
    "teaser-wand": "Wand",
    "scratching-post": "Scratch post",
    "window-cushion": "Window perch",
    "cat-tree": "Cat tree",
    "cat-bed": "Cat bed",
    "high-five": "High-five",
    "paw-shake": "Paw shake",
    "outdoor-garden": "Garden",
    butterfly: "Butterfly",
  };
  return labels[itemId] ?? catItem(itemId)?.name ?? itemId;
}

/*
 * Item actions intentionally live in the temporary room tray above. Keeping the
 * caption outside the artwork prevents it from obscuring the cat.
 */
function TransientCatCaption({
  caption,
  reducedMotion,
  visible,
}: {
  caption: string;
  reducedMotion: boolean;
  visible: boolean;
}) {
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    opacity.stopAnimation();
    if (!visible) {
      opacity.setValue(0);
      return undefined;
    }
    opacity.setValue(reducedMotion ? 1 : 0);
    const reveal = reducedMotion
      ? undefined
      : Animated.timing(opacity, {
        duration: 180,
        easing: Easing.out(Easing.quad),
        toValue: 1,
        useNativeDriver: true,
      });
    reveal?.start();
    const timeout = setTimeout(() => {
      if (reducedMotion) {
        opacity.setValue(0);
        return;
      }
      Animated.timing(opacity, {
        duration: 260,
        easing: Easing.in(Easing.quad),
        toValue: 0,
        useNativeDriver: true,
      }).start();
    }, 4_500);
    return () => {
      clearTimeout(timeout);
      reveal?.stop();
    };
  }, [caption, opacity, reducedMotion, visible]);

  if (!visible) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.roomCaption, { opacity }]}
      testID="cat-room-caption"
    >
      <Text accessibilityLiveRegion="polite" style={styles.roomCaptionText}>
        {caption}
      </Text>
    </Animated.View>
  );
}

function CatStore({
  disabled,
  onBuy,
  pendingItemId,
  previewActive,
  queuedItemId,
  room,
  state,
  syncPending,
}: {
  disabled: boolean;
  onBuy(item: CatCatalogItem): void;
  pendingItemId?: string;
  previewActive: boolean;
  queuedItemId?: string;
  room: CatRoomView;
  state: Parameters<typeof purchaseAvailability>[0];
  syncPending: boolean;
}) {
  return (
    <>
      <View style={styles.storeBalance}>
        <PixelCoinIcon size={34} />
        <View>
          <Text style={styles.storeBalanceLabel}>Available points</Text>
          <Text style={styles.storeBalanceValue}>{formatPointAmount(room.points)}</Text>
        </View>
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
            const previewButtonLabel = quantity > 0
              ? "Preview owned"
              : unlocked
                ? "Preview eligible"
                : `Preview locked · day ${item.unlockActiveDays}`;
            return (
              <View key={item.id} style={styles.storeItem}>
                <View style={styles.storeItemIcon}>
                  <PixelItemIcon itemId={item.id} size={64} />
                </View>
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
                    disabled={previewActive || disabled || availability !== "available"}
                    label={
                      previewActive
                        ? previewButtonLabel
                        : pendingItemId === item.id
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
      {ownsYarn && activeTarget === "yarn" ? (
        <Animated.View
          accessibilityLabel="Yarn ball in room"
          pointerEvents="none"
          style={[styles.movingTarget, movingTarget]}
        >
          <PixelItemIcon itemId="yarn-toy" size={42} />
        </Animated.View>
      ) : null}
      {ownsMouse && activeTarget === "mouse" ? (
        <Animated.View
          accessibilityLabel="Toy mouse in room"
          pointerEvents="none"
          style={[styles.movingTarget, movingTarget]}
        >
          <PixelItemIcon itemId="toy-mouse" size={46} />
        </Animated.View>
      ) : null}
      {activeTarget === "wand" ? (
        <Animated.View
          accessibilityLabel="Moving teaser wand target"
          pointerEvents="none"
          style={[styles.movingTarget, styles.wandTarget, movingTarget]}
        >
          <PixelItemIcon itemId="teaser-wand" size={58} />
        </Animated.View>
      ) : null}
      {activeTarget === "butterfly" ? (
        <Animated.View
          accessibilityLabel="Butterfly in garden"
          pointerEvents="none"
          style={[styles.movingTarget, styles.butterflyTarget, movingTarget]}
        >
          <PixelItemIcon itemId="butterfly" size={42} />
        </Animated.View>
      ) : null}
    </>
  );
}

function FurnitureVisual({
  itemId,
  onPress,
}: {
  itemId?: CatItemId;
  onPress?(itemId: CatItemId): void;
}) {
  if (itemId === "cat-bed") {
    return (
      <Pressable
        accessibilityHint="Starts a nap"
        accessibilityLabel="Cat bed in room"
        accessibilityRole="button"
        disabled={!onPress}
        onPress={() => onPress?.(itemId)}
        style={[styles.catBed, roomAnchorStyle(CAT_ROOM_LAYOUT.bedAnchor)]}
      />
    );
  }
  if (itemId === "window-cushion") {
    return (
      <Pressable
        accessibilityHint="Shows watch and nap choices"
        accessibilityLabel="Window perch in room"
        accessibilityRole="button"
        disabled={!onPress}
        onPress={() => onPress?.(itemId)}
        style={[styles.windowCushion, roomAnchorStyle(CAT_ROOM_LAYOUT.windowPerchAnchor)]}
      />
    );
  }
  if (itemId === "scratching-post") {
    return (
      <Pressable
        accessibilityHint="Starts scratching"
        accessibilityLabel="Scratching post in room"
        accessibilityRole="button"
        disabled={!onPress}
        onPress={() => onPress?.(itemId)}
        style={[styles.scratchingPost, roomAnchorStyle(CAT_ROOM_LAYOUT.scratchingPostAnchor)]}
      >
        <View style={styles.scratchingPostTop} />
        <View style={styles.scratchingPostColumn} />
        <View style={styles.scratchingPostBase} />
      </Pressable>
    );
  }
  if (itemId === "cat-tree") {
    return (
      <Pressable
        accessibilityHint="Starts climbing and perching"
        accessibilityLabel="Cat tree in room"
        accessibilityRole="button"
        disabled={!onPress}
        onPress={() => onPress?.(itemId)}
        style={[styles.catTree, roomAnchorStyle(CAT_ROOM_LAYOUT.catTreeFloorAnchor)]}
      >
        <View style={styles.catTreeTop} />
        <View style={styles.catTreeUpperPost} />
        <View style={styles.catTreeMiddle} />
        <View style={styles.catTreeLowerPost} />
        <View style={styles.catTreeBase} />
      </Pressable>
    );
  }
  return null;
}

function roomAnchorStyle(point: NormalizedRoomPoint) {
  return {
    left: `${point.x * 100}%` as const,
    top: `${point.y * 100}%` as const,
  };
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

function foodPose(visual: CatFoodVisual): CatPose {
  if (visual === "wet-food") return "wet-food";
  if (visual === "kibble") return "food";
  if (visual === "soft-treat") return "treat";
  if (visual === "freeze-dried-treat") return "freeze-dried-treat";
  return "milk";
}

function formatPoints(points: number): string {
  return `${Number.isInteger(points) ? points.toFixed(0) : points.toFixed(1)} points`;
}

function formatPointAmount(points: number): string {
  return Number.isInteger(points) ? points.toFixed(0) : points.toFixed(1);
}

const styles = StyleSheet.create({
  roomSafeArea: { backgroundColor: colors.background, flex: 1 },
  roomScreenContent: { flexGrow: 1, gap: spacing.sm, paddingBottom: spacing.lg, paddingHorizontal: spacing.sm, paddingTop: spacing.xs },
  roomScreenHeader: { alignItems: "baseline", flexDirection: "row", justifyContent: "space-between", minHeight: 38, paddingHorizontal: spacing.xs },
  roomScreenTitle: { color: colors.text, fontSize: 24, fontWeight: "900", letterSpacing: -0.4 },
  roomScreenStage: { color: colors.textMuted, fontSize: typography.small, fontWeight: "800" },
  backToRoom: { alignItems: "center", alignSelf: "flex-start", flexDirection: "row", minHeight: touchTarget, paddingRight: spacing.md },
  backToRoomArrow: { color: colors.primary, fontSize: 30, fontWeight: "700", marginRight: spacing.xs },
  backToRoomText: { color: colors.primary, fontSize: typography.small, fontWeight: "900" },
  qaPanel: { backgroundColor: "#F5F3FF", borderColor: "#7C3AED", borderRadius: radii.md, borderStyle: "dashed", borderWidth: 1, gap: spacing.sm, padding: spacing.md },
  qaHeader: { alignItems: "flex-start", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" },
  qaDisclosure: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", minHeight: touchTarget },
  qaDisclosureIcon: { color: "#5B21B6", fontSize: 22, fontWeight: "900" },
  qaTitle: { color: "#5B21B6", fontSize: typography.label, fontWeight: "900", letterSpacing: 1.1 },
  qaSummary: { color: "#5B21B6", fontSize: typography.small, fontWeight: "800", lineHeight: 19 },
  qaDescription: { color: colors.textMuted, fontSize: typography.small, lineHeight: 19, marginTop: spacing.xs },
  qaLabel: { color: colors.text, fontSize: typography.label, fontWeight: "800", letterSpacing: 0.6, marginTop: spacing.xs, textTransform: "uppercase" },
  qaChipWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  qaChip: { backgroundColor: colors.surface, borderColor: "#C4B5FD", borderRadius: radii.pill, borderWidth: 1, justifyContent: "center", minHeight: 34, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  qaChipSelected: { backgroundColor: "#6D28D9", borderColor: "#6D28D9" },
  qaChipPressed: { opacity: 0.72 },
  qaChipText: { color: "#5B21B6", fontSize: typography.small, fontWeight: "700" },
  qaChipTextSelected: { color: "#FFFFFF" },
  notice: { backgroundColor: colors.primarySoft, borderRadius: radii.sm, color: colors.text, fontSize: typography.small, lineHeight: 20, padding: spacing.md },
  progressTitle: { color: colors.text, fontSize: typography.body, fontWeight: "800" },
  growthTitle: { color: colors.text, fontSize: typography.body, fontWeight: "900" },
  symbolicNote: { color: colors.textMuted, fontSize: typography.small, fontStyle: "italic", lineHeight: 20 },
  returnMessage: { color: colors.success, fontSize: typography.body, fontWeight: "700", lineHeight: 22 },
  roomExperience: { gap: spacing.sm },
  roomFrame: { backgroundColor: "#FFFCF6", borderColor: "#D9A86C", borderRadius: radii.lg, borderWidth: 1, overflow: "hidden", position: "relative" },
  gardenRoomFrame: { borderColor: "#79A96B" },
  room: { alignItems: "center", backgroundColor: "#FDECCB", overflow: "hidden", padding: spacing.md, position: "relative" },
  gardenRoom: { backgroundColor: "#DFF2D0" },
  gardenSky: { backgroundColor: "#CDECF4", height: 190, left: 0, position: "absolute", right: 0, top: 0 },
  window: { backgroundColor: "#BFE5F5", borderColor: "#FFFFFF", borderWidth: 5, flexDirection: "row", height: 84, left: spacing.lg, position: "absolute", top: 78, width: 118 },
  windowPane: { borderColor: "#FFFFFF", borderRightWidth: 2, flex: 1 },
  gardenDetail: { color: "#3B6B3B", fontSize: 20, left: 20, letterSpacing: 7, position: "absolute", right: 20, textAlign: "center", top: 50 },
  roomFloor: { backgroundColor: "#E8C895", bottom: 0, left: 0, position: "absolute", right: 0, top: `${CAT_ROOM_LAYOUT.floorY * 100}%` },
  roomFloorHighlight: { backgroundColor: "#F4DDB7", height: 8, left: 0, position: "absolute", right: 0, top: 0 },
  gardenFloor: { backgroundColor: "#A9CF83" },
  gardenFloorHighlight: { backgroundColor: "#C7E4A9" },
  kittenLayer: { height: 110, left: 0, position: "absolute", top: 0, width: CAT_SPRITE_WIDTH, zIndex: 3 },
  roomHud: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", left: 12, position: "absolute", right: 12, top: 12, zIndex: 12 },
  pointsHud: { alignItems: "center", backgroundColor: "rgba(255, 252, 246, 0.94)", borderColor: "#E4D3BE", borderRadius: radii.pill, borderWidth: 1, flexDirection: "row", gap: spacing.sm, minHeight: touchTarget, paddingHorizontal: spacing.sm },
  pointsHudValue: { color: "#4A2F21", fontSize: typography.body, fontVariant: ["tabular-nums"], fontWeight: "900" },
  roomHudActions: { flexDirection: "row", gap: spacing.xs },
  hudButton: { alignItems: "center", backgroundColor: "rgba(255, 252, 246, 0.94)", borderColor: "#E4D3BE", borderRadius: radii.pill, borderWidth: 1, height: touchTarget, justifyContent: "center", width: touchTarget },
  hudButtonActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  roomCaption: { alignItems: "center", alignSelf: "center", backgroundColor: colors.surface, borderColor: "#E4D3BE", borderRadius: radii.md, borderWidth: 1, justifyContent: "center", maxWidth: 300, minHeight: 42, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  roomCaptionText: { color: colors.text, flexShrink: 1, fontSize: typography.small, lineHeight: 20, textAlign: "center", width: "100%" },
  floatingSheet: { backgroundColor: "rgba(255, 252, 246, 0.98)", borderColor: "#D9A86C", borderRadius: radii.lg, borderWidth: 2, bottom: spacing.sm, gap: spacing.sm, left: spacing.sm, maxHeight: 390, padding: spacing.md, position: "absolute", right: spacing.sm, shadowColor: "#4A2F21", shadowOffset: { height: 4, width: 0 }, shadowOpacity: 0.18, shadowRadius: 10, zIndex: 20 },
  sheetHeader: { alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" },
  sheetTitleGroup: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  sheetTitle: { color: colors.text, fontSize: typography.heading, fontWeight: "900" },
  sheetCloseButton: { alignItems: "center", backgroundColor: colors.surfaceMuted, borderRadius: radii.pill, height: touchTarget, justifyContent: "center", width: touchTarget },
  sheetCloseText: { color: colors.text, fontSize: 26, fontWeight: "700", lineHeight: 28 },
  itemTray: { backgroundColor: "rgba(255, 247, 231, 0.98)", maxHeight: 360, padding: spacing.sm },
  itemTrayScroll: { maxHeight: 296 },
  itemTrayContent: { gap: spacing.md, paddingBottom: spacing.xs },
  itemTraySection: { gap: spacing.xs },
  itemTraySectionLabel: { color: colors.text, fontSize: typography.label, fontWeight: "900", letterSpacing: 0.8, textTransform: "uppercase" },
  itemTrayGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  itemTrayButton: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, gap: 3, minHeight: 82, padding: spacing.xs, width: 72 },
  itemTrayButtonSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary, borderWidth: 2 },
  itemTrayIcon: { alignItems: "center", height: 50, justifyContent: "center", position: "relative", width: 56 },
  itemTrayLabel: { color: colors.text, fontSize: 11, fontWeight: "800", lineHeight: 13, textAlign: "center" },
  itemTrayQuantity: { backgroundColor: colors.primary, borderRadius: radii.pill, minWidth: 25, paddingHorizontal: 4, paddingVertical: 1, position: "absolute", right: -2, top: -2 },
  itemTrayQuantityText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900", textAlign: "center" },
  trayUtilityButton: { alignItems: "center", backgroundColor: colors.surfaceMuted, borderColor: colors.border, borderRadius: radii.md, borderStyle: "dashed", borderWidth: 1, gap: 4, justifyContent: "center", minHeight: 82, padding: spacing.xs, width: 72 },
  trayUtilityIcon: { color: colors.textMuted, fontSize: 26, fontWeight: "500", lineHeight: 32 },
  furnitureChoice: { alignItems: "center", backgroundColor: "rgba(255, 252, 246, 0.98)", borderColor: "#D9A86C", borderRadius: radii.md, borderWidth: 2, flexDirection: "row", gap: spacing.xs, left: spacing.sm, padding: spacing.xs, position: "absolute", zIndex: 9 },
  contextChoiceButton: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radii.sm, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.md },
  contextChoiceText: { color: colors.primaryPressed, fontSize: typography.small, fontWeight: "900" },
  growthDetailHeader: { alignItems: "center", flex: 1, flexDirection: "row", gap: spacing.sm },
  growthDetailTitleGroup: { flex: 1, gap: 2 },
  movingTarget: { height: 64, left: 0, marginLeft: -32, marginTop: -32, position: "absolute", top: 0, width: 64, zIndex: 6 },
  wandTarget: { height: 64, width: 64 },
  butterflyTarget: { height: 64, width: 64 },
  catBed: { backgroundColor: "#D9A4C4", borderColor: "#8C5177", borderRadius: 34, borderWidth: 5, height: 55, marginLeft: -56, marginTop: -25, position: "absolute", width: 112 },
  windowCushion: { backgroundColor: "#D79B62", borderColor: "#8F5C32", borderRadius: 8, borderWidth: 3, height: 24, marginLeft: -58, marginTop: -4, position: "absolute", width: 116 },
  scratchingPost: { height: 135, marginLeft: -41, marginTop: -135, position: "absolute", width: 82, zIndex: 1 },
  scratchingPostTop: { backgroundColor: "#8F5C32", borderRadius: 7, height: 14, left: 25, position: "absolute", top: 0, width: 32 },
  scratchingPostColumn: { backgroundColor: "#C59A6D", borderColor: "#8F5C32", borderWidth: 3, height: 108, left: 31, position: "absolute", top: 10, width: 20 },
  scratchingPostBase: { backgroundColor: "#8F5C32", borderRadius: 8, bottom: 0, height: 18, left: 2, position: "absolute", width: 78 },
  catTree: { height: 170, marginLeft: -65, marginTop: -170, position: "absolute", width: 130, zIndex: 1 },
  catTreeTop: { backgroundColor: "#B8865B", borderColor: "#70452B", borderRadius: 9, borderWidth: 3, height: 22, left: 12, position: "absolute", top: 0, width: 74 },
  catTreeUpperPost: { backgroundColor: "#C59A6D", borderColor: "#70452B", borderWidth: 3, height: 62, left: 42, position: "absolute", top: 19, width: 18 },
  catTreeMiddle: { backgroundColor: "#B8865B", borderColor: "#70452B", borderRadius: 8, borderWidth: 3, height: 20, left: 28, position: "absolute", top: 75, width: 92 },
  catTreeLowerPost: { backgroundColor: "#C59A6D", borderColor: "#70452B", borderWidth: 3, height: 63, left: 76, position: "absolute", top: 92, width: 20 },
  catTreeBase: { backgroundColor: "#8F5C32", borderRadius: 8, bottom: 0, height: 18, left: 16, position: "absolute", width: 110 },
  cardTitle: { color: colors.text, fontSize: typography.heading, fontWeight: "800" },
  actionButton: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.border, borderRadius: radii.sm, borderWidth: 1, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  actionButtonText: { color: colors.primaryPressed, fontSize: typography.small, fontWeight: "800" },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.5 },
  storeBalance: { alignItems: "center", alignSelf: "flex-start", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.pill, borderWidth: 1, flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  storeBalanceLabel: { color: colors.textMuted, fontSize: typography.label, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase" },
  storeBalanceValue: { color: colors.text, fontSize: 24, fontVariant: ["tabular-nums"], fontWeight: "900" },
  storeSection: { gap: spacing.sm },
  categoryTitle: { color: colors.text, fontSize: typography.heading, fontWeight: "900" },
  storeItem: { alignItems: "flex-start", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, flexDirection: "row", gap: spacing.md, justifyContent: "space-between", padding: spacing.md },
  storeItemIcon: { alignItems: "center", backgroundColor: colors.surfaceMuted, borderRadius: radii.md, height: 68, justifyContent: "center", width: 68 },
  storeItemCopy: { flex: 1, gap: spacing.xs },
  itemName: { color: colors.text, fontSize: typography.body, fontWeight: "800" },
  itemDescription: { color: colors.textMuted, fontSize: typography.small, lineHeight: 20 },
  ownedText: { color: colors.success, fontSize: typography.small, fontWeight: "800" },
  priceColumn: { alignItems: "flex-end", gap: spacing.sm, maxWidth: 112 },
  price: { color: colors.text, fontSize: typography.body, fontWeight: "900" },
});
