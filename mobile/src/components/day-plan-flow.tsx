import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing, touchTarget, typography } from "../theme/tokens.ts";
import { DayPlanner } from "./day-planner.tsx";

export function DayPlanFlow({ dateKey }: { dateKey: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.flow}>
      <View style={styles.shell}>
        <Pressable
          accessibilityLabel={`${expanded ? "Collapse" : "Open"} Plan my day`}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          onPress={() => setExpanded((current) => !current)}
          style={({ pressed }) => [styles.summaryRow, pressed && styles.pressed]}
        >
          <View style={styles.summaryCopy}>
            <Text style={styles.kicker}>OPTIONAL</Text>
            <Text style={styles.title}>Plan my day</Text>
            <Text style={styles.summary}>Choose a First Move and a few Tasks</Text>
          </View>
          <Text accessibilityElementsHidden importantForAccessibility="no" style={styles.disclosure}>
            {expanded ? "−" : "+"}
          </Text>
        </Pressable>
      </View>
      {expanded ? <DayPlanner dateKey={dateKey} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flow: { gap: spacing.sm },
  shell: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  summaryRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: touchTarget,
    paddingHorizontal: 12,
    paddingVertical: spacing.sm,
  },
  summaryCopy: { flex: 1 },
  kicker: {
    color: colors.textMuted,
    fontSize: typography.label,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  title: { color: colors.text, fontSize: typography.body, fontWeight: "800", lineHeight: 22 },
  summary: { color: colors.textMuted, fontSize: typography.small, lineHeight: 19 },
  disclosure: { color: colors.primary, fontSize: 24, fontWeight: "700", minWidth: 24, textAlign: "center" },
  pressed: { opacity: 0.72 },
});
