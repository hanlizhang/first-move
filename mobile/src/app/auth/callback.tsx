import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";

import { handleAuthCallback, type CallbackResult } from "../../auth/callback.ts";
import { getSupabaseClient } from "../../supabase/client.ts";
import { Body, Card, Heading, Label, LoadingState, PrimaryButton, Screen } from "../../components/ui.tsx";

export default function AuthCallbackScreen() {
  const callbackUrl = Linking.useLinkingURL();
  const router = useRouter();
  const handledUrl = useRef<string | undefined>(undefined);
  const [result, setResult] = useState<CallbackResult>();

  useEffect(() => {
    if (!callbackUrl || handledUrl.current === callbackUrl) return;
    handledUrl.current = callbackUrl;
    let active = true;
    let callbackAuth;
    try {
      callbackAuth = getSupabaseClient().auth;
    } catch {
      const timer = setTimeout(() => {
        setResult({
          status: "invalid",
          message: "Account services are not configured. Return to Settings to use Guest Mode.",
        });
      }, 0);
      return () => clearTimeout(timer);
    }
    void handleAuthCallback(callbackUrl, callbackAuth)
      .then((nextResult) => {
        if (!active) return;
        setResult(nextResult);
        Linking.clearInitialURL();
        if (nextResult.status === "success") {
          router.replace("/(tabs)/settings");
        }
      })
      .catch(() => {
        if (active) {
          setResult({
            status: "invalid",
            message: "This sign-in link is invalid or expired. Request a new link from Settings.",
          });
        }
      });
    return () => {
      active = false;
    };
  }, [callbackUrl, router]);

  return (
    <Screen eyebrow="Secure sign-in" title="Opening First Move">
      {!result ? (
        <LoadingState label="Finishing sign-in…" />
      ) : result.status === "invalid" ? (
        <Card tone="danger">
          <Label>Link needs attention</Label>
          <Heading>Request a new sign-in link</Heading>
          <Body>{result.message}</Body>
          <PrimaryButton title="Open Settings" onPress={() => router.replace("/(tabs)/settings")} />
        </Card>
      ) : (
        <Card tone="success">
          <Heading>Signed in</Heading>
          <Body>Loading your account state…</Body>
        </Card>
      )}
    </Screen>
  );
}
