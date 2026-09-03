import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { useFirstMoveApp } from "../app-state/app-provider.tsx";
import {
  DirectionPicker,
  FormLabel,
  SelectionButton,
  TitleInput,
} from "../components/domain-controls.tsx";
import { useCurrentLocalDate } from "../components/use-current-local-date.ts";
import {
  Body,
  Card,
  Heading,
  Label,
  LoadingState,
  PrimaryButton,
  Screen,
  SecondaryButton,
} from "../components/ui.tsx";
import {
  DIRECTIONS,
  WEEKDAYS,
  type AppState,
  type Direction,
  type Habit,
  type HabitSchedule,
  type Weekday,
} from "../domain/models.ts";
import {
  addHabit,
  editHabit,
  isHabitActive,
  isHabitScheduled,
  softDeleteHabit,
  toggleHabitCompletion,
} from "../domain/tasks-habits.ts";
import { colors, radii, spacing, touchTarget, typography } from "../theme/tokens.ts";

const DEFAULT_WEEKDAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri"];
const WEEKDAY_LABELS: Record<Weekday, string> = {
  sun: "Sun",
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
};

export default function HabitsScreen() {
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
  const [editingId, setEditingId] = useState<string>();
  const [title, setTitle] = useState("");
  const [direction, setDirection] = useState<Direction>(DIRECTIONS[0]);
  const [scheduleKind, setScheduleKind] = useState<"daily" | "weekdays">("daily");
  const [weekdays, setWeekdays] = useState<Weekday[]>(DEFAULT_WEEKDAYS);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const schedule: HabitSchedule | undefined =
    scheduleKind === "daily"
      ? { kind: "daily" }
      : weekdays.length > 0
        ? { kind: "weekdays", weekdays }
        : undefined;

  if (localWorkspaceStatus === "loading") {
    return (
      <Screen title="Habits">
        <LoadingState label="Loading Habits from this device…" />
      </Screen>
    );
  }

  return (
    <Screen
      eyebrow="Today"
      title="Habits"
      description="Use a daily rhythm or choose specific weekdays. Check-ins use your current local date."
    >
      <SecondaryButton title="Back to Today" onPress={() => router.back()} />
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
      {!workspaceEditable && auth.status === "authenticated" ? (
        <Card tone="warning">
          <Label>Editing unavailable</Label>
          <Body>
            Finish loading a verified initialized cloud workspace in Settings before changing Habits.
          </Body>
        </Card>
      ) : null}

      <Card>
        <Label>{editingId ? "Edit Habit" : "New Habit"}</Label>
        <FormLabel>Habit title</FormLabel>
        <TitleInput
          accessibilityLabel="Habit title"
          onChangeText={setTitle}
          placeholder="Take a short walk"
          value={title}
        />
        <DirectionPicker onSelect={setDirection} selected={direction} />
        <FormLabel>Schedule</FormLabel>
        <View accessibilityRole="radiogroup" style={styles.choiceList}>
          <SelectionButton
            detail="Every local calendar day"
            label="Daily"
            onPress={() => setScheduleKind("daily")}
            selected={scheduleKind === "daily"}
          />
          <SelectionButton
            detail="Only the weekdays you choose"
            label="Selected weekdays"
            onPress={() => setScheduleKind("weekdays")}
            selected={scheduleKind === "weekdays"}
          />
        </View>
        {scheduleKind === "weekdays" ? (
          <>
            <FormLabel>Weekdays</FormLabel>
            <View style={styles.weekdayRow}>
              {WEEKDAYS.map((weekday) => {
                const selected = weekdays.includes(weekday);
                return (
                  <Pressable
                    accessibilityLabel={`${selected ? "Remove" : "Add"} ${WEEKDAY_LABELS[weekday]}`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    key={weekday}
                    onPress={() => toggleWeekday(weekday)}
                    style={({ pressed }) => [
                      styles.weekday,
                      selected && styles.weekdaySelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.weekdayText,
                        selected && styles.weekdayTextSelected,
                      ]}
                    >
                      {WEEKDAY_LABELS[weekday]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {!weekdays.length ? (
              <Text accessibilityLiveRegion="polite" style={styles.validationText}>
                Choose at least one weekday.
              </Text>
            ) : null}
          </>
        ) : null}
        <PrimaryButton
          disabled={saving || !workspaceEditable || !title.trim() || !schedule}
          title={editingId ? "Save Habit changes" : "Create Habit"}
          onPress={() => void submitHabit()}
        />
        {editingId ? (
          <SecondaryButton
            disabled={saving}
            title="Cancel editing"
            onPress={resetEditor}
          />
        ) : null}
      </Card>

      <View style={styles.sectionHeader}>
        <Label>Active Habits</Label>
        <Text style={styles.count}>{localWorkspace.habits.length}</Text>
      </View>
      {localWorkspace.habits.length === 0 ? (
        <Card>
          <Heading>No Habits yet</Heading>
          <Body muted>Keep the first one light and forgiving.</Body>
        </Card>
      ) : (
        localWorkspace.habits.map((habit) => (
          <EditableHabitCard
            key={habit.id}
            disabled={saving || !workspaceEditable}
            habit={habit}
            onDelete={() => confirmDelete(habit)}
            onEdit={() => beginEdit(habit)}
            onToggle={() =>
              void saveChange(
                (state) => toggleHabitCompletion(state, habit.id, today),
                !isHabitActive(habit, today)
                  ? "Habit check-in removed for today."
                  : "Habit checked for today.",
              )
            }
            today={today}
          />
        ))
      )}

      <Card tone={auth.status === "authenticated" ? "warning" : "default"}>
        <Label>Storage boundary</Label>
        <Body muted>
          {auth.status === "authenticated"
            ? sync.status === "write-disabled"
              ? "This uninitialized account remains write-disabled. Its local cache is never merged with Guest or another account."
              : "This initialized Supabase UUID uses one immediate local working copy and an owner-scoped retry queue; validated server responses remain canonical."
            : "Guest Habits stay only in the separate Guest workspace on this device."}
        </Body>
      </Card>
    </Screen>
  );

  async function submitHabit(): Promise<void> {
    if (!schedule) return;
    const editing = editingId;
    const changed = await saveChange(
      (state) =>
        editing
          ? editHabit(state, editing, { title, direction, schedule })
          : addHabit(state, { title, direction, schedule }),
      editing ? "Habit changes saved." : "Habit created.",
    );
    if (changed) resetEditor();
  }

  function beginEdit(habit: Habit): void {
    setEditingId(habit.id);
    setTitle(habit.title);
    setDirection(habit.direction);
    setScheduleKind(habit.schedule.kind);
    setWeekdays(
      habit.schedule.kind === "weekdays"
        ? [...habit.schedule.weekdays]
        : DEFAULT_WEEKDAYS,
    );
    setNotice("");
  }

  function resetEditor(): void {
    setEditingId(undefined);
    setTitle("");
    setDirection(DIRECTIONS[0]);
    setScheduleKind("daily");
    setWeekdays(DEFAULT_WEEKDAYS);
  }

  function toggleWeekday(weekday: Weekday): void {
    setWeekdays((current) =>
      current.includes(weekday)
        ? current.filter((candidate) => candidate !== weekday)
        : WEEKDAYS.filter(
            (candidate) => candidate === weekday || current.includes(candidate),
          ),
    );
  }

  function confirmDelete(habit: Habit): void {
    Alert.alert(
      "Delete this Habit?",
      "It will leave the active list. Existing Focus history keeps its stable relationship ID.",
      [
        { text: "Keep Habit", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void saveChange(
              (state) => softDeleteHabit(state, habit.id),
              "Habit removed from the active list.",
            ).then((changed) => {
              if (changed && editingId === habit.id) resetEditor();
            });
          },
        },
      ],
    );
  }

  async function saveChange(
    recipe: (state: AppState) => AppState,
    successNotice: string,
  ): Promise<boolean> {
    if (saving) return false;
    setSaving(true);
    setNotice("");
    let changed = false;
    const next = await updateLocalWorkspace((state) => {
      const updated = recipe(state);
      changed = updated !== state;
      return updated;
    });
    setSaving(false);
    if (next && changed) setNotice(successNotice);
    else if (next) setNotice("That Habit change is no longer available. Nothing was changed.");
    return Boolean(next && changed);
  }
}

function EditableHabitCard({
  disabled,
  habit,
  onDelete,
  onEdit,
  onToggle,
  today,
}: {
  disabled: boolean;
  habit: Habit;
  onDelete(): void;
  onEdit(): void;
  onToggle(): void;
  today: string;
}) {
  const scheduled = isHabitScheduled(habit, today);
  const completed = !isHabitActive(habit, today);
  return (
    <Card tone={completed ? "success" : "default"}>
      <View style={styles.itemHeading}>
        <View style={styles.itemText}>
          <Heading>{habit.title}</Heading>
          <Body muted>
            {habit.direction} · {scheduleLabel(habit.schedule)}
            {!scheduled ? " · Not scheduled today" : ""}
          </Body>
        </View>
        <HabitCheckButton
          completed={completed}
          disabled={disabled || !scheduled}
          label={habit.title}
          onPress={onToggle}
          scheduled={scheduled}
        />
      </View>
      <View style={styles.actionRow}>
        <SecondaryButton
          accessibilityLabel={`Edit ${habit.title}`}
          disabled={disabled}
          title="Edit"
          onPress={onEdit}
        />
        <SecondaryButton
          accessibilityLabel={`Delete ${habit.title}`}
          disabled={disabled}
          title="Delete"
          onPress={onDelete}
        />
      </View>
    </Card>
  );
}

function HabitCheckButton({
  completed,
  disabled,
  label,
  onPress,
  scheduled,
}: {
  completed: boolean;
  disabled: boolean;
  label: string;
  onPress(): void;
  scheduled: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={
        scheduled
          ? `${completed ? "Uncheck" : "Check"} ${label} for today`
          : `${label} is not scheduled today`
      }
      accessibilityRole="checkbox"
      accessibilityState={{ checked: completed, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.completion,
        completed && styles.completionSelected,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.completionText, completed && styles.completionTextSelected]}>
        {!scheduled ? "Not today" : completed ? "Checked today" : "Check today"}
      </Text>
    </Pressable>
  );
}

function scheduleLabel(schedule: HabitSchedule): string {
  return schedule.kind === "daily"
    ? "Daily"
    : schedule.weekdays.map((weekday) => WEEKDAY_LABELS[weekday]).join(", ");
}

const styles = StyleSheet.create({
  choiceList: { gap: spacing.sm },
  weekdayRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  weekday: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.sm,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: touchTarget,
    minWidth: touchTarget,
    paddingHorizontal: spacing.sm,
  },
  weekdaySelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  weekdayText: { color: colors.text, fontSize: typography.small, fontWeight: "800" },
  weekdayTextSelected: { color: "#FFFFFF" },
  validationText: { color: colors.danger, fontSize: typography.small, fontWeight: "700" },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  count: { color: colors.textMuted, fontSize: typography.small, fontWeight: "800" },
  itemHeading: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
  },
  itemText: { flex: 1, gap: spacing.xs },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  completion: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: touchTarget,
    paddingHorizontal: spacing.md,
  },
  completionSelected: { backgroundColor: colors.success, borderColor: colors.success },
  completionText: { color: colors.text, fontSize: typography.small, fontWeight: "800" },
  completionTextSelected: { color: "#FFFFFF" },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.55 },
});
