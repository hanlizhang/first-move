import { AccountPanel } from "../../components/account-panel.tsx";
import { Body, Card, Heading, Label, Screen } from "../../components/ui.tsx";

export default function SettingsScreen() {
  return (
    <Screen
      eyebrow="Settings"
      title="Account and local data"
      description="Authentication is optional. M0 reads an initialized cloud copy but never sets one up or writes business data."
    >
      <AccountPanel />
      <Card>
        <Label>Privacy</Label>
        <Heading>Secrets stay out of the app</Heading>
        <Body>
          The mobile client accepts only the public Supabase URL and publishable key. Sessions use encrypted platform storage; emails, tokens, journal text, and cloud payloads are never logged.
        </Body>
      </Card>
    </Screen>
  );
}
