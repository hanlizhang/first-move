import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useFirstMoveApp } from "../app-state/app-provider.tsx";
import type {
  PurchaseFlowOutcome,
  RestoreFlowOutcome,
} from "../subscriptions/revenuecat.ts";
import { colors, spacing, typography } from "../theme/tokens.ts";
import {
  Body,
  Card,
  Heading,
  Label,
  PrimaryButton,
  SecondaryButton,
} from "./ui.tsx";

type PendingAction = "purchase" | "restore";
type Feedback = { message: string; tone: "neutral" | "success" | "error" };
type ActionState = {
  userId?: string;
  pendingAction?: PendingAction;
  feedback?: Feedback;
};

export function SubscriptionPanel() {
  const {
    auth,
    subscription,
    presentProPaywall,
    restorePurchases,
  } = useFirstMoveApp();
  const userId = auth.status === "authenticated" ? auth.user.id : undefined;
  const [actionState, setActionState] = useState<ActionState>({});

  if (!userId) {
    return (
      <Card>
        <Label>First Move Pro</Label>
        <Heading>Sign in to purchase or restore</Heading>
        <Body>
          RevenueCat purchases are available only for a signed-in account. Guest Mode remains fully functional.
        </Body>
      </Card>
    );
  }

  const planLabel =
    subscription.status === "pro"
      ? "Pro"
      : subscription.status === "free"
        ? "Free"
        : subscription.status === "loading"
          ? "Checking…"
          : "Unavailable";
  const actionsAvailable =
    subscription.status === "free" || subscription.status === "pro";
  const pendingAction =
    actionState.userId === userId ? actionState.pendingAction : undefined;
  const feedback = actionState.userId === userId ? actionState.feedback : undefined;

  return (
    <Card tone={subscription.status === "pro" ? "success" : "default"}>
      <Label>First Move Pro</Label>
      <Heading>Current plan: {planLabel}</Heading>
      {subscription.status === "pro" ? (
        <Body>Your Pro entitlement is active for this account.</Body>
      ) : subscription.status === "free" ? (
        <Body>
          Upgrade through the secure RevenueCat paywall. Plans and localized prices come directly from the store.
        </Body>
      ) : subscription.status === "loading" ? (
        <Body muted>Checking this account’s subscription status…</Body>
      ) : (
        <Body>
          Subscription status is unavailable right now. All existing First Move features remain available.
        </Body>
      )}

      {subscription.status === "free" ? (
        <PrimaryButton
          disabled={Boolean(pendingAction)}
          title={pendingAction === "purchase" ? "Opening secure paywall…" : "Upgrade to Pro"}
          onPress={() => void runPurchase()}
        />
      ) : null}
      {actionsAvailable ? (
        <SecondaryButton
          disabled={Boolean(pendingAction)}
          title={pendingAction === "restore" ? "Restoring purchases…" : "Restore purchases"}
          onPress={() => void runRestore()}
        />
      ) : null}
      {feedback ? (
        <View style={styles.feedback}>
          <Text
            accessibilityLiveRegion="polite"
            style={[
              styles.feedbackText,
              feedback.tone === "success" && styles.success,
              feedback.tone === "error" && styles.error,
            ]}
          >
            {feedback.message}
          </Text>
        </View>
      ) : null}
      <Body muted>No current First Move feature is gated by this plan.</Body>
    </Card>
  );

  async function runPurchase() {
    const actionUserId = userId;
    setActionState({ userId: actionUserId, pendingAction: "purchase" });
    try {
      const outcome = await presentProPaywall();
      setActionState((current) =>
        current.userId === actionUserId
          ? { userId: actionUserId, feedback: purchaseFeedback(outcome) }
          : current,
      );
    } catch {
      setActionState((current) =>
        current.userId === actionUserId
          ? { userId: actionUserId, feedback: purchaseFeedback("error") }
          : current,
      );
    } finally {
      setActionState((current) =>
        current.userId === actionUserId
          ? { ...current, pendingAction: undefined }
          : current,
      );
    }
  }

  async function runRestore() {
    const actionUserId = userId;
    setActionState({ userId: actionUserId, pendingAction: "restore" });
    try {
      const outcome = await restorePurchases();
      setActionState((current) =>
        current.userId === actionUserId
          ? { userId: actionUserId, feedback: restoreFeedback(outcome) }
          : current,
      );
    } catch {
      setActionState((current) =>
        current.userId === actionUserId
          ? { userId: actionUserId, feedback: restoreFeedback("error") }
          : current,
      );
    } finally {
      setActionState((current) =>
        current.userId === actionUserId
          ? { ...current, pendingAction: undefined }
          : current,
      );
    }
  }
}

function purchaseFeedback(outcome: PurchaseFlowOutcome): Feedback {
  switch (outcome) {
    case "pro":
    case "already-pro":
      return { message: "First Move Pro is active.", tone: "success" };
    case "cancelled":
      return {
        message: "No purchase was made. Your plan is unchanged.",
        tone: "neutral",
      };
    case "free":
      return {
        message: "Pro is not active yet. You can try Restore purchases.",
        tone: "neutral",
      };
    case "unavailable":
      return {
        message: "Purchases are unavailable until this signed-in account finishes loading.",
        tone: "error",
      };
    case "error":
      return {
        message: "The purchase could not be completed. Your current plan is unchanged.",
        tone: "error",
      };
  }
}

function restoreFeedback(outcome: RestoreFlowOutcome): Feedback {
  switch (outcome) {
    case "pro":
      return { message: "First Move Pro was restored.", tone: "success" };
    case "free":
      return {
        message: "No active Pro purchase was found. Your plan remains Free.",
        tone: "neutral",
      };
    case "unavailable":
      return {
        message: "Restore is unavailable until this signed-in account finishes loading.",
        tone: "error",
      };
    case "error":
      return {
        message: "Purchases could not be restored. Your current plan is unchanged.",
        tone: "error",
      };
  }
}

const styles = StyleSheet.create({
  feedback: { marginTop: spacing.xs },
  feedbackText: {
    color: colors.textMuted,
    fontSize: typography.small,
    lineHeight: 20,
  },
  success: { color: colors.success },
  error: { color: colors.danger },
});
