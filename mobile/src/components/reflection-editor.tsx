import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import type { JournalEntry } from "../domain/models.ts";
import {
  hasReflectionContent,
  type ReflectionInput,
} from "../domain/reflections.ts";
import { colors, radii, spacing, touchTarget, typography } from "../theme/tokens.ts";
import { Body, Card, PrimaryButton, SecondaryButton } from "./ui.tsx";

interface ReflectionEditorProps {
  disabled: boolean;
  existing?: JournalEntry;
  onDelete(): Promise<boolean>;
  onSave(input: ReflectionInput): Promise<boolean>;
}

const TEXT_FIELDS: {
  key: keyof Pick<
    ReflectionInput,
    "whatHelped" | "completed" | "difficult" | "nextStep" | "freeText"
  >;
  label: string;
  placeholder: string;
}[] = [
  { key: "whatHelped", label: "What helped?", placeholder: "A person, place, or small choice…" },
  { key: "completed", label: "What did you do?", placeholder: "Anything that counts today…" },
  { key: "difficult", label: "What felt difficult?", placeholder: "Name it without judging it…" },
  { key: "nextStep", label: "One small next step", placeholder: "Make it easy to begin…" },
  { key: "freeText", label: "Notes", placeholder: "Anything else you want to remember…" },
];

export function ReflectionEditor({
  disabled,
  existing,
  onDelete,
  onSave,
}: ReflectionEditorProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<ReflectionInput>(() => toInput(existing));

  if (!editing) {
    return (
      <Card tone={existing ? "primary" : "default"}>
        {existing ? <ReflectionPreview reflection={existing} /> : (
          <Body muted>A few private words can help close the day gently.</Body>
        )}
        <Text style={styles.privacy}>Private on your workspace. Never sent to AI.</Text>
        <SecondaryButton
          disabled={disabled}
          onPress={() => {
            setDraft(toInput(existing));
            setEditing(true);
          }}
          title={existing ? "Edit reflection" : "Add reflection"}
        />
      </Card>
    );
  }

  return (
    <Card tone="primary">
      <RatingRow
        disabled={disabled || saving}
        label="Mood"
        onChange={(mood) => setDraft((current) => ({ ...current, mood }))}
        value={draft.mood}
      />
      <RatingRow
        disabled={disabled || saving}
        label="Energy"
        onChange={(energy) => setDraft((current) => ({ ...current, energy }))}
        value={draft.energy}
      />
      {TEXT_FIELDS.map((field) => (
        <View key={field.key} style={styles.field}>
          <Text style={styles.label}>{field.label}</Text>
          <TextInput
            accessibilityLabel={field.label}
            editable={!disabled && !saving}
            maxLength={1_000}
            multiline
            onChangeText={(value) =>
              setDraft((current) => ({ ...current, [field.key]: value }))
            }
            placeholder={field.placeholder}
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            textAlignVertical="top"
            value={draft[field.key] ?? ""}
          />
        </View>
      ))}
      <Text style={styles.privacy}>Private on your workspace. Never sent to AI.</Text>
      <View style={styles.actions}>
        <PrimaryButton
          disabled={disabled || saving || !hasReflectionContent(draft)}
          onPress={() => void submitSave()}
          title={saving ? "Saving…" : "Save reflection"}
        />
        <SecondaryButton
          disabled={saving}
          onPress={() => {
            setDraft(toInput(existing));
            setEditing(false);
          }}
          title="Cancel"
        />
        {existing ? (
          <Pressable
            accessibilityRole="button"
            disabled={disabled || saving}
            onPress={() => void submitDelete()}
            style={({ pressed }) => [
              styles.deleteButton,
              pressed && styles.pressed,
              (disabled || saving) && styles.disabled,
            ]}
          >
            <Text style={styles.deleteText}>Delete reflection</Text>
          </Pressable>
        ) : null}
      </View>
    </Card>
  );

  async function submitSave(): Promise<void> {
    if (disabled || saving || !hasReflectionContent(draft)) return;
    setSaving(true);
    const saved = await onSave(draft);
    setSaving(false);
    if (saved) setEditing(false);
  }

  async function submitDelete(): Promise<void> {
    if (disabled || saving || !existing) return;
    setSaving(true);
    const deleted = await onDelete();
    setSaving(false);
    if (deleted) {
      setDraft({});
      setEditing(false);
    }
  }
}

