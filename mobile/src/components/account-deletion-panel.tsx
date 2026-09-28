import { useState } from "react";
import { Linking, StyleSheet, Text, TextInput, View } from "react-native";

import {
  MOBILE_ACCOUNT_DELETION_CONFIRMATION,
  openAppleSubscriptionManagement,
  type MobileAccountDeletionOutcome,
} from "../account-deletion/account-deletion.ts";
import { useFirstMoveApp } from "../app-state/app-provider.tsx";
import { colors, radii, spacing, touchTarget, typography } from "../theme/tokens.ts";
import {
  Body,
  Card,
  DangerButton,
  Heading,
  Label,
  SecondaryButton,
} from "./ui.tsx";

export function AccountDeletionPanel() {
  const {
    auth,
    deleteAccount,
    sendDeletionReauthenticationLink,
  } = useFirstMoveApp();
  const [expanded, setExpanded] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState<"reauth" | "delete" | "manage">();
  const [feedback, setFeedback] = useState<string>();

  if (auth.status !== "authenticated") return null;

  return (
    <Card tone="danger">
      <Label>Account deletion</Label>
      <Heading>Delete account</Heading>
      <Body>
        Permanently delete your First Move account and synced cloud data. This cannot be undone.
      </Body>
      <Body>
        Deleting your First Move account does not cancel an active Apple subscription. Apple may continue billing until you cancel it in your Apple Account.
      </Body>
      <SecondaryButton
        disabled={Boolean(pending)}
        title={pending === "manage" ? "Opening Apple subscriptions…" : "Manage Apple subscription"}
        onPress={() => void manageSubscription()}
      />
      {!expanded ? (
        <DangerButton title="Delete account" onPress={() => setExpanded(true)} />
      ) : (
        <View style={styles.confirmationGroup}>
          <Body>
            First, request a fresh secure email link and open it on this device. Return here within five minutes to continue.
          </Body>
          <SecondaryButton
            disabled={Boolean(pending)}
            title={pending === "reauth" ? "Sending secure link…" : "Email me a fresh sign-in link"}
            onPress={() => void reauthenticate()}
          />
          <Text style={styles.inputLabel}>
            Type {MOBILE_ACCOUNT_DELETION_CONFIRMATION} to confirm
          </Text>
          <TextInput
            accessibilityLabel="Account deletion confirmation"
            autoCapitalize="characters"
            autoCorrect={false}
            onChangeText={setConfirmation}
            placeholder={MOBILE_ACCOUNT_DELETION_CONFIRMATION}
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            value={confirmation}
          />
          <DangerButton
            disabled={
              Boolean(pending) ||
              confirmation !== MOBILE_ACCOUNT_DELETION_CONFIRMATION
            }
            title={pending === "delete" ? "Starting deletion…" : "Permanently delete account"}
            onPress={() => void confirmDeletion()}
          />
          <SecondaryButton
            disabled={Boolean(pending)}
            title="Keep my account"
            onPress={() => {
              setExpanded(false);
              setConfirmation("");
              setFeedback(undefined);
            }}
          />
        </View>
      )}
      {feedback ? (
        <Text accessibilityLiveRegion="polite" style={styles.feedback}>
          {feedback}
        </Text>
      ) : null}
    </Card>
  );

  async function manageSubscription() {
    setPending("manage");
    const opened = await openAppleSubscriptionManagement(Linking.openURL);
    setFeedback(
      opened
        ? undefined
        : "Apple subscription management could not be opened. Try again from iOS Settings.",
    );
    setPending(undefined);
  }

  async function reauthenticate() {
    setPending("reauth");
    const result = await sendDeletionReauthenticationLink();
    setFeedback(result.message);
    setPending(undefined);
  }

  async function confirmDeletion() {
    setPending("delete");
    const outcome = await deleteAccount(confirmation);
    setFeedback(deletionFeedback(outcome));
    setPending(undefined);
  }
}

function deletionFeedback(outcome: MobileAccountDeletionOutcome): string {
  switch (outcome) {
    case "accepted":
      return "Account deletion is in progress.";
    case "reauthentication-required":
      return "Open a fresh sign-in link, then return here and confirm again within five minutes.";
    case "confirmation-required":
      return `Type ${MOBILE_ACCOUNT_DELETION_CONFIRMATION} exactly.`;
    case "denied":
      return "Your secure session could not be verified. Sign in again before deleting the account.";
    case "unavailable":
      return "Account deletion is temporarily unavailable. Nothing was deleted; please try again.";
  }
}

const styles = StyleSheet.create({
  confirmationGroup: { gap: spacing.sm },
  inputLabel: {
    color: colors.text,
    fontSize: typography.small,
    fontWeight: "800",
    marginTop: spacing.xs,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.danger,
    borderRadius: radii.sm,
    borderWidth: 1,
    color: colors.text,
    fontSize: typography.body,
    minHeight: touchTarget,
    paddingHorizontal: spacing.md,
  },
  feedback: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20,
  },
});
