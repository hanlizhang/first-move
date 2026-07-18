import type { Direction, IntendedDuration, StuckState } from "./models.ts";
import { DIRECTIONS, STUCK_STATES } from "./models.ts";

export interface FirstMoveTemplate {
  id: string;
  stuckState: StuckState;
  direction: Direction;
  text: string;
  durationMinutes: 2 | 5 | 10 | 25;
}

type TemplateSeed = { text: string; durationMinutes: FirstMoveTemplate["durationMinutes"] };

const specificMoves: Record<StuckState, Record<Direction, TemplateSeed>> = {
  "scrolling and unable to stop": {
    "Work & Study": { text: "Put the phone face down and open one work or study item.", durationMinutes: 2 },
    "Daily Life": { text: "Put the phone down and place one nearby item where it belongs.", durationMinutes: 2 },
    "Exercise & Movement": { text: "Set the phone down, stand up, and stretch your arms overhead.", durationMinutes: 2 },
    "Intentional Entertainment": { text: "Choose one thing to watch or play, then close the scrolling feed.", durationMinutes: 5 },
    Rest: { text: "Put the phone out of reach and take five slow, ordinary breaths.", durationMinutes: 2 },
  },
  "in bed and unable to get up": {
    "Work & Study": { text: "Sit up and put the work item you need within reach.", durationMinutes: 2 },
    "Daily Life": { text: "Put both feet on the floor and choose one thing to carry with you.", durationMinutes: 2 },
    "Exercise & Movement": { text: "Sit at the edge of the bed and roll your shoulders five times.", durationMinutes: 2 },
    "Intentional Entertainment": { text: "Sit up and choose one specific five-minute entertainment activity.", durationMinutes: 5 },
    Rest: { text: "Adjust one thing—light, pillow, or blanket—to make rest intentional.", durationMinutes: 2 },
  },
  "knows what to do but cannot start": {
    "Work & Study": { text: "Open the exact file, page, or message needed for the task.", durationMinutes: 2 },
    "Daily Life": { text: "Touch the first object involved and move it one step forward.", durationMinutes: 2 },
    "Exercise & Movement": { text: "Put on shoes or clear a small space to move.", durationMinutes: 2 },
    "Intentional Entertainment": { text: "Name one entertainment choice and open only that choice.", durationMinutes: 5 },
    Rest: { text: "Set a two-minute pause and make your resting position comfortable.", durationMinutes: 2 },
  },
  "overwhelmed by a large task": {
    "Work & Study": { text: "Write the task title and one action that takes under two minutes.", durationMinutes: 2 },
    "Daily Life": { text: "Choose one visible square of space and clear only that area.", durationMinutes: 5 },
    "Exercise & Movement": { text: "Choose one movement and do it gently for two minutes.", durationMinutes: 2 },
    "Intentional Entertainment": { text: "Choose one five-minute activity as a deliberate break from the task.", durationMinutes: 5 },
    Rest: { text: "Write down what can wait, then rest without solving the whole task.", durationMinutes: 5 },
  },
  "needs intentional rest": {
    "Work & Study": { text: "Write one note about where to resume, then close the work.", durationMinutes: 2 },
    "Daily Life": { text: "Prepare water and one comfortable place to rest.", durationMinutes: 2 },
    "Exercise & Movement": { text: "Do one gentle stretch, then settle into rest.", durationMinutes: 2 },
    "Intentional Entertainment": { text: "Choose one calm five-minute activity and remove other options.", durationMinutes: 5 },
    Rest: { text: "Settle somewhere comfortable and let the next five minutes be unproductive.", durationMinutes: 5 },
  },
  "unsure what is needed": {
    "Work & Study": { text: "Open your task list and circle one item without starting it yet.", durationMinutes: 2 },
    "Daily Life": { text: "Look around and improve one thing within arm's reach.", durationMinutes: 2 },
    "Exercise & Movement": { text: "Stand up if comfortable and notice how your body wants to move.", durationMinutes: 2 },
    "Intentional Entertainment": { text: "Choose one specific thing that sounds enjoyable for five minutes.", durationMinutes: 5 },
    Rest: { text: "Pause for two minutes with no requirement to decide anything.", durationMinutes: 2 },
  },
};

const alternateMoves: Record<Direction, TemplateSeed> = {
  "Work & Study": { text: "Prepare one tool you need and stop after it is ready.", durationMinutes: 2 },
  "Daily Life": { text: "Do one visible action that makes the next action easier.", durationMinutes: 2 },
  "Exercise & Movement": { text: "Move gently in place for two minutes.", durationMinutes: 2 },
  "Intentional Entertainment": { text: "Choose one activity on purpose and give it five minutes.", durationMinutes: 5 },
  Rest: { text: "Make one small change that helps rest feel deliberate.", durationMinutes: 2 },
};

export const FIRST_MOVE_TEMPLATES: FirstMoveTemplate[] = STUCK_STATES.flatMap((stuckState) =>
  DIRECTIONS.flatMap((direction) => [
    { id: `${slug(stuckState)}-${slug(direction)}-1`, stuckState, direction, ...specificMoves[stuckState][direction] },
    { id: `${slug(stuckState)}-${slug(direction)}-2`, stuckState, direction, ...alternateMoves[direction] },
  ]),
);

export function templatesFor(stuckState: StuckState, direction: Direction): FirstMoveTemplate[] {
  return FIRST_MOVE_TEMPLATES.filter(
    (template) => template.stuckState === stuckState && template.direction === direction,
  );
}

export function nextShorterDuration(duration: IntendedDuration): IntendedDuration {
  if (duration === 25) return 10;
  if (duration === 10) return 5;
  return 2;
}

export function easierTemplateFor(
  stuckState: StuckState,
  direction: Direction,
  currentTemplateId?: string,
): FirstMoveTemplate {
  const options = templatesFor(stuckState, direction);
  const different = options.find((template) => template.id !== currentTemplateId);
  return different ?? options[0];
}

function slug(value: string): string {
  return value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
