import { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  filterFocusLinkOptions,
  findFocusLinkOption,
  type FocusLinkOption,
} from "../domain/focus.ts";
import {
  colors,
  radii,
  spacing,
  touchTarget,
  typography,
} from "../theme/tokens.ts";

export function FocusLinkPicker({
  currentUnavailableLabel,
  label,
  onSelect,
  options,
  selectedKey,
}: {
  currentUnavailableLabel?: string;
  label: string;
  onSelect(value: string): void;
  options: readonly FocusLinkOption[];
  selectedKey: string;
}) {
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");
  const selected = findFocusLinkOption(options, selectedKey);
  const selectedAvailable = !selectedKey || Boolean(selected);
  const filtered = useMemo(
    () => filterFocusLinkOptions(options, query),
    [options, query],
  );
  const tasks = filtered.filter((option) => option.kind === "task");
  const habits = filtered.filter((option) => option.kind === "habit");
  const selectedLabel = selected
    ? `${selected.kind === "task" ? "Task" : "Habit"}: ${selected.title}`
    : selectedKey
      ? currentUnavailableLabel ?? "Existing linked item is unavailable"
      : "No linked item";

  function open(): void {
    setQuery("");
    setVisible(true);
  }

  function choose(key: string): void {
    onSelect(key);
    setVisible(false);
  }

  return (
    <>
      <Text style={styles.inputLabel}>{label}</Text>
      <Pressable
        accessibilityHint="Opens searchable Tasks and Habits"
        accessibilityLabel={`${label}: ${selectedLabel}`}
        accessibilityRole="button"
        onPress={open}
        style={({ pressed }) => [styles.field, pressed && styles.pressed]}
      >
        <Text numberOfLines={2} style={styles.fieldText}>
          {selectedLabel}
        </Text>
        <Text accessibilityElementsHidden style={styles.chevron}>
          ›
        </Text>
      </Pressable>

      <Modal
        animationType="slide"
        onRequestClose={() => setVisible(false)}
        presentationStyle="pageSheet"
        visible={visible}
      >
        <SafeAreaView style={styles.safeArea}>
          <View accessibilityViewIsModal style={styles.modalHeader}>
            <View style={styles.headerText}>
              <Text accessibilityRole="header" style={styles.title}>
                Link a Task or Habit
              </Text>
              <Text style={styles.description}>
                Choose one active item, or keep this Session standalone.
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setVisible(false)}
              style={({ pressed }) => [styles.close, pressed && styles.pressed]}
            >
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
          <TextInput
            accessibilityLabel="Search Tasks and Habits"
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setQuery}
            placeholder="Search by title or direction"
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
            style={styles.search}
            value={query}
          />
          <ScrollView
            accessibilityRole="radiogroup"
            contentContainerStyle={styles.options}
            keyboardShouldPersistTaps="handled"
          >
            <PickerOption
              detail="Keep this Session standalone"
              label="No linked item"
              onPress={() => choose("")}
              selected={!selectedKey}
            />
            {!selectedAvailable ? (
              <>
                <Text style={styles.groupLabel}>Current relationship</Text>
                <PickerOption
                  detail="Unavailable for new links · retained until you choose another item"
                  label={currentUnavailableLabel ?? "Existing linked item"}
                  onPress={() => choose(selectedKey)}
                  selected
                />
              </>
            ) : null}
            <OptionGroup
              emptyLabel={query ? "No matching Tasks" : "No active Tasks"}
              label="Tasks"
              onSelect={choose}
              options={tasks}
              selectedKey={selectedKey}
            />
            <OptionGroup
              emptyLabel={query ? "No matching Habits" : "No active Habits"}
              label="Habits"
              onSelect={choose}
              options={habits}
              selectedKey={selectedKey}
            />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

function OptionGroup({
  emptyLabel,
  label,
  onSelect,
  options,
  selectedKey,
}: {
  emptyLabel: string;
  label: string;
  onSelect(key: string): void;
  options: readonly FocusLinkOption[];
  selectedKey: string;
}) {
  return (
    <View style={styles.group}>
      <Text accessibilityRole="header" style={styles.groupLabel}>
        {label}
      </Text>
      {options.length ? (
        options.map((option) => (
          <PickerOption
            detail={`${option.direction} · ${
              option.source === "canonical"
                ? "Synced read-only item"
                : "On-device item"
            }`}
            key={option.key}
            label={option.title}
            onPress={() => onSelect(option.key)}
            selected={selectedKey === option.key}
          />
        ))
      ) : (
        <Text style={styles.empty}>{emptyLabel}</Text>
      )}
    </View>
  );
}

function PickerOption({
  detail,
  label,
  onPress,
  selected,
}: {
  detail: string;
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
        styles.option,
        selected && styles.optionSelected,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.optionText}>
        <Text style={styles.optionTitle}>{label}</Text>
        <Text style={styles.optionDetail}>{detail}</Text>
      </View>
      <Text style={[styles.selection, selected && styles.selectionSelected]}>
        {selected ? "Selected" : "Choose"}
      </Text>
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
  field: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: touchTarget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  fieldText: {
    color: colors.text,
    flex: 1,
    fontSize: typography.body,
    fontWeight: "700",
  },
  chevron: { color: colors.primary, fontSize: 28, fontWeight: "700" },
  pressed: { opacity: 0.8 },
  safeArea: { backgroundColor: colors.background, flex: 1 },
  modalHeader: {
    alignItems: "flex-start",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
  },
  headerText: { flex: 1, gap: spacing.xs },
  title: { color: colors.text, fontSize: typography.heading, fontWeight: "800" },
  description: { color: colors.textMuted, fontSize: typography.small, lineHeight: 20 },
  close: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: touchTarget,
    paddingHorizontal: spacing.sm,
  },
  closeText: { color: colors.primary, fontSize: typography.body, fontWeight: "800" },
  search: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.sm,
    borderWidth: 1,
    color: colors.text,
    fontSize: typography.body,
    margin: spacing.md,
    minHeight: touchTarget,
    paddingHorizontal: spacing.md,
  },
  options: { gap: spacing.sm, padding: spacing.md, paddingTop: 0 },
  group: { gap: spacing.sm, marginTop: spacing.sm },
  groupLabel: {
    color: colors.textMuted,
    fontSize: typography.label,
    fontWeight: "800",
    letterSpacing: 1,
    marginTop: spacing.sm,
    textTransform: "uppercase",
  },
  empty: { color: colors.textMuted, fontSize: typography.small, paddingVertical: spacing.sm },
  option: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: touchTarget,
    padding: spacing.md,
  },
  optionSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  optionText: { flex: 1, gap: spacing.xs },
  optionTitle: { color: colors.text, fontSize: typography.body, fontWeight: "800" },
  optionDetail: { color: colors.textMuted, fontSize: typography.label },
  selection: { color: colors.textMuted, fontSize: typography.label, fontWeight: "800" },
  selectionSelected: { color: colors.primary },
});
