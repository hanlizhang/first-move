import { PlaceholderCard } from "../../components/placeholder.tsx";
import { Body, Card, Heading, Label, Screen } from "../../components/ui.tsx";

export default function FirstMovesScreen() {
  return (
    <Screen
      eyebrow="First Moves"
      title="What would help right now?"
      description="The M0 foundation keeps this path visible while the full local, manual First Move flow is ported in M1."
    >
      <PlaceholderCard
        label="Always available"
        title="I’m Stuck"
        body="No account, Morning Start, or AI will be required when this flow arrives in M1."
        action="Choose one small move"
      />
      <Card>
        <Label>Product boundary</Label>
        <Heading>Rest counts as a valid direction</Heading>
        <Body>
          Work & Study, Daily Life, Exercise & Movement, Intentional Entertainment, and Rest remain the exact shared directions.
        </Body>
      </Card>
    </Screen>
  );
}
