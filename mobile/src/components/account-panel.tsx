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
    sync,
    continueAsGuest,
    openSignIn,
    sendMagicLink,
    signOut,
    retryAuthRestore,
    refreshCloud,
    startFreshCloudWorkspace,
  } = useFirstMoveApp();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [setupPending, setSetupPending] = useState(false);
  const [setupMessage, setSetupMessage] = useState<string | undefined>();

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
          Guest progress and each account stay separate. Signing in never uploads or merges Guest data.
        </Body>
        <PrimaryButton title="Sync across devices" onPress={openSignIn} />
      </Card>
    );
  }

  if (auth.status === "authenticated") {
    return (
      <View style={styles.group}>
        <View style={styles.section}>
          <Label>Account</Label>
          <Heading>Signed in</Heading>
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
          <Body muted>Signing out keeps Guest Mode and account data separate.</Body>
        </View>
        <CloudStatusCard
          onRefresh={() => void refreshCloud()}
          onStartFresh={() => void runStartFresh()}
        />
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

  async function runStartFresh() {
    setSetupPending(true);
    setSetupMessage(undefined);
    try {
      const result = await startFreshCloudWorkspace();
      setSetupMessage(result.message);
    } catch {
      setSetupMessage(
        "Start fresh could not be completed. Guest progress remains safe; try again.",
      );
    } finally {
      setSetupPending(false);
    }
  }

  function CloudStatusCard({
    onRefresh,
    onStartFresh,
  }: {
    onRefresh: () => void;
    onStartFresh: () => void;
  }) {
    if (sync.status === "local") return null;
    if (sync.status === "loading") {
      return (
        <Card>
          <Label>Loading cloud progress</Label>
          <Body>Checking this account and loading its synced progress…</Body>
        </Card>
      );
    }
    if (sync.status === "write-disabled") {
      return (
        <Card tone="warning">
          <Label>Set up sync</Label>
          <Heading>Start with an empty synced account</Heading>
          <Body>{sync.message}</Body>
          <Body>
            Start fresh does not upload or merge Guest progress. Your existing Guest progress stays separately stored on this device.
          </Body>
          <PrimaryButton
            disabled={setupPending}
            title={setupPending ? "Starting fresh…" : "Start fresh"}
            onPress={onStartFresh}
          />
          <SecondaryButton title="Check cloud setup again" onPress={onRefresh} />
          <SecondaryButton title="Continue as guest" onPress={continueAsGuest} />
          {setupMessage ? <Body>{setupMessage}</Body> : null}
        </Card>
      );
    }
    if (sync.status === "pending" || sync.status === "syncing") {
      return (
        <Card tone="warning">
          <Label>{sync.status === "pending" ? "Pending sync" : "Syncing"}</Label>
          <Heading>
            {sync.pendingCount} {sync.pendingCount === 1 ? "change" : "changes"} queued
          </Heading>
          <Body muted>
            Your changes are saved on this device and will sync when possible.
          </Body>
          <SecondaryButton title="Retry and refresh" onPress={onRefresh} />
        </Card>
      );
    }
    if (sync.status === "offline") {
      return (
        <Card tone="warning">
          <Label>Offline · retry pending</Label>
          <Heading>Your saved changes are safe</Heading>
          <Body>{sync.message}</Body>
          <SecondaryButton title="Retry and refresh" onPress={onRefresh} />
        </Card>
      );
    }
    if (sync.status === "error") {
      return (
        <Card tone="danger">
          <Label>Sync error</Label>
          <Body>{sync.message}</Body>
          <SecondaryButton title="Retry and refresh" onPress={onRefresh} />
        </Card>
      );
    }
    if (sync.status === "synced" && cloud.status === "ready") {
      return (
        <View style={styles.section}>
          <Label>Synced · Up to date</Label>
          <Heading>Your progress is synced</Heading>
          <Body muted>
            Tasks, Habits, First Moves, and Focus Sessions are available across your signed-in devices.
          </Body>
          <SecondaryButton title="Refresh cloud data" onPress={onRefresh} />
        </View>
      );
    }
    if (sync.status === "synced") {
      return (
        <View style={styles.section}>
          <Label>Synced · Up to date</Label>
          <Heading>Your progress is synced</Heading>
          <SecondaryButton title="Refresh cloud data" onPress={onRefresh} />
        </View>
      );
    }
    return null;
  }
}

const styles = StyleSheet.create({
  group: { gap: spacing.md },
  section: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
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
});
