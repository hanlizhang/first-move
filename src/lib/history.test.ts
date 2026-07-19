import assert from "node:assert/strict";
import test from "node:test";

import { getCalendarMonth, getDayDetail, getTrendSummary } from "./history.ts";
import { createEmptyState, type ActivitySession, type AppState } from "./models.ts";

function session(id: string, localDate: Date, status: ActivitySession["status"], direction: ActivitySession["direction"], minutes: number, mode: ActivitySession["mode"] = "stopwatch"): ActivitySession {
  return { id, mode, direction, label: id, status, startedAt: localDate.toISOString(), accumulatedElapsedMs: minutes * 60_000, actualElapsedMs: status === "completed" || status === "stopped" ? minutes * 60_000 : undefined, endedAt: status === "completed" || status === "stopped" ? localDate.toISOString() : undefined };
}

function withSessions(sessions: ActivitySession[]): AppState { return { ...createEmptyState(), sessions }; }

test("groups closed session time by the user's local date", () => {
  const lateLocal = new Date(2026, 6, 20, 0, 30);
  const summary = getTrendSummary(withSessions([session("local", lateLocal, "completed", "Rest", 10)]), "2026-07-20", 7);
  assert.equal(summary.daily.at(-1)?.totalMs, 600_000);
});

test("builds exact inclusive 7-day and 30-day ranges", () => {
  const seven = getTrendSummary(createEmptyState(), "2026-07-20", 7).daily;
  const thirty = getTrendSummary(createEmptyState(), "2026-07-20", 30).daily;
  assert.equal(seven.length, 7); assert.equal(seven[0].dateKey, "2026-07-14"); assert.equal(seven.at(-1)?.dateKey, "2026-07-20");
  assert.equal(thirty.length, 30); assert.equal(thirty[0].dateKey, "2026-06-21"); assert.equal(thirty.at(-1)?.dateKey, "2026-07-20");
});

test("totals categories and excludes running and paused sessions", () => {
  const date = new Date(2026, 6, 20, 12);
  const summary = getTrendSummary(withSessions([
    session("work", date, "completed", "Work & Study", 20, "countdown"),
    session("rest", date, "stopped", "Rest", 5),
    session("running", date, "running", "Daily Life", 30),
    session("paused", date, "paused", "Exercise & Movement", 30),
  ]), "2026-07-20", 7);
  assert.equal(summary.totalTrackedMs, 25 * 60_000);
  assert.equal(summary.byCategory["Work & Study"], 20 * 60_000);
  assert.equal(summary.byCategory.Rest, 5 * 60_000);
  assert.equal(summary.completedSessions, 1);
  assert.equal(summary.completedFirstMoves, 1);
});

test("calendar grid spans month boundaries and marks today", () => {
  const days = getCalendarMonth(createEmptyState(), 2026, 7, "2026-08-15");
  assert.equal(days.length, 42);
  assert.equal(days[0].dateKey, "2026-07-26");
  assert.equal(days.at(-1)?.dateKey, "2026-09-05");
  assert.equal(days.find((day) => day.dateKey === "2026-08-15")?.isToday, true);
});

test("selected-day detail includes tasks, habits, sessions, and Mini Journal", () => {
  const date = new Date(2026, 6, 20, 12);
  const state: AppState = {
    ...withSessions([session("done", date, "stopped", "Daily Life", 3)]),
    tasks: [{ id: "task", title: "Laundry", direction: "Daily Life", order: 0, createdAt: date.toISOString(), updatedAt: date.toISOString(), completedOn: ["2026-07-20"] }],
    habits: [{ id: "habit", title: "Stretch", direction: "Exercise & Movement", schedule: { kind: "daily" }, createdAt: date.toISOString(), updatedAt: date.toISOString(), completedOn: ["2026-07-20"] }],
    journalEntries: [{ dateKey: "2026-07-20", completed: "Showed up", updatedAt: date.toISOString() }],
  };
  const detail = getDayDetail(state, "2026-07-20");
  assert.equal(detail.completedTasks[0].title, "Laundry"); assert.equal(detail.habitCheckIns[0].title, "Stretch");
  assert.equal(detail.sessions[0].status, "stopped"); assert.equal(detail.journalEntry?.completed, "Showed up");
});

test("empty data returns zeroed summaries and selectable calendar dates", () => {
  const summary = getTrendSummary(createEmptyState(), "2026-07-20", 7);
  const detail = getDayDetail(createEmptyState(), "2026-07-20");
  assert.equal(summary.totalTrackedMs, 0); assert.equal(summary.activeDays, 0);
  assert.equal(detail.sessions.length, 0); assert.equal(detail.totalTrackedMs, 0);
  assert.equal(getCalendarMonth(createEmptyState(), 2026, 6)[10].isActive, false);
});
