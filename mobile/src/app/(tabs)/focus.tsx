import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { useFirstMoveApp } from "../../app-state/app-provider.tsx";
import { useCelebrations } from "../../components/celebration-provider.tsx";
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
import { FocusLinkPicker } from "../../components/focus-link-picker.tsx";
import { PixelKitten } from "../../components/pixel-kitten.tsx";
import { useCurrentLocalDate } from "../../components/use-current-local-date.ts";
import { getPendingIntent } from "../../domain/app-state.ts";
import {
  buildFocusLinkOptions,
  findFocusLinkOption,
  focusLinkFields,
  focusLinkKey,
  parseFocusDurationInput,
  sessionReferenceCatalog,
  type FocusLinkOption,
} from "../../domain/focus.ts";
import {
  DIRECTIONS,
  FOCUS_COUNTDOWN_PRESETS,
  type ActivityIntent,
  type ActivitySession,
  type AppState,
  type Direction,
  type SessionStatus,
} from "../../domain/models.ts";
import {
  cancelSession,
  elapsedMs,
  getLatestClosedSession,
  getOpenSession,
  pauseSession,
  reconcileRunningCountdown,
  remainingMs,
  resumeSession,
  reviewSession,
  startCountdown,
  startCountdownFromIntent,
  startStopwatch,
  stopSession,
  type SessionReferenceCatalog,
} from "../../domain/sessions.ts";
import {
  colors,
  radii,
  spacing,
  touchTarget,
  typography,
} from "../../theme/tokens.ts";

export default function FocusScreen() {
  const { presentFocusCompletion } = useCelebrations();
  const {
    localWorkspace,
    localWorkspaceMessage,
    localWorkspaceStatus,
    updateLocalWorkspace,
    workspaceEditable,
  } = useFirstMoveApp();
  const [nowMs, setNowMs] = useState(Date.now);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const completionRequested = useRef<string | undefined>(undefined);
  const today = useCurrentLocalDate();
  const linkOptions = useMemo(
    () => buildFocusLinkOptions(localWorkspace, today),
    [localWorkspace, today],
  );
  const references = useMemo(
    () => sessionReferenceCatalog(linkOptions),
    [linkOptions],
  );
  const pendingIntent = getPendingIntent(localWorkspace);
  const openSession = getOpenSession(localWorkspace);
  const latestClosedSession = getLatestClosedSession(localWorkspace);

  useEffect(() => {
    if (openSession?.status !== "running") {
      completionRequested.current = undefined;
      return;
    }
    if (completionRequested.current !== openSession?.id) {
      completionRequested.current = undefined;
    }
    const session = openSession;
    const tick = () => {
      const current = Date.now();
      setNowMs(current);
      if (
        session.mode === "countdown" &&
        workspaceEditable &&
        remainingMs(session, current) === 0 &&
        completionRequested.current !== session.id
      ) {
        completionRequested.current = session.id;
        setNotice("");
        void updateLocalWorkspace((state) =>
          reconcileRunningCountdown(state, current),
        ).then((next) => {
          const completed = next?.sessions.find(
            (candidate) => candidate.id === session.id,
          );
          if (completed?.status === "completed") {
            presentFocusCompletion(completed);
            setNotice("");
          } else {
            completionRequested.current = undefined;
          }
        });
      }
    };
    const initialTick = setTimeout(tick, 0);
    const interval = setInterval(tick, 500);
    return () => {
      clearTimeout(initialTick);
      clearInterval(interval);
    };
  }, [
    openSession,
    presentFocusCompletion,
    updateLocalWorkspace,
    workspaceEditable,
  ]);

  if (localWorkspaceStatus === "loading") {
    return (
      <Screen title="Focus">
        <LoadingState label="Loading your local Focus session…" />
      </Screen>
    );
  }

  return (
    <Screen
      eyebrow="Focus"
      title={focusTitle(openSession?.status, latestClosedSession?.status)}
      description={
        openSession
          ? undefined
          : "Choose a countdown or stopwatch, or continue a pending First Move."
      }
    >
      {localWorkspaceMessage ? (
        <Card tone="danger">
          <Body>{localWorkspaceMessage}</Body>
        </Card>
      ) : null}
      {notice ? (
        <Card>
          <Body>{notice}</Body>
        </Card>
      ) : null}

      {openSession ? (
        <ActiveSessionCard
          nowMs={nowMs}
          onCancel={() => {
            const assisted = Boolean(openSession.linkedIntentId);
            void saveChange(
              (state) => cancelSession(state, openSession.id),
              assisted
                ? "Cancelled. Your pending First Move is still ready."
                : "Cancelled. No focus time was saved.",
            );
          }}
          onPause={() =>
            void saveChange(
              (state, current) => pauseSession(state, openSession.id, current),
              (next) =>
                next.sessions.find((session) => session.id === openSession.id)
                  ?.status === "completed"
                  ? ""
                  : "Paused. Your elapsed time is saved.",
            )
          }
          onResume={() =>
            void saveChange(
              (state, current) => resumeSession(state, openSession.id, current),
              "Resumed from your saved time.",
            )
          }
          onStop={() =>
            void saveChange(
              (state, current) => stopSession(state, openSession.id, current),
              "",
            )
          }
          saving={saving || !workspaceEditable}
          session={openSession}
        />
      ) : (
        <>
          {latestClosedSession ? (
            <SessionReview
              key={latestClosedSession.id}
              linkOptions={linkOptions}
              references={references}
              session={latestClosedSession}
              state={localWorkspace}
              updateLocalWorkspace={updateLocalWorkspace}
              workspaceEditable={workspaceEditable}
            />
          ) : null}

          {pendingIntent ? (
            <PendingFirstMoveCard
              disabled={saving || !workspaceEditable}
              intent={pendingIntent}
              linkOptions={linkOptions}
              onStart={() =>
                void saveChange(
                  (state, current) =>
                    startCountdownFromIntent(state, pendingIntent.id, current),
                  "Your pending First Move has started.",
                )
              }
              state={localWorkspace}
            />
          ) : null}

          <FocusSetup
            disabled={saving || !workspaceEditable}
            linkOptions={linkOptions}
            onStartCountdown={(input) =>
              void saveChange(
                (state, current) =>
                  startCountdown(state, input, current, undefined, references),
                "Your countdown has started.",
              )
            }
            onStartStopwatch={(input) =>
              void saveChange(
                (state, current) =>
                  startStopwatch(state, input, current, undefined, references),
                "Your stopwatch has started.",
              )
            }
          />
        </>
      )}

    </Screen>
  );

  async function saveChange(
    recipe: (state: AppState, current: number) => AppState,
    successNotice: string | ((next: AppState) => string),
  ): Promise<void> {
    if (saving || !workspaceEditable) return;
    const current = Date.now();
    setNowMs(current);
    setSaving(true);
    setNotice("");
    let changed = false;
    let closedSession: ActivitySession | undefined;
    const next = await updateLocalWorkspace((state) => {
      const previousOpenSession = getOpenSession(state);
      const updated = recipe(state, current);
      changed = updated !== state;
      if (changed && previousOpenSession) {
        const candidate = updated.sessions.find(
          (session) => session.id === previousOpenSession.id,
        );
        if (candidate?.status === "completed" || candidate?.status === "stopped") {
          closedSession = candidate;
        }
      }
      return updated;
    });
    setSaving(false);
    if (next && changed) {
      if (closedSession) presentFocusCompletion(closedSession);
      setNotice(
        typeof successNotice === "string" ? successNotice : successNotice(next),
      );
    } else if (next) {
      setNotice("That Focus change is no longer available. Your saved data was not changed.");
    }
  }
}

