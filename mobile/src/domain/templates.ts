import {
  DIRECTIONS,
  INTENDED_DURATIONS,
  STUCK_STATES,
  type Direction,
  type IntendedDuration,
  type StuckState,
} from "./models.ts";

export type FirstMoveStyle =
  | "choose"
  | "open"
  | "pause"
  | "place"
  | "prepare"
  | "tiny-action";

export interface FirstMoveTemplate {
  id: string;
  stuckStates: readonly StuckState[];
  directions: readonly Direction[];
  durationMinutes: readonly IntendedDuration[];
  suggestedDurationMinutes: IntendedDuration;
  style: FirstMoveStyle;
  text: string;
}

interface TemplateSeed {
  id: string;
  text: string;
  style: FirstMoveStyle;
  suggestedDurationMinutes: IntendedDuration;
  durationMinutes?: readonly IntendedDuration[];
}

export interface FirstMoveSelectionContext {
  stuckState: StuckState;
  direction: Direction;
  durationMinutes?: IntendedDuration;
  recentTemplateIds?: readonly string[];
}

const ALL_DURATIONS: readonly IntendedDuration[] = INTENDED_DURATIONS;
const FIVE_PLUS_MINUTES: readonly IntendedDuration[] = [5, 10, 25];

const directionCodes: Record<Direction, string> = {
  "Work & Study": "work",
  "Daily Life": "daily",
  "Exercise & Movement": "movement",
  "Intentional Entertainment": "entertainment",
  Rest: "rest",
};

const stuckStateCodes: Record<StuckState, string> = {
  "scrolling and unable to stop": "scrolling",
  "in bed and unable to get up": "in-bed",
  "knows what to do but cannot start": "cannot-start",
  "overwhelmed by a large task": "overwhelmed",
  "needs intentional rest": "needs-rest",
  "unsure what is needed": "unsure",
};

const directionSeeds: Record<Direction, readonly TemplateSeed[]> = {
  "Work & Study": [
    seed("open-file", "Find the exact place where you will begin and stop there.", "open", 2),
    seed("write-title", "Name the smallest result you could make in two minutes.", "choose", 2),
    seed("show-tab", "Bring the exact starting point into view.", "place", 2),
    seed("materials-within-reach", "Put what you need to begin within reach.", "prepare", 2),
    seed("easiest-list-item", "Choose one part you can start without finishing.", "choose", 2),
    seed("rough-first-sentence", "Make one rough attempt at the first step.", "tiny-action", 2),
  ],
  "Daily Life": [
    seed("put-away-three", "Choose one practical step you can finish in under two minutes.", "choose", 2),
    seed("dish-to-sink", "Place the first thing you will use where you can reach it.", "place", 2),
    seed("hand-sized-surface", "Spend two minutes preparing only what the first step needs.", "prepare", 2),
    seed("one-item-home", "Move one thing involved into its starting position.", "place", 2),
    seed("glass-of-water", "Make one part ready for the step that follows.", "prepare", 2),
    seed("prepare-household-tool", "Do the first visible action and stop after it is complete.", "tiny-action", 2),
  ],
  "Exercise & Movement": [
    seed("workout-clothes", "Put your body in the position where the movement begins.", "prepare", 2),
    seed("shoes-by-door", "Begin with the smallest range of motion that feels comfortable.", "tiny-action", 2),
    seed("thirty-second-stretch", "Stretch one part of your body gently for thirty seconds.", "tiny-action", 2),
    seed("one-slow-repetition", "Do one movement once, then decide whether to continue.", "tiny-action", 2),
    seed("clear-movement-space", "Start with two minutes at an easy, comfortable pace.", "tiny-action", 2),
    seed("ankle-circles", "Move one part of your body through a comfortable range once.", "tiny-action", 2),
  ],
  "Intentional Entertainment": [
    seed(
      "one-song",
      "Spend five minutes with one chosen activity before deciding whether to continue.",
      "tiny-action",
      5,
      FIVE_PLUS_MINUTES,
    ),
    seed("open-chosen-thing", "Choose one activity and make it ready to begin.", "prepare", 2),
    seed("choose-not-scroll", "Remove one competing option, then begin your choice.", "tiny-action", 2),
    seed("close-feed-open-choice", "Give one chosen activity your full attention for two minutes.", "tiny-action", 2),
    seed("first-two-minutes", "Begin one activity and stop at its first natural pause.", "tiny-action", 2),
    seed("choose-stopping-point", "Choose a stopping point, then begin one activity.", "choose", 2),
  ],
  Rest: [
    seed("eyes-closed", "Pause for two minutes without needing to decide what comes next.", "pause", 2),
    seed("phone-out-of-reach", "Reduce one source of stimulation you can control.", "tiny-action", 2),
    seed("dim-one-light", "Let one part of your body soften for thirty seconds.", "pause", 2),
    seed("three-breaths", "Take three slow breaths without trying to change anything.", "pause", 2),
    seed("supported-position", "Sit or lie somewhere your body feels supported.", "place", 2),
    seed("unclench-hands", "Rest your hands and let them unclench for thirty seconds.", "pause", 2),
  ],
};

