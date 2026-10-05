import { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { colors, spacing, touchTarget, typography } from "../theme/tokens.ts";
import { Heading, Label } from "./ui.tsx";

export const LEGAL_LINKS = {
  privacy: "https://firstmovestartsmall.com/privacy",
  terms: "https://firstmovestartsmall.com/terms",
  support: "https://firstmovestartsmall.com/support",
} as const;

export function LegalLinksPanel() {
  const [feedback, setFeedback] = useState<string>();

  return (
    <View style={styles.section}>
      <Label>Legal</Label>
      <Heading>Legal and support</Heading>
      <View style={styles.rows}>
        <LinkRow label="Privacy Policy" onPress={() => void open(LEGAL_LINKS.privacy)} />
        <LinkRow label="Terms of Use" onPress={() => void open(LEGAL_LINKS.terms)} />
        <LinkRow label="Support" onPress={() => void open(LEGAL_LINKS.support)} />
      </View>
      {feedback ? (
        <Text accessibilityLiveRegion="polite" style={styles.feedback}>{feedback}</Text>
      ) : null}
    </View>
  );

  async function open(url: string) {
    setFeedback(undefined);
    try {
      await Linking.openURL(url);
    } catch {
      setFeedback("This page could not be opened. Please try again.");
    }
  }
}

function LinkRow({ label, onPress }: { label: string; onPress(): void }) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Text style={styles.rowLabel}>{label}</Text>
      <Text accessibilityElementsHidden style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  rows: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  row: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    minHeight: touchTarget,
  },
  rowLabel: {
    color: colors.text,
    flex: 1,
    fontSize: typography.body,
    fontWeight: "700",
  },
  chevron: { color: colors.primary, fontSize: 26, fontWeight: "700" },
  pressed: { opacity: 0.7 },
  feedback: {
    color: colors.textMuted,
    fontSize: typography.small,
    lineHeight: 20,
  },
});
