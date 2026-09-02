import { useFirstMoveApp } from "../../app-state/app-provider.tsx";
import { PlaceholderCard } from "../../components/placeholder.tsx";
import { Body, Card, Heading, Label, Screen } from "../../components/ui.tsx";

export default function CatScreen() {
  const { cloud } = useFirstMoveApp();
  return (
    <Screen eyebrow="Cat" title="Your gentle companion" description="No missed day can harm the cat or remove progress.">
      {cloud.status === "ready" ? (
        <Card tone="success">
          <Label>Canonical balance · read-only</Label>
          <Heading>{cloud.workspace.state.progress.points} points</Heading>
          <Body>{cloud.workspace.state.inventory.items.length} inventory item types loaded and verified.</Body>
        </Card>
      ) : null}
      <PlaceholderCard
        label="M1"
        title="Cat room and store presentation"
        body="M0 makes no purchases, consumptions, reward calculations, inventory writes, or milestone grants."
      />
    </Screen>
  );
}
