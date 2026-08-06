import { PlaceholderCard } from "../../components/placeholder.tsx";
import { Screen } from "../../components/ui.tsx";

export default function FocusScreen() {
  return (
    <Screen eyebrow="Focus" title="One bounded session" description="Timer behavior and recovery remain a focused M1 port.">
      <PlaceholderCard
        label="M1"
        title="No session is running"
        body="Countdowns and stopwatches will preserve the existing timestamp, status, duration, UUID, date, and timezone contracts."
        action="Start a session"
      />
    </Screen>
  );
}
