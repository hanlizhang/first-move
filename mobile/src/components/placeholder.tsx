import { Body, Card, Heading, Label, PrimaryButton } from "./ui.tsx";

export function PlaceholderCard({
  label,
  title,
  body,
  action,
}: {
  label: string;
  title: string;
  body: string;
  action?: string;
}) {
  return (
    <Card tone="primary">
      <Label>{label}</Label>
      <Heading>{title}</Heading>
      <Body>{body}</Body>
      {action ? <PrimaryButton disabled title={action} accessibilityHint="Available in M1" /> : null}
    </Card>
  );
}
