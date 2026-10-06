import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useFirstMoveApp } from "../../app-state/app-provider.tsx";
import {
  cancelPendingIntent,
  createPendingIntent,
  getPendingIntent,
} from "../../domain/app-state.ts";
import {
  DIRECTIONS,
  INTENDED_DURATIONS,
  STUCK_STATES,
  type Direction,
  type IntendedDuration,
  type StuckState,
} from "../../domain/models.ts";
import { getOpenSession } from "../../domain/sessions.ts";
import {
  nextShorterDuration,
  templatesFor,
} from "../../domain/templates.ts";
import {
  Body,
  Card,
  Heading,
  Label,
  LoadingState,
  PrimaryButton,
  Screen,
} from "../../components/ui.tsx";
import {
  PixelDirectionIcon,
  PixelKittenScene,
} from "../../components/pixel-scenes.tsx";
import {
  colors,
  radii,
  spacing,
  touchTarget,
  typography,
} from "../../theme/tokens.ts";

type FlowStep = "landing" | "stuck-state" | "direction" | "move";

export default function FirstMovesScreen() {
  const router = useRouter();
  const { visualPreview } = useLocalSearchParams<{ visualPreview?: string }>();
  const {
    localWorkspace,
    localWorkspaceMessage,
    localWorkspaceStatus,
    updateLocalWorkspace,
    workspaceEditable,
  } = useFirstMoveApp();
  const [step, setStep] = useState<FlowStep>(
    __DEV__ && visualPreview === "step-1"
      ? "stuck-state"
      : __DEV__ && visualPreview === "step-2"
        ? "direction"
        : "landing",
  );
  const [stuckState, setStuckState] = useState<StuckState>(STUCK_STATES[0]);
  const [direction, setDirection] = useState<Direction>(DIRECTIONS[0]);
  const initialTemplate = templatesFor(stuckState, direction)[0];
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [templateId, setTemplateId] = useState<string | undefined>(
    initialTemplate?.id,
  );
  const [moveText, setMoveText] = useState(initialTemplate?.text ?? "");
  const [duration, setDuration] = useState<IntendedDuration>(
    initialTemplate?.durationMinutes ?? 2,
  );
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const pendingIntent = getPendingIntent(localWorkspace);
  const openSession = getOpenSession(localWorkspace);

  useEffect(() => {
    if (!__DEV__ || !visualPreview) return undefined;
    const frame = requestAnimationFrame(() => {
      setStep(
        visualPreview === "step-1"
          ? "stuck-state"
          : visualPreview === "step-2"
            ? "direction"
            : "landing",
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [visualPreview]);

  function chooseTemplate(
    stateChoice: StuckState,
    directionChoice: Direction,
    index = 0,
  ) {
    const options = templatesFor(stateChoice, directionChoice);
    const selectedIndex = options.length === 0 ? 0 : index % options.length;
    const selected = options[selectedIndex];
    if (!selected) return;
    setSuggestionIndex(selectedIndex);
    setTemplateId(selected.id);
    setMoveText(selected.text);
    setDuration(selected.durationMinutes);
    setNotice("");
  }

  function chooseStuckState(value: StuckState) {
    setStuckState(value);
    chooseTemplate(value, direction);
    setStep("direction");
  }

  function chooseDirection(value: Direction) {
    setDirection(value);
    chooseTemplate(stuckState, value);
    setStep("move");
  }

  async function savePendingIntent() {
    if (!moveText.trim() || saving || !workspaceEditable) return;
    setSaving(true);
    setNotice("");
    const next = await updateLocalWorkspace((state) =>
      createPendingIntent(state, {
        stuckState,
        direction,
        moveText,
        intendedDurationMinutes: duration,
      }),
    );
    setSaving(false);
    if (next && getPendingIntent(next)) {
      router.push("/(tabs)/focus");
      return;
    }
    setNotice("This move could not be saved yet. Check the wording and try again.");
  }

  async function clearPending(nextStep: FlowStep) {
    if (!pendingIntent || saving || !workspaceEditable) return;
    setSaving(true);
    const next = await updateLocalWorkspace((state) =>
      cancelPendingIntent(state, pendingIntent.id),
    );
    setSaving(false);
    if (next && !getPendingIntent(next)) {
      setNotice(nextStep === "stuck-state" ? "Cancelled. Nothing was lost." : "");
      setStep(nextStep);
    }
  }

  if (localWorkspaceStatus === "loading") {
    return (
      <Screen title="I’m Stuck">
        <LoadingState label="Loading local First Moves…" />
      </Screen>
    );
  }

  if (pendingIntent) {
    return (
      <Screen
        eyebrow="First Moves"
        title={openSession ? "Your session is in progress" : "Ready when you are"}
        description={
          openSession
            ? "Return to Focus to pause, resume, stop, or cancel this saved local session."
            : "This pending move is saved on this device and ready for a bounded countdown."
        }
      >
        {localWorkspaceMessage ? (
          <Card tone="danger">
            <Body>{localWorkspaceMessage}</Body>
          </Card>
        ) : null}
        <View style={[styles.flowSurface, styles.resultSurface]}>
          <Label>Pending First Move</Label>
          <Heading>{pendingIntent.moveText}</Heading>
          <View style={styles.details}>
            <Detail label="Direction" value={pendingIntent.direction} />
            <Detail
              label="Intended duration"
              value={`${pendingIntent.intendedDurationMinutes} minutes`}
            />
            <Detail label="Right now" value={sentenceCase(pendingIntent.stuckState)} />
          </View>
          <PrimaryButton
            title="Continue to Focus"
            onPress={() => router.push("/(tabs)/focus")}
          />
          {!openSession ? (
            <>
              <TextAction
                label="Change this move"
                disabled={saving || !workspaceEditable}
                onPress={() => void clearPending("move")}
              />
              <TextAction
                label="Cancel for now"
                disabled={saving || !workspaceEditable}
                onPress={() => void clearPending("stuck-state")}
              />
            </>
          ) : null}
        </View>
      </Screen>
    );
  }

  if (step === "landing") {
    return (
      <SafeAreaView edges={["top", "left", "right"]} style={styles.landingSafeArea}>
        <View style={styles.landingScreen}>
          <View style={styles.landingCopy}>
            <Text accessibilityRole="header" style={styles.landingTitle}>Feeling stuck?</Text>
            <Text style={styles.landingDescription}>Try one small action today.</Text>
          </View>
          {localWorkspaceMessage ? (
            <Card tone="danger">
              <Body>{localWorkspaceMessage}</Body>
            </Card>
          ) : null}
          <View style={styles.landingHero}>
            <PixelKittenScene
              accessibilityLabel="An attentive pixel kitten ready to help you start small"
              attention
            />
          </View>
          <View style={styles.landingActionZone}>
            <View style={styles.landingAction}>
              <PrimaryButton
                title="Start small"
                onPress={() => setStep("stuck-state")}
              />
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <Screen
      eyebrow="I’m Stuck · No AI required"
      title="Choose one small move"
      description="One decision at a time. Rest and intentional entertainment are both valid choices."
    >
      {localWorkspaceMessage ? (
        <Card tone="danger">
          <Body>{localWorkspaceMessage}</Body>
        </Card>
      ) : null}
      {step === "stuck-state" ? (
        <View style={styles.flowSurface}>
          <Label>Step 1 of 3</Label>
          <Heading>What feels closest right now?</Heading>
          <Body muted>You do not need to explain or justify it.</Body>
          <View style={styles.choiceList}>
            {STUCK_STATES.map((value) => (
              <ChoiceButton
                icon={<StuckStateSymbol state={value} />}
                key={value}
                label={sentenceCase(value)}
                onPress={() => chooseStuckState(value)}
                tile
              />
            ))}
          </View>
          <TextAction label="Back" onPress={() => setStep("landing")} />
        </View>
      ) : null}

      {step === "direction" ? (
        <View style={styles.flowSurface}>
          <Label>Step 2 of 3</Label>
          <Heading>Where would you like to move?</Heading>
          <Body muted>There is no best direction. You can change it later.</Body>
          <View style={styles.choiceList}>
            {DIRECTIONS.map((value) => (
              <ChoiceButton
                icon={<PixelDirectionIcon direction={value} />}
                key={value}
                label={value}
                onPress={() => chooseDirection(value)}
                tile
              />
            ))}
          </View>
          <TextAction
            label="Back"
            onPress={() => setStep("stuck-state")}
          />
        </View>
      ) : null}

      {step === "move" ? (
        <View style={styles.flowSurface}>
          <Label>Step 3 of 3</Label>
          <Heading>Your First Move</Heading>
          <Body muted>
            {sentenceCase(stuckState)} · {direction}
          </Body>
          <Text style={styles.inputLabel}>Edit the wording</Text>
          <TextInput
            accessibilityLabel="First Move wording"
            maxLength={160}
            multiline
            onChangeText={(value) => {
              setMoveText(value);
              setTemplateId(undefined);
              setNotice("");
            }}
            placeholder="Write one visible action you can begin now"
            placeholderTextColor={colors.textMuted}
            style={styles.textInput}
            textAlignVertical="top"
            value={moveText}
          />
          <Text style={styles.counter}>{moveText.length}/160</Text>

          <Text style={styles.inputLabel}>Intended duration</Text>
          <View accessibilityRole="radiogroup" style={styles.durationRow}>
            {INTENDED_DURATIONS.map((minutes) => (
              <ChoiceButton
                compact
                key={minutes}
                label={`${minutes} min`}
                onPress={() => setDuration(minutes)}
                selected={duration === minutes}
              />
            ))}
          </View>

          {notice ? (
            <Text accessibilityLiveRegion="polite" style={styles.notice}>
              {notice}
            </Text>
          ) : null}

          <View style={styles.utilityActions}>
            <UtilityAction
              label="Choose another"
              onPress={() =>
                chooseTemplate(stuckState, direction, suggestionIndex + 1)
              }
            />
            <UtilityAction
              label="Make duration shorter"
              disabled={duration === 2}
              onPress={() => setDuration(nextShorterDuration(duration))}
            />
            <UtilityAction
              label="Enter my own move"
              onPress={() => {
                setTemplateId(undefined);
                setMoveText("");
                setDuration(2);
                setNotice("Write one small action in your own words.");
              }}
            />
          </View>

          <PrimaryButton
            title={saving ? "Saving…" : "Save this First Move"}
            disabled={!moveText.trim() || saving || !workspaceEditable}
            onPress={() => void savePendingIntent()}
          />
          <TextAction
            label="Change direction"
            disabled={saving}
            onPress={() => setStep("direction")}
          />
          <TextAction
            label="Cancel"
            disabled={saving}
            onPress={() => {
              setNotice("Cancelled. Nothing was lost.");
              setStep("stuck-state");
            }}
          />
          {templateId ? (
            <Body muted>This suggestion came from the offline local library.</Body>
          ) : null}
        </View>
      ) : null}

      {notice && step !== "move" ? (
        <Text accessibilityLiveRegion="polite" style={styles.notice}>
          {notice}
        </Text>
      ) : null}
    </Screen>
  );
}

function ChoiceButton({
  compact = false,
  icon,
  label,
  onPress,
  selected = false,
  tile = false,
}: {
  compact?: boolean;
  icon?: ReactNode;
  label: string;
  onPress(): void;
  selected?: boolean;
  tile?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole={compact ? "radio" : "button"}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        compact && styles.compactChoice,
        tile && styles.tileChoice,
        selected && styles.selectedChoice,
        pressed && styles.pressedChoice,
      ]}
    >
      {icon ? <View style={styles.choiceIcon}>{icon}</View> : null}
      <Text style={[
        styles.choiceText,
        compact && styles.compactChoiceText,
        tile && styles.tileChoiceText,
        selected && styles.selectedChoiceText,
      ]}>
        {label}
      </Text>
    </Pressable>
  );
}

function StuckStateSymbol({ state }: { state: StuckState }) {
  const index = STUCK_STATES.indexOf(state);
  return (
    <View accessibilityElementsHidden style={styles.symbolCanvas}>
      {index === 0 ? (
        <>
          <View style={styles.phoneBody} />
          <View style={styles.phoneScroll} />
        </>
      ) : null}
      {index === 1 ? (
        <>
          <View style={styles.bedPillow} />
          <View style={styles.bedBlanket} />
          <View style={styles.bedLeg} />
        </>
      ) : null}
      {index === 2 ? (
        <>
          <View style={styles.pausedStepLow} />
          <View style={styles.pausedStepHigh} />
          <View style={styles.pauseBarOne} />
          <View style={styles.pauseBarTwo} />
        </>
      ) : null}
      {index === 3 ? (
        <>
          <View style={styles.blockOne} />
          <View style={styles.blockTwo} />
          <View style={styles.blockThree} />
        </>
      ) : null}
      {index === 4 ? <View style={styles.moonSymbol}><View style={styles.moonCutout} /></View> : null}
      {index === 5 ? (
        <>
          <Text style={styles.questionSymbol}>?</Text>
          <View style={styles.questionSpark} />
        </>
      ) : null}
    </View>
  );
}

function UtilityAction({
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
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.utilityAction,
        pressed && styles.pressedChoice,
        disabled && styles.disabled,
      ]}
    >
      <Text style={styles.utilityActionText}>{label}</Text>
      <Text accessibilityElementsHidden style={styles.utilityActionIcon}>+</Text>
    </Pressable>
  );
}

function TextAction({
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
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.textAction,
        pressed && styles.pressedChoice,
        disabled && styles.disabled,
      ]}
    >
      <Text style={styles.textActionText}>{label}</Text>
    </Pressable>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function sentenceCase(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

const styles = StyleSheet.create({
  landingSafeArea: { backgroundColor: colors.background, flex: 1 },
  landingScreen: {
    flex: 1,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  landingCopy: {
    alignItems: "center",
    flex: 23,
    gap: spacing.sm,
    justifyContent: "center",
  },
  landingTitle: {
    color: colors.text,
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: -0.7,
    lineHeight: 39,
    textAlign: "center",
  },
  landingDescription: {
    color: colors.textMuted,
    fontSize: typography.body,
    lineHeight: 23,
    textAlign: "center",
  },
  landingHero: {
    alignItems: "center",
    flex: 52,
    justifyContent: "center",
    minHeight: 0,
    overflow: "hidden",
    width: "100%",
  },
  landingActionZone: {
    alignItems: "center",
    flex: 25,
    justifyContent: "flex-end",
    paddingBottom: spacing.lg,
    width: "100%",
  },
  landingAction: {
    alignSelf: "center",
    maxWidth: 360,
    width: "100%",
  },
  flowSurface: {
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  resultSurface: {
    backgroundColor: colors.primarySoft,
    borderLeftColor: colors.primary,
    borderLeftWidth: 4,
    borderRadius: radii.sm,
    padding: spacing.md,
  },
  choiceList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  choice: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderColor: "transparent",
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: touchTarget,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
  },
  tileChoice: {
    alignItems: "flex-start",
    flexBasis: "47%",
    flexDirection: "column",
    flexGrow: 1,
    justifyContent: "space-between",
    minHeight: 116,
    padding: spacing.md,
  },
  compactChoice: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: 72,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  selectedChoice: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pressedChoice: { opacity: 0.78 },
  choiceText: {
    color: colors.text,
    flex: 1,
    fontSize: typography.body,
    fontWeight: "700",
    textAlign: "left",
  },
  tileChoiceText: { flex: 0, fontSize: typography.small, lineHeight: 19 },
  choiceIcon: { alignItems: "center", height: 40, justifyContent: "center", width: 48 },
  compactChoiceText: { flex: 0, textAlign: "center" },
  selectedChoiceText: { color: "#FFFFFF" },
  inputLabel: {
    color: colors.text,
    fontSize: typography.small,
    fontWeight: "800",
    marginTop: spacing.sm,
  },
  textInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.sm,
    borderWidth: 1,
    color: colors.text,
    fontSize: typography.body,
    lineHeight: 24,
    minHeight: 112,
    padding: spacing.md,
  },
  counter: {
    color: colors.textMuted,
    fontSize: typography.label,
    textAlign: "right",
  },
  durationRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  utilityActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  utilityAction: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    flexBasis: "47%",
    flexGrow: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: touchTarget,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
  },
  utilityActionText: {
    color: colors.text,
    flex: 1,
    fontSize: typography.small,
    fontWeight: "700",
  },
  utilityActionIcon: { color: colors.primary, fontSize: 22, fontWeight: "800" },
  textAction: {
    alignItems: "center",
    alignSelf: "center",
    justifyContent: "center",
    minHeight: touchTarget,
    paddingHorizontal: spacing.md,
  },
  textActionText: {
    color: colors.primary,
    fontSize: typography.small,
    fontWeight: "800",
  },
  disabled: { opacity: 0.5 },
  notice: {
    color: colors.primaryPressed,
    fontSize: typography.small,
    lineHeight: 20,
  },
  details: { gap: spacing.sm },
  detail: { gap: spacing.xs },
  detailLabel: {
    color: colors.textMuted,
    fontSize: typography.label,
    fontWeight: "700",
  },
  detailValue: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: "700",
  },
  symbolCanvas: { height: 40, position: "relative", width: 48 },
  phoneBody: { borderColor: colors.primaryPressed, borderRadius: 4, borderWidth: 3, height: 36, left: 13, position: "absolute", top: 1, width: 22 },
  phoneScroll: { backgroundColor: colors.primary, height: 4, left: 19, position: "absolute", top: 15, width: 10 },
  bedPillow: { backgroundColor: "#E6A8A8", borderColor: colors.primaryPressed, borderRadius: 3, borderWidth: 2, height: 13, left: 5, position: "absolute", top: 9, width: 15 },
  bedBlanket: { backgroundColor: "#EFCBA2", borderColor: colors.primaryPressed, borderWidth: 3, bottom: 6, height: 21, left: 4, position: "absolute", width: 40 },
  bedLeg: { backgroundColor: colors.primaryPressed, bottom: 1, height: 6, left: 35, position: "absolute", width: 4 },
  pausedStepLow: { backgroundColor: "#EFCBA2", bottom: 4, height: 11, left: 3, position: "absolute", width: 17 },
  pausedStepHigh: { backgroundColor: "#C6864F", bottom: 4, height: 22, left: 20, position: "absolute", width: 18 },
  pauseBarOne: { backgroundColor: colors.primaryPressed, height: 16, position: "absolute", right: 7, top: 1, width: 4 },
  pauseBarTwo: { backgroundColor: colors.primaryPressed, height: 16, position: "absolute", right: 0, top: 1, width: 4 },
  blockOne: { backgroundColor: "#E6A8A8", borderColor: colors.primaryPressed, borderWidth: 2, bottom: 2, height: 16, left: 2, position: "absolute", width: 20 },
  blockTwo: { backgroundColor: "#C6864F", borderColor: colors.primaryPressed, borderWidth: 2, bottom: 2, height: 16, left: 26, position: "absolute", width: 20 },
  blockThree: { backgroundColor: "#EFCBA2", borderColor: colors.primaryPressed, borderWidth: 2, bottom: 20, height: 16, left: 14, position: "absolute", width: 20 },
  moonSymbol: { backgroundColor: "#C6864F", borderRadius: 18, height: 36, left: 6, overflow: "hidden", position: "absolute", top: 1, width: 36 },
  moonCutout: { backgroundColor: colors.surfaceMuted, borderRadius: 14, height: 29, left: 11, position: "absolute", top: -2, width: 29 },
  questionSymbol: { color: colors.primaryPressed, fontSize: 34, fontWeight: "900", left: 7, lineHeight: 39, position: "absolute", top: -2 },
  questionSpark: { backgroundColor: "#E6A8A8", height: 9, position: "absolute", right: 6, top: 4, transform: [{ rotate: "15deg" }], width: 9 },
});
