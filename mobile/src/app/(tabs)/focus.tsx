import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { useFirstMoveApp } from "../../app-state/app-provider.tsx";
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
  const {
    auth,
    localWorkspace,
    localWorkspaceMessage,
    localWorkspaceStatus,
    sync,
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
            setNotice("Session complete and saved automatically.");
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
  }, [openSession, updateLocalWorkspace, workspaceEditable]);

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
      description="Start a countdown or stopwatch directly, or use a pending First Move. Every mode uses the same saved local Session engine."
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
          linkOptions={linkOptions}
          nowMs={nowMs}
          onCancel={() => {
            const assisted = Boolean(openSession.linkedIntentId);
            void saveChange(
              (state) => cancelSession(state, openSession.id),
              assisted
                ? "Cancelled. Your pending First Move is still ready."
                : "Cancelled. No completed or stopped Session was saved.",
            );
          }}
          onPause={() =>
            void saveChange(
              (state, current) => pauseSession(state, openSession.id, current),
              (next) =>
                next.sessions.find((session) => session.id === openSession.id)
                  ?.status === "completed"
                  ? "Session complete and saved automatically."
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
              (next) =>
                next.sessions.find((session) => session.id === openSession.id)
                  ?.status === "completed"
                  ? "Session complete and saved automatically."
                  : "Stopped when you chose. This Session is already saved.",
            )
          }
          saving={saving || !workspaceEditable}
          session={openSession}
          state={localWorkspace}
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
            />
          ) : null}

          <CountdownSetup
            disabled={saving || !workspaceEditable}
            linkOptions={linkOptions}
            onStart={(input) =>
              void saveChange(
                (state, current) =>
                  startCountdown(state, input, current, undefined, references),
                "Your standalone countdown has started.",
              )
            }
          />

          <StopwatchSetup
            disabled={saving || !workspaceEditable}
            linkOptions={linkOptions}
            onStart={(input) =>
              void saveChange(
                (state, current) =>
                  startStopwatch(state, input, current, undefined, references),
                "Your standalone stopwatch has started.",
              )
            }
          />
        </>
      )}

      <Card>
        <Label>Storage boundary</Label>
        <Body muted>
          {auth.status === "authenticated"
            ? sync.status === "write-disabled"
              ? "This uninitialized account remains write-disabled. Guest and account data are not merged."
              : "Sessions and pending First Moves update this UUID’s local working copy immediately, queue in order, and accept only validated canonical responses."
            : "Guest Mode keeps Sessions and relationships only in the separate Guest workspace on this device."}
        </Body>
      </Card>
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
    const next = await updateLocalWorkspace((state) => {
      const updated = recipe(state, current);
      changed = updated !== state;
      return updated;
    });
    setSaving(false);
    if (next && changed) {
      setNotice(
        typeof successNotice === "string" ? successNotice : successNotice(next),
      );
    } else if (next) {
      setNotice("That Focus change is no longer available. Your saved data was not changed.");
    }
  }
}

function ActiveSessionCard({
  linkOptions,
  nowMs,
  onCancel,
  onPause,
  onResume,
  onStop,
  saving,
  session,
  state,
}: {
  linkOptions: readonly FocusLinkOption[];
  nowMs: number;
  onCancel(): void;
  onPause(): void;
  onResume(): void;
  onStop(): void;
  saving: boolean;
  session: ActivitySession;
  state: AppState;
}) {
  const displayMs =
    session.mode === "countdown"
      ? remainingMs(session, nowMs) ?? 0
      : elapsedMs(session, nowMs);
  const relationship = sessionRelationshipLabel(session, state, linkOptions);

  return (
    <Card tone="primary">
      <Label>
        {session.mode === "countdown" ? "Countdown" : "Stopwatch"} · {session.status}
      </Label>
      <Text
        accessibilityLabel={`${formatDuration(displayMs)} ${
          session.mode === "countdown" ? "remaining" : "elapsed"
        }`}
        accessibilityLiveRegion="polite"
        style={styles.timer}
      >
        {formatDuration(displayMs)}
      </Text>
      <Heading>{session.label}</Heading>
      <View style={styles.details}>
        <Detail label="Direction" value={session.direction} />
        {session.mode === "countdown" ? (
          <Detail
            label="Duration"
            value={`${session.targetDurationMinutes ?? 0} minutes`}
          />
        ) : null}
        <Detail label="Relationship" value={relationship} />
      </View>
      {session.status === "running" ? (
        <PrimaryButton disabled={saving} title="Pause" onPress={onPause} />
      ) : (
        <PrimaryButton disabled={saving} title="Resume" onPress={onResume} />
      )}
      <SecondaryButton
        disabled={saving}
        title="Stop and save"
        onPress={onStop}
      />
      <SecondaryButton
        disabled={saving}
        title="Cancel this session"
        onPress={onCancel}
      />
    </Card>
  );
}

