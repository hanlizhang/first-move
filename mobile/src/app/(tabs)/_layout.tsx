import { Tabs } from "expo-router";
import { Text } from "react-native";

import { colors, typography } from "../../theme/tokens.ts";

const icons: Record<string, string> = {
  "first-moves": "●",
  today: "□",
  focus: "◎",
  cat: "◇",
  settings: "⚙",
};

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, minHeight: 62 },
        tabBarIcon: ({ color }) => (
          <Text accessibilityElementsHidden style={{ color, fontSize: typography.body }}>
            {icons[route.name] ?? "•"}
          </Text>
        ),
      })}
    >
      <Tabs.Screen name="first-moves" options={{ title: "First Moves" }} />
      <Tabs.Screen name="today" options={{ title: "Today" }} />
      <Tabs.Screen name="focus" options={{ title: "Focus" }} />
      <Tabs.Screen name="cat" options={{ title: "Cat" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}
