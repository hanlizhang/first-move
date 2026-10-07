import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

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
import { PixelFocusRing } from "../../components/pixel-scenes.tsx";
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
} from "../../domain/models.ts";
import {
  acknowledgeSession,
  cancelSession,
  continueLinkedSession,
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
  const router = useRouter();
  const {
    fontScale,
    height: viewportHeight,
    width: viewportWidth,
  } = useWindowDimensions();
  const { visualPreview } = useLocalSearchParams<{ visualPreview?: string }>();
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
  const [standaloneSetupForIntentId, setStandaloneSetupForIntentId] =
    useState<string>();
  const visualPreviewIntent = useMemo<ActivityIntent>(() => ({
    createdAt: "2026-10-07T09:00:00.000Z",
    direction: "Work & Study",
    id: "visual-preview-intent",
    intendedDurationMinutes: 2,
    moveText: "Write the task title and one action that takes under two minutes.",
    status: visualPreview === "pending" ? "pending" : "consumed",
    stuckState: "overwhelmed by a large task",
  }), [visualPreview]);
  const visualPreviewSession = useMemo<ActivitySession>(() => {
    const startedAt = "2026-10-07T09:00:00.000Z";
    const completed = visualPreview === "completed" || visualPreview === "post-focus";
    return {
      accumulatedElapsedMs: completed ? 120_000 : 15_000,
      actualElapsedMs: completed ? 120_000 : undefined,
      direction: visualPreviewIntent.direction,
      endedAt: completed ? "2026-10-07T09:02:00.000Z" : undefined,
      id: "visual-preview-running-focus",
      label: visualPreviewIntent.moveText,
      lastResumedAt: visualPreview === "paused" || completed ? undefined : startedAt,
      linkedIntentId: visualPreviewIntent.id,
      mode: "countdown",
      startedAt,
      status: completed
        ? "completed"
        : visualPreview === "paused"
          ? "paused"
          : "running",
      targetDurationMinutes: visualPreviewIntent.intendedDurationMinutes,
    };
  }, [visualPreview, visualPreviewIntent]);
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
  const linkedResultSession =
    latestClosedSession?.linkedIntentId && !latestClosedSession.reviewedAt
      ? latestClosedSession
      : undefined;
  const linkedResultIntent = linkedResultSession?.linkedIntentId
    ? localWorkspace.activityIntents.find(
        (intent) => intent.id === linkedResultSession.linkedIntentId,
      )
    : undefined;
  const visualPreviewActive =
    __DEV__ && (visualPreview === "running" || visualPreview === "paused");
  const activePresentation = Boolean(openSession) || visualPreviewActive;
  const focusParentWidth = Math.min(viewportWidth - spacing.md * 2, 420);
  const focusRingSize = Math.round(
    Math.min(
      activePresentation ? 248 : 236,
      Math.max(
        176,
        Math.min(
          focusParentWidth * 0.62,
          viewportHeight * (activePresentation ? 0.29 : 0.27),
        ),
      ),
    ),
  );
  const requiresFocusOverflow = fontScale > 1.3 || viewportHeight < 600;
  const focusSetup = (
    <FocusSetup
      disabled={saving || !workspaceEditable}
      linkOptions={linkOptions}
      parentWidth={focusParentWidth}
      ringSize={focusRingSize}
      onStartCountdown={(input) =>
        void saveChange(
          (state, current) =>
            startCountdown(state, input, current, undefined, references),
          "",
        )
      }
      onStartStopwatch={(input) =>
        void saveChange(
          (state, current) =>
            startStopwatch(state, input, current, undefined, references),
          "",
        )
      }
    />
  );

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

  useEffect(() => {
    if (!__DEV__ || visualPreview !== "completed") return;
    presentFocusCompletion(visualPreviewSession);
  }, [presentFocusCompletion, visualPreview, visualPreviewSession]);

  if (localWorkspaceStatus === "loading") {
    return (
      <Screen title="Focus">
        <LoadingState label="Loading your local Focus session…" />
      </Screen>
    );
  }

  if (
    __DEV__ &&
    ["pending", "running", "paused", "completed", "post-focus"].includes(
      visualPreview ?? "",
    )
  ) {
    return (
      <FocusPage
        immersive={visualPreviewActive}
        scroll={requiresFocusOverflow}
        title={visualPreviewActive ? undefined : "Focus"}
      >
        {visualPreviewActive ? (
          <ActiveSessionCard
            parentWidth={focusParentWidth}
            ringSize={focusRingSize}
            nowMs={new Date(visualPreviewSession.startedAt).getTime() + 15_000}
            onCancel={() => undefined}
            onPause={() => undefined}
            onResume={() => undefined}
            onStop={() => undefined}
            saving={false}
            session={visualPreviewSession}
          />
        ) : visualPreview === "pending" ? (
          <>
            <PendingFirstMoveCard
              disabled={false}
              intent={visualPreviewIntent}
              linkOptions={[]}
              onStart={() => undefined}
              state={localWorkspace}
            />
            <SecondaryButton
              title="Start a different Focus session"
              onPress={() => undefined}
            />
          </>
        ) : (
          <LinkedFirstMoveResult
            disabled={false}
            intent={visualPreviewIntent}
            onAnotherFirstMove={() => undefined}
            onDone={() => undefined}
            onKeepGoing={() => undefined}
            session={visualPreviewSession}
          />
        )}
      </FocusPage>
    );
  }

  return (
    <FocusPage
      immersive={Boolean(openSession)}
      scroll={requiresFocusOverflow}
      title={openSession ? undefined : "Focus"}
    >
      {localWorkspaceMessage ? (
        <Card tone="danger">
          <Body>{localWorkspaceMessage}</Body>
        </Card>
      ) : null}
      {notice && !openSession ? (
        <Card>
          <Body>{notice}</Body>
        </Card>
      ) : null}

      {openSession ? (
        <ActiveSessionCard
          parentWidth={focusParentWidth}
          ringSize={focusRingSize}
          nowMs={nowMs}
          onCancel={() => {
            const assisted = Boolean(openSession.linkedIntentId);
            const pendingAssisted = localWorkspace.activityIntents.some(
              (intent) =>
                intent.id === openSession.linkedIntentId &&
                intent.status === "pending",
            );
            void saveChange(
              (state) => cancelSession(state, openSession.id),
              pendingAssisted
                ? "Cancelled. Your pending First Move is still ready."
                : assisted
                  ? "Cancelled. Your saved First Move is unchanged."
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
      ) : linkedResultSession && linkedResultIntent ? (
        <LinkedFirstMoveResult
          disabled={saving || !workspaceEditable}
          intent={linkedResultIntent}
          onAnotherFirstMove={() => {
            void saveChange(
              (state, current) =>
                acknowledgeSession(state, linkedResultSession.id, current),
              "",
            ).then((changed) => {
              if (changed) router.push("/(tabs)/first-moves");
            });
          }}
          onDone={() =>
            void saveChange(
              (state, current) =>
                acknowledgeSession(state, linkedResultSession.id, current),
              "First Move finished for now.",
            )
          }
          onKeepGoing={() =>
            void saveChange(
              (state, current) =>
                continueLinkedSession(state, linkedResultSession.id, current),
              "You are continuing with the same First Move.",
            )
          }
          session={linkedResultSession}
        />
      ) : (
        <>
          {pendingIntent ? (
            standaloneSetupForIntentId === pendingIntent.id ? (
              <View style={styles.alternateFocusSetup}>
                <SecondaryButton
                  disabled={saving || !workspaceEditable}
                  title="Back to my First Move"
                  onPress={() => setStandaloneSetupForIntentId(undefined)}
                />
                {focusSetup}
              </View>
            ) : (
              <>
                <PendingFirstMoveCard
                  disabled={saving || !workspaceEditable}
                  intent={pendingIntent}
                  linkOptions={linkOptions}
                  onStart={() =>
                    void saveChange(
                      (state, current) =>
                        startCountdownFromIntent(state, pendingIntent.id, current),
                      "",
                    )
                  }
                  state={localWorkspace}
                />
                <SecondaryButton
                  disabled={saving || !workspaceEditable}
                  title="Start a different Focus session"
                  onPress={() =>
                    setStandaloneSetupForIntentId(pendingIntent.id)
                  }
                />
              </>
            )
          ) : (
            focusSetup
          )}
          {latestClosedSession && !pendingIntent ? (
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
        </>
      )}

    </FocusPage>
  );

  async function saveChange(
    recipe: (state: AppState, current: number) => AppState,
    successNotice: string | ((next: AppState) => string),
  ): Promise<boolean> {
    if (saving || !workspaceEditable) return false;
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
    return Boolean(next && changed);
  }
}

function FocusPage({
  children,
  immersive = false,
  scroll = false,
  title,
}: {
  children: ReactNode;
  immersive?: boolean;
  scroll?: boolean;
  title?: string;
}) {
  const content = (
    <>
      {title ? (
        <Text accessibilityRole="header" style={styles.focusPageTitle}>
          {title}
        </Text>
      ) : null}
      <View
        style={[
          styles.focusPageBody,
          immersive && styles.focusPageBodyImmersive,
        ]}
      >
        {children}
      </View>
    </>
  );
  return (
    <SafeAreaView
      edges={immersive ? ["top", "right", "bottom", "left"] : ["top", "left", "right"]}
      style={styles.focusSafeArea}
    >
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.focusOverflowContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {content}
        </ScrollView>
      ) : (
        <View style={styles.focusPageContent}>{content}</View>
      )}
    </SafeAreaView>
  );
}

function ActiveSessionCard({
  nowMs,
  onCancel,
  onPause,
  onResume,
  onStop,
  parentWidth,
  ringSize,
  saving,
  session,
}: {
  nowMs: number;
  onCancel(): void;
  onPause(): void;
  onResume(): void;
  onStop(): void;
  parentWidth: number;
  ringSize: number;
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
    <View style={[styles.activeSessionCard, { width: parentWidth }]}>
      <View style={styles.activeSessionInfo}>
        {session.linkedIntentId ? (
          <Text style={styles.firstMoveEyebrow}>YOUR FIRST MOVE</Text>
        ) : null}
        <Text
          accessibilityLabel={
            session.linkedIntentId
              ? `Your First Move. ${session.label}`
              : session.label
          }
          adjustsFontSizeToFit
          ellipsizeMode="tail"
          minimumFontScale={0.78}
          numberOfLines={3}
          style={styles.activeSessionTitle}
        >
          {session.label}
        </Text>
        <Text style={styles.activeSessionMeta}>
          {session.direction}
          {session.mode === "countdown"
            ? ` · ${session.targetDurationMinutes ?? 0} min`
            : " · Stopwatch"}
        </Text>
      </View>
      <View style={[styles.timerPresentation, { height: ringSize, width: "100%" }]}>
        <PixelFocusRing
          accessibilityLabel={`${formatDuration(displayMs)} ${
            session.mode === "countdown" ? "remaining" : "elapsed"
          }`}
          label={session.mode === "countdown" ? "Focus" : "Stopwatch"}
          live
          progress={progress}
          size={ringSize}
          value={formatDuration(displayMs)}
        />
      </View>
      <View style={styles.sleepingKitten}>
        <PixelKitten
          accessibilityLabel="Sleeping pixel kitten resting beneath the Focus timer"
          pose="sleeping"
          showFloor={false}
        />
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
      <Label>YOUR FIRST MOVE</Label>
      <Text
        adjustsFontSizeToFit
        ellipsizeMode="tail"
        minimumFontScale={0.82}
        numberOfLines={4}
        style={styles.pendingMoveTitle}
      >
        {intent.moveText}
      </Text>
      <Text style={styles.nextMoveMeta}>
        {intent.direction} · {intent.intendedDurationMinutes} min · {intentRelationshipLabel(intent, linkOptions, state)}
      </Text>
      <PrimaryButton
        disabled={disabled}
        title="Start this move"
        onPress={onStart}
      />
    </View>
  );
}

function LinkedFirstMoveResult({
  disabled,
  intent,
  onAnotherFirstMove,
  onDone,
  onKeepGoing,
  session,
}: {
  disabled: boolean;
  intent: ActivityIntent;
  onAnotherFirstMove(): void;
  onDone(): void;
  onKeepGoing(): void;
  session: ActivitySession;
}) {
  const stopped = session.status === "stopped";
  return (
    <View style={styles.linkedResult}>
      <View style={styles.linkedResultSummary}>
        <Label>FIRST MOVE SAVED</Label>
        <Heading>
          {stopped
            ? "You stopped when you chose. Your time is saved."
            : "You made the first move."}
        </Heading>
        <Text
          accessibilityLabel={`Actual focus time ${formatDuration(session.actualElapsedMs ?? 0)}`}
          style={styles.linkedResultDuration}
        >
          {formatDuration(session.actualElapsedMs ?? 0)}
        </Text>
        <Text
          adjustsFontSizeToFit
          ellipsizeMode="tail"
          minimumFontScale={0.82}
          numberOfLines={3}
          style={styles.linkedResultMove}
        >
          {intent.moveText}
        </Text>
        <Text style={styles.linkedResultMeta}>
          {intent.direction} · {intent.intendedDurationMinutes} min intended
        </Text>
      </View>
      <View style={styles.linkedResultActions}>
        <PrimaryButton disabled={disabled} title="Done" onPress={onDone} />
        <View style={styles.linkedResultSecondaryActions}>
          <View style={styles.linkedResultSecondaryAction}>
            <SecondaryButton
              disabled={disabled}
              title="Keep going"
              onPress={onKeepGoing}
            />
          </View>
          <View style={styles.linkedResultSecondaryAction}>
            <SecondaryButton
              disabled={disabled}
              title="Another First Move"
              onPress={onAnotherFirstMove}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

type FocusSetupMode = "countdown" | "stopwatch";

function FocusSetup({
  disabled,
  linkOptions,
  parentWidth,
  ringSize,
  onStartCountdown,
  onStartStopwatch,
}: {
  disabled: boolean;
  linkOptions: readonly FocusLinkOption[];
  parentWidth: number;
  ringSize: number;
  onStartCountdown(input: Parameters<typeof startCountdown>[1]): void;
  onStartStopwatch(input: Parameters<typeof startStopwatch>[1]): void;
}) {
  const [mode, setMode] = useState<FocusSetupMode>("countdown");

  return (
    <View style={[styles.focusSetup, { width: parentWidth }]}>
      <View
        accessibilityElementsHidden={mode !== "countdown"}
        importantForAccessibility={mode === "countdown" ? "auto" : "no-hide-descendants"}
        style={mode !== "countdown" && styles.hiddenSetup}
      >
        <CountdownSetup
          disabled={disabled}
          linkOptions={linkOptions}
          mode={mode}
          onModeSelect={setMode}
          onStart={onStartCountdown}
          ringSize={ringSize}
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
          mode={mode}
          onModeSelect={setMode}
          onStart={onStartStopwatch}
          ringSize={ringSize}
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
  mode,
  onModeSelect,
  onStart,
  ringSize,
}: {
  disabled: boolean;
  linkOptions: readonly FocusLinkOption[];
  mode: FocusSetupMode;
  onModeSelect(mode: FocusSetupMode): void;
  onStart(input: Parameters<typeof startCountdown>[1]): void;
  ringSize: number;
}) {
  const [label, setLabel] = useState("");
  const [direction, setDirection] = useState<Direction>(DIRECTIONS[0]);
  const [linkKey, setLinkKey] = useState("");
  const [preset, setPreset] = useState<number>(25);
  const [customMinutes, setCustomMinutes] = useState("");
  const [customExpanded, setCustomExpanded] = useState(false);
  const [customizeExpanded, setCustomizeExpanded] = useState(false);
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
      <View style={styles.idleFocusHero}>
        <PixelFocusRing
          accessibilityLabel={
            duration === undefined
              ? "Custom countdown duration is invalid"
              : `${duration} minute countdown selected`
          }
          label="Focus"
          size={ringSize}
          value={duration === undefined ? "--:--" : formatDuration(duration * 60_000)}
        />
        <View style={styles.focusStartButton}>
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
        </View>
        <View style={styles.idleSleepingKitten}>
          <PixelKitten
            accessibilityLabel="Sleeping pixel kitten beside the Focus ring"
            pose="sleeping"
            showFloor={false}
          />
        </View>
      </View>
      <View style={styles.secondaryConfiguration}>
        <DisclosureButton
          expanded={customizeExpanded}
          label="Customize"
          onPress={() => setCustomizeExpanded((current) => !current)}
          summary={duration === undefined ? "Check custom time" : `${duration} min · Countdown`}
        />
        {customizeExpanded ? (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.configurationScroller}
          >
            <View style={styles.customizePanel}>
              <Text style={styles.configurationLabel}>Duration</Text>
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
                label="Custom"
                onPress={() => setCustomExpanded((current) => !current)}
                summary={customMinutes && customDuration ? `${customDuration} min` : undefined}
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
              <Text style={styles.configurationLabel}>Mode</Text>
              <FocusModeSelector mode={mode} onSelect={onModeSelect} />
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
          </ScrollView>
        ) : null}
      </View>
    </View>
  );
}

function StopwatchSetup({
  disabled,
  linkOptions,
  mode,
  onModeSelect,
  onStart,
  ringSize,
}: {
  disabled: boolean;
  linkOptions: readonly FocusLinkOption[];
  mode: FocusSetupMode;
  onModeSelect(mode: FocusSetupMode): void;
  onStart(input: Parameters<typeof startStopwatch>[1]): void;
  ringSize: number;
}) {
  const [label, setLabel] = useState("");
  const [direction, setDirection] = useState<Direction>(DIRECTIONS[0]);
  const [linkKey, setLinkKey] = useState("");
  const [customizeExpanded, setCustomizeExpanded] = useState(false);
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
      <View style={styles.idleFocusHero}>
        <PixelFocusRing
          accessibilityLabel="Stopwatch ready at zero minutes"
          label="Stopwatch"
          size={ringSize}
          value="00:00"
        />
        <View style={styles.focusStartButton}>
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
        </View>
        <View style={styles.idleSleepingKitten}>
          <PixelKitten
            accessibilityLabel="Sleeping pixel kitten beside the Focus ring"
            pose="sleeping"
            showFloor={false}
          />
        </View>
      </View>
      <View style={styles.secondaryConfiguration}>
        <DisclosureButton
          expanded={customizeExpanded}
          label="Customize"
          onPress={() => setCustomizeExpanded((current) => !current)}
          summary="Stopwatch"
        />
        {customizeExpanded ? (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.configurationScroller}
          >
            <View style={styles.customizePanel}>
              <Text style={styles.configurationLabel}>Mode</Text>
              <FocusModeSelector mode={mode} onSelect={onModeSelect} />
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
          </ScrollView>
        ) : null}
      </View>
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
        label="Details"
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
        {expanded ? "⌃" : "›"}
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
  focusSafeArea: { backgroundColor: colors.background, flex: 1 },
  focusPageContent: {
    alignItems: "center",
    flex: 1,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  focusOverflowContent: {
    alignItems: "center",
    flexGrow: 1,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  focusPageTitle: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: "900",
    lineHeight: 28,
    textAlign: "center",
  },
  focusPageBody: {
    flex: 1,
    gap: spacing.md,
    marginTop: spacing.sm,
    maxWidth: 420,
    width: "100%",
  },
  focusPageBodyImmersive: { marginTop: 0 },
  alternateFocusSetup: { flex: 1, gap: spacing.sm },
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
  linkedResult: {
    flex: 1,
    gap: spacing.md,
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
  },
  linkedResultSummary: { gap: spacing.sm },
  linkedResultDuration: {
    color: colors.text,
    fontSize: 36,
    fontVariant: ["tabular-nums"],
    fontWeight: "900",
    letterSpacing: -0.5,
    lineHeight: 42,
  },
  linkedResultMove: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: "800",
    lineHeight: 24,
  },
  linkedResultMeta: {
    color: colors.textMuted,
    fontSize: typography.small,
    lineHeight: 20,
  },
  linkedResultActions: { gap: spacing.sm },
  linkedResultSecondaryActions: { flexDirection: "row", gap: spacing.sm },
  linkedResultSecondaryAction: { flex: 1 },
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
    flex: 1,
    gap: spacing.sm,
    justifyContent: "center",
    paddingVertical: spacing.sm,
  },
  pendingMoveTitle: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: "800",
    lineHeight: 28,
  },
  nextMoveMeta: {
    color: colors.textMuted,
    fontSize: typography.small,
    lineHeight: 20,
  },
  focusSetup: {
    flex: 1,
    gap: spacing.sm,
  },
  activeSessionCard: {
    alignItems: "center",
    alignSelf: "center",
    flex: 1,
    gap: spacing.xs,
    justifyContent: "space-between",
  },
  timerPresentation: {
    alignItems: "center",
    alignSelf: "center",
    flexShrink: 1,
    justifyContent: "center",
    position: "relative",
  },
  sleepingKitten: {
    alignSelf: "center",
    height: 92,
    marginTop: -18,
    overflow: "hidden",
    width: 174,
  },
  activeSessionInfo: {
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  firstMoveEyebrow: {
    color: colors.primary,
    fontSize: typography.label,
    fontWeight: "900",
    letterSpacing: 1.2,
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
  focusActions: { alignSelf: "stretch", gap: spacing.xs },
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
  idleFocusHero: {
    alignItems: "center",
    alignSelf: "center",
    flex: 1,
    gap: spacing.sm,
    justifyContent: "center",
    width: "100%",
  },
  focusStartButton: { width: 176 },
  idleSleepingKitten: {
    alignSelf: "center",
    height: 96,
    marginTop: -22,
    overflow: "hidden",
    width: 174,
  },
  modeSelector: {
    alignSelf: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.pill,
    flexDirection: "row",
    gap: spacing.xs,
    maxWidth: 360,
    padding: spacing.xs,
    width: "100%",
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
  setupContent: { flex: 1, gap: spacing.sm },
  secondaryConfiguration: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexShrink: 1,
  },
  configurationScroller: { flexShrink: 1, maxHeight: 260 },
  customizePanel: { gap: spacing.sm, paddingBottom: spacing.md },
  configurationLabel: {
    color: colors.textMuted,
    fontSize: typography.label,
    fontWeight: "800",
    letterSpacing: 1,
    marginTop: spacing.xs,
    textTransform: "uppercase",
  },
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
    gap: spacing.md,
  },
  disclosureButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
    minHeight: touchTarget,
    paddingHorizontal: spacing.xs,
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