function PendingFirstMoveCard({
  disabled,
  intent,
  linkOptions,
  onStart,
}: {
  disabled: boolean;
  intent: ActivityIntent;
  linkOptions: readonly FocusLinkOption[];
  onStart(): void;
}) {
  return (
    <Card tone="primary">
      <Label>Pending First Move</Label>
      <Heading>{intent.moveText}</Heading>
      <View style={styles.details}>
        <Detail label="Direction" value={intent.direction} />
        <Detail
          label="Intended duration"
          value={`${intent.intendedDurationMinutes} minutes`}
        />
        <Detail
          label="Relationship"
          value={intentRelationshipLabel(intent, linkOptions)}
        />
      </View>
      <Body muted>
        This assisted countdown will keep its existing ActivityIntent relationship.
      </Body>
      <PrimaryButton
        disabled={disabled}
        title="Start this First Move"
        onPress={onStart}
      />
    </Card>
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
  const customDuration = customMinutes
    ? parseFocusDurationInput(customMinutes)
    : undefined;
  const duration = customMinutes ? customDuration : preset;

  function chooseLink(key: string): void {
    setLinkKey(key);
    const source = findFocusLinkOption(linkOptions, key);
    if (!source) return;
    setDirection(source.direction);
    setLabel(source.title);
  }

  return (
    <Card>
      <Label>Standalone</Label>
      <Heading>Quick Countdown</Heading>
      <Body muted>
        Start Focus directly without creating or consuming an ActivityIntent.
      </Body>
      <FocusLinkPicker
        label="Link to a Task or Habit (optional)"
        onSelect={chooseLink}
        options={linkOptions}
        selectedKey={linkKey}
      />
      <Text style={styles.inputLabel}>Activity title (optional)</Text>
      <TextInput
        accessibilityLabel="Countdown activity title"
        maxLength={160}
        onChangeText={setLabel}
        placeholder="Focus time"
        placeholderTextColor={colors.textMuted}
        style={styles.textInput}
        value={label}
      />
      <DirectionPicker onSelect={setDirection} selected={direction} />
      <Text style={styles.inputLabel}>Duration</Text>
      <View accessibilityRole="radiogroup" style={styles.choiceRow}>
        {FOCUS_COUNTDOWN_PRESETS.map((minutes) => (
          <ChoiceButton
            key={minutes}
            label={`${minutes} min`}
            onPress={() => {
              setPreset(minutes);
              setCustomMinutes("");
            }}
            selected={!customMinutes && preset === minutes}
          />
        ))}
      </View>
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
      <PrimaryButton
        disabled={disabled || duration === undefined}
        title="Start countdown"
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
    </Card>
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

  function chooseLink(key: string): void {
    setLinkKey(key);
    const source = findFocusLinkOption(linkOptions, key);
    if (!source) return;
    setDirection(source.direction);
    setLabel(source.title);
  }

  return (
    <Card>
      <Label>Standalone</Label>
      <Heading>Stopwatch</Heading>
      <Body muted>
        Track open-ended time with the same persisted Session engine.
      </Body>
      <FocusLinkPicker
        label="Link to a Task or Habit (optional)"
        onSelect={chooseLink}
        options={linkOptions}
        selectedKey={linkKey}
      />
      <Text style={styles.inputLabel}>Activity title (optional)</Text>
      <TextInput
        accessibilityLabel="Stopwatch activity title"
        maxLength={160}
        onChangeText={setLabel}
        placeholder="Tracked time"
        placeholderTextColor={colors.textMuted}
        style={styles.textInput}
        value={label}
      />
      <DirectionPicker onSelect={setDirection} selected={direction} />
      <PrimaryButton
        disabled={disabled}
        title="Start stopwatch"
        onPress={() =>
          onStart({
            direction,
            label: label || undefined,
            ...focusLinkFields(linkKey),
          })
        }
      />
    </Card>
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
    <Card tone={session.status === "completed" ? "success" : "default"}>
      <Label>
        {session.status === "completed" ? "Session complete" : "Stopped intentionally"}
      </Label>
      <Heading>{session.label}</Heading>
      <Body>
        Saved automatically · Actual time: {formatDuration(session.actualElapsedMs ?? 0)}
      </Body>
      {!editing ? (
        <>
          <View style={styles.details}>
            <Detail label="Direction" value={session.direction} />
            <Detail label="Relationship" value={relationship} />
          </View>
          <SecondaryButton
            disabled={!workspaceEditable}
            title="Edit details"
            onPress={() => setEditing(true)}
          />
        </>
      ) : (
        <>
          <Text style={styles.inputLabel}>Activity title</Text>
          <TextInput
            accessibilityLabel="Saved Session activity title"
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
          ) : (
            <FocusLinkPicker
              currentUnavailableLabel={relationship}
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
    </Card>
  );
}

function DirectionPicker({
  onSelect,
  selected,
}: {
  onSelect(value: Direction): void;
  selected: Direction;
}) {
  return (
    <>
      <Text style={styles.inputLabel}>Direction</Text>
      <View accessibilityRole="radiogroup" style={styles.choiceList}>
        {DIRECTIONS.map((direction) => (
          <ChoiceButton
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
  detail,
  label,
  onPress,
  selected,
}: {
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

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function focusTitle(
  openStatus?: SessionStatus,
  closedStatus?: SessionStatus,
): string {
  if (openStatus === "running") return "Track this time";
  if (openStatus === "paused") return "Paused where you left it";
  if (closedStatus === "completed") return "Session complete";
  if (closedStatus === "stopped") return "Time saved";
  return "Choose how to focus";
}

function intentRelationshipLabel(
  intent: ActivityIntent,
  options: readonly FocusLinkOption[],
): string {
  if (intent.linkedTaskId) {
    const title = findFocusLinkOption(
      options,
      focusLinkKey("task", intent.linkedTaskId),
    )?.title;
    return title ? `Task: ${title}` : "Task currently unavailable";
  }
  if (intent.linkedHabitId) {
    const title = findFocusLinkOption(
      options,
      focusLinkKey("habit", intent.linkedHabitId),
    )?.title;
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
      ? `First Move: ${intent.moveText} · ${intentRelationshipLabel(intent, options)}`
      : "Linked First Move retained";
  }
  if (session.linkedTaskId) {
    const option = findFocusLinkOption(
      options,
      focusLinkKey("task", session.linkedTaskId),
    );
    return option ? `Task: ${option.title}` : "Linked Task currently unavailable";
  }
  if (session.linkedHabitId) {
    const option = findFocusLinkOption(
      options,
      focusLinkKey("habit", session.linkedHabitId),
    );
    return option ? `Habit: ${option.title}` : "Linked Habit currently unavailable";
  }
  return "Standalone — no linked item";
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
  timer: {
    color: colors.text,
    fontSize: 54,
    fontVariant: ["tabular-nums"],
    fontWeight: "800",
    letterSpacing: -1,
    textAlign: "center",
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
