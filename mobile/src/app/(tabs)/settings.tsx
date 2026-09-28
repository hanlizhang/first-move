import { AccountPanel } from "../../components/account-panel.tsx";
import { AccountDeletionPanel } from "../../components/account-deletion-panel.tsx";
import { AiAccessPanel } from "../../components/ai-access-panel.tsx";
import { LegalLinksPanel } from "../../components/legal-links-panel.tsx";
import { SubscriptionPanel } from "../../components/subscription-panel.tsx";
import { Body, Card, Heading, Label, Screen } from "../../components/ui.tsx";

export default function SettingsScreen() {
  return (
    <Screen
      eyebrow="Settings"
      title="Account and local data"
      description="An account is optional. Sign in to sync across devices, or keep using Guest Mode locally."
    >
      <AccountPanel />
      <LegalLinksPanel />
      <SubscriptionPanel />
      <AccountDeletionPanel />
      <AiAccessPanel />
      <Card>
        <Label>Privacy</Label>
        <Heading>Your private data stays private</Heading>
        <Body>
          Sign-in sessions use secure platform storage. Emails, journal text, and synced content are never written to diagnostic logs.
        </Body>
      </Card>
    </Screen>
  );
}
