import { StyleSheet, View } from "react-native";

import { AccountPanel } from "../../components/account-panel.tsx";
import { AccountDeletionPanel } from "../../components/account-deletion-panel.tsx";
import { AiAccessPanel } from "../../components/ai-access-panel.tsx";
import { CelebrationQaPanel } from "../../components/celebration-qa-panel.tsx";
import { LegalLinksPanel } from "../../components/legal-links-panel.tsx";
import { SubscriptionPanel } from "../../components/subscription-panel.tsx";
import { Body, Heading, Label, Screen } from "../../components/ui.tsx";
import { colors, spacing } from "../../theme/tokens.ts";

export default function SettingsScreen() {
  return (
    <Screen
      eyebrow="Settings"
      title="Settings"
      description="An account is optional. Sign in to sync across devices, or keep using Guest Mode locally."
    >
      <AccountPanel />
      <LegalLinksPanel />
      <SubscriptionPanel />
      <AccountDeletionPanel />
      <AiAccessPanel />
      {__DEV__ ? <CelebrationQaPanel /> : null}
      <View style={styles.section}>
        <Label>Privacy</Label>
        <Heading>Your private data stays private</Heading>
        <Body>
          Sign-in sessions use secure platform storage. Emails, journal text, and synced content are never written to diagnostic logs.
        </Body>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
});
