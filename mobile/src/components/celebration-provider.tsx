import {
  AccessibilityInfo,
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  findNodeHandle,
} from "react-native";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  celebrationPreviewEvent,
  createCelebrationQueueState,
  deriveCelebrations,
  dismissCurrentCelebration,
  enqueueCelebrations,
  focusCompletionCelebration,
  formatFocusDuration,
  formatPositivePoints,
  setCelebrationQueueOwner,
  type CelebrationEvent,
  type CelebrationQueueState,
} from "../domain/celebrations.ts";
import type { ActivitySession, AppState } from "../domain/models.ts";
import { radii, spacing, touchTarget, typography } from "../theme/tokens.ts";
import { PixelStepScene } from "./pixel-scenes.tsx";

type PreviewKind =
  | "points"
  | "active-day"
  | "milestone"
  | "combined"
  | "focus-completed"
  | "focus-stopped";

interface CelebrationContextValue {
  presentWorkspaceTransition(
    ownerKey: string,
    before: AppState,
    after: AppState,
  ): void;
  presentFocusCompletion(session: ActivitySession): void;
  previewCelebration(kind: PreviewKind): void;
  previewReducedMotion: boolean;
  setPreviewReducedMotion(enabled: boolean): void;
  setCelebrationOwner(ownerKey?: string): void;
}

type QueueAction =
  | { type: "dismiss" }
  | { type: "enqueue"; events: CelebrationEvent[] }
  | { type: "owner"; ownerKey?: string };

const CelebrationContext = createContext<CelebrationContextValue | undefined>(
  undefined,
);

export function CelebrationProvider({ children }: { children: ReactNode }) {
  const [queue, dispatch] = useReducer(
    celebrationQueueReducer,
    undefined,
    () => createCelebrationQueueState(),
  );
  const previewSequence = useRef(0);
  const [previewReducedMotion, setPreviewReducedMotionState] = useState(false);

  const setCelebrationOwner = useCallback((ownerKey?: string) => {
    dispatch({ type: "owner", ownerKey });
  }, []);

  const presentWorkspaceTransition = useCallback(
    (ownerKey: string, before: AppState, after: AppState) => {
      dispatch({ type: "owner", ownerKey });
      const events = deriveCelebrations(before, after);
      if (events.length > 0) dispatch({ type: "enqueue", events });
    },
    [],
  );

  const previewCelebration = useCallback((kind: PreviewKind) => {
    if (!__DEV__) return;
    previewSequence.current += 1;
    const preview = celebrationPreviewEvent(kind);
    dispatch({
      type: "enqueue",
      events: [{
        ...preview,
        id: `${preview.id}:${previewSequence.current}`,
        sourceKey: `${preview.sourceKey}:${previewSequence.current}`,
      }],
    });
  }, []);
  const presentFocusCompletion = useCallback((session: ActivitySession) => {
    const event = focusCompletionCelebration(session);
    if (event) dispatch({ type: "enqueue", events: [event] });
  }, []);
  const setPreviewReducedMotion = useCallback((enabled: boolean) => {
    if (__DEV__) setPreviewReducedMotionState(enabled);
  }, []);
  const dismissCelebration = useCallback(() => {
    dispatch({ type: "dismiss" });
  }, []);

  const value = useMemo<CelebrationContextValue>(
    () => ({
      presentWorkspaceTransition,
      presentFocusCompletion,
      previewCelebration,
      previewReducedMotion,
      setPreviewReducedMotion,
      setCelebrationOwner,
    }),
    [
      presentWorkspaceTransition,
      presentFocusCompletion,
      previewCelebration,
      previewReducedMotion,
      setCelebrationOwner,
      setPreviewReducedMotion,
    ],
  );

  return (
    <CelebrationContext.Provider value={value}>
      <View style={styles.app}>{children}</View>
      <CelebrationRenderer
        event={queue.current}
        forceReduceMotion={__DEV__ && previewReducedMotion}
        onDismiss={dismissCelebration}
      />
    </CelebrationContext.Provider>
  );
}

export function useCelebrations(): CelebrationContextValue {
  const context = useContext(CelebrationContext);
  if (!context) {
    throw new Error("useCelebrations must be used inside CelebrationProvider.");
  }
  return context;
}

function celebrationQueueReducer(
  state: CelebrationQueueState,
  action: QueueAction,
): CelebrationQueueState {
  if (action.type === "owner") {
    return setCelebrationQueueOwner(state, action.ownerKey);
  }
  if (action.type === "enqueue") return enqueueCelebrations(state, action.events);
  return dismissCurrentCelebration(state);
}