const specificSeeds: Record<
  StuckState,
  Record<Direction, readonly TemplateSeed[]>
> = {
  "scrolling and unable to stop": {
    "Work & Study": [
      seed("close-feed-open-document", "Stop scrolling and bring the first part of the work into view.", "place", 2),
    ],
    "Daily Life": [
      seed("lock-phone-carry-dish", "Stop scrolling and place the first thing involved where you can reach it.", "place", 2),
    ],
    "Exercise & Movement": [
      seed("phone-down-stand-stretch", "Stop scrolling and change your body position once.", "tiny-action", 2),
    ],
    "Intentional Entertainment": [
      seed("feed-to-saved-choice", "Stop scrolling and choose one activity to begin on purpose.", "choose", 2),
    ],
    Rest: [
      seed("phone-away-three-breaths", "Stop scrolling and take three ordinary breaths before deciding what comes next.", "pause", 2),
    ],
  },
  "in bed and unable to get up": {
    "Work & Study": [
      seed("sit-up-material", "Sit up and put one work or study item within reach.", "prepare", 2),
    ],
    "Daily Life": [
      seed("feet-floor-carry-cup", "Sit up and place the first thing involved within reach.", "place", 2),
    ],
    "Exercise & Movement": [
      seed("bed-edge-shoulders", "Sit at the edge of the bed and roll your shoulders five times.", "tiny-action", 2),
    ],
    "Intentional Entertainment": [
      seed("sit-up-open-choice", "Sit up or stay where you are and make one chosen activity ready.", "prepare", 2),
    ],
    Rest: [
      seed("set-two-minute-rest", "Set a two-minute timer, close your eyes, and let staying in bed be the plan.", "pause", 2),
    ],
  },
  "knows what to do but cannot start": {
    "Work & Study": [
      seed("exact-work-item", "Do the first ten seconds of the step you already know.", "tiny-action", 2),
    ],
    "Daily Life": [
      seed("touch-first-object", "Put the first thing involved into position, then stop.", "place", 2),
    ],
    "Exercise & Movement": [
      seed("planned-movement-once", "Do the movement you planned exactly once.", "tiny-action", 2),
    ],
    "Intentional Entertainment": [
      seed("name-and-open-choice", "Name one activity, then make only that choice ready.", "prepare", 2),
    ],
    Rest: [
      seed("comfortable-two-minute-pause", "Make your resting position comfortable and set a two-minute pause.", "pause", 2),
    ],
  },
  "overwhelmed by a large task": {
    "Work & Study": [
      seed("task-title-tiny-action", "Write the task title and one action that takes under two minutes.", "tiny-action", 2),
    ],
    "Daily Life": [
      seed(
        "one-small-surface",
        "Choose one practical part and prepare only what it needs.",
        "prepare",
        5,
        FIVE_PLUS_MINUTES,
      ),
    ],
    "Exercise & Movement": [
      seed("one-gentle-repetition", "Choose one movement and do one gentle repetition.", "tiny-action", 2),
    ],
    "Intentional Entertainment": [
      seed(
        "deliberate-five-minute-break",
        "Choose one five-minute activity as a deliberate break from the task.",
        "choose",
        5,
        FIVE_PLUS_MINUTES,
      ),
    ],
    Rest: [
      seed(
        "write-what-can-wait",
        "Write down what can wait, then lie or sit somewhere comfortable.",
        "pause",
        5,
        FIVE_PLUS_MINUTES,
      ),
    ],
  },
  "needs intentional rest": {
    "Work & Study": [
      seed("resume-note-close-work", "Write one note about where to resume, then close the work.", "prepare", 2),
    ],
    "Daily Life": [
      seed("water-comfortable-place", "Place the first thing you will need later where you can find it, then pause.", "place", 2),
    ],
    "Exercise & Movement": [
      seed("gentle-stretch-settle", "Do one gentle stretch, then settle into rest.", "pause", 2),
    ],
    "Intentional Entertainment": [
      seed(
        "calm-choice-remove-options",
        "Choose one calm activity and put the other options away.",
        "choose",
        5,
        FIVE_PLUS_MINUTES,
      ),
    ],
    Rest: [
      seed(
        "five-minutes-unproductive",
        "Settle somewhere comfortable and let five minutes be unproductive.",
        "pause",
        5,
        FIVE_PLUS_MINUTES,
      ),
    ],
  },
  "unsure what is needed": {
    "Work & Study": [
      seed("relevant-item-in-front", "Put one work or study item directly in front of you.", "place", 2),
    ],
    "Daily Life": [
      seed("improve-arms-reach", "Choose one practical thing and put it in position for its next use.", "place", 2),
    ],
    "Exercise & Movement": [
      seed("shift-weight", "Shift your position gently once and pause.", "tiny-action", 2),
    ],
    "Intentional Entertainment": [
      seed("one-saved-option", "Choose the activity that sounds easiest to begin and prepare only that one.", "prepare", 2),
    ],
    Rest: [
      seed("no-decision-pause", "Pause for two minutes with no requirement to decide anything.", "pause", 2),
    ],
  },
};

