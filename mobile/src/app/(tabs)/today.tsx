import { useFirstMoveApp } from "../../app-state/app-provider.tsx";
import { PlaceholderCard } from "../../components/placeholder.tsx";
import { Body, Card, Heading, Label, Screen } from "../../components/ui.tsx";

export default function TodayScreen() {
  const { cloud } = useFirstMoveApp();
  return (
    <Screen eyebrow="Today" title="A small view of today" description="M0 navigation and verified read-only cloud state only.">
      {cloud.status === "ready" ? (
        <Card tone="success">
          <Label>Read-only cloud snapshot</Label>
          <Heading>{cloud.workspace.state.tasks.length} tasks in the canonical workspace</Heading>
          <Body>
            {cloud.workspace.state.habits.length} habits · {cloud.workspace.state.progress.totalActiveDays} active days · {cloud.workspace.state.progress.points} points
          </Body>
        </Card>
      ) : null}
      <PlaceholderCard
        label="M1"
        title="Today’s plan and timeline"
        body="Tasks, habits, Mini Journal, Morning metadata, and activity history stay read-only or unavailable in M0."
      />
    </Screen>
  );
}
