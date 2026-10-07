import assert from "node:assert/strict";
import test from "node:test";

import {
  DIRECTIONS,
  INTENDED_DURATIONS,
  STUCK_STATES,
} from "./models.ts";
import {
  FIRST_MOVE_TEMPLATES,
  nextShorterDuration,
  selectFirstMoveTemplate,
  templatesFor,
} from "./templates.ts";

test("the safe local library has unique stable IDs and meaningful coverage", () => {
  assert.equal(FIRST_MOVE_TEMPLATES.length, 60);
  assert.equal(
    new Set(FIRST_MOVE_TEMPLATES.map((template) => template.id)).size,
    FIRST_MOVE_TEMPLATES.length,
  );
  assert.ok(
    FIRST_MOVE_TEMPLATES.every(
      (template) =>
        template.text.length <= 160 &&
        template.durationMinutes.includes(template.suggestedDurationMinutes),
    ),
  );

  for (const stuckState of STUCK_STATES) {
    for (const direction of DIRECTIONS) {
      const templates = templatesFor(stuckState, direction);
      assert.equal(templates.length, 7);
      assert.ok(templates.every((template) => template.text.trim().length > 0));
      assert.ok(
        templates.every(
          (template) =>
            template.directions.includes(direction) &&
            (template.stuckStates.length === 0 ||
              template.stuckStates.includes(stuckState)),
        ),
      );
    }
  }
});

test("default templates do not assume unsupported task media or objects", () => {
  const forbiddenByDirection: Record<(typeof DIRECTIONS)[number], RegExp> = {
    "Work & Study": /\b(file|tab|screen|message|document|device|type|typing)\b/i,
    "Daily Life": /\b(sink|dish|laundry|trash|clothes|cleaning)\b|household tool/i,
    "Exercise & Movement": /\b(shoes|gym|workout|window)\b/i,
    "Intentional Entertainment": /\b(book|game|movie|song|screen|controller|remote|watch|play|listen)\b/i,
    Rest: /\b(phone|light|blanket|pillow|notification|notifications)\b/i,
  };

  for (const template of FIRST_MOVE_TEMPLATES) {
    for (const direction of template.directions) {
      assert.doesNotMatch(template.text, forbiddenByDirection[direction]);
    }
    if (/\bbed\b/i.test(template.text)) {
      assert.ok(template.stuckStates.includes("in bed and unable to get up"));
    }
    if (/\bscroll(?:ing)?\b/i.test(template.text)) {
      assert.ok(template.stuckStates.includes("scrolling and unable to stop"));
    }
  }
});

test("every stuck state and Direction produces nonempty matching wording", () => {
  for (const stuckState of STUCK_STATES) {
    for (const direction of DIRECTIONS) {
      const selected = selectFirstMoveTemplate({ stuckState, direction });
      assert.ok(selected.text.trim());
      assert.ok(selected.directions.includes(direction));
      assert.ok(
        selected.stuckStates.length === 0 ||
          selected.stuckStates.includes(stuckState),
      );
    }
  }
});

test("two-minute selection excludes templates meant only for longer moves", () => {
  for (const stuckState of STUCK_STATES) {
    for (const direction of DIRECTIONS) {
      const options = templatesFor(stuckState, direction, 2);
      assert.ok(options.length >= 5 && options.length <= 7);
      assert.ok(options.every((template) => template.durationMinutes.includes(2)));
      const selected = selectFirstMoveTemplate({
        stuckState,
        direction,
        durationMinutes: 2,
      });
      assert.ok(selected.durationMinutes.includes(2));
    }
  }
});

test("recent templates are avoided while alternatives exist", () => {
  const context = {
    stuckState: "scrolling and unable to stop",
    direction: "Work & Study",
    durationMinutes: 2,
  } as const;
  const first = selectFirstMoveTemplate(context);
  const second = selectFirstMoveTemplate({
    ...context,
    recentTemplateIds: [first.id],
  });
  assert.notEqual(second.id, first.id);

  const specificIds = templatesFor(
    context.stuckState,
    context.direction,
    context.durationMinutes,
  )
    .filter((template) => template.stuckStates.length > 0)
    .map((template) => template.id);
  const directionFallback = selectFirstMoveTemplate({
    ...context,
    recentTemplateIds: specificIds,
  });
  assert.equal(directionFallback.stuckStates.length, 0);
  assert.ok(directionFallback.directions.includes(context.direction));
});

test("recent-history exhaustion gracefully reuses an eligible template", () => {
  const stuckState = "needs intentional rest" as const;
  const direction = "Rest" as const;
  const eligible = templatesFor(stuckState, direction, 5);
  const selected = selectFirstMoveTemplate({
    stuckState,
    direction,
    durationMinutes: 5,
    recentTemplateIds: eligible.map((template) => template.id),
  });
  assert.ok(eligible.some((template) => template.id === selected.id));
  assert.ok(selected.text.trim());
});

test("all supported durations select valid wording and shortening stops at two", () => {
  for (const durationMinutes of INTENDED_DURATIONS) {
    const selected = selectFirstMoveTemplate({
      stuckState: "unsure what is needed",
      direction: "Daily Life",
      durationMinutes,
    });
    assert.ok(selected.text.trim());
    assert.ok(selected.durationMinutes.includes(durationMinutes));
  }
  assert.equal(nextShorterDuration(25), 10);
  assert.equal(nextShorterDuration(10), 5);
  assert.equal(nextShorterDuration(5), 2);
  assert.equal(nextShorterDuration(2), 2);
});