function CelebrationRenderer({
  event,
  forceReduceMotion,
  onDismiss,
}: {
  event?: CelebrationEvent;
  forceReduceMotion: boolean;
  onDismiss(): void;
}) {
  const reduceMotion = useReduceMotion() || forceReduceMotion;

  if (!event) return null;
  if (event.level === 1) {
    return (
      <PointsCelebration
        event={event}
        onDismiss={onDismiss}
        reduceMotion={reduceMotion}
      />
    );
  }
  if (event.level === 2) {
    const LevelTwoCelebration = event.kind === "focus-completion"
      ? FocusCompletionCelebration
      : ActiveDayCelebration;
    return (
      <LevelTwoCelebration
        event={event}
        onDismiss={onDismiss}
        reduceMotion={reduceMotion}
      />
    );
  }
  return (
    <MilestoneCelebration
      event={event}
      onDismiss={onDismiss}
      reduceMotion={reduceMotion}
    />
  );
}

function PointsCelebration({
  event,
  onDismiss,
  reduceMotion,
}: CelebrationViewProps) {
  const [opacity] = useState(() => new Animated.Value(0));
  const [scale] = useState(() => new Animated.Value(reduceMotion ? 1 : 0.94));
  const [rise] = useState(() => new Animated.Value(reduceMotion ? 0 : 8));

  useEffect(() => {
    opacity.setValue(0);
    scale.setValue(reduceMotion ? 1 : 0.94);
    rise.setValue(reduceMotion ? 0 : 8);
    const reveal = Animated.parallel([
      Animated.timing(opacity, {
        duration: reduceMotion ? 120 : 180,
        easing: Easing.out(Easing.quad),
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        duration: reduceMotion ? 0 : 220,
        easing: Easing.out(Easing.back(1.15)),
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.timing(rise, {
        duration: reduceMotion ? 0 : 220,
        easing: Easing.out(Easing.quad),
        toValue: 0,
        useNativeDriver: true,
      }),
    ]);
    reveal.start();
    const dismissTimer = setTimeout(() => {
      Animated.timing(opacity, {
        duration: 140,
        toValue: 0,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) onDismiss();
      });
    }, 2_800);
    return () => {
      clearTimeout(dismissTimer);
      reveal.stop();
    };
  }, [event.id, onDismiss, opacity, reduceMotion, rise, scale]);

  return (
    <View pointerEvents="none" style={styles.toastLayer}>
      <Animated.View
        accessibilityLabel={event.accessibleLabel}
        accessibilityLiveRegion="polite"
        accessibilityRole="text"
        style={[
          styles.toast,
          { opacity, transform: [{ translateY: rise }, { scale }] },
        ]}
      >
        <ToastStepIcon />
        <Text style={styles.toastSource}>{event.sourceLabel}</Text>
        <Text style={styles.toastPoints}>
          {formatPositivePoints(event.points ?? 0)}
        </Text>
      </Animated.View>
    </View>
  );
}

function ToastStepIcon() {
  return (
    <View accessibilityElementsHidden style={styles.toastSteps}>
      <View style={[styles.toastStep, styles.toastStepOne]} />
      <View style={[styles.toastStep, styles.toastStepTwo]} />
      <View style={[styles.toastStep, styles.toastStepThree]} />
    </View>
  );
}

function ActiveDayCelebration(props: CelebrationViewProps) {
  const { event, reduceMotion } = props;
  return (
    <BlockingCelebrationFrame {...props} tone="daily">
      <View style={styles.activeDayContent}>
        <View style={styles.rewardHeading}>
          <Text style={styles.overlayLabel}>
            {event.focus ? "Focus saved · Daily progress" : "Daily progress"}
          </Text>
          <Text style={styles.activeDayTitle}>You showed up today</Text>
        </View>
        <PixelStepScene reduceMotion={reduceMotion} variant="daily" />
        <View style={styles.primaryRewardGroup}>
          <Text style={styles.activeDayCount}>
            Active Day +{event.activeDayDelta ?? 1}
          </Text>
          <SecondaryRewards event={event} includeActiveDay={false} />
        </View>
      </View>
    </BlockingCelebrationFrame>
  );
}

function FocusCompletionCelebration(props: CelebrationViewProps) {
  const { event, reduceMotion } = props;
  const stopped = event.focus?.outcome === "stopped";
  return (
    <BlockingCelebrationFrame {...props} tone="focus">
      <View style={styles.activeDayContent}>
        <View style={styles.rewardHeading}>
          <Text style={styles.overlayLabel}>Focus saved</Text>
          <Text style={styles.activeDayTitle}>
            {stopped ? "You stopped intentionally" : "Session complete"}
          </Text>
          <Text style={styles.focusSupport}>
            {stopped
              ? "Choosing to stop is still a deliberate step."
              : "One focused step, finished."}
          </Text>
        </View>
        <PixelStepScene reduceMotion={reduceMotion} variant="focus" />
        <View style={styles.primaryRewardGroup}>
          <Text style={styles.focusDuration}>
            {formatFocusDuration(event.focus?.durationMs ?? 0).replace(".", "")}
          </Text>
          <SecondaryRewards event={event} includeActiveDay />
        </View>
      </View>
    </BlockingCelebrationFrame>
  );
}

function MilestoneCelebration(props: CelebrationViewProps) {
  const { event, reduceMotion } = props;
  const milestone = event.milestone;
  return (
    <BlockingCelebrationFrame {...props} tone="milestone">
      <View style={styles.milestoneContent}>
        <View style={styles.milestoneCopy}>
          <Text style={styles.milestoneLabel}>Cat Room milestone</Text>
          <Text style={styles.dayTitle}>Day {milestone?.day ?? event.activeDayTotal}</Text>
          <Text style={styles.milestoneTitle}>
            {milestone?.chapter ?? "Something new for your kitten"}
          </Text>
        </View>
        <PixelStepScene reduceMotion={reduceMotion} variant="milestone" />
        <View style={styles.milestoneRewardGroup}>
          <Text style={styles.milestoneReward}>
            {milestone?.reward ?? "Active Day milestone reached"}
          </Text>
          <SecondaryRewards event={event} includeActiveDay />
        </View>
      </View>
    </BlockingCelebrationFrame>
  );
}

function SecondaryRewards({
  event,
  includeActiveDay,
}: {
  event: CelebrationEvent;
  includeActiveDay: boolean;
}) {
  const rewards = [
    event.focus && event.kind !== "focus-completion"
      ? event.focus.outcome === "completed"
        ? "Session complete"
        : "Focus saved"
      : undefined,
    includeActiveDay && event.activeDayDelta
      ? `Active Day +${event.activeDayDelta}`
      : undefined,
    event.points ? formatPositivePoints(event.points) : undefined,
  ].filter(Boolean);
  return rewards.length > 0 ? (
    <Text style={styles.supportingReward}>{rewards.join(" · ")}</Text>
  ) : null;
}

interface CelebrationViewProps {
  event: CelebrationEvent;
  onDismiss(): void;
  reduceMotion: boolean;
}

function BlockingCelebrationFrame({
  children,
  event,
  onDismiss,
  reduceMotion,
  tone,
}: CelebrationViewProps & {
  children: ReactNode;
  tone: "daily" | "focus" | "milestone";
}) {
  const summaryRef = useRef<View>(null);
  const [opacity] = useState(() => new Animated.Value(0));
  const [scale] = useState(() => new Animated.Value(reduceMotion ? 1 : 0.97));

  useEffect(() => {
    opacity.setValue(0);
    scale.setValue(reduceMotion ? 1 : 0.97);
    const reveal = Animated.parallel([
      Animated.timing(opacity, {
        duration: reduceMotion ? 140 : 240,
        easing: Easing.out(Easing.quad),
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        duration: reduceMotion ? 0 : 280,
        easing: Easing.out(Easing.back(1.08)),
        toValue: 1,
        useNativeDriver: true,
      }),
    ]);
    reveal.start();
    const focusTimer = setTimeout(() => {
      const node = findNodeHandle(summaryRef.current);
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }, reduceMotion ? 160 : 300);
    return () => {
      clearTimeout(focusTimer);
      reveal.stop();
    };
  }, [event.id, opacity, reduceMotion, scale]);

  return (
    <Modal
      animationType="none"
      onRequestClose={onDismiss}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible
    >
      <SafeAreaView
        edges={["top", "right", "bottom", "left"]}
        style={[
          styles.blockingSafeArea,
          tone === "milestone"
            ? styles.milestoneBackground
            : tone === "focus"
              ? styles.focusBackground
              : styles.dailyBackground,
        ]}
      >
        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.fullScreenMoment,
            { opacity, transform: [{ scale }] },
          ]}
        >
          <View
            accessibilityLabel={event.accessibleLabel}
            accessibilityRole="summary"
            accessible
            ref={summaryRef}
            style={styles.summary}
          >
            {children}
          </View>
          <Pressable
            accessibilityHint="Closes this celebration"
            accessibilityRole="button"
            onPress={onDismiss}
            style={({ pressed }) => [
              styles.continueButton,
              pressed && styles.continuePressed,
            ]}
          >
            <Text style={styles.continueText}>Continue</Text>
          </Pressable>
        </Animated.View>
      </SafeAreaView>
    </Modal>
  );
}