function RatingRow({
  disabled,
  label,
  onChange,
  value,
}: {
  disabled: boolean;
  label: string;
  onChange(value?: 1 | 2 | 3 | 4 | 5): void;
  value?: 1 | 2 | 3 | 4 | 5;
}) {
  return (
    <View style={styles.ratingBlock}>
      <Text style={styles.label}>{label}</Text>
      <View accessibilityRole="radiogroup" style={styles.ratingRow}>
        {([1, 2, 3, 4, 5] as const).map((rating) => {
          const selected = value === rating;
          return (
            <Pressable
              accessibilityLabel={`${label} ${rating} out of 5`}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled }}
              disabled={disabled}
              key={rating}
              onPress={() => onChange(selected ? undefined : rating)}
              style={({ pressed }) => [
                styles.rating,
                selected && styles.ratingSelected,
                pressed && styles.pressed,
                disabled && styles.disabled,
              ]}
            >
              <Text style={[styles.ratingText, selected && styles.ratingTextSelected]}>
                {rating}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ReflectionPreview({ reflection }: { reflection: JournalEntry }) {
  const fields = reflectionFields(reflection);
  return (
    <View style={styles.preview}>
      <Text style={styles.saved}>Saved today</Text>
      {fields.slice(0, 3).map((field) => (
        <View key={field.label}>
          <Text style={styles.previewLabel}>{field.label}</Text>
          <Text numberOfLines={3} style={styles.previewValue}>{field.value}</Text>
        </View>
      ))}
      {fields.length > 3 ? <Text style={styles.more}>+ {fields.length - 3} more</Text> : null}
    </View>
  );
}

function reflectionFields(reflection: JournalEntry): { label: string; value: string }[] {
  return [
    reflection.whatHelped ? { label: "What helped", value: reflection.whatHelped } : undefined,
    reflection.completed ? { label: "What I did", value: reflection.completed } : undefined,
    reflection.difficult ? { label: "What felt difficult", value: reflection.difficult } : undefined,
    reflection.nextStep ? { label: "Small next step", value: reflection.nextStep } : undefined,
    reflection.freeText ? { label: "Notes", value: reflection.freeText } : undefined,
    reflection.mood ? { label: "Mood", value: `${reflection.mood}/5` } : undefined,
    reflection.energy ? { label: "Energy", value: `${reflection.energy}/5` } : undefined,
  ].filter((field): field is { label: string; value: string } => Boolean(field));
}

function toInput(entry?: JournalEntry): ReflectionInput {
  if (!entry) return {};
  return {
    mood: entry.mood,
    energy: entry.energy,
    whatHelped: entry.whatHelped,
    completed: entry.completed,
    difficult: entry.difficult,
    nextStep: entry.nextStep,
    freeText: entry.freeText,
  };
}

const styles = StyleSheet.create({
  preview: { gap: spacing.sm },
  saved: { color: colors.success, fontSize: typography.small, fontWeight: "800" },
  previewLabel: { color: colors.primary, fontSize: typography.small, fontWeight: "800" },
  previewValue: { color: colors.text, fontSize: typography.body, lineHeight: 22, marginTop: 2 },
  more: { color: colors.textMuted, fontSize: typography.small },
  privacy: { color: colors.textMuted, fontSize: typography.small, lineHeight: 20 },
  ratingBlock: { gap: spacing.xs },
  ratingRow: { flexDirection: "row", gap: spacing.sm },
  label: { color: colors.text, fontSize: typography.small, fontWeight: "800" },
  rating: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: touchTarget,
    justifyContent: "center",
    width: touchTarget,
  },
  ratingSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  ratingText: { color: colors.text, fontSize: typography.body, fontWeight: "800" },
  ratingTextSelected: { color: "#FFFFFF" },
  field: { gap: spacing.xs },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.sm,
    borderWidth: 1,
    color: colors.text,
    fontSize: typography.body,
    lineHeight: 22,
    minHeight: 72,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  actions: { gap: spacing.sm },
  deleteButton: { alignItems: "center", justifyContent: "center", minHeight: touchTarget },
  deleteText: { color: colors.danger, fontSize: typography.small, fontWeight: "800" },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.5 },
});
