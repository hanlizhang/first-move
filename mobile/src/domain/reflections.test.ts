import assert from "node:assert/strict";
import test from "node:test";

import { createEmptyState } from "./models.ts";
import {
  deleteReflection,
  REFLECTION_REWARD_POINTS,
  saveReflection,
} from "./reflections.ts";

const TODAY = "2026-09-04";
const NOW = "2026-09-04T18:30:00.000Z";

test("Guest reflection saves locally and rewards the date only once", () => {
  const initial = createEmptyState();
  const saved = saveReflection(
    initial,
    TODAY,
    { mood: 4, completed: "  Took one step  " },
    {
      rewardAuthority: "guest-local",
      clock: () => NOW,
      timezone: "Europe/Zurich",
    },
  );

  assert.equal(saved.journalEntries[0]?.completed, "Took one step");
  assert.equal(saved.progress.points, REFLECTION_REWARD_POINTS);
  assert.deepEqual(saved.progress.activeDateKeys, [TODAY]);
  assert.deepEqual(saved.rewardEvents[0], {
    id: `reflection:${TODAY}`,
    source: "reflection",
    sourceId: TODAY,
    dateKey: TODAY,
    timezone: "Europe/Zurich",
    points: REFLECTION_REWARD_POINTS,
    createdAt: NOW,
  });

  const edited = saveReflection(
    saved,
    TODAY,
    { energy: 2, nextStep: "Open the note" },
    { rewardAuthority: "guest-local", clock: () => NOW },
  );
  const deleted = deleteReflection(edited, TODAY);
  const recreated = saveReflection(
    deleted,
    TODAY,
    { whatHelped: "Returning" },
    { rewardAuthority: "guest-local", clock: () => NOW },
  );

  assert.equal(recreated.rewardEvents.filter((event) => event.source === "reflection").length, 1);
  assert.equal(recreated.progress.points, REFLECTION_REWARD_POINTS);
});

test("authenticated reflection mutations never calculate points or rewards on Mobile", () => {
  const initial = createEmptyState();
  initial.progress.points = 12.3;
  initial.rewardEvents = [
    {
      id: "existing",
      source: "session",
      sourceId: "session-id",
      dateKey: TODAY,
      points: 0.3,
      createdAt: NOW,
    },
  ];

  const saved = saveReflection(
    initial,
    TODAY,
    { difficult: "Starting", nextStep: "One minute" },
    { rewardAuthority: "server-authoritative", clock: () => NOW },
  );

  assert.equal(saved.journalEntries.length, 1);
  assert.equal(saved.progress.points, 12.3);
  assert.strictEqual(saved.rewardEvents, initial.rewardEvents);
});

test("reflection input is bounded and empty or invalid saves are ignored", () => {
  const initial = createEmptyState();
  assert.strictEqual(
    saveReflection(
      initial,
      "not-a-date",
      { freeText: "Words" },
      { rewardAuthority: "guest-local" },
    ),
    initial,
  );
  assert.strictEqual(
    saveReflection(
      initial,
      TODAY,
      { mood: 9 as 1, freeText: "   " },
      { rewardAuthority: "guest-local" },
    ),
    initial,
  );

  const saved = saveReflection(
    initial,
    TODAY,
    { freeText: `  ${"x".repeat(1_100)}  ` },
    { rewardAuthority: "server-authoritative", clock: () => NOW },
  );
  assert.equal(saved.journalEntries[0]?.freeText?.length, 1_000);
});
