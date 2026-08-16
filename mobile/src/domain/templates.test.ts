import assert from "node:assert/strict";
import test from "node:test";

import { DIRECTIONS, STUCK_STATES } from "./models.ts";
import {
  FIRST_MOVE_TEMPLATES,
  easierTemplateFor,
  nextShorterDuration,
  templatesFor,
} from "./templates.ts";

test("the local library covers every stuck state and exact PRD direction", () => {
  assert.deepEqual(DIRECTIONS, [
    "Work & Study",
    "Daily Life",
    "Exercise & Movement",
    "Intentional Entertainment",
    "Rest",
  ]);
  assert.equal(STUCK_STATES.length, 6);
  assert.ok(FIRST_MOVE_TEMPLATES.length >= STUCK_STATES.length * DIRECTIONS.length * 2);

  for (const stuckState of STUCK_STATES) {
    for (const direction of DIRECTIONS) {
      const templates = templatesFor(stuckState, direction);
      assert.ok(templates.length >= 2);
      assert.ok(templates.every((template) => template.text.trim().length > 0));
      assert.ok(
        templates.every((template) => [2, 5, 10, 25].includes(template.durationMinutes)),
      );
    }
  }
});

test("choose another cycles local templates and shorter duration reaches two minutes", () => {
  const options = templatesFor(
    "scrolling and unable to stop",
    "Daily Life",
  );
  const next = easierTemplateFor(
    "scrolling and unable to stop",
    "Daily Life",
    options[0]?.id,
  );
  assert.equal(next.id, options[1]?.id);
  assert.equal(nextShorterDuration(25), 10);
  assert.equal(nextShorterDuration(10), 5);
  assert.equal(nextShorterDuration(5), 2);
  assert.equal(nextShorterDuration(2), 2);
});

test("the shared water reset remains available for the same Web stuck states", () => {
  const text = "Put the phone down, stand up, and drink one glass of water.";
  for (const stuckState of [
    "scrolling and unable to stop",
    "in bed and unable to get up",
    "unsure what is needed",
  ] as const) {
    for (const direction of DIRECTIONS) {
      assert.ok(
        templatesFor(stuckState, direction).some(
          (template) => template.text === text,
        ),
      );
    }
  }
});
