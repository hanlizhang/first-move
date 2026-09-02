import "react-native-url-polyfill/auto";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppProvider } from "../app-state/app-provider.tsx";
import { colors } from "../theme/tokens.ts";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="tasks" />
          <Stack.Screen name="habits" />
          <Stack.Screen name="auth/callback" options={{ gestureEnabled: false }} />
        </Stack>
      </AppProvider>
    </SafeAreaProvider>
  );
}
