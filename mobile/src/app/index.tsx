import { Redirect } from "expo-router";

import { useFirstMoveApp } from "../app-state/app-provider.tsx";
import { AccountPanel } from "../components/account-panel.tsx";
import { LoadingState, Screen } from "../components/ui.tsx";

export default function WelcomeScreen() {
  const { auth } = useFirstMoveApp();
  if (auth.status === "loading") {
    return (
      <Screen title="First Move">
        <LoadingState />
      </Screen>
    );
  }
  if (auth.status === "guest" || auth.status === "authenticated") {
    return <Redirect href="/(tabs)/first-moves" />;
  }
  return (
    <Screen
      eyebrow="A gentle beginning"
      title="Make one small move"
      description="Use Guest Mode without an account, or sign in to read an existing First Move cloud workspace."
    >
      <AccountPanel />
    </Screen>
  );
}
