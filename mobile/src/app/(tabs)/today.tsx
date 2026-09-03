import { useRouter } from "expo-router";

import { useFirstMoveApp } from "../../app-state/app-provider.tsx";
import {
  Body,
  Card,
  Heading,
  Label,
  PrimaryButton,
  Screen,
  SecondaryButton,
} from "../../components/ui.tsx";

export default function TodayScreen() {
  const router = useRouter();
  const { auth, cloud, localWorkspace } = useFirstMoveApp();
  return (
    <Screen
      eyebrow="Today"
      title="Choose one useful thing"
      description="Tasks and Habits are available directly on this device. Other Today features arrive in later Mobile milestones."
    >
      <Card tone="primary">
        <Label>Tasks</Label>
        <Heading>{localWorkspace.tasks.length} editable on this device</Heading>
        <Body muted>Create, edit, complete, reopen, or remove an active Task.</Body>
        <PrimaryButton title="Open Tasks" onPress={() => router.push("/tasks")} />
      </Card>
      <Card>
        <Label>Habits</Label>
        <Heading>{localWorkspace.habits.length} editable on this device</Heading>
        <Body muted>Use a daily schedule or choose the weekdays that fit.</Body>
        <SecondaryButton title="Open Habits" onPress={() => router.push("/habits")} />
      </Card>
      {auth.status === "authenticated" && cloud.status === "ready" ? (
        <Card tone="success">
          <Label>Server-authoritative progress</Label>
          <Heading>{cloud.workspace.state.progress.points} verified points</Heading>
          <Body>
            Latest validated response · {cloud.workspace.state.progress.totalActiveDays} active days
          </Body>
        </Card>
      ) : null}
      <Card>
        <Label>Still outside M1E</Label>
        <Heading>Plan and timeline</Heading>
        <Body muted>Today history, daily-plan editing, Mini Journal, and Morning metadata remain later Mobile work.</Body>
      </Card>
    </Screen>
  );
}
