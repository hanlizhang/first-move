import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

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
  colors,
  radii,
  spacing,
  touchTarget,
  typography,
} from "../../theme/tokens.ts";

type FlowStep = "stuck-state" | "direction" | "move";

export default function FirstMovesScreen() {
  const router = useRouter();
  const {
    localWorkspace,
    localWorkspaceMessage,
    localWorkspaceStatus,
    updateLocalWorkspace,
    workspaceEditable,
  } = useFirstMoveApp();
  const [step, setStep] = useState<FlowStep>("stuck-state");
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
                key={value}
                label={sentenceCase(value)}
                onPress={() => chooseStuckState(value)}
              />
            ))}
          </View>
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
                key={value}
                label={value}
                onPress={() => chooseDirection(value)}
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
  label,
  onPress,
  selected = false,
}: {
  compact?: boolean;
  label: string;
  onPress(): void;
  selected?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole={compact ? "radio" : "button"}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        compact && styles.compactChoice,
        selected && styles.selectedChoice,
        pressed && styles.pressedChoice,
      ]}
    >
      <Text style={[
        styles.choiceText,
        compact && styles.compactChoiceText,
        selected && styles.selectedChoiceText,
      ]}>
        {label}
      </Text>
      {!compact ? (
        <Text accessibilityElementsHidden style={styles.choiceChevron}>›</Text>
      ) : null}
    </Pressable>
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
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  choice: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    minHeight: touchTarget,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
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
  choiceChevron: { color: colors.primary, fontSize: 26, fontWeight: "700" },
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
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  utilityAction: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: touchTarget,
    paddingVertical: spacing.sm,
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
});