function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}

const styles = StyleSheet.create({
  app: { flex: 1 },
  toastLayer: {
    alignItems: "center",
    left: spacing.md,
    position: "absolute",
    right: spacing.md,
    top: spacing.xxl,
    zIndex: 100,
  },
  toast: {
    alignItems: "center",
    backgroundColor: "#4A2F21",
    borderRadius: radii.pill,
    flexDirection: "row",
    gap: spacing.sm,
    maxWidth: 360,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
  },
  toastSource: {
    color: "#FFF1DE",
    fontSize: typography.small,
    fontWeight: "700",
  },
  toastPoints: {
    color: "#FFD19B",
    fontSize: typography.body,
    fontWeight: "900",
  },
  blockingSafeArea: {
    flex: 1,
    justifyContent: "center",
  },
  dailyBackground: { backgroundColor: "#FFF5E7" },
  focusBackground: { backgroundColor: "#FFF9F0" },
  milestoneBackground: { backgroundColor: "#FFF1DD" },
  summary: { flex: 1 },
  activeDayContent: {
    alignItems: "center",
    flex: 1,
    justifyContent: "space-evenly",
    minHeight: 440,
  },
  rewardHeading: { alignItems: "center", gap: spacing.sm },
  overlayLabel: {
    color: "#9A5936",
    fontSize: typography.label,
    fontWeight: "900",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  activeDayTitle: {
    color: "#4A2F21",
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: -0.7,
    lineHeight: 38,
    maxWidth: 330,
    textAlign: "center",
  },
  activeDayCount: {
    color: "#A94F3D",
    fontSize: 28,
    fontWeight: "900",
  },
  focusSupport: {
    color: "#7A6354",
    fontSize: typography.body,
    lineHeight: 24,
    maxWidth: 300,
    textAlign: "center",
  },
  focusDuration: {
    color: "#8B5A35",
    fontSize: 24,
    fontWeight: "900",
    textAlign: "center",
  },
  primaryRewardGroup: { alignItems: "center", gap: spacing.sm },
  supportingReward: {
    color: "#7A6354",
    fontSize: typography.body,
    fontWeight: "800",
    lineHeight: 24,
    maxWidth: 340,
    textAlign: "center",
  },
  fullScreenMoment: {
    alignSelf: "center",
    flex: 1,
    justifyContent: "space-between",
    maxWidth: 480,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    width: "100%",
  },
  milestoneContent: {
    alignItems: "center",
    flex: 1,
    justifyContent: "space-evenly",
    minHeight: 420,
  },
  milestoneCopy: { alignItems: "center", gap: spacing.sm },
  milestoneLabel: {
    color: "#A94F3D",
    fontSize: typography.label,
    fontWeight: "900",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  dayTitle: {
    color: "#4A2F21",
    fontSize: 44,
    fontWeight: "900",
    letterSpacing: -1.2,
    lineHeight: 50,
    textTransform: "uppercase",
  },
  milestoneTitle: {
    color: "#6C4430",
    fontSize: typography.heading,
    fontWeight: "800",
    lineHeight: 28,
    maxWidth: 320,
    textAlign: "center",
  },
  milestoneRewardGroup: { alignItems: "center", gap: spacing.xs },
  milestoneReward: {
    color: "#A94F3D",
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 30,
    maxWidth: 320,
    textAlign: "center",
  },
  continueButton: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "#8B5A35",
    borderRadius: radii.sm,
    justifyContent: "center",
    minHeight: touchTarget,
    maxWidth: 420,
    paddingHorizontal: spacing.lg,
    width: "100%",
  },
  continuePressed: { backgroundColor: "#70452B" },
  continueText: {
    color: "#FFFFFF",
    fontSize: typography.body,
    fontWeight: "900",
  },
  toastSteps: {
    alignItems: "flex-end",
    flexDirection: "row",
    height: 18,
    width: 24,
  },
  toastStep: { backgroundColor: "#E49B5D", width: 8 },
  toastStepOne: { height: 6 },
  toastStepTwo: { height: 12 },
  toastStepThree: { height: 18 },
});
