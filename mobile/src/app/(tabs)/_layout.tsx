import { Tabs, useGlobalSearchParams, usePathname } from "expo-router";
import { Text } from "react-native";

import { useFirstMoveApp } from "../../app-state/app-provider.tsx";
import { getOpenSession } from "../../domain/sessions.ts";
import { colors, typography } from "../../theme/tokens.ts";

const icons: Record<string, string> = {
  "first-moves": "●",
  today: "□",
  focus: "◎",
  cat: "◇",
  settings: "⚙",
};

export default function TabsLayout() {
  const pathname = usePathname();
  const { visualPreview } = useGlobalSearchParams<{ visualPreview?: string }>();
  const { localWorkspace } = useFirstMoveApp();
  const onFocus = pathname.endsWith("/focus");
  const previewActive =
    __DEV__ && (visualPreview === "running" || visualPreview === "paused");
  const hideFocusTabs =
    onFocus && (Boolean(getOpenSession(localWorkspace)) || previewActive);

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
        tabBarStyle: hideFocusTabs
          ? { display: "none" }
          : {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
              minHeight: 62,
            },
        tabBarIcon: ({ color }) => (
          <Text accessibilityElementsHidden style={{ color, fontSize: typography.body }}>
            {icons[route.name] ?? "•"}
          </Text>
        ),
      })}
    >
      <Tabs.Screen
        name="first-moves"
        options={{
          tabBarAccessibilityLabel: "First Move",
          title: "First Move",
        }}
      />
      <Tabs.Screen name="today" options={{ title: "Today" }} />
      <Tabs.Screen name="focus" options={{ title: "Focus" }} />
      <Tabs.Screen name="cat" options={{ title: "Cat" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}
