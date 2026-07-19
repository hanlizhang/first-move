import assert from "node:assert/strict";
import test from "node:test";

import { normalizeAppState } from "./app-state.ts";
import { createEmptyState } from "./models.ts";
import { deleteReflection, saveReflection } from "./reflections.ts";
import { loadAppState, saveAppState, type StorageLike } from "./repository.ts";
import { REFLECTION_REWARD_POINTS } from "./rewards.ts";
import { getTodayTimeline } from "./summaries.ts";

const dateKey = "2026-07-20";
const firstClock = () => "2026-07-20T18:00:00.000Z";
const laterClock = () => "2026-07-20T19:00:00.000Z";

test("saves a partial daily reflection and awards its first-save reward", () => {
  const state = saveReflection(createEmptyState(), dateKey, { mood: 4, completed: "I opened the draft" }, firstClock);
  assert.equal(state.journalEntries.length, 1);
  assert.equal(state.journalEntries[0].energy, undefined);
  assert.equal(state.progress.points, REFLECTION_REWARD_POINTS);
  assert.equal(state.rewardEvents[0].id, `reflection:${dateKey}`);
  assert.deepEqual(state.progress.activeDateKeys, [dateKey]);
});

test("editing, deleting, and recreating never duplicates the daily reward", () => {
  const saved = saveReflection(createEmptyState(), dateKey, { completed: "Started" }, firstClock);
  const edited = saveReflection(saved, dateKey, { energy: 3, nextStep: "Continue tomorrow" }, laterClock);
  const deleted = deleteReflection(edited, dateKey);
  const recreated = saveReflection(deleted, dateKey, { difficult: "Getting started" }, laterClock);

  assert.equal(recreated.journalEntries.length, 1);
  assert.equal(recreated.journalEntries[0].difficult, "Getting started");
  assert.equal(recreated.rewardEvents.filter((event) => event.source === "reflection").length, 1);
  assert.equal(recreated.progress.points, REFLECTION_REWARD_POINTS);
  assert.deepEqual(recreated.progress.activeDateKeys, [dateKey]);
});

test("reflection survives repository persistence and appears once in Today", () => {
  const values = new Map<string, string>();
  const storage: StorageLike = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
  };
  const state = saveReflection(createEmptyState(), dateKey, { freeText: "A private note" }, firstClock);
  assert.equal(saveAppState(storage, state), true);
  const loaded = loadAppState(storage);
  const entries = getTodayTimeline(loaded, dateKey).filter((entry) => entry.kind === "reflection");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].points, REFLECTION_REWARD_POINTS);
});

test("malformed reflections are discarded and duplicate dates recover to one entry", () => {
  const recovered = normalizeAppState({
    journalEntries: [
      { dateKey, mood: 9, updatedAt: firstClock() },
      { dateKey, completed: "Earlier", updatedAt: firstClock() },
      { dateKey, completed: "Latest", updatedAt: laterClock() },
      { dateKey: "not-a-date", updatedAt: laterClock() },
    ],
  });
  assert.equal(recovered.journalEntries.length, 1);
  assert.equal(recovered.journalEntries[0].completed, "Latest");
});

test("an empty reflection is not stored or rewarded", () => {
  const state = saveReflection(createEmptyState(), dateKey, { completed: "   " }, firstClock);
  assert.equal(state.journalEntries.length, 0);
  assert.equal(state.rewardEvents.length, 0);
});