function ActiveSessionCard({
  nowMs,
  onCancel,
  onPause,
  onResume,
  onStop,
  saving,
  session,
}: {
  nowMs: number;
  onCancel(): void;
  onPause(): void;
  onResume(): void;
  onStop(): void;
  saving: boolean;
  session: ActivitySession;
}) {
  const displayMs =
    session.mode === "countdown"
      ? remainingMs(session, nowMs) ?? 0
      : elapsedMs(session, nowMs);
  const progress =
    session.mode === "countdown"
      ? countdownProgress(session.targetDurationMinutes, displayMs)
      : undefined;

  return (
    <View style={styles.activeSessionCard}>
      <View style={styles.timerPresentation}>
        <FocusRing progress={progress} />
        <View style={styles.timerContent}>
          <Text style={styles.timerStatus}>
            {session.mode === "countdown" ? "Countdown" : "Stopwatch"} · {session.status}
          </Text>
          <Text
            adjustsFontSizeToFit
            accessibilityLabel={`${formatDuration(displayMs)} ${
              session.mode === "countdown" ? "remaining" : "elapsed"
            }`}
            accessibilityLiveRegion="polite"
            minimumFontScale={0.8}
            numberOfLines={1}
            style={styles.timer}
          >
            {formatDuration(displayMs)}
          </Text>
        </View>
      </View>
      <View style={styles.sleepingKitten}>
        <PixelKitten
          accessibilityLabel="Sleeping pixel kitten resting beneath the Focus timer"
          pose="sleeping"
          showFloor={false}
        />
      </View>
      <View style={styles.activeSessionInfo}>
        <Text style={styles.activeSessionTitle}>{session.label}</Text>
        <Text style={styles.activeSessionMeta}>
          {session.direction}
          {session.mode === "countdown"
            ? ` · ${session.targetDurationMinutes ?? 0} min`
            : " · Stopwatch"}
        </Text>
      </View>
      <View style={styles.focusActions}>
        <Pressable
          accessibilityRole="button"
          disabled={saving}
          onPress={session.status === "running" ? onPause : onResume}
          style={({ pressed }) => [
            styles.focusPrimaryButton,
            pressed && styles.focusPrimaryButtonPressed,
            saving && styles.focusActionDisabled,
          ]}
        >
          <Text style={styles.focusPrimaryButtonText}>
            {session.status === "running" ? "Pause" : "Resume"}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={saving}
          onPress={onStop}
          style={({ pressed }) => [
            styles.focusSecondaryButton,
            pressed && styles.focusSecondaryButtonPressed,
            saving && styles.focusActionDisabled,
          ]}
        >
          <Text style={styles.focusSecondaryButtonText}>Stop and save</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={saving}
          onPress={onCancel}
          style={({ pressed }) => [
            styles.focusCancelButton,
            pressed && styles.focusCancelButtonPressed,
            saving && styles.focusActionDisabled,
          ]}
        >
          <Text style={styles.focusCancelButtonText}>Cancel this session</Text>
        </Pressable>
      </View>
    </View>
  );
}

