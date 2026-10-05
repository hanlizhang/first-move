import { StyleSheet, View } from "react-native";

import { useCelebrations } from "./celebration-provider.tsx";
import { Body, Card, Heading, Label, SecondaryButton } from "./ui.tsx";

export function CelebrationQaPanel() {
  const {
    previewCelebration,
    previewReducedMotion,
    setPreviewReducedMotion,
  } = useCelebrations();

  if (!__DEV__) return null;

  return (
    <Card tone="primary">
      <Label>Development preview</Label>
      <Heading>Celebration QA</Heading>
      <Body muted>
        Presentation only. These previews do not change progress, points,
        inventory, local data, or synced data.
      </Body>
      <View style={styles.actions}>
        <SecondaryButton
          onPress={() => previewCelebration("points")}
          title="Preview +points"
        />
        <SecondaryButton
          onPress={() => previewCelebration("active-day")}
          title="Preview Active Day"
        />
        <SecondaryButton
          onPress={() => previewCelebration("milestone")}
          title="Preview milestone"
        />
        <SecondaryButton
          onPress={() => previewCelebration("combined")}
          title="Preview combined"
        />
        <SecondaryButton
          onPress={() => previewCelebration("focus-completed")}
          title="Preview Focus complete"
        />
        <SecondaryButton
          onPress={() => previewCelebration("focus-stopped")}
          title="Preview Focus stopped"
        />
        <SecondaryButton
          onPress={() => setPreviewReducedMotion(!previewReducedMotion)}
          title={
            previewReducedMotion
              ? "Use system motion setting"
              : "Preview reduced motion"
          }
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 8 },
});
