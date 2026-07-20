import assert from "node:assert/strict";
import test from "node:test";

import { createMockDayPlan } from "./day-planning.ts";
import { createEmptyState } from "./models.ts";
import { applyPlanningReview, makeReviewItemSmaller, planToReviewItems } from "./planning-review.ts";

test("planning review converts suggestions without saving them", () => {
  const state = createEmptyState();
  const items = planToReviewItems(createMockDayPlan("write report\nwalk"));
  assert.equal(state.tasks.length, 0); assert.equal(state.activityIntents.length, 0);
  assert.equal(items[0].group, "first-move"); assert.ok(items.every((item) => item.firstStep));
});

test("Make this smaller is local and shortens the selected duration", () => {
  const item = planToReviewItems(createMockDayPlan("write report"))[1];
  const smaller = makeReviewItemSmaller({ ...item, durationMinutes: 25 });
  assert.equal(smaller.durationMinutes, 10); assert.match(smaller.firstStep, /^Do only this first:/);
});

test("confirmation creates ordinary tasks and reuses the pending intent model", () => {
  const items = planToReviewItems(createMockDayPlan("write report\nwalk"));
  const state = applyPlanningReview(createEmptyState(), items);
  assert.equal(state.tasks.length, 2);
  assert.equal(state.activityIntents.length, 1);
  assert.equal(state.activityIntents[0].moveText, items[0].firstStep);
});
