import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { useFirstMoveApp } from "../app-state/app-provider.tsx";
import { colors, radii, spacing, touchTarget, typography } from "../theme/tokens.ts";
import {
  Body,
  Card,
  Heading,
  Label,
  LoadingState,
  PrimaryButton,
  SecondaryButton,
} from "./ui.tsx";

export function AccountPanel() {
  const {
    auth,
    cloud,
    continueAsGuest,
    openSignIn,
    sendMagicLink,
    signOut,
    retryAuthRestore,
    refreshCloud,
  } = useFirstMoveApp();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);

  if (auth.status === "loading") return <LoadingState label="Restoring secure session…" />;

  if (auth.status === "error") {
    return (
      <Card tone="danger">
        <Label>Account needs attention</Label>
        <Heading>Guest Mode is still safe to use</Heading>
        <Body>{auth.message}</Body>
        <PrimaryButton title="Continue as guest" onPress={continueAsGuest} />
        <SecondaryButton title="Try account restore again" onPress={() => void retryAuthRestore()} />
      </Card>
    );
  }

  if (auth.status === "guest") {
    return (
      <Card tone="primary">
        <Label>Guest Mode</Label>
        <Heading>Local and account data stay separate</Heading>
        <Body>
          Guest progress and each account’s local progress use separate device storage. Signing in never uploads, merges, or deletes either side.
        </Body>
        <PrimaryButton title="Sync across devices" onPress={openSignIn} />
      </Card>
    );
  }

  if (auth.status === "authenticated") {
    return (
      <View style={styles.group}>
        <Card tone="success">
          <Label>Authenticated</Label>
          <Heading>Signed in securely</Heading>
          <Body>{auth.user.email ?? "Email address unavailable"}</Body>
          <SecondaryButton
            disabled={pending}
            title={pending ? "Signing out…" : "Sign out"}
            onPress={() =>
              void runPending(async () => {
                await signOut();
              })
            }
          />
          <Body muted>Signing out does not delete guest data or account-scoped local cache data.</Body>
        </Card>
        <CloudStatusCard onRefresh={() => void refreshCloud()} />
      </View>
    );
  }

  return (
    <Card>
      <Label>Optional account</Label>
      <Heading>Sync across devices</Heading>
      <Body>
        Sign in with an email magic link. Guest Mode remains available without an account or network.
      </Body>
      <Text style={styles.inputLabel}>Email</Text>
      <TextInput
        accessibilityLabel="Email"
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        keyboardType="email-address"
        onChangeText={setEmail}
        placeholder="you@example.com"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
        value={email}
      />
      <PrimaryButton
        disabled={pending}
        title={pending ? "Sending link…" : "Email me a sign-in link"}
        onPress={() =>
          void runPending(async () => {
            await sendMagicLink(email);
          })
        }
      />
      <SecondaryButton title="Continue as guest" onPress={continueAsGuest} />
      {auth.message ? <Body>{auth.message}</Body> : null}
    </Card>
  );

  async function runPending(action: () => Promise<void>) {
    setPending(true);
    try {
      await action();
    } finally {
      setPending(false);
    }
  }

  function CloudStatusCard({ onRefresh }: { onRefresh: () => void }) {
    if (cloud.status === "loading") {
      return (
        <Card>
          <Label>Cloud</Label>
          <Body>Checking and validating the canonical cloud workspace…</Body>
        </Card>
      );
    }
    if (cloud.status === "setup-unavailable") {
      return (
        <Card tone="warning">
          <Label>Cloud setup unavailable</Label>
          <Heading>Not available until M1E</Heading>
          <Body>{cloud.message}</Body>
        </Card>
      );
    }
    if (cloud.status === "error") {
      return (
        <Card tone="danger">
          <Label>Cloud read failed</Label>
          <Body>{cloud.message}</Body>
          <SecondaryButton title="Retry read-only hydration" onPress={onRefresh} />
        </Card>
      );
    }
    if (cloud.status === "ready") {
      const { state } = cloud.workspace;
      return (
        <Card tone="success">
          <Label>Cloud copy loaded · read-only</Label>
          <Heading>Canonical workspace verified</Heading>
          <View style={styles.metrics}>
            <Metric label="Tasks" value={state.tasks.length} />
            <Metric label="Habits" value={state.habits.length} />
            <Metric label="Sessions" value={state.sessions.length} />
            <Metric label="Points" value={state.progress.points} />
          </View>
          <Body muted>
            Mobile can read this initialized workspace. It cannot create, edit, import, merge, purchase, or sync cloud business data yet.
          </Body>
          <SecondaryButton title="Refresh cloud data" onPress={onRefresh} />
        </Card>
      );
    }
    return null;
  }
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.md },
  inputLabel: { color: colors.text, fontSize: typography.small, fontWeight: "800", marginTop: spacing.sm },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.sm,
    borderWidth: 1,
    color: colors.text,
    fontSize: typography.body,
    minHeight: touchTarget,
    paddingHorizontal: spacing.md,
  },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  metric: { backgroundColor: colors.surface, borderRadius: radii.sm, minWidth: 92, padding: spacing.sm },
  metricValue: { color: colors.text, fontSize: typography.heading, fontWeight: "800" },
  metricLabel: { color: colors.textMuted, fontSize: typography.small },
});
