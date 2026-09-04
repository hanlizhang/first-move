import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import type { AuthState } from "../../auth/auth-state.ts";
import { useFirstMoveApp, type AppSyncState } from "../../app-state/app-provider.tsx";
import { ReflectionEditor } from "../../components/reflection-editor.tsx";
import { useCurrentLocalDate } from "../../components/use-current-local-date.ts";
import {
  Body,
  Card,
  LoadingState,
  PrimaryButton,
  Screen,
} from "../../components/ui.tsx";
import { captureLocalDay } from "../../domain/dates.ts";
import { DIRECTIONS, type AppState, type Habit, type Task } from "../../domain/models.ts";
import {
  deleteReflection,
  saveReflection,
  type ReflectionInput,
} from "../../domain/reflections.ts";
import {
  isHabitActive,
  isTaskActive,
  toggleHabitCompletion,
  toggleTaskCompletion,
} from "../../domain/tasks-habits.ts";
import {
  formatFocusedDuration,
  formatTimelineTime,
  getTodayView,
  type TodayFocusItem,
  type TodayTimelineItem,
} from "../../domain/today.ts";
import { colors, radii, spacing, touchTarget, typography } from "../../theme/tokens.ts";

export default function TodayScreen() {
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
  const today = useCurrentLocalDate();
  const view = useMemo(() => getTodayView(localWorkspace, today), [localWorkspace, today]);
  const [savingId, setSavingId] = useState<string>();
  const [notice, setNotice] = useState("");

  if (localWorkspaceStatus === "loading") {
    return (
      <Screen title="Today">
        <LoadingState label="Loading today…" />
      </Screen>
    );
  }

  return (
    <Screen
      eyebrow={formatCurrentDate(today)}
      title="Today"
      description="A small view of what matters now and the time you chose intentionally."
    >
      <View style={styles.topRow}>
        <SyncPill auth={auth} sync={sync} />
        <Text style={styles.summaryText}>
          {view.tasks.filter((task) => !isTaskActive(task, today)).length} Tasks done ·{" "}
          {view.habits.filter((habit) => !isHabitActive(habit, today)).length} Habits checked
        </Text>
      </View>

      <PrimaryButton
        title="I’m Stuck"
        onPress={() => router.push("/(tabs)/first-moves")}
      />

      {localWorkspaceMessage ? (
        <Card tone="danger">
          <Body>{localWorkspaceMessage}</Body>
        </Card>
      ) : null}
      {notice ? (
        <Text accessibilityLiveRegion="polite" style={styles.notice}>
          {notice}
        </Text>
      ) : null}
      {!workspaceEditable && auth.status === "authenticated" ? (
        <Card tone="warning">
          <Body>Today is read-only until this account finishes loading.</Body>
        </Card>
      ) : null}

      <TodaySummary
        directionTotals={view.directionTotals}
        points={localWorkspace.progress.points}
        totalFocusedMs={view.totalFocusedMs}
      />

      <SectionHeader
        count={view.tasks.length}
        onPress={() => router.push("/tasks")}
        title="Tasks"
      />
      <Card>
        {view.tasks.length === 0 ? (
          <EmptyRow message="No active Tasks. Add one small next step." />
        ) : (
          view.tasks.map((task, index) => (
            <TaskRow
              completed={!isTaskActive(task, today)}
              disabled={Boolean(savingId) || !workspaceEditable}
              first={index === 0}
              key={task.id}
              onOpen={() =>
                router.push({ pathname: "/tasks", params: { edit: task.id } })
              }
              onToggle={() =>
                void saveToggle(
                  task.id,
                  (state) => toggleTaskCompletion(state, task.id, today),
                  isTaskActive(task, today)
                    ? "Task completed for today."
                    : "Task marked incomplete for today.",
                )
              }
              task={task}
            />
          ))
        )}
      </Card>

      <SectionHeader
        count={view.habits.length}
        onPress={() => router.push("/habits")}
        title="Habits"
      />
      <Card>
        {view.habits.length === 0 ? (
          <EmptyRow message="No Habits are scheduled for today." />
        ) : (
          view.habits.map((habit, index) => (
            <HabitRow
              checked={!isHabitActive(habit, today)}
              disabled={Boolean(savingId) || !workspaceEditable}
              first={index === 0}
              habit={habit}
              key={habit.id}
              onToggle={() =>
                void saveToggle(
                  habit.id,
                  (state) => toggleHabitCompletion(state, habit.id, today),
                  isHabitActive(habit, today)
                    ? "Habit checked for today."
                    : "Habit check-in removed for today.",
                )
              }
            />
          ))
        )}
      </Card>

      <SectionHeader
        detail={formatFocusedDuration(view.totalFocusedMs)}
        onPress={() => router.push("/(tabs)/focus")}
        title="Focus today"
      />
      <Card>
        {view.focusItems.length === 0 ? (
          <EmptyRow message="No completed or intentionally stopped Focus Sessions yet." />
        ) : (
          view.focusItems.map((item, index) => (
            <FocusRow first={index === 0} item={item} key={item.id} />
          ))
        )}
      </Card>

      <StaticSectionHeader detail={`${view.timeline.length}`} title="Activity timeline" />
      <Card>
        {view.timeline.length === 0 ? (
          <EmptyRow message="Your completed Tasks, Habit check-ins, and closed Focus Sessions will appear here." />
        ) : (
          view.timeline.map((item, index) => (
            <TimelineRow first={index === 0} item={item} key={item.id} />
          ))
        )}
      </Card>

      <StaticSectionHeader title="Reflection" />
      <ReflectionEditor
        disabled={Boolean(savingId) || !workspaceEditable}
        existing={view.reflection}
        key={today}
        onDelete={removeTodayReflection}
        onSave={saveTodayReflection}
      />
    </Screen>
  );

  async function saveToggle(
    id: string,
    recipe: (state: AppState) => AppState,
    successNotice: string,
  ): Promise<void> {
    if (savingId) return;
    setSavingId(id);
    setNotice("");
    let changed = false;
    const next = await updateLocalWorkspace((state) => {
      const updated = recipe(state);
      changed = updated !== state;
      return updated;
    });
    setSavingId(undefined);
    if (next && changed) setNotice(successNotice);
    else if (next) setNotice("That item is no longer available. Nothing was changed.");
  }

  async function saveTodayReflection(input: ReflectionInput): Promise<boolean> {
    if (savingId) return false;
    setSavingId("reflection");
    setNotice("");
    const captured = captureLocalDay();
    const next = await updateLocalWorkspace((state) =>
      saveReflection(state, today, input, {
        rewardAuthority:
          auth.status === "authenticated" ? "server-authoritative" : "guest-local",
        timezone: captured.timezone,
      }),
    );
    setSavingId(undefined);
    if (!next) return false;
    setNotice(
      auth.status === "authenticated"
        ? "Reflection saved to your private workspace."
        : "Reflection saved on this device.",
    );
    return true;
  }

  async function removeTodayReflection(): Promise<boolean> {
    if (savingId) return false;
    setSavingId("reflection");
    setNotice("");
    let changed = false;
    const next = await updateLocalWorkspace((state) => {
      const updated = deleteReflection(state, today);
      changed = updated !== state;
      return updated;
    });
    setSavingId(undefined);
    if (!next || !changed) return false;
    setNotice("Reflection deleted. Any first-save points remain unchanged.");
    return true;
  }
}

