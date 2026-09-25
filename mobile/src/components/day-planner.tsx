import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { featureRemaining } from "../ai/access.ts";
import { useFirstMoveApp } from "../app-state/app-provider.tsx";
import {
  blankPlanningReviewItem,
  canMoveReviewItemToGroup,
  nextAvailableReviewGroup,
  planToReviewItems,
  validPlanningReview,
} from "../domain/day-planning.ts";
import {
  DIRECTIONS,
  INTENDED_DURATIONS,
  type Direction,
  type IntendedDuration,
  type PlanningReviewItem,
} from "../domain/models.ts";
import { getPendingIntent } from "../domain/app-state.ts";
import { colors, radii, spacing, touchTarget, typography } from "../theme/tokens.ts";
import {
  Body,
  Card,
  Heading,
  Label,
  PrimaryButton,
  SecondaryButton,
} from "./ui.tsx";

export function DayPlanner({ dateKey }: { dateKey: string }) {
  const router = useRouter();
  const {
    aiAccess,
    auth,
    confirmDailyPlan,
    dailyPlans,
    organizeDay,
    workspaceEditable,
  } = useFirstMoveApp();
  const existing = useMemo(
    () => dailyPlans.find((plan) => plan.dateKey === dateKey),
    [dailyPlans, dateKey],
  );
  const [brainDump, setBrainDump] = useState("");
  const [items, setItems] = useState<PlanningReviewItem[]>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [reviewingExisting, setReviewingExisting] = useState(false);
  const remaining = featureRemaining(aiAccess, "daily_plan");
  const signedIn = auth.status === "authenticated";
  const exhausted = remaining === 0;

  if (existing && !reviewingExisting && !items) {
    const firstMove = existing.items.find((item) => item.group === "first-move");
    return (
      <Card tone="primary">
        <Label>Plan my day</Label>
        <Heading>Today’s plan is ready</Heading>
        <Body muted>
          {existing.items.filter((item) => item.group === "priority").length} priority ·{" "}
          {existing.items.filter((item) => item.group === "optional").length} optional
        </Body>
        {firstMove ? <Body>First Move: {firstMove.firstStep}</Body> : null}
        <SecondaryButton
          disabled={!workspaceEditable}
          onPress={() => {
            setItems(existing.items.map((item) => ({ ...item })));
            setReviewingExisting(true);
            setNotice("Review your plan. Nothing changes until you confirm.");
          }}
          title="Review or edit plan"
        />
        {firstMove ? (
          <PrimaryButton
            onPress={() => router.push("/(tabs)/focus")}
            title="Open Focus"
          />
        ) : null}
      </Card>
    );
  }

  return (
    <Card tone="primary">
      <Label>Optional planning · Manual path included</Label>
      <Heading>Plan my day</Heading>
      {!items ? (
        <>
          <Body muted>
            Add only what you choose to share. Journal, habits, history, photos, and cat data are excluded.
          </Body>
          <TextInput
            accessibilityLabel="Brain dump"
            maxLength={2_000}
            multiline
            onChangeText={setBrainDump}
            placeholder="What is on your mind today?"
            placeholderTextColor={colors.textMuted}
            style={styles.brainDump}
            textAlignVertical="top"
            value={brainDump}
          />
          <Text style={styles.counter}>{brainDump.length}/2,000</Text>
          {!signedIn ? (
            <Body muted>Sign in is required for live AI. Manual planning still works here.</Body>
          ) : exhausted ? (
            <Body muted>
              {aiAccess.status === "ready" && aiAccess.access.accessBasis === "pro"
                ? "Today’s Pro Plan my day action is used."
                : "Your introductory AI actions are used."}{" "}
              Manual planning remains available.
            </Body>
          ) : aiAccess.status === "ready" ? (
            <Body muted>
              {aiAccess.access.accessBasis === "introductory"
                ? `${remaining} of 5 shared AI actions remaining`
                : `${remaining} of 1 Plan my day action remaining today`}
            </Body>
          ) : null}
          <PrimaryButton
            disabled={loading || !brainDump.trim() || !signedIn || exhausted}
            onPress={() => void organize()}
            title={loading ? "Organizing…" : "Organize with AI"}
          />
          <SecondaryButton
            disabled={loading}
            onPress={() => {
              setItems([blankPlanningReviewItem()]);
              setNotice("Manual review started. No AI request was made.");
            }}
            title="Plan manually"
          />
          <SecondaryButton
            onPress={() => router.push("/tasks")}
            title="Create Tasks directly"
          />
        </>
      ) : (
        <>
          <Body muted>
            Edit every field. At most one First Move, three priority Tasks, and three optional Tasks can be saved.
          </Body>
          {items.map((item, index) => (
            <ReviewItem
              first={index === 0}
              item={item}
              key={item.id}
              last={index === items.length - 1}
              onDelete={() => setItems((current) => current?.filter((candidate) => candidate.id !== item.id))}
              onMove={(offset) => moveItem(index, offset)}
              onPatch={(patch) => updateItem(item.id, patch)}
              onSetGroup={(group) => setGroup(item.id, group)}
            />
          ))}
          <SecondaryButton
            onPress={addItem}
            title="Add item"
          />
          <PrimaryButton
            disabled={saving || !workspaceEditable}
            onPress={() => void confirm()}
            title={saving ? "Saving plan…" : "Confirm plan"}
          />
          <SecondaryButton
            disabled={saving}
            onPress={() => {
              setItems(undefined);
              setReviewingExisting(false);
              setNotice("Review cancelled. Nothing was changed.");
            }}
            title="Cancel review"
          />
        </>
      )}
      {notice ? (
        <Text accessibilityLiveRegion="polite" style={styles.notice}>
          {notice}
        </Text>
      ) : null}
    </Card>
  );

  async function organize() {
    if (loading || !brainDump.trim() || !signedIn || exhausted) return;
    setLoading(true);
    setNotice("");
    const result = await organizeDay(brainDump);
    setLoading(false);
    if (result.outcome === "failure") {
      setNotice(result.message);
      return;
    }
    setItems(planToReviewItems(result.plan));
    setNotice("AI suggestions are ready to review. Nothing is saved yet.");
  }

  function updateItem(id: string, patch: Partial<PlanningReviewItem>) {
    setItems((current) =>
      current?.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  function setGroup(id: string, group: PlanningReviewItem["group"]) {
    if (!items || !canMoveReviewItemToGroup(items, id, group)) {
      setNotice(
        group === "first-move"
          ? "Only one First Move is allowed."
          : `Only three ${group} Tasks are allowed.`,
      );
      return;
    }
    updateItem(id, { group });
  }

  function moveItem(index: number, offset: -1 | 1) {
    setItems((current) => {
      if (!current) return current;
      const destination = index + offset;
      if (destination < 0 || destination >= current.length) return current;
      const next = [...current];
      [next[index], next[destination]] = [next[destination]!, next[index]!];
      return next;
    });
  }

  function addItem() {
    if (!items) return;
    const group = nextAvailableReviewGroup(items);
    if (!group) {
      setNotice("The review already has six Task items. Delete one before adding another.");
      return;
    }
    setItems([...items, blankPlanningReviewItem(group)]);
  }

  async function confirm() {
    if (!items || !validPlanningReview(items)) {
      setNotice("Every item needs a title, concrete first step, direction, and duration.");
      return;
    }
    setSaving(true);
    setNotice("");
    const next = await confirmDailyPlan(dateKey, items);
    setSaving(false);
    if (!next) {
      setNotice("The plan could not be saved yet. Manual planning remains available.");
      return;
    }
    const hasFirstMove = Boolean(getPendingIntent(next));
    setItems(undefined);
    setReviewingExisting(false);
    setBrainDump("");
    setNotice(
      hasFirstMove
        ? "Plan saved. Your reviewed First Move is ready in Focus."
        : "Plan saved without a pending First Move.",
    );
  }
}

function ReviewItem({
  first,
  item,
  last,
  onDelete,
  onMove,
  onPatch,
  onSetGroup,
}: {
  first: boolean;
  item: PlanningReviewItem;
  last: boolean;
  onDelete(): void;
  onMove(offset: -1 | 1): void;
  onPatch(patch: Partial<PlanningReviewItem>): void;
  onSetGroup(group: PlanningReviewItem["group"]): void;
}) {
  return (
    <View style={styles.reviewItem}>
      <Text style={styles.itemLabel}>{groupLabel(item.group)}</Text>
      <TextInput
        accessibilityLabel={`${groupLabel(item.group)} title`}
        maxLength={160}
        onChangeText={(title) => onPatch({ title })}
        placeholder="Title"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        value={item.title}
      />
      <TextInput
        accessibilityLabel={`${groupLabel(item.group)} concrete first step`}
        maxLength={160}
        onChangeText={(firstStep) => onPatch({ firstStep })}
        placeholder="Concrete first step"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        value={item.firstStep}
      />
      <Text style={styles.controlLabel}>Type</Text>
      <View style={styles.chips}>
        {(["first-move", "priority", "optional"] as const).map((group) => (
          <Chip
            key={group}
            label={groupLabel(group)}
            onPress={() => onSetGroup(group)}
            selected={item.group === group}
          />
        ))}
      </View>
      <Text style={styles.controlLabel}>Direction</Text>
      <View style={styles.chips}>
        {DIRECTIONS.map((direction) => (
          <Chip
            key={direction}
            label={direction}
            onPress={() => onPatch({ category: direction as Direction })}
            selected={item.category === direction}
          />
        ))}
      </View>
      <Text style={styles.controlLabel}>Duration</Text>
      <View style={styles.chips}>
        {INTENDED_DURATIONS.map((duration) => (
          <Chip
            key={duration}
            label={`${duration} min`}
            onPress={() => onPatch({ durationMinutes: duration as IntendedDuration })}
            selected={item.durationMinutes === duration}
          />
        ))}
      </View>
      <View style={styles.itemActions}>
        <SmallButton disabled={first} label="Move up" onPress={() => onMove(-1)} />
        <SmallButton disabled={last} label="Move down" onPress={() => onMove(1)} />
        <SmallButton label="Delete" onPress={onDelete} />
      </View>
    </View>
  );
}

function Chip({
  label,
  onPress,
  selected,
}: {
  label: string;
  onPress(): void;
  selected: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function SmallButton({
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
      style={[styles.smallButton, disabled && styles.disabled]}
    >
      <Text style={styles.smallButtonText}>{label}</Text>
    </Pressable>
  );
}

function groupLabel(group: PlanningReviewItem["group"]): string {
  if (group === "first-move") return "First Move";
  if (group === "priority") return "Priority Task";
  return "Optional Task";
}

const styles = StyleSheet.create({
  brainDump: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.sm,
    borderWidth: 1,
    color: colors.text,
    fontSize: typography.body,
    minHeight: 130,
    padding: spacing.md,
  },
  counter: { color: colors.textMuted, fontSize: typography.label, textAlign: "right" },
  notice: { color: colors.primary, fontSize: typography.small, lineHeight: 21 },
  reviewItem: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  itemLabel: { color: colors.primary, fontSize: typography.small, fontWeight: "800" },
  input: {
    borderColor: colors.border,
    borderRadius: radii.sm,
    borderWidth: 1,
    color: colors.text,
    fontSize: typography.body,
    minHeight: touchTarget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  controlLabel: { color: colors.textMuted, fontSize: typography.label, fontWeight: "800" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontSize: typography.small, fontWeight: "700" },
  chipTextSelected: { color: "#FFFFFF" },
  itemActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  smallButton: {
    borderColor: colors.border,
    borderRadius: radii.sm,
    borderWidth: 1,
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  smallButtonText: { color: colors.text, fontSize: typography.small, fontWeight: "700" },
  disabled: { opacity: 0.45 },
});
