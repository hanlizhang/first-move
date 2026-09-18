import { StyleSheet, Text, View } from "react-native";

import { mobileAiAccessPresentation } from "../ai/access.ts";
import { useFirstMoveApp } from "../app-state/app-provider.tsx";
import { colors, spacing, typography } from "../theme/tokens.ts";
import { Body, Card, Heading, Label, SecondaryButton } from "./ui.tsx";

export function AiAccessPanel() {
  const { aiAccess, refreshAiAccess } = useFirstMoveApp();
  const presentation = mobileAiAccessPresentation(aiAccess);
  return (
    <Card tone={presentation.tone === "success" ? "success" : "default"}>
      <Label>First Move AI</Label>
      <Heading>{presentation.heading}</Heading>
      <Body muted>{presentation.summary}</Body>
      {presentation.allowances.length > 0 ? (
        <View style={styles.allowances}>
          {presentation.allowances.map((allowance) => (
            <Text key={allowance} style={styles.allowance}>
              {allowance}
            </Text>
          ))}
        </View>
      ) : null}
      {aiAccess.status !== "guest" ? (
        <SecondaryButton
          disabled={aiAccess.status === "loading"}
          onPress={() => void refreshAiAccess()}
          title={aiAccess.status === "loading" ? "Checking…" : "Refresh AI access"}
        />
      ) : null}
      <Body muted>
        The server checks access again before every live request. Purchase status shown elsewhere never authorizes AI.
      </Body>
    </Card>
  );
}

const styles = StyleSheet.create({
  allowances: { gap: spacing.xs },
  allowance: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 21,
  },
});
