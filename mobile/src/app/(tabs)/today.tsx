import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import type { AuthState } from "../../auth/auth-state.ts";
import { useFirstMoveApp, type AppSyncState } from "../../app-state/app-provider.tsx";
import { ReflectionEditor } from "../../components/reflection-editor.tsx";
import { MorningPlanFlow } from "../../components/morning-plan-flow.tsx";
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
      description="What matters today, and your next small move."
    >
      <View style={styles.statusRow}>
        <SyncStatus auth={auth} sync={sync} />
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
        checkedHabits={view.habits.filter((habit) => !isHabitActive(habit, today)).length}
        completedTasks={view.tasks.filter((task) => task.completedOn.includes(today)).length}
        directionTotals={view.directionTotals}
        habitCount={view.habits.length}
        points={localWorkspace.progress.points}
        taskCount={view.tasks.length}
        totalFocusedMs={view.totalFocusedMs}
      />

      <View style={styles.section}>
        <SectionHeader
          count={view.tasks.length}
          onPress={() => router.push("/tasks")}
          title="Tasks"
        />
        <View style={styles.sectionList}>
          {view.tasks.length === 0 ? (
            <EmptyRow message="No active Tasks. Add one small next step." />
          ) : (
            view.tasks.map((task, index) => (
              <TaskRow
                completed={!isTaskActive(task)}
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
                    isTaskActive(task)
                      ? "Task completed."
                      : "Task marked incomplete.",
                  )
                }
                task={task}
              />
            ))
          )}
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader
          count={view.habits.length}
          onPress={() => router.push("/habits")}
          title="Habits"
        />
        <View style={styles.sectionList}>
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
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader
          detail={formatFocusedDuration(view.totalFocusedMs)}
          onPress={() => router.push("/(tabs)/focus")}
          title="Focus today"
        />
        <View style={styles.sectionList}>
          {view.focusItems.length === 0 ? (
            <EmptyRow message="No completed or intentionally stopped Focus Sessions yet." />
          ) : (
            view.focusItems.map((item, index) => (
              <FocusRow first={index === 0} item={item} key={item.id} />
            ))
          )}
        </View>
      </View>

      <MorningPlanFlow dateKey={today} />

      <View style={styles.section}>
        <StaticSectionHeader detail={`${view.timeline.length}`} title="Activity timeline" />
        <View style={[styles.sectionList, styles.timelineList]}>
          {view.timeline.length === 0 ? (
            <EmptyRow message="Your completed Tasks, Habit check-ins, and closed Focus Sessions will appear here." />
          ) : (
            view.timeline.map((item, index) => (
              <TimelineRow first={index === 0} item={item} key={item.id} />
            ))
          )}
        </View>
      </View>

      <View style={styles.section}>
        <StaticSectionHeader title="Reflection" />
        <ReflectionEditor
          disabled={Boolean(savingId) || !workspaceEditable}
          existing={view.reflection}
          key={today}
          onDelete={removeTodayReflection}
          onSave={saveTodayReflection}
        />
      </View>
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
  checkedHabits,
  completedTasks,
  directionTotals,
  habitCount,
  points,
  taskCount,
  totalFocusedMs,
}: {
  checkedHabits: number;
  completedTasks: number;
  directionTotals: ReturnType<typeof getTodayView>["directionTotals"];
  habitCount: number;
  points: number;
  taskCount: number;
  totalFocusedMs: number;
}) {
  const activeDirections = DIRECTIONS.map((direction) => ({
    direction,
    duration: directionTotals[direction],
  })).filter((item) => item.duration > 0);

  return (
    <View accessibilityLabel="Today overview" style={styles.overview}>
      <View style={styles.overviewMetrics}>
        <OverviewMetric label="Tasks" value={`${completedTasks}/${taskCount}`} />
        <OverviewMetric label="Habits" value={`${checkedHabits}/${habitCount}`} />
        <OverviewMetric label="Focused today" value={formatFocusedDuration(totalFocusedMs)} />
      </View>
      <Text style={styles.overviewContext}>
        Current points {formatPoints(points)}
        {activeDirections.length > 0
          ? ` · ${activeDirections
              .map((item) => `${item.direction} ${formatFocusedDuration(item.duration)}`)
              .join(" · ")}`
          : " · No Focus activity yet"}
      </Text>
    </View>
  );
}

function OverviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.overviewMetric}>
      <Text style={styles.overviewValue}>{value}</Text>
      <Text style={styles.overviewLabel}>{label}</Text>
    </View>
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
        dateScoped={false}
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
        <Text style={[styles.itemTitle, completed && styles.completedText]}>
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
        <Text style={[styles.itemTitle, checked && styles.completedText]}>
          {habit.title}
        </Text>
        <Text style={styles.itemMeta}>{habit.direction}</Text>
      </View>
    </View>
  );
}