const directionTemplates = DIRECTIONS.flatMap((direction) =>
  directionSeeds[direction].map((entry) =>
    toTemplate(`direction.${directionCodes[direction]}.${entry.id}`, [], [direction], entry),
  ),
);

const specificTemplates = STUCK_STATES.flatMap((stuckState) =>
  DIRECTIONS.flatMap((direction) =>
    specificSeeds[stuckState][direction].map((entry) =>
      toTemplate(
        `specific.${stuckStateCodes[stuckState]}.${directionCodes[direction]}.${entry.id}`,
        [stuckState],
        [direction],
        entry,
      ),
    ),
  ),
);

export const FIRST_MOVE_TEMPLATES: readonly FirstMoveTemplate[] = [
  ...directionTemplates,
  ...specificTemplates,
];

export function templatesFor(
  stuckState: StuckState,
  direction: Direction,
  durationMinutes?: IntendedDuration,
): FirstMoveTemplate[] {
  return FIRST_MOVE_TEMPLATES.filter(
    (template) =>
      template.directions.includes(direction) &&
      (template.stuckStates.length === 0 ||
        template.stuckStates.includes(stuckState)) &&
      (durationMinutes === undefined ||
        template.durationMinutes.includes(durationMinutes)),
  );
}

export function selectFirstMoveTemplate(
  context: FirstMoveSelectionContext,
): FirstMoveTemplate {
  const options = templatesFor(
    context.stuckState,
    context.direction,
    context.durationMinutes,
  );
  const recentIds = new Set(context.recentTemplateIds ?? []);
  const unseen = options.filter((template) => !recentIds.has(template.id));
  const available = unseen.length > 0 ? unseen : options;
  const specific = available.find((template) =>
    template.stuckStates.includes(context.stuckState),
  );
  const selected = specific ?? available[0];
  if (selected) return selected;

  const durationFallback = FIRST_MOVE_TEMPLATES.find(
    (template) =>
      template.directions.includes(context.direction) &&
      (context.durationMinutes === undefined ||
        template.durationMinutes.includes(context.durationMinutes)),
  );
  const directionFallback =
    durationFallback ??
    FIRST_MOVE_TEMPLATES.find((template) =>
      template.directions.includes(context.direction),
    );
  if (directionFallback) return directionFallback;

  throw new Error("The local First Move template library is incomplete.");
}

export function nextShorterDuration(
  duration: IntendedDuration,
): IntendedDuration {
  if (duration === 25) return 10;
  if (duration === 10) return 5;
  return 2;
}

function seed(
  id: string,
  text: string,
  style: FirstMoveStyle,
  suggestedDurationMinutes: IntendedDuration,
  durationMinutes: readonly IntendedDuration[] = ALL_DURATIONS,
): TemplateSeed {
  return { id, text, style, suggestedDurationMinutes, durationMinutes };
}

function toTemplate(
  id: string,
  stuckStates: readonly StuckState[],
  directions: readonly Direction[],
  entry: TemplateSeed,
): FirstMoveTemplate {
  return {
    id,
    stuckStates,
    directions,
    durationMinutes: entry.durationMinutes ?? ALL_DURATIONS,
    suggestedDurationMinutes: entry.suggestedDurationMinutes,
    style: entry.style,
    text: entry.text,
  };
}
