import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useFirstMoveApp } from "../../app-state/app-provider.tsx";
import {
  cancelPendingIntent,
  getPendingIntent,
} from "../../domain/app-state.ts";
import type { AppState, SessionStatus } from "../../domain/models.ts";
import {
  cancelSession,
  getLatestClosedSession,
  getOpenSession,
  pauseSession,
  reconcileRunningCountdown,
  remainingMs,
  resumeSession,
  startCountdownFromIntent,
  stopSession,
} from "../../domain/sessions.ts";
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
import { colors, spacing, typography } from "../../theme/tokens.ts";

export default function FocusScreen() {
  const router = useRouter();
  const {
    auth,
    localWorkspace,
    localWorkspaceMessage,
    localWorkspaceStatus,
    updateLocalWorkspace,
  } = useFirstMoveApp();
  const [nowMs, setNowMs] = useState(Date.now);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const completionRequested = useRef<string | undefined>(undefined);
  const pendingIntent = getPendingIntent(localWorkspace);
  const openSession = getOpenSession(localWorkspace);
  const latestClosedSession = pendingIntent
    ? getLatestClosedSession(localWorkspace, pendingIntent.id)
    : getLatestClosedSession(localWorkspace);

  useEffect(() => {
    if (openSession?.status !== "running") return;
    const session = openSession;
    const tick = () => {
      const current = Date.now();
      setNowMs(current);
      if (
        remainingMs(session, current) === 0 &&
        completionRequested.current !== session.id
      ) {
        completionRequested.current = session.id;
        setNotice("");
        void updateLocalWorkspace((state) =>
          reconcileRunningCountdown(state, current),
        ).then((next) => {
          if (!next) completionRequested.current = undefined;
        });
      }
    };
    const initialTick = setTimeout(tick, 0);
    const interval = setInterval(tick, 500);
    return () => {
      clearTimeout(initialTick);
      clearInterval(interval);
    };
  }, [openSession, updateLocalWorkspace]);

  if (localWorkspaceStatus === "loading") {
    return (
      <Screen title="Focus">
        <LoadingState label="Loading your local Focus session…" />
      </Screen>
    );
  }

  const closedForCurrentIntent =
    latestClosedSession &&
    (!pendingIntent || latestClosedSession.linkedIntentId === pendingIntent.id)
      ? latestClosedSession
      : undefined;

  return (
    <Screen
      eyebrow="Focus"
      title={focusTitle(openSession?.status, closedForCurrentIntent?.status)}
      description="A bounded countdown stays accurate from saved timestamps, including after an app restart."
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
        <Card tone="primary">
          <Label>
            {openSession.status === "running" ? "Running" : "Paused"}
          </Label>
          <Text
            accessibilityLabel={`${formatCountdown(remainingMs(openSession, nowMs) ?? 0)} remaining`}
            accessibilityLiveRegion="polite"
            style={styles.timer}
          >
            {formatCountdown(remainingMs(openSession, nowMs) ?? 0)}
          </Text>
          <Heading>{openSession.label}</Heading>
          <View style={styles.details}>
            <Detail label="Direction" value={openSession.direction} />
            <Detail
              label="Bound"
              value={`${openSession.targetDurationMinutes ?? 0} minutes`}
            />
          </View>
          {openSession.status === "running" ? (
            <PrimaryButton
              disabled={saving}
              title="Pause"
              onPress={() =>
                void saveChange(
                  (state, current) => pauseSession(state, openSession.id, current),
                  "Paused. Your elapsed time is saved.",
                )
              }
            />
          ) : (
            <PrimaryButton
              disabled={saving}
              title="Resume"
              onPress={() =>
                void saveChange(
                  (state, current) => resumeSession(state, openSession.id, current),
                  "Resumed from your saved time.",
                )
              }
            />
          )}
          <SecondaryButton
            disabled={saving}
            title="Stop here"
            onPress={() =>
              void saveChange(
                (state, current) => stopSession(state, openSession.id, current),
                "Stopped when you chose. The time you spent is saved.",
              )
            }
          />
          <SecondaryButton
            disabled={saving}
            title="Cancel this session"
            onPress={() =>
              void saveChange(
                (state, current) => cancelSession(state, openSession.id, current),
                "Cancelled. Your First Move is still ready, and nothing was lost.",
              )
            }
          />
        </Card>
      ) : closedForCurrentIntent ? (
        <Card
          tone={
            closedForCurrentIntent.status === "completed" ? "success" : "default"
          }
        >
          <Label>
            {closedForCurrentIntent.status === "completed"
              ? "Completed"
              : "Stopped intentionally"}
          </Label>
          <Heading>
            {closedForCurrentIntent.status === "completed"
              ? "The timer reached zero"
              : "You stopped when you chose"}
          </Heading>
          <Body>{closedForCurrentIntent.label}</Body>
          <View style={styles.details}>
            <Detail
              label="Actual elapsed time"
              value={formatCountdown(closedForCurrentIntent.actualElapsedMs ?? 0)}
            />
            <Detail label="Direction" value={closedForCurrentIntent.direction} />
          </View>
          <Body muted>
            This local session is saved. M1B adds no reward, penalty, history, or
            post-session decision flow.
          </Body>
          <SecondaryButton
            title="Back to First Moves"
            onPress={() => router.push("/(tabs)/first-moves")}
          />
        </Card>
      ) : pendingIntent ? (
        <Card tone="primary">
          <Label>Ready</Label>
          <Heading>{pendingIntent.moveText}</Heading>
          <View style={styles.details}>
            <Detail label="Direction" value={pendingIntent.direction} />
            <Detail
              label="Bounded countdown"
              value={`${pendingIntent.intendedDurationMinutes} minutes`}
            />
          </View>
          <PrimaryButton
            disabled={saving}
            title={`Start ${pendingIntent.intendedDurationMinutes}-minute session`}
            onPress={() =>
              void saveChange(
                (state, current) =>
                  startCountdownFromIntent(
                    state,
                    pendingIntent.id,
                    current,
                  ),
                "Your bounded session has started.",
              )
            }
          />
          <SecondaryButton
            disabled={saving}
            title="Cancel for now"
            onPress={() =>
              void saveChange(
                (state) => cancelPendingIntent(state, pendingIntent.id),
                "Cancelled. Nothing was lost.",
              )
            }
          />
        </Card>
      ) : (
        <Card tone="primary">
          <Label>Ready</Label>
          <Heading>No pending First Move</Heading>
          <Body>
            Choose a local template or write your own move before starting a
            bounded session.
          </Body>
          <PrimaryButton
            title="Choose a First Move"
            onPress={() => router.push("/(tabs)/first-moves")}
          />
        </Card>
      )}

      <Card>
        <Label>Storage boundary</Label>
        <Body muted>
          {auth.status === "authenticated"
            ? "This session stays in this account’s device-local workspace. Cloud business data remains read-only."
            : "Guest Mode keeps this session only in the separate Guest workspace on this device."}
        </Body>
      </Card>
    </Screen>
  );

  async function saveChange(
    recipe: (state: AppState, current: number) => AppState,
    successNotice: string,
  ) {
    if (saving) return;
    const current = Date.now();
    setNowMs(current);
    setSaving(true);
    setNotice("");
    const next = await updateLocalWorkspace((state) => recipe(state, current));
    setSaving(false);
    if (next) setNotice(successNotice);
  }
}

function focusTitle(
  openStatus?: SessionStatus,
  closedStatus?: SessionStatus,
): string {
  if (openStatus === "running") return "One move, for now";
  if (openStatus === "paused") return "Paused where you left it";
  if (closedStatus === "completed") return "Session complete";
  if (closedStatus === "stopped") return "Time saved";
  return "Ready for one bounded session";
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function formatCountdown(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  timer: {
    color: colors.text,
    fontSize: 56,
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
});
