import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { DIRECTIONS, type Direction } from "../domain/models.ts";
import {
  colors,
  radii,
  spacing,
  touchTarget,
  typography,
} from "../theme/tokens.ts";

export function FormLabel({ children }: { children: string }) {
  return <Text style={styles.inputLabel}>{children}</Text>;
}

export function TitleInput({
  accessibilityLabel,
  onChangeText,
  placeholder,
  value,
}: {
  accessibilityLabel: string;
  onChangeText(value: string): void;
  placeholder: string;
  value: string;
}) {
  return (
    <TextInput
      accessibilityLabel={accessibilityLabel}
      maxLength={160}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      style={styles.textInput}
      value={value}
    />
  );
}

export function DirectionPicker({
  onSelect,
  selected,
}: {
  onSelect(value: Direction): void;
  selected: Direction;
}) {
  return (
    <>
      <FormLabel>Direction</FormLabel>
      <View accessibilityRole="radiogroup" style={styles.choiceList}>
        {DIRECTIONS.map((direction) => (
          <SelectionButton
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

export function SelectionButton({
  detail,
  disabled = false,
  label,
  onPress,
  selected,
}: {
  detail?: string;
  disabled?: boolean;
  label: string;
  onPress(): void;
  selected: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        selected && styles.choiceSelected,
        pressed && styles.choicePressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>
        {label}
      </Text>
      {detail ? (
        <Text
          style={[styles.choiceDetail, selected && styles.choiceTextSelected]}
        >
          {detail}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  disabled: { opacity: 0.55 },
});