function CheckButton({
  checked,
  dateScoped = true,
  disabled,
  label,
  onPress,
  verb,
}: {
  checked: boolean;
  dateScoped?: boolean;
  disabled: boolean;
  label: string;
  onPress(): void;
  verb: string;
}) {
  return (
    <Pressable
      accessibilityLabel={`${verb} ${label}${dateScoped ? " for today" : ""}`}
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
        <Text style={[styles.itemTitle, styles.focusTitle]}>{item.title}</Text>
        <Text style={styles.duration}>{formatFocusedDuration(item.durationMs)}</Text>
      </View>
      <Text style={styles.itemMeta}>
        {item.direction} · {item.status === "completed" ? "Completed" : "Stopped intentionally"}
      </Text>
      {item.linkedKind && item.linkedLabel ? (
        <Text style={styles.linkedLabel}>
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
        <Text style={styles.itemTitle}>{item.label}</Text>
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

function SyncStatus({ auth, sync }: { auth: AuthState; sync: AppSyncState }) {
  const display = syncDisplay(auth, sync);
  return (
    <View
      accessibilityLabel={`Sync status: ${display.label}`}
      style={styles.syncStatus}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={[styles.syncDot, display.tone === "good" ? styles.syncGood : styles.syncCaution]}
      />
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
  section: { gap: spacing.xs },
  sectionList: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  timelineList: { borderBottomColor: "#DED8CF", borderTopColor: "#DED8CF" },
  statusRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  syncStatus: { alignItems: "center", flexDirection: "row", gap: 6, minHeight: 24 },
  syncDot: { borderRadius: radii.pill, height: 7, width: 7 },
  syncGood: { backgroundColor: colors.success },
  syncCaution: { backgroundColor: colors.warning },
  syncText: { fontSize: typography.small, fontWeight: "700" },
  syncGoodText: { color: colors.success },
  syncCautionText: { color: colors.warning },
  notice: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
    color: colors.text,
    fontSize: typography.small,
    padding: spacing.sm,
  },
  overview: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    gap: spacing.sm,
    paddingHorizontal: 12,
    paddingVertical: spacing.sm,
  },
  overviewMetrics: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  overviewMetric: { flexBasis: 80, flexGrow: 1, minWidth: 76 },
  overviewValue: { color: colors.text, fontSize: 20, fontWeight: "900", lineHeight: 24 },
  overviewLabel: { color: colors.textMuted, fontSize: typography.small, lineHeight: 18 },
  overviewContext: { color: colors.textMuted, fontSize: typography.small, lineHeight: 20 },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    justifyContent: "space-between",
  },
  sectionTitleRow: { alignItems: "center", flexDirection: "row", flexShrink: 1, gap: spacing.sm },
  sectionTitle: {
    color: "#4A2F21",
    fontSize: 20,
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
  itemCopy: { flex: 1, justifyContent: "center", minHeight: touchTarget, paddingVertical: 2 },
  itemTitle: { color: "#4A2F21", fontSize: typography.body, fontWeight: "800", lineHeight: 21 },
  completedText: { color: colors.textMuted, textDecorationLine: "line-through" },
  itemMeta: { color: colors.textMuted, fontSize: typography.small, lineHeight: 18, marginTop: 1 },
  chevron: { color: colors.textMuted, fontSize: 28, paddingLeft: spacing.sm },
  focusRow: { paddingVertical: 6 },
  focusHeading: { alignItems: "flex-start", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" },
  focusTitle: { flex: 1 },
  duration: { color: "#4A2F21", fontSize: typography.body, fontWeight: "800" },
  linkedLabel: { color: colors.primary, fontSize: typography.small, lineHeight: 18, marginTop: 2 },
  timelineRow: { alignItems: "flex-start", flexDirection: "row", gap: spacing.sm, paddingVertical: 6 },
  timelineTimeColumn: { flexShrink: 0, minWidth: 64 },
  timelineTime: { color: "#4A2F21", fontSize: typography.small, fontWeight: "800" },
  timelineKind: { color: colors.textMuted, fontSize: typography.label, marginTop: 1 },
  timelineCopy: { flex: 1 },
  pointChange: { color: colors.success, fontSize: typography.small, fontWeight: "800" },
  emptyText: { color: colors.textMuted, fontSize: typography.body, lineHeight: 22, paddingVertical: spacing.sm },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.5 },
});
