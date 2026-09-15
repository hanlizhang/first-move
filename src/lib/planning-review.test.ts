import assert from "node:assert/strict";
import test from "node:test";

import { createPendingIntent, getPendingIntent } from "./app-state.ts";
import { createMockDayPlan } from "./day-planning.ts";
import { createEmptyState } from "./models.ts";
import {
  applyConfirmedPlanFirstMove,
  applyPlanningReview,
  makeReviewItemSmaller,
  planToReviewItems,
} from "./planning-review.ts";
import { completeSession, startCountdown } from "./sessions.ts";

const clock = () => "2026-09-15T08:00:00.000Z";

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

test("confirmation creates ordinary tasks and makes the reviewed First Move pending", () => {
  const items = planToReviewItems(createMockDayPlan("write report\nwalk"));
  const state = applyPlanningReview(createEmptyState(), items);
  assert.equal(state.tasks.length, 2);
  assert.equal(state.activityIntents.length, 1);
  assert.deepEqual(
    pickExecutableFields(getPendingIntent(state)),
    pickReviewedFields(items[0]),
  );
});

test("confirmation safely supersedes an older pending First Move", () => {
  const oldPending = createPendingIntent(
    createEmptyState(),
    {
      stuckState: "knows what to do but cannot start",
      direction: "Daily Life",
      moveText: "Open the old document",
      intendedDurationMinutes: 5,
    },
    clock,
    () => "old-pending-intent",
  );
  const items = planToReviewItems(createMockDayPlan("write report\nwalk"));
  items[0] = {
    ...items[0],
    category: "Work & Study",
    firstStep: "Open the report outline",
    durationMinutes: 10,
  };

  const confirmed = applyConfirmedPlanFirstMove(
    oldPending,
    items,
    clock,
    () => "reviewed-first-move",
  );

  assert.equal(confirmed.activityIntents.length, 1);
  assert.equal(getPendingIntent(confirmed)?.id, "reviewed-first-move");
  assert.equal(confirmed.activityIntents.some((intent) => intent.id === "old-pending-intent"), false);
  assert.deepEqual(
    pickExecutableFields(getPendingIntent(confirmed)),
    pickReviewedFields(items[0]),
  );
});

test("Focus can immediately start the reviewed First Move", () => {
  const items = planToReviewItems(createMockDayPlan("write report"));
  const confirmed = applyConfirmedPlanFirstMove(
    createEmptyState(),
    items,
    clock,
    () => "reviewed-first-move",
  );
  const pending = getPendingIntent(confirmed);
  assert.ok(pending);

  const focused = startCountdown(
    confirmed,
    {
      direction: pending.direction,
      durationMinutes: pending.intendedDurationMinutes,
      label: pending.moveText,
      linkedIntentId: pending.id,
    },
    Date.parse(clock()),
    () => "reviewed-focus-session",
  );

  assert.deepEqual(
    focused.sessions.map((session) => ({
      direction: session.direction,
      durationMinutes: session.targetDurationMinutes,
      label: session.label,
      linkedIntentId: session.linkedIntentId,
    })),
    [{
      direction: items[0].category,
      durationMinutes: items[0].durationMinutes,
      label: items[0].firstStep,
      linkedIntentId: "reviewed-first-move",
    }],
  );
});

test("replacing the current pending intent leaves consumed session history untouched", () => {
  const firstIntent = createPendingIntent(
    createEmptyState(),
    {
      stuckState: "unsure what is needed",
      direction: "Daily Life",
      moveText: "Put one mug away",
      intendedDurationMinutes: 2,
    },
    clock,
    () => "consumed-intent",
  );
  const running = startCountdown(
    firstIntent,
    { durationMinutes: 2, linkedIntentId: "consumed-intent" },
    Date.parse(clock()),
    () => "historical-session",
  );
  const consumed = completeSession(
    running,
    "historical-session",
    Date.parse(clock()) + 120_000,
  );
  const withCurrentPending = createPendingIntent(
    consumed,
    {
      stuckState: "knows what to do but cannot start",
      direction: "Work & Study",
      moveText: "Old current move",
      intendedDurationMinutes: 5,
    },
    clock,
    () => "old-current-intent",
  );
  const historicalSessions = structuredClone(withCurrentPending.sessions);
  const historicalRewards = structuredClone(withCurrentPending.rewardEvents);

  const confirmed = applyConfirmedPlanFirstMove(
    withCurrentPending,
    planToReviewItems(createMockDayPlan("new work")),
    clock,
    () => "new-current-intent",
  );

  assert.deepEqual(confirmed.sessions, historicalSessions);
  assert.deepEqual(confirmed.rewardEvents, historicalRewards);
  assert.equal(confirmed.sessions[0]?.linkedIntentId, "consumed-intent");
  assert.equal(getPendingIntent(confirmed)?.id, "new-current-intent");
  assert.equal(confirmed.activityIntents.length, 1);
});

function pickExecutableFields(intent: ReturnType<typeof getPendingIntent>) {
  return intent && {
    direction: intent.direction,
    durationMinutes: intent.intendedDurationMinutes,
    moveText: intent.moveText,
  };
}

function pickReviewedFields(item: ReturnType<typeof planToReviewItems>[number]) {
  return {
    direction: item.category,
    durationMinutes: item.durationMinutes,
    moveText: item.firstStep,
  };
}
