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
  SecondaryButton,
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
    auth,
    localWorkspace,
    localWorkspaceMessage,
    localWorkspaceStatus,
    sync,
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
        <Card tone="primary">
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
              <SecondaryButton
                title="Change this move"
                disabled={saving || !workspaceEditable}
                onPress={() => void clearPending("move")}
              />
              <SecondaryButton
                title="Cancel for now"
                disabled={saving || !workspaceEditable}
                onPress={() => void clearPending("stuck-state")}
              />
            </>
          ) : null}
        </Card>
        <LocalBoundary
          authenticated={auth.status === "authenticated"}
          syncStatus={sync.status}
        />
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
        <Card tone="primary">
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
        </Card>
      ) : null}

      {step === "direction" ? (
        <Card tone="primary">
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
          <SecondaryButton
            title="Back"
            onPress={() => setStep("stuck-state")}
          />
        </Card>
      ) : null}

      {step === "move" ? (
        <Card tone="primary">
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

          <View style={styles.actionGroup}>
            <SecondaryButton
              title="Choose another"
              onPress={() =>
                chooseTemplate(stuckState, direction, suggestionIndex + 1)
              }
            />
            <SecondaryButton
              title="Make duration shorter"
              disabled={duration === 2}
              onPress={() => setDuration(nextShorterDuration(duration))}
            />
            <SecondaryButton
              title="Enter my own move"
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
          <SecondaryButton
            title="Change direction"
            disabled={saving}
            onPress={() => setStep("direction")}
          />
          <SecondaryButton
            title="Cancel"
            disabled={saving}
            onPress={() => {
              setNotice("Cancelled. Nothing was lost.");
              setStep("stuck-state");
            }}
          />
          {templateId ? (
            <Body muted>This suggestion came from the offline local library.</Body>
          ) : null}
        </Card>
      ) : null}

      {notice && step !== "move" ? (
        <Text accessibilityLiveRegion="polite" style={styles.notice}>
          {notice}
        </Text>
      ) : null}
      <LocalBoundary
        authenticated={auth.status === "authenticated"}
        syncStatus={sync.status}
      />
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
      <Text style={[styles.choiceText, selected && styles.selectedChoiceText]}>
        {label}
      </Text>
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

function LocalBoundary({
  authenticated,
  syncStatus,
}: {
  authenticated: boolean;
  syncStatus: string;
}) {
  return (
    <Card>
      <Label>Storage boundary</Label>
      <Body muted>
        {authenticated
          ? syncStatus === "write-disabled"
            ? "This uninitialized account cannot save a First Move. Guest and account workspaces remain separate."
            : "This First Move saves immediately to the account working copy and queues through Web Sync v1. Only the pending Intent view is sent."
          : "Guest Mode stores this First Move in its separate local AsyncStorage workspace. No account or network is required."}
      </Body>
    </Card>
  );
}

function sentenceCase(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

const styles = StyleSheet.create({
  choiceList: { gap: spacing.sm },
  choice: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.sm,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: touchTarget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  compactChoice: { flexGrow: 1, minWidth: 72 },
  selectedChoice: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pressedChoice: { opacity: 0.78 },
  choiceText: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: "700",
    textAlign: "center",
  },
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
  actionGroup: { gap: spacing.sm },
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