function TodaySummary({
  directionTotals,
  points,
  totalFocusedMs,
}: {
  directionTotals: ReturnType<typeof getTodayView>["directionTotals"];
  points: number;
  totalFocusedMs: number;
}) {
  return (
    <Card tone="primary">
      <View style={styles.metricsRow}>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Current points</Text>
          <Text style={styles.metricValue}>{formatPoints(points)}</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Focused today</Text>
          <Text style={styles.metricValue}>{formatFocusedDuration(totalFocusedMs)}</Text>
        </View>
      </View>
      <View style={styles.directionList}>
        {DIRECTIONS.map((direction) => {
          const duration = directionTotals[direction];
          const width = `${
            totalFocusedMs > 0 ? Math.round((duration / totalFocusedMs) * 100) : 0
          }%` as `${number}%`;
          return (
            <View key={direction} style={styles.directionRow}>
              <View style={styles.directionHeading}>
                <Text numberOfLines={1} style={styles.directionLabel}>{direction}</Text>
                <Text style={styles.directionDuration}>{formatFocusedDuration(duration)}</Text>
              </View>
              <View style={styles.directionTrack}>
                <View style={[styles.directionFill, { width }]} />
              </View>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

function StaticSectionHeader({ detail, title }: { detail?: string; title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleRow}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>
        {detail ? <Text style={styles.count}>{detail}</Text> : null}
      </View>
    </View>
  );
}

function SectionHeader({
  count,
  detail,
  onPress,
  title,
}: {
  count?: number;
  detail?: string;
  onPress(): void;
  title: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleRow}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          {title}
        </Text>
        {count !== undefined ? <Text style={styles.count}>{count}</Text> : null}
        {detail ? <Text style={styles.total}>{detail}</Text> : null}
      </View>
      <Pressable
        accessibilityLabel={`Open ${title}`}
        accessibilityRole="button"
        hitSlop={8}
        onPress={onPress}
        style={({ pressed }) => [styles.manageButton, pressed && styles.pressed]}
      >
        <Text style={styles.manageText}>{title === "Focus today" ? "Open Focus" : "Manage"}</Text>
      </Pressable>
    </View>
  );
}

function TaskRow({
  completed,
  disabled,
  first,
  onOpen,
  onToggle,
  task,
}: {
  completed: boolean;
  disabled: boolean;
  first: boolean;
  onOpen(): void;
  onToggle(): void;
  task: Task;
}) {
  return (
    <View style={[styles.itemRow, !first && styles.itemBorder]}>
      <CheckButton
        checked={completed}
        disabled={disabled}
        label={task.title}
        onPress={onToggle}
        verb={completed ? "Mark incomplete" : "Complete"}
      />
      <Pressable
        accessibilityHint="Opens this Task in the editor"
        accessibilityLabel={`Edit ${task.title}`}
        accessibilityRole="button"
        onPress={onOpen}
        style={({ pressed }) => [styles.itemCopy, pressed && styles.pressed]}
      >
        <Text numberOfLines={2} style={[styles.itemTitle, completed && styles.completedText]}>
          {task.title}
        </Text>
        <Text style={styles.itemMeta}>{task.direction}</Text>
      </Pressable>
      <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.chevron}>
        ›
      </Text>
    </View>
  );
}

function HabitRow({
  checked,
  disabled,
  first,
  habit,
  onToggle,
}: {
  checked: boolean;
  disabled: boolean;
  first: boolean;
  habit: Habit;
  onToggle(): void;
}) {
  return (
    <View style={[styles.itemRow, !first && styles.itemBorder]}>
      <CheckButton
        checked={checked}
        disabled={disabled}
        label={habit.title}
        onPress={onToggle}
        verb={checked ? "Uncheck" : "Check"}
      />
      <View style={styles.itemCopy}>
        <Text numberOfLines={2} style={[styles.itemTitle, checked && styles.completedText]}>
          {habit.title}
        </Text>
        <Text style={styles.itemMeta}>{habit.direction}</Text>
      </View>
    </View>
  );
}

function CheckButton({
  checked,
  disabled,
  label,
  onPress,
  verb,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onPress(): void;
  verb: string;
}) {
  return (
    <Pressable
      accessibilityLabel={`${verb} ${label} for today`}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.checkboxTouch,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        <Text style={styles.checkmark}>{checked ? "✓" : ""}</Text>
      </View>
    </Pressable>
  );
}

function FocusRow({ first, item }: { first: boolean; item: TodayFocusItem }) {
  return (
    <View style={[styles.focusRow, !first && styles.itemBorder]}>
      <View style={styles.focusHeading}>
        <Text numberOfLines={2} style={[styles.itemTitle, styles.focusTitle]}>{item.title}</Text>
        <Text style={styles.duration}>{formatFocusedDuration(item.durationMs)}</Text>
      </View>
      <Text style={styles.itemMeta}>
        {item.direction} · {item.status === "completed" ? "Completed" : "Stopped intentionally"}
      </Text>
      {item.linkedKind && item.linkedLabel ? (
        <Text numberOfLines={2} style={styles.linkedLabel}>
          {item.linkedKind} · {item.linkedLabel}
        </Text>
      ) : null}
    </View>
  );
}

function TimelineRow({ first, item }: { first: boolean; item: TodayTimelineItem }) {
  return (
    <View style={[styles.timelineRow, !first && styles.itemBorder]}>
      <View style={styles.timelineTimeColumn}>
        <Text style={styles.timelineTime}>
          {formatTimelineTime(item.occurredAt, item.timezone)}
        </Text>
        <Text style={styles.timelineKind}>{item.kind}</Text>
      </View>
      <View style={styles.timelineCopy}>
        <Text numberOfLines={2} style={styles.itemTitle}>{item.label}</Text>
        <Text style={styles.itemMeta}>
          {item.direction}
          {item.durationMs !== undefined
            ? ` · ${formatFocusedDuration(item.durationMs)} · ${
                item.sessionStatus === "stopped" ? "Stopped intentionally" : "Completed"
              }`
            : ""}
        </Text>
      </View>
      {item.points !== undefined ? (
        <Text style={styles.pointChange}>{formatPointChange(item.points)}</Text>
      ) : null}
    </View>
  );
}

function EmptyRow({ message }: { message: string }) {
  return <Text style={styles.emptyText}>{message}</Text>;
}

function SyncPill({ auth, sync }: { auth: AuthState; sync: AppSyncState }) {
  const display = syncDisplay(auth, sync);
  return (
    <View
      accessibilityLabel={`Sync status: ${display.label}`}
      style={[styles.syncPill, display.tone === "good" ? styles.syncGood : styles.syncCaution]}
    >
      <Text style={[styles.syncText, display.tone === "good" ? styles.syncGoodText : styles.syncCautionText]}>
        {display.label}
      </Text>
    </View>
  );
}

function syncDisplay(
  auth: AuthState,
  sync: AppSyncState,
): { label: string; tone: "good" | "caution" } {
  if (auth.status !== "authenticated" || sync.status === "local") {
    return { label: "Local", tone: "good" };
  }
  if (sync.status === "synced") return { label: "Synced", tone: "good" };
  if (sync.status === "offline") return { label: "Offline", tone: "caution" };
  if (sync.status === "pending" || sync.status === "syncing") {
    return {
      label: sync.pendingCount > 0 ? `Pending · ${sync.pendingCount}` : "Pending",
      tone: "caution",
    };
  }
  if (sync.status === "error") return { label: "Sync issue", tone: "caution" };
  if (sync.status === "write-disabled") return { label: "Local", tone: "caution" };
  return { label: "Loading", tone: "caution" };
}

function formatCurrentDate(dateKey: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(`${dateKey}T12:00:00`));
}

function formatPoints(points: number): string {
  return Number.isInteger(points) ? String(points) : points.toFixed(1);
}

function formatPointChange(points: number): string {
  return `${points > 0 ? "+" : ""}${formatPoints(points)} pts`;
}

const styles = StyleSheet.create({
  topRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    justifyContent: "space-between",
  },
  summaryText: { color: colors.textMuted, fontSize: typography.small },
  syncPill: {
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  syncGood: { backgroundColor: colors.successSoft, borderColor: "#86EFAC" },
  syncCaution: { backgroundColor: colors.warningSoft, borderColor: "#FCD34D" },
  syncText: { fontSize: typography.small, fontWeight: "800" },
  syncGoodText: { color: colors.success },
  syncCautionText: { color: colors.warning },
  notice: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
    color: colors.text,
    fontSize: typography.small,
    padding: spacing.sm,
  },
  metricsRow: { flexDirection: "row", gap: spacing.md },
  metric: { flex: 1 },
  metricLabel: { color: colors.primary, fontSize: typography.small, fontWeight: "800" },
  metricValue: { color: colors.text, fontSize: 26, fontWeight: "900", marginTop: 2 },
  directionList: { gap: spacing.sm, marginTop: spacing.xs },
  directionRow: { gap: spacing.xs },
  directionHeading: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  directionLabel: { color: colors.text, flex: 1, fontSize: typography.small },
  directionDuration: { color: colors.textMuted, fontSize: typography.small, fontWeight: "800" },
  directionTrack: {
    backgroundColor: "#D9D0F7",
    borderRadius: radii.pill,
    height: 6,
    overflow: "hidden",
  },
  directionFill: { backgroundColor: colors.primary, borderRadius: radii.pill, height: 6 },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  sectionTitleRow: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  sectionTitle: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: "800",
  },
  count: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    color: colors.textMuted,
    fontSize: typography.small,
    fontWeight: "800",
    minWidth: 28,
    overflow: "hidden",
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    textAlign: "center",
  },
  total: { color: colors.primary, fontSize: typography.body, fontWeight: "800" },
  manageButton: { justifyContent: "center", minHeight: touchTarget, paddingLeft: spacing.md },
  manageText: { color: colors.primary, fontSize: typography.small, fontWeight: "800" },
  itemRow: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: touchTarget,
    paddingVertical: spacing.xs,
  },
  itemBorder: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
  checkboxTouch: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: touchTarget,
    minWidth: touchTarget,
  },
  checkbox: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.sm,
    borderWidth: 2,
    height: 26,
    justifyContent: "center",
    width: 26,
  },
  checkboxChecked: { backgroundColor: colors.success, borderColor: colors.success },
  checkmark: { color: "#FFFFFF", fontSize: typography.body, fontWeight: "900" },
  itemCopy: { flex: 1, justifyContent: "center", minHeight: touchTarget, paddingVertical: spacing.xs },
  itemTitle: { color: colors.text, fontSize: typography.body, fontWeight: "800", lineHeight: 22 },
  completedText: { color: colors.textMuted, textDecorationLine: "line-through" },
  itemMeta: { color: colors.textMuted, fontSize: typography.small, lineHeight: 20, marginTop: 2 },
  chevron: { color: colors.textMuted, fontSize: 28, paddingLeft: spacing.sm },
  focusRow: { paddingVertical: spacing.sm },
  focusHeading: { alignItems: "flex-start", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" },
  focusTitle: { flex: 1 },
  duration: { color: colors.text, fontSize: typography.body, fontWeight: "800" },
  linkedLabel: { color: colors.primary, fontSize: typography.small, lineHeight: 20, marginTop: spacing.xs },
  timelineRow: { alignItems: "flex-start", flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.sm },
  timelineTimeColumn: { width: 64 },
  timelineTime: { color: colors.text, fontSize: typography.small, fontWeight: "800" },
  timelineKind: { color: colors.textMuted, fontSize: typography.label, marginTop: 2 },
  timelineCopy: { flex: 1 },
  pointChange: { color: colors.success, fontSize: typography.small, fontWeight: "800" },
  emptyText: { color: colors.textMuted, fontSize: typography.body, lineHeight: 23, paddingVertical: spacing.sm },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.5 },
});
