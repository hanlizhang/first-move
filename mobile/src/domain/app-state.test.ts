import assert from "node:assert/strict";
import test from "node:test";

import {
  cancelPendingIntent,
  createPendingIntent,
  getPendingIntent,
  normalizeAppState,
} from "./app-state.ts";
import { createEmptyState } from "./models.ts";
import { isUuidV4 } from "./ids.ts";

const timestamp = "2026-08-09T09:00:00.000Z";

test("a template, edited, or manual move creates one validated pending intent", () => {
  const initial = createEmptyState();
  const created = createPendingIntent(
    initial,
    {
      stuckState: "knows what to do but cannot start",
      direction: "Work & Study",
      moveText: "  Open   the exact document.  ",
      intendedDurationMinutes: 5,
    },
    () => timestamp,
    () => "intent-local",
  );

  assert.deepEqual(getPendingIntent(created), {
    id: "intent-local",
    stuckState: "knows what to do but cannot start",
    direction: "Work & Study",
    moveText: "Open the exact document.",
    intendedDurationMinutes: 5,
    linkedTaskId: undefined,
    linkedHabitId: undefined,
    createdAt: timestamp,
    status: "pending",
  });
  assert.equal(
    createPendingIntent(created, {
      stuckState: "unsure what is needed",
      direction: "Rest",
      moveText: "Pause",
      intendedDurationMinutes: 2,
    }),
    created,
  );
});

test("default Mobile Intent IDs are canonical UUID v4 values", () => {
  const state = createPendingIntent(createEmptyState(), {
    stuckState: "unsure what is needed",
    direction: "Rest",
    moveText: "Take one breath",
    intendedDurationMinutes: 2,
  });
  assert.ok(state.activityIntents[0] && isUuidV4(state.activityIntents[0].id));
});

test("invalid pending intents are rejected and cancellation is neutral", () => {
  const state = createEmptyState();
  assert.equal(
    createPendingIntent(state, {
      stuckState: "unsure what is needed",
      direction: "Rest",
      moveText: "   ",
      intendedDurationMinutes: 2,
    }),
    state,
  );

  const created = createPendingIntent(
    state,
    {
      stuckState: "needs intentional rest",
      direction: "Rest",
      moveText: "Make one comfortable place to rest.",
      intendedDurationMinutes: 2,
    },
    () => timestamp,
    () => "intent-rest",
  );
  assert.equal(
    getPendingIntent(cancelPendingIntent(created, "intent-rest")),
    undefined,
  );
});

test("schema-v8 normalization preserves valid records and removes malformed ones", () => {
  const normalized = normalizeAppState({
    schemaVersion: 4,
    tasks: [
      {
        id: "task-valid",
        title: "Existing task",
        direction: "Daily Life",
        order: 4,
        createdAt: timestamp,
        updatedAt: timestamp,
        completedOn: [],
      },
      { id: "task-invalid", direction: "Not a direction" },
    ],
    habits: [],
    activityIntents: [
      {
        id: "intent-first",
        stuckState: "unsure what is needed",
        direction: "Rest",
        moveText: "Pause for two minutes.",
        intendedDurationMinutes: 2,
        createdAt: timestamp,
        status: "pending",
      },
      {
        id: "intent-second",
        stuckState: "needs intentional rest",
        direction: "Rest",
        moveText: "Set up a resting place.",
        intendedDurationMinutes: 5,
        createdAt: timestamp,
        status: "pending",
      },
      { id: "intent-invalid", moveText: "No contracts" },
    ],
    sessions: [],
    rewardEvents: [],
    journalEntries: [],
    morningChecks: [],
    morningAttempts: [],
    inventory: { items: [] },
    progress: { points: -10, journeyDay: 3 },
  });

  assert.equal(normalized.schemaVersion, 8);
  assert.equal(normalized.tasks.length, 1);
  assert.equal(normalized.tasks[0]?.order, 0);
  assert.equal(normalized.activityIntents.length, 1);
  assert.equal(normalized.activityIntents[0]?.id, "intent-first");
  assert.equal(normalized.progress.points, 0);
  assert.equal(normalized.progress.journeyDay, 3);
});

test("normalization retains historical intents while exposing only one pending pointer", () => {
  const baseIntent = {
    stuckState: "unsure what is needed" as const,
    direction: "Rest" as const,
    moveText: "Pause for two minutes.",
    intendedDurationMinutes: 2 as const,
    createdAt: timestamp,
  };
  const normalized = normalizeAppState({
    ...createEmptyState(),
    activityIntents: [
      { ...baseIntent, id: "intent-consumed", status: "consumed" },
      { ...baseIntent, id: "intent-pending", status: "pending" },
      { ...baseIntent, id: "intent-extra-pending", status: "pending" },
      { ...baseIntent, id: "intent-cancelled", status: "cancelled" },
    ],
  });

  assert.deepEqual(
    normalized.activityIntents.map(({ id, status }) => ({ id, status })),
    [
      { id: "intent-consumed", status: "consumed" },
      { id: "intent-pending", status: "pending" },
      { id: "intent-cancelled", status: "cancelled" },
    ],
  );
  assert.equal(getPendingIntent(normalized)?.id, "intent-pending");
});
