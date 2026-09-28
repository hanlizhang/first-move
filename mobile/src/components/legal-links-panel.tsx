import { useState } from "react";
import { Linking, StyleSheet, Text } from "react-native";

import { colors, typography } from "../theme/tokens.ts";
import { Card, Heading, Label, SecondaryButton } from "./ui.tsx";

export const LEGAL_LINKS = {
  privacy: "https://firstmovestartsmall.com/privacy",
  terms: "https://firstmovestartsmall.com/terms",
  support: "https://firstmovestartsmall.com/support",
} as const;

export function LegalLinksPanel() {
  const [feedback, setFeedback] = useState<string>();

  return (
    <Card>
      <Label>Legal</Label>
      <Heading>Legal and support</Heading>
      <SecondaryButton title="Privacy Policy" onPress={() => void open(LEGAL_LINKS.privacy)} />
      <SecondaryButton title="Terms of Use" onPress={() => void open(LEGAL_LINKS.terms)} />
      <SecondaryButton title="Support" onPress={() => void open(LEGAL_LINKS.support)} />
      {feedback ? (
        <Text accessibilityLiveRegion="polite" style={styles.feedback}>{feedback}</Text>
      ) : null}
    </Card>
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

const styles = StyleSheet.create({
  feedback: {
    color: colors.textMuted,
    fontSize: typography.small,
    lineHeight: 20,
  },
});