const FOCUS_RING_SIZE = 232;
const FOCUS_RING_STROKE = 12;
const FOCUS_RING_RADIUS = (FOCUS_RING_SIZE - FOCUS_RING_STROKE) / 2;
const FOCUS_RING_CIRCUMFERENCE = 2 * Math.PI * FOCUS_RING_RADIUS;

function FocusRing({ progress }: { progress?: number }) {
  return (
    <Svg
      accessible={false}
      height={FOCUS_RING_SIZE}
      viewBox={`0 0 ${FOCUS_RING_SIZE} ${FOCUS_RING_SIZE}`}
      width={FOCUS_RING_SIZE}
    >
      <Circle
        cx={FOCUS_RING_SIZE / 2}
        cy={FOCUS_RING_SIZE / 2}
        fill="none"
        r={FOCUS_RING_RADIUS}
        stroke="#EFCBA2"
        strokeWidth={FOCUS_RING_STROKE}
      />
      {progress !== undefined && progress > 0 ? (
        <Circle
          cx={FOCUS_RING_SIZE / 2}
          cy={FOCUS_RING_SIZE / 2}
          fill="none"
          r={FOCUS_RING_RADIUS}
          stroke="#8B5A35"
          strokeDasharray={`${FOCUS_RING_CIRCUMFERENCE} ${FOCUS_RING_CIRCUMFERENCE}`}
          strokeDashoffset={FOCUS_RING_CIRCUMFERENCE * (1 - progress)}
          strokeLinecap="round"
          strokeWidth={FOCUS_RING_STROKE}
          transform={`rotate(-90 ${FOCUS_RING_SIZE / 2} ${FOCUS_RING_SIZE / 2})`}
        />
      ) : null}
    </Svg>
  );
}

function countdownProgress(
  targetDurationMinutes: number | undefined,
  remainingMilliseconds: number,
): number {
  const totalMilliseconds = (targetDurationMinutes ?? 0) * 60_000;
  if (totalMilliseconds <= 0) return 0;
  return Math.min(
    1,
    Math.max(0, (totalMilliseconds - remainingMilliseconds) / totalMilliseconds),
  );
}

function PendingFirstMoveCard({
  disabled,
  intent,
  linkOptions,
  onStart,
  state,
}: {
  disabled: boolean;
  intent: ActivityIntent;
  linkOptions: readonly FocusLinkOption[];
  onStart(): void;
  state: AppState;
}) {
  return (
    <View style={styles.nextMove}>
      <Label>Next small move</Label>
      <Heading>{intent.moveText}</Heading>
      <Text style={styles.nextMoveMeta}>
        {intent.direction} · {intent.intendedDurationMinutes} min · {intentRelationshipLabel(intent, linkOptions, state)}
      </Text>
      <PrimaryButton
        disabled={disabled}
        title="Start this First Move"
        onPress={onStart}
      />
    </View>
  );
}

type FocusSetupMode = "countdown" | "stopwatch";

function FocusSetup({
  disabled,
  linkOptions,
  onStartCountdown,
  onStartStopwatch,
}: {
  disabled: boolean;
  linkOptions: readonly FocusLinkOption[];
  onStartCountdown(input: Parameters<typeof startCountdown>[1]): void;
  onStartStopwatch(input: Parameters<typeof startStopwatch>[1]): void;
}) {
  const [mode, setMode] = useState<FocusSetupMode>("countdown");

  return (
    <View style={styles.focusSetup}>
      <Label>Focus setup</Label>
      <FocusModeSelector mode={mode} onSelect={setMode} />
      <View
        accessibilityElementsHidden={mode !== "countdown"}
        importantForAccessibility={mode === "countdown" ? "auto" : "no-hide-descendants"}
        style={mode !== "countdown" && styles.hiddenSetup}
      >
        <CountdownSetup
          disabled={disabled}
          linkOptions={linkOptions}
          onStart={onStartCountdown}
        />
      </View>
      <View
        accessibilityElementsHidden={mode !== "stopwatch"}
        importantForAccessibility={mode === "stopwatch" ? "auto" : "no-hide-descendants"}
        style={mode !== "stopwatch" && styles.hiddenSetup}
      >
        <StopwatchSetup
          disabled={disabled}
          linkOptions={linkOptions}
          onStart={onStartStopwatch}
        />
      </View>
    </View>
  );
}

