import { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { useFirstMoveApp } from "../app-state/app-provider.tsx";
import {
  DirectionPicker,
  FormLabel,
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
import { DIRECTIONS, type AppState, type Direction, type Task } from "../domain/models.ts";
import {
  addTask,
  editTask,
  softDeleteTask,
  toggleTaskCompletion,
} from "../domain/tasks-habits.ts";
import { colors, radii, spacing, touchTarget, typography } from "../theme/tokens.ts";

export default function TasksScreen() {
  const router = useRouter();
  const {
    auth,
    cloud,
    localWorkspace,
    localWorkspaceMessage,
    localWorkspaceStatus,
    updateLocalWorkspace,
  } = useFirstMoveApp();
  const today = useCurrentLocalDate();
  const [editingId, setEditingId] = useState<string>();
  const [title, setTitle] = useState("");
  const [direction, setDirection] = useState<Direction>(DIRECTIONS[0]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const canonicalTasks = useMemo(() => {
    if (
      auth.status !== "authenticated" ||
      cloud.status !== "ready" ||
      cloud.userId !== auth.user.id
    ) {
      return [];
    }
    const localIds = new Set(localWorkspace.tasks.map((task) => task.id));
    return cloud.workspace.state.tasks.filter((task) => !localIds.has(task.id));
  }, [auth, cloud, localWorkspace.tasks]);

  if (localWorkspaceStatus === "loading") {
    return (
      <Screen title="Tasks">
        <LoadingState label="Loading Tasks from this device…" />
      </Screen>
    );
  }

  return (
    <Screen
      eyebrow="Today"
      title="Tasks"
      description="Keep one-off actions small and concrete. Completion is recorded for your current local date."
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

      <Card>
        <Label>{editingId ? "Edit on-device Task" : "New on-device Task"}</Label>
        <FormLabel>Task title</FormLabel>
        <TitleInput
          accessibilityLabel="Task title"
          onChangeText={setTitle}
          placeholder="Open the document"
          value={title}
        />
        <DirectionPicker onSelect={setDirection} selected={direction} />
        <PrimaryButton
          disabled={saving || !title.trim()}
          title={editingId ? "Save Task changes" : "Create Task"}
          onPress={() => void submitTask()}
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
        <Label>Editable on this device</Label>
        <Text style={styles.count}>{localWorkspace.tasks.length}</Text>
      </View>
      {localWorkspace.tasks.length === 0 ? (
        <Card>
          <Heading>No on-device Tasks yet</Heading>
          <Body muted>Add one small action above.</Body>
        </Card>
      ) : (
        localWorkspace.tasks.map((task) => (
          <EditableTaskCard
            key={task.id}
            disabled={saving}
            onDelete={() => confirmDelete(task)}
            onEdit={() => beginEdit(task)}
            onToggle={() =>
              void saveChange(
                (state) => toggleTaskCompletion(state, task.id, today),
                task.completedOn.includes(today)
                  ? "Task marked incomplete for today."
                  : "Task completed for today.",
              )
            }
            task={task}
            today={today}
          />
        ))
      )}

      {canonicalTasks.length > 0 ? (
        <>
          <View style={styles.sectionHeader}>
            <Label>Canonical cloud · read-only</Label>
            <Text style={styles.count}>{canonicalTasks.length}</Text>
          </View>
          {canonicalTasks.map((task) => (
            <ReadOnlyTaskCard key={task.id} task={task} today={today} />
          ))}
        </>
      ) : null}

      <Card tone={auth.status === "authenticated" ? "warning" : "default"}>
        <Label>Storage boundary</Label>
        <Body muted>
          {auth.status === "authenticated"
            ? "New and edited Tasks stay in this Supabase UUID’s account-local workspace. Canonical cloud Tasks remain separate and read-only until M1E adds authenticated business writes."
            : "Guest Tasks stay only in the separate Guest workspace on this device."}
        </Body>
      </Card>
    </Screen>
  );

  async function submitTask(): Promise<void> {
    const editing = editingId;
    const changed = await saveChange(
      (state) =>
        editing
          ? editTask(state, editing, { title, direction })
          : addTask(state, { title, direction }),
      editing ? "Task changes saved on this device." : "Task created on this device.",
    );
    if (changed) resetEditor();
  }

  function beginEdit(task: Task): void {
    setEditingId(task.id);
    setTitle(task.title);
    setDirection(task.direction);
    setNotice("");
  }

  function resetEditor(): void {
    setEditingId(undefined);
    setTitle("");
    setDirection(DIRECTIONS[0]);
  }

  function confirmDelete(task: Task): void {
    Alert.alert(
      "Delete this Task?",
      "It will leave the active on-device list. Existing Focus history keeps its stable relationship ID.",
      [
        { text: "Keep Task", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void saveChange(
              (state) => softDeleteTask(state, task.id),
              "Task removed from the active list.",
            ).then((changed) => {
              if (changed && editingId === task.id) resetEditor();
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
    else if (next) setNotice("That Task change is no longer available. Nothing was changed.");
    return Boolean(next && changed);
  }
}

function EditableTaskCard({
  disabled,
  onDelete,
  onEdit,
  onToggle,
  task,
  today,
}: {
  disabled: boolean;
  onDelete(): void;
  onEdit(): void;
  onToggle(): void;
  task: Task;
  today: string;
}) {
  const completed = task.completedOn.includes(today);
  return (
    <Card tone={completed ? "success" : "default"}>
      <View style={styles.itemHeading}>
        <View style={styles.itemText}>
          <Heading>{task.title}</Heading>
          <Body muted>{task.direction}</Body>
        </View>
        <CompletionButton
          completed={completed}
          disabled={disabled}
          label={task.title}
          onPress={onToggle}
        />
      </View>
      <View style={styles.actionRow}>
        <SecondaryButton
          accessibilityLabel={`Edit ${task.title}`}
          disabled={disabled}
          title="Edit"
          onPress={onEdit}
        />
        <SecondaryButton
          accessibilityLabel={`Delete ${task.title}`}
          disabled={disabled}
          title="Delete"
          onPress={onDelete}
        />
      </View>
    </Card>
  );
}

function ReadOnlyTaskCard({ task, today }: { task: Task; today: string }) {
  return (
    <Card>
      <Label>Synced read-only item</Label>
      <Heading>{task.title}</Heading>
      <Body muted>
        {task.direction} · {task.completedOn.includes(today) ? "Completed today" : "Not completed today"}
      </Body>
    </Card>
  );
}

function CompletionButton({
  completed,
  disabled,
  label,
  onPress,
}: {
  completed: boolean;
  disabled: boolean;
  label: string;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityLabel={`${completed ? "Mark incomplete" : "Complete"} ${label}`}
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
        {completed ? "Completed today" : "Complete today"}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  count: {
    color: colors.textMuted,
    fontSize: typography.small,
    fontWeight: "800",
  },
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
