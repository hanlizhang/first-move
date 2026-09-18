import assert from "node:assert/strict";
import test from "node:test";

import { getPendingIntent } from "./app-state.ts";
import {
  applyConfirmedPlanFirstMove,
  applyPlanningReview,
  planToReviewItems,
  upsertDailyPlan,
  validPlanningReview,
  type DayPlan,
} from "./day-planning.ts";
import { createEmptyState, type PlanningReviewItem } from "./models.ts";
import { getOpenSession, startCountdownFromIntent } from "./sessions.ts";

const OLD_INTENT = "10000000-0000-4000-8000-000000000001";
const REVIEW_IDS = [
  "20000000-0000-4000-8000-000000000002",
  "30000000-0000-4000-8000-000000000003",
  "40000000-0000-4000-8000-000000000004",
];
const TASK_ID = "50000000-0000-4000-8000-000000000005";
const INTENT_ID = "60000000-0000-4000-8000-000000000006";
const SESSION_ID = "70000000-0000-4000-8000-000000000007";

test("a reviewed plan creates tasks and one executable pending First Move", () => {
  const items = reviewItems();
  const ids = [TASK_ID, INTENT_ID];
  const next = applyPlanningReview(
    createEmptyState(),
    items,
    () => "2026-09-15T08:00:00.000Z",
    () => ids.shift()!,
  );
  const pending = getPendingIntent(next);
  assert.equal(next.tasks.length, 1);
  assert.equal(next.tasks[0]?.title, "Send report");
  assert.deepEqual(pending, {
    id: INTENT_ID,
    stuckState: "unsure what is needed",
    direction: "Work & Study",
    moveText: "Open the report draft.",
    intendedDurationMinutes: 2,
    linkedTaskId: undefined,
    linkedHabitId: undefined,
    createdAt: "2026-09-15T08:00:00.000Z",
    status: "pending",
  });
});

test("confirming a plan safely replaces an older pending move and Focus sees the new review", () => {
  const initial = {
    ...createEmptyState(),
    activityIntents: [
      {
        id: OLD_INTENT,
        stuckState: "needs intentional rest" as const,
        direction: "Rest" as const,
        moveText: "Old move",
        intendedDurationMinutes: 5 as const,
        createdAt: "2026-09-15T07:00:00.000Z",
        status: "pending" as const,
      },
    ],
  };
  const ids = [TASK_ID, INTENT_ID];
  const replaced = applyPlanningReview(
    initial,
    reviewItems(),
    () => "2026-09-15T08:00:00.000Z",
    () => ids.shift()!,
  );
  assert.equal(replaced.activityIntents.filter((intent) => intent.status === "pending").length, 1);
  assert.equal(replaced.activityIntents.some((intent) => intent.id === OLD_INTENT), false);

  const started = startCountdownFromIntent(
    replaced,
    INTENT_ID,
    Date.parse("2026-09-15T08:01:00.000Z"),
    () => SESSION_ID,
  );
  assert.equal(getOpenSession(started)?.label, "Open the report draft.");
  assert.equal(getOpenSession(started)?.linkedIntentId, INTENT_ID);
});

test("server plan review enforces one/three/three limits and persists canonical UUID items", () => {
  let index = 0;
  const items = planToReviewItems(plan(), () => REVIEW_IDS[index++]!);
  assert.equal(validPlanningReview(items), true);
  const plans = upsertDailyPlan([], { dateKey: "2026-09-15", items });
  assert.equal(plans[0]?.items.length, 3);
  assert.deepEqual(plans[0]?.items.map((item) => item.id), REVIEW_IDS);
  assert.equal(
    validPlanningReview([
      ...items,
      { ...items[1]!, id: "80000000-0000-4000-8000-000000000008" },
      { ...items[1]!, id: "90000000-0000-4000-8000-000000000009" },
      { ...items[1]!, id: "a0000000-0000-4000-8000-00000000000a" },
    ]),
    false,
  );
});

test("editing an existing plan replaces its pending First Move without duplicating tasks", () => {
  const created = applyPlanningReview(
    createEmptyState(),
    reviewItems(),
    () => "2026-09-15T08:00:00.000Z",
    sequentialIds([TASK_ID, INTENT_ID]),
  );
  const replacementIntentId = "b0000000-0000-4000-8000-00000000000b";
  const edited = applyConfirmedPlanFirstMove(
    created,
    reviewItems().map((item) =>
      item.group === "first-move"
        ? { ...item, firstStep: "Open the revised report." }
        : { ...item, title: "Send revised report" },
    ),
    () => "2026-09-15T09:00:00.000Z",
    () => replacementIntentId,
  );

  assert.equal(edited.tasks.length, 1);
  assert.equal(edited.tasks[0]?.title, "Send report");
  assert.equal(getPendingIntent(edited)?.id, replacementIntentId);
  assert.equal(getPendingIntent(edited)?.moveText, "Open the revised report.");
});

function reviewItems(): PlanningReviewItem[] {
  return [
    {
      id: REVIEW_IDS[0]!,
      group: "first-move",
      title: "Begin report",
      firstStep: "Open the report draft.",
      category: "Work & Study",
      durationMinutes: 2,
    },
    {
      id: REVIEW_IDS[1]!,
      group: "priority",
      title: "Send report",
      firstStep: "Read the first paragraph.",
      category: "Work & Study",
      durationMinutes: 10,
    },
  ];
}

function plan(): DayPlan {
  return {
    firstMove: {
      title: "Begin report",
      firstStep: "Open the report draft.",
      category: "Work & Study",
      durationMinutes: 2,
    },
    priorityTasks: [
      {
        title: "Send report",
        firstStep: "Read the first paragraph.",
        category: "Work & Study",
        durationMinutes: 10,
      },
    ],
    optionalTasks: [
      {
        title: "Take a walk",
        firstStep: "Put on shoes.",
        category: "Exercise & Movement",
        durationMinutes: 5,
      },
    ],
    suggestedCategory: "Work & Study",
    suggestedDuration: 2,
  };
}

function sequentialIds(ids: string[]): () => string {
  return () => ids.shift()!;
}