function FocusModeSelector({
  mode,
  onSelect,
}: {
  mode: FocusSetupMode;
  onSelect(mode: FocusSetupMode): void;
}) {
  return (
    <View accessibilityRole="tablist" style={styles.modeSelector}>
      {(["countdown", "stopwatch"] as const).map((option) => {
        const selected = mode === option;
        const label = option === "countdown" ? "Countdown" : "Stopwatch";
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={option}
            onPress={() => onSelect(option)}
            style={({ pressed }) => [
              styles.modeOption,
              selected && styles.modeOptionSelected,
              pressed && styles.choicePressed,
            ]}
          >
            <Text style={[styles.modeOptionText, selected && styles.modeOptionTextSelected]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function CountdownSetup({
  disabled,
  linkOptions,
  onStart,
}: {
  disabled: boolean;
  linkOptions: readonly FocusLinkOption[];
  onStart(input: Parameters<typeof startCountdown>[1]): void;
}) {
  const [label, setLabel] = useState("");
  const [direction, setDirection] = useState<Direction>(DIRECTIONS[0]);
  const [linkKey, setLinkKey] = useState("");
  const [preset, setPreset] = useState<number>(25);
  const [customMinutes, setCustomMinutes] = useState("");
  const [customExpanded, setCustomExpanded] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const customDuration = customMinutes
    ? parseFocusDurationInput(customMinutes)
    : undefined;
  const duration = customMinutes ? customDuration : preset;

  function chooseLink(key: string): void {
    setLinkKey(key);
    const source = findFocusLinkOption(linkOptions, key);
    if (!source) return;
    setDetailsExpanded(true);
    setDirection(source.direction);
    setLabel(source.title);
  }

  return (
    <View style={styles.setupContent}>
      <View style={styles.setupIntro}>
        <Heading>Choose a duration</Heading>
        <Body muted>Pick a starting point. You can stop whenever you need.</Body>
      </View>
      <View accessibilityRole="radiogroup" style={styles.durationChoices}>
        {FOCUS_COUNTDOWN_PRESETS.map((minutes) => (
          <ChoiceButton
            balanced
            compact
            key={minutes}
            label={`${minutes} min`}
            onPress={() => {
              setPreset(minutes);
              setCustomMinutes("");
              setCustomExpanded(false);
            }}
            selected={!customMinutes && preset === minutes}
          />
        ))}
      </View>
      <DisclosureButton
        expanded={customExpanded}
        label={customMinutes && customDuration
          ? `Custom · ${customDuration} min`
          : "Custom duration"}
        onPress={() => setCustomExpanded((current) => !current)}
      />
      {customExpanded ? (
        <View style={styles.customDurationPanel}>
          <Text style={styles.inputLabel}>Custom minutes</Text>
          <TextInput
            accessibilityLabel="Custom countdown minutes"
            keyboardType="number-pad"
            maxLength={3}
            onChangeText={setCustomMinutes}
            placeholder="1–720"
            placeholderTextColor={colors.textMuted}
            style={[styles.textInput, styles.minutesInput]}
            value={customMinutes}
          />
          {customMinutes && customDuration === undefined ? (
            <Text accessibilityLiveRegion="polite" style={styles.validationText}>
              Enter a whole number from 1 to 720.
            </Text>
          ) : null}
        </View>
      ) : null}
      <PrimaryButton
        accessibilityLabel="Start countdown focus"
        disabled={disabled || duration === undefined}
        title="Start Focus"
        onPress={() => {
          if (duration === undefined) return;
          onStart({
            direction,
            label: label || undefined,
            durationMinutes: duration,
            ...focusLinkFields(linkKey),
          });
        }}
      />
      <DetailsDisclosure
        expanded={detailsExpanded}
        summary={focusDetailsSummary(label, direction, linkKey, linkOptions)}
        onPress={() => setDetailsExpanded((current) => !current)}
      >
        <SetupDetails
          direction={direction}
          label={label}
          linkKey={linkKey}
          linkOptions={linkOptions}
          mode="countdown"
          onDirectionChange={setDirection}
          onLabelChange={setLabel}
          onLinkChange={chooseLink}
        />
      </DetailsDisclosure>
    </View>
  );
}

function StopwatchSetup({
  disabled,
  linkOptions,
  onStart,
}: {
  disabled: boolean;
  linkOptions: readonly FocusLinkOption[];
  onStart(input: Parameters<typeof startStopwatch>[1]): void;
}) {
  const [label, setLabel] = useState("");
  const [direction, setDirection] = useState<Direction>(DIRECTIONS[0]);
  const [linkKey, setLinkKey] = useState("");
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  function chooseLink(key: string): void {
    setLinkKey(key);
    const source = findFocusLinkOption(linkOptions, key);
    if (!source) return;
    setDetailsExpanded(true);
    setDirection(source.direction);
    setLabel(source.title);
  }

  return (
    <View style={styles.setupContent}>
      <View style={styles.setupIntro}>
        <Heading>Open-ended focus</Heading>
        <Body muted>Start now and stop when the activity is finished.</Body>
      </View>
      <PrimaryButton
        accessibilityLabel="Start stopwatch focus"
        disabled={disabled}
        title="Start Focus"
        onPress={() =>
          onStart({
            direction,
            label: label || undefined,
            ...focusLinkFields(linkKey),
          })
        }
      />
      <DetailsDisclosure
        expanded={detailsExpanded}
        summary={focusDetailsSummary(label, direction, linkKey, linkOptions)}
        onPress={() => setDetailsExpanded((current) => !current)}
      >
        <SetupDetails
          direction={direction}
          label={label}
          linkKey={linkKey}
          linkOptions={linkOptions}
          mode="stopwatch"
          onDirectionChange={setDirection}
          onLabelChange={setLabel}
          onLinkChange={chooseLink}
        />
      </DetailsDisclosure>
    </View>
  );
}

function SetupDetails({
  direction,
  label,
  linkKey,
  linkOptions,
  mode,
  onDirectionChange,
  onLabelChange,
  onLinkChange,
}: {
  direction: Direction;
  label: string;
  linkKey: string;
  linkOptions: readonly FocusLinkOption[];
  mode: FocusSetupMode;
  onDirectionChange(value: Direction): void;
  onLabelChange(value: string): void;
  onLinkChange(value: string): void;
}) {
  return (
    <View style={styles.detailsPanel}>
      <Text style={styles.inputLabel}>Activity title (optional)</Text>
      <TextInput
        accessibilityLabel={`${mode === "countdown" ? "Countdown" : "Stopwatch"} activity title`}
        maxLength={160}
        onChangeText={onLabelChange}
        placeholder={mode === "countdown" ? "Focus time" : "Tracked time"}
        placeholderTextColor={colors.textMuted}
        style={styles.textInput}
        value={label}
      />
      <DirectionPicker compact onSelect={onDirectionChange} selected={direction} />
      <FocusLinkPicker
        label="Link to a Task or Habit (optional)"
        onSelect={onLinkChange}
        options={linkOptions}
        selectedKey={linkKey}
      />
    </View>
  );
}

function DetailsDisclosure({
  children,
  expanded,
  onPress,
  summary,
}: {
  children: ReactNode;
  expanded: boolean;
  onPress(): void;
  summary: string;
}) {
  return (
    <View style={styles.detailsDisclosure}>
      <DisclosureButton
        expanded={expanded}
        label={expanded ? "Hide details" : "Add details"}
        onPress={onPress}
        summary={expanded ? undefined : summary}
      />
      {expanded ? children : null}
    </View>
  );
}

function DisclosureButton({
  expanded,
  label,
  onPress,
  summary,
}: {
  expanded: boolean;
  label: string;
  onPress(): void;
  summary?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      onPress={onPress}
      style={({ pressed }) => [styles.disclosureButton, pressed && styles.choicePressed]}
    >
      <View style={styles.disclosureCopy}>
        <Text style={styles.disclosureLabel}>{label}</Text>
        {summary ? <Text style={styles.disclosureSummary}>{summary}</Text> : null}
      </View>
      <Text accessibilityElementsHidden style={styles.disclosureIcon}>
        {expanded ? "−" : "+"}
      </Text>
    </Pressable>
  );
}

function SessionReview({
  linkOptions,
  references,
  session,
  state,
  updateLocalWorkspace,
  workspaceEditable,
}: {
  linkOptions: readonly FocusLinkOption[];
  references: SessionReferenceCatalog;
  session: ActivitySession;
  state: AppState;
  updateLocalWorkspace(
    recipe: (current: AppState) => AppState,
  ): Promise<AppState | undefined>;
  workspaceEditable: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(session.label);
  const [direction, setDirection] = useState<Direction>(session.direction);
  const [linkKey, setLinkKey] = useState(
    session.linkedTaskId
      ? focusLinkKey("task", session.linkedTaskId)
      : session.linkedHabitId
        ? focusLinkKey("habit", session.linkedHabitId)
        : "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const relationship = sessionRelationshipLabel(session, state, linkOptions);
  const currentLinkUnavailable = Boolean(linkKey) && !findFocusLinkOption(linkOptions, linkKey);

  async function saveReview(): Promise<void> {
    if (!label.trim() || saving || !workspaceEditable) return;
    setSaving(true);
    setError("");
    let changed = false;
    const next = await updateLocalWorkspace((current) => {
      const updated = reviewSession(
        current,
        session.id,
        {
          label,
          direction,
          ...(session.linkedIntentId ? {} : focusLinkFields(linkKey)),
        },
        Date.now(),
        references,
      );
      changed = updated !== current;
      return updated;
    });
    setSaving(false);
    if (!next || !changed) {
      setError("These details could not be saved. Your original Session is still safe.");
      return;
    }
    setEditing(false);
  }

  function cancelEdit(): void {
    setLabel(session.label);
    setDirection(session.direction);
    setLinkKey(
      session.linkedTaskId
        ? focusLinkKey("task", session.linkedTaskId)
        : session.linkedHabitId
          ? focusLinkKey("habit", session.linkedHabitId)
          : "",
    );
    setError("");
    setEditing(false);
  }

  return (
    <View style={[styles.sessionReview, editing && styles.sessionReviewEditing]}>
      <Label>
        Last focus · {session.status === "completed" ? "Completed" : "Stopped intentionally"}
      </Label>
      <Text
        accessibilityLabel={`Actual focus time ${formatDuration(session.actualElapsedMs ?? 0)}`}
        style={styles.reviewDuration}
      >
        {formatDuration(session.actualElapsedMs ?? 0)}
      </Text>
      <Text style={styles.reviewTitle}>{session.label}</Text>
      {!editing ? (
        <>
          <Text style={styles.reviewMeta}>
            {session.direction} · {relationship}
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={!workspaceEditable}
            onPress={() => setEditing(true)}
            style={({ pressed }) => [
              styles.editDetailsButton,
              pressed && styles.choicePressed,
              !workspaceEditable && styles.focusActionDisabled,
            ]}
          >
            <Text style={styles.editDetailsText}>Edit details</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.inputLabel}>Activity title</Text>
          <TextInput
            accessibilityLabel="Saved focus activity title"
            maxLength={160}
            onChangeText={setLabel}
            placeholder="What did you do?"
            placeholderTextColor={colors.textMuted}
            style={styles.textInput}
            value={label}
          />
          <DirectionPicker onSelect={setDirection} selected={direction} />
          {session.linkedIntentId ? (
            <View style={styles.retainedRelationship}>
              <Text style={styles.inputLabel}>Linked First Move retained</Text>
              <Body muted>{relationship}</Body>
            </View>
          ) : currentLinkUnavailable ? (
            <View style={styles.retainedRelationship}>
              <Text style={styles.inputLabel}>Current linked item retained</Text>
              <Body muted>{relationship}</Body>
              <SecondaryButton
                disabled={saving || !workspaceEditable}
                title="Change linked item"
                onPress={() => setLinkKey("")}
              />
            </View>
          ) : (
            <FocusLinkPicker
              label="Linked Task or Habit (optional)"
              onSelect={setLinkKey}
              options={linkOptions}
              selectedKey={linkKey}
            />
          )}
          {error ? (
            <Text accessibilityLiveRegion="polite" style={styles.validationText}>
              {error}
            </Text>
          ) : null}
          <PrimaryButton
            disabled={saving || !workspaceEditable || !label.trim()}
            title="Save changes"
            onPress={() => void saveReview()}
          />
          <SecondaryButton
            disabled={saving || !workspaceEditable}
            title="Cancel editing"
            onPress={cancelEdit}
          />
        </>
      )}
    </View>
  );
}

function DirectionPicker({
  compact = false,
  onSelect,
  selected,
}: {
  compact?: boolean;
  onSelect(value: Direction): void;
  selected: Direction;
}) {
  return (
    <>
      <Text style={styles.inputLabel}>Direction</Text>
      <View accessibilityRole="radiogroup" style={compact ? styles.choiceRow : styles.choiceList}>
        {DIRECTIONS.map((direction) => (
          <ChoiceButton
            compact={compact}
            key={direction}
            label={direction}
            onPress={() => onSelect(direction)}
            selected={selected === direction}
          />
        ))}
      </View>
    </>
  );
}

function ChoiceButton({
  balanced = false,
  compact = false,
  detail,
  label,
  onPress,
  selected,
}: {
  balanced?: boolean;
  compact?: boolean;
  detail?: string;
  label: string;
  onPress(): void;
  selected: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        compact && styles.choiceCompact,
        balanced && styles.choiceBalanced,
        selected && styles.choiceSelected,
        pressed && styles.choicePressed,
      ]}
    >
      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>
        {label}
      </Text>
      {detail ? (
        <Text style={[styles.choiceDetail, selected && styles.choiceTextSelected]}>
          {detail}
        </Text>
      ) : null}
    </Pressable>
  );
}

function focusTitle(
  openStatus?: SessionStatus,
  closedStatus?: SessionStatus,
): string {
  if (openStatus === "running") return "Track this time";
  if (openStatus === "paused") return "Paused where you left it";
  if (closedStatus === "completed" || closedStatus === "stopped") {
    return "Ready for what’s next";
  }
  return "Choose how to focus";
}

function focusDetailsSummary(
  label: string,
  direction: Direction,
  linkKey: string,
  options: readonly FocusLinkOption[],
): string {
  const parts: string[] = [];
  const linked = findFocusLinkOption(options, linkKey);
  const trimmedLabel = label.trim();
  if (linked) {
    parts.push(`${linked.kind === "task" ? "Task" : "Habit"}: ${linked.title}`);
  }
  if (trimmedLabel && trimmedLabel !== linked?.title) parts.push(trimmedLabel);
  if (direction !== DIRECTIONS[0]) parts.push(direction);
  return parts.length > 0
    ? parts.join(" · ")
    : "Title, direction, or linked Task/Habit";
}

function intentRelationshipLabel(
  intent: ActivityIntent,
  options: readonly FocusLinkOption[],
  state?: AppState,
): string {
  if (intent.linkedTaskId) {
    const title =
      state?.tasks.find((candidate) => candidate.id === intent.linkedTaskId)?.title ??
      findFocusLinkOption(options, focusLinkKey("task", intent.linkedTaskId))?.title;
    return title ? `Task: ${title}` : "Task currently unavailable";
  }
  if (intent.linkedHabitId) {
    const title =
      state?.habits.find((candidate) => candidate.id === intent.linkedHabitId)?.title ??
      findFocusLinkOption(options, focusLinkKey("habit", intent.linkedHabitId))?.title;
    return title ? `Habit: ${title}` : "Habit currently unavailable";
  }
  return "No linked item";
}

function sessionRelationshipLabel(
  session: ActivitySession,
  state: AppState,
  options: readonly FocusLinkOption[],
): string {
  if (session.linkedIntentId) {
    const intent = state.activityIntents.find(
      (candidate) => candidate.id === session.linkedIntentId,
    );
    return intent
      ? `First Move: ${intent.moveText} · ${intentRelationshipLabel(intent, options, state)}`
      : "Linked First Move retained";
  }
  if (session.linkedTaskId) {
    const title =
      state.tasks.find((candidate) => candidate.id === session.linkedTaskId)?.title ??
      findFocusLinkOption(options, focusLinkKey("task", session.linkedTaskId))?.title;
    return title ? `Task: ${title}` : "Linked Task currently unavailable";
  }
  if (session.linkedHabitId) {
    const title =
      state.habits.find((candidate) => candidate.id === session.linkedHabitId)?.title ??
      findFocusLinkOption(options, focusLinkKey("habit", session.linkedHabitId))?.title;
    return title ? `Habit: ${title}` : "Linked Habit currently unavailable";
  }
  return "No linked item";
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  sessionReview: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
    paddingBottom: spacing.md,
  },
  sessionReviewEditing: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  reviewDuration: {
    color: colors.text,
    fontSize: 36,
    fontVariant: ["tabular-nums"],
    fontWeight: "900",
    letterSpacing: -0.5,
    lineHeight: 42,
  },
  reviewTitle: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: "800",
    lineHeight: 28,
  },
  reviewMeta: {
    color: colors.textMuted,
    fontSize: typography.small,
    lineHeight: 20,
  },
  editDetailsButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    justifyContent: "center",
    minHeight: touchTarget,
    paddingRight: spacing.md,
  },
  editDetailsText: {
    color: colors.primary,
    fontSize: typography.small,
    fontWeight: "800",
  },
  nextMove: {
    backgroundColor: colors.primarySoft,
    borderLeftColor: colors.primary,
    borderLeftWidth: 4,
    borderRadius: radii.sm,
    gap: spacing.sm,
    padding: spacing.md,
  },
  nextMoveMeta: {
    color: colors.textMuted,
    fontSize: typography.small,
    lineHeight: 20,
  },
  focusSetup: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  activeSessionCard: {
    alignItems: "stretch",
    backgroundColor: "#FFFCF6",
    borderColor: "#E4D3BE",
    borderRadius: radii.md,
    borderWidth: 1,
    gap: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
  },
  timerPresentation: {
    alignItems: "center",
    alignSelf: "center",
    height: FOCUS_RING_SIZE,
    justifyContent: "center",
    position: "relative",
    width: FOCUS_RING_SIZE,
  },
  timerContent: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  timerStatus: {
    color: "#7A6354",
    fontSize: typography.label,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginBottom: spacing.sm,
    textTransform: "uppercase",
  },
  timer: {
    color: "#4A2F21",
    fontSize: 56,
    fontVariant: ["tabular-nums"],
    fontWeight: "800",
    letterSpacing: -1,
    textAlign: "center",
  },
  sleepingKitten: {
    alignSelf: "center",
    height: 128,
    marginTop: -84,
    width: 186,
  },
  activeSessionInfo: {
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  activeSessionTitle: {
    color: "#4A2F21",
    fontSize: typography.heading,
    fontWeight: "800",
    lineHeight: 28,
    textAlign: "center",
  },
  activeSessionMeta: {
    color: "#7A6354",
    fontSize: typography.small,
    fontWeight: "700",
    textAlign: "center",
  },
  focusActions: { gap: spacing.sm, marginTop: spacing.sm },
  focusPrimaryButton: {
    alignItems: "center",
    backgroundColor: "#8B5A35",
    borderRadius: radii.sm,
    justifyContent: "center",
    minHeight: touchTarget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  focusPrimaryButtonPressed: { backgroundColor: "#70452B" },
  focusPrimaryButtonText: {
    color: "#FFF9F0",
    fontSize: typography.body,
    fontWeight: "800",
  },
  focusSecondaryButton: {
    alignItems: "center",
    backgroundColor: "#FFFCF6",
    borderColor: "#CFAF8D",
    borderRadius: radii.sm,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: touchTarget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  focusSecondaryButtonPressed: { backgroundColor: "#F6EBDD" },
  focusSecondaryButtonText: {
    color: "#5C3B29",
    fontSize: typography.body,
    fontWeight: "800",
  },
  focusCancelButton: {
    alignItems: "center",
    alignSelf: "center",
    justifyContent: "center",
    minHeight: touchTarget,
    paddingHorizontal: spacing.md,
  },
  focusCancelButtonPressed: { opacity: 0.65 },
  focusCancelButtonText: {
    color: "#7A6354",
    fontSize: typography.small,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  focusActionDisabled: { opacity: 0.55 },
  modeSelector: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    flexDirection: "row",
    gap: spacing.xs,
    padding: spacing.xs,
  },
  modeOption: {
    alignItems: "center",
    borderRadius: radii.pill,
    flex: 1,
    justifyContent: "center",
    minHeight: touchTarget,
    paddingHorizontal: spacing.sm,
  },
  modeOptionSelected: { backgroundColor: colors.primary },
  modeOptionText: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: "800",
  },
  modeOptionTextSelected: { color: "#FFFFFF" },
  hiddenSetup: { display: "none" },
  setupContent: { gap: spacing.md, paddingTop: spacing.sm },
  setupIntro: { gap: spacing.xs },
  durationChoices: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  customDurationPanel: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
    gap: spacing.sm,
    padding: spacing.md,
  },
  detailsDisclosure: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  disclosureButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
    minHeight: touchTarget,
    paddingVertical: spacing.sm,
  },
  disclosureCopy: { flex: 1, gap: 2 },
  disclosureLabel: {
    color: colors.text,
    fontSize: typography.small,
    fontWeight: "800",
  },
  disclosureSummary: {
    color: colors.textMuted,
    fontSize: typography.label,
    lineHeight: 17,
  },
  disclosureIcon: {
    color: colors.primary,
    fontSize: 22,
    fontWeight: "800",
  },
  detailsPanel: { gap: spacing.sm },
  inputLabel: {
    color: colors.text,
    fontSize: typography.small,
    fontWeight: "800",
    marginTop: spacing.xs,
  },
  textInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.sm,
    borderWidth: 1,
    color: colors.text,
    fontSize: typography.body,
    minHeight: touchTarget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  minutesInput: { maxWidth: 160 },
  choiceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  choiceList: { gap: spacing.sm },
  choice: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.sm,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: touchTarget,
    minWidth: 72,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  choiceCompact: {
    alignItems: "center",
    borderRadius: radii.pill,
    minWidth: 52,
    paddingHorizontal: spacing.sm,
  },
  choiceBalanced: { flexBasis: "29%", flexGrow: 1 },
  choiceSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  choicePressed: { opacity: 0.8 },
  choiceText: {
    color: colors.text,
    fontSize: typography.small,
    fontWeight: "800",
  },
  choiceDetail: {
    color: colors.textMuted,
    fontSize: typography.label,
    marginTop: spacing.xs,
  },
  choiceTextSelected: { color: "#FFFFFF" },
  validationText: {
    color: colors.danger,
    fontSize: typography.small,
    fontWeight: "700",
  },
  retainedRelationship: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.border,
    borderRadius: radii.sm,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
});
