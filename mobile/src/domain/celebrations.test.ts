import assert from "node:assert/strict";
import test from "node:test";

import {
  celebrationPreviewEvent,
  createCelebrationQueueState,
  deriveCelebrations,
  dismissCurrentCelebration,
  enqueueCelebrations,
  focusCompletionCelebration,
  setCelebrationQueueOwner,
  type CelebrationEvent,
} from "./celebrations.ts";
import {
  createEmptyState,
  type ActivitySession,
  type AppState,
  type RewardSource,
} from "./models.ts";

test("an ordinary positive reward derives one compact points celebration", () => {
  const before = createEmptyState();
  const after = withReward(before, "task", 5);

  const events = deriveCelebrations(before, after);

  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    accessibleLabel: "Task complete. +5 points.",
    id: "celebration:task:source-task:2026-10-05:points:0",
    kind: "points",
    level: 1,
    points: 5,
    priority: 100,
    sourceKey: "task:source-task:2026-10-05",
    sourceLabel: "Task complete",
  });
});

test("a negative Store ledger entry does not derive a celebration", () => {
  const before = createEmptyState();
  const after = withReward(before, "store", -25);

  assert.deepEqual(deriveCelebrations(before, after), []);
});

test("an Active Day and its points coalesce into one stronger event", () => {
  const before = activeDays(8);
  const after = withReward(activeDays(9), "habit", 5);

  const events = deriveCelebrations(before, after);

  assert.equal(events.length, 1);
  assert.equal(events[0]?.level, 2);
  assert.equal(events[0]?.kind, "active-day");
  assert.equal(events[0]?.activeDayDelta, 1);
  assert.equal(events[0]?.activeDayTotal, 9);
  assert.equal(events[0]?.points, 5);
  assert.match(events[0]?.accessibleLabel ?? "", /You showed up today/);
});

test("a Cat unlock derives one full-screen milestone event", () => {
  const before = activeDays(34);
  const after = activeDays(35);

  const [event] = deriveCelebrations(before, after);

  assert.equal(event?.level, 3);
  assert.equal(event?.kind, "milestone");
  assert.equal(event?.milestone?.day, 35);
  assert.equal(event?.milestone?.reward, "Cat food unlocked");
  assert.deepEqual(event?.milestone?.unlockedItemIds, ["cat-food"]);
});

test("milestone, Active Day, points, and item grants remain one related event", () => {
  const before = activeDays(99);
  const after = withReward(activeDays(100), "morning", 10);
  after.progress.unlockedMilestones = [100];
  after.progress.grantedMilestones = [100];
  after.inventory.items = [
    { itemId: "outdoor-garden", quantity: 1 },
    { itemId: "butterfly", quantity: 1 },
  ];

  const events = deriveCelebrations(before, after);

  assert.equal(events.length, 1);
  assert.equal(events[0]?.level, 3);
  assert.equal(events[0]?.activeDayDelta, 1);
  assert.equal(events[0]?.points, 10);
  assert.equal(events[0]?.milestone?.day, 100);
  assert.deepEqual(events[0]?.milestone?.unlockedItemIds, [
    "paw-shake",
    "outdoor-garden",
    "butterfly",
  ]);
});

test("the queue orders pending celebrations and exposes only one current event", () => {
  const points = celebrationPreviewEvent("points");
  const activeDay = celebrationPreviewEvent("active-day");
  const milestone = celebrationPreviewEvent("milestone");
  const queued = enqueueCelebrations(createCelebrationQueueState("guest"), [
    points,
    activeDay,
    milestone,
  ]);

  assert.equal(queued.current?.level, 3);
  assert.deepEqual(queued.pending.map((event) => event.level), [2, 1]);
  assert.equal("current" in queued, true);

  const next = dismissCurrentCelebration(queued);
  assert.equal(next.current?.level, 2);
  assert.deepEqual(next.pending.map((event) => event.level), [1]);
});

test("the queue deduplicates ids and isolates Guest and account presentation state", () => {
  const preview = celebrationPreviewEvent("milestone");
  const guest = enqueueCelebrations(createCelebrationQueueState("guest"), [preview]);
  const duplicate = enqueueCelebrations(guest, [preview]);

  assert.equal(duplicate, guest);
  const account = setCelebrationQueueOwner(duplicate, "account:user-1");
  assert.equal(account.ownerKey, "account:user-1");
  assert.equal(account.current, undefined);
  assert.deepEqual(account.pending, []);
  assert.deepEqual(account.seenIds, []);
  assert.deepEqual(account.completedSources, {});
});

test("completed and intentionally stopped Focus sessions derive supportive presentation events", () => {
  const completed = focusCompletionCelebration(focusSession("completed", 300_000));
  const stopped = focusCompletionCelebration(focusSession("stopped", 150_000));

  assert.equal(completed?.kind, "focus-completion");
  assert.equal(completed?.level, 2);
  assert.equal(completed?.sourceKey, "session:source-session:2026-10-05");
  assert.equal(completed?.focus?.durationMs, 300_000);
  assert.equal(completed?.focus?.linkedFirstMove, false);
  assert.match(completed?.accessibleLabel ?? "", /Session complete/);
  assert.equal(stopped?.focus?.outcome, "stopped");
  assert.match(stopped?.accessibleLabel ?? "", /stopped intentionally/);
  assert.equal(focusCompletionCelebration({
    ...focusSession("stopped", 150_000),
    status: "paused",
  }), undefined);
});

test("linked Focus completion is branded around the retained First Move context", () => {
  const completed = focusCompletionCelebration({
    ...focusSession("completed", 120_000),
    label: "Open the exact document.",
    linkedIntentId: "intent-local",
    targetDurationMinutes: 2,
  });
  const stopped = focusCompletionCelebration({
    ...focusSession("stopped", 45_000),
    label: "Open the exact document.",
    linkedIntentId: "intent-local",
    targetDurationMinutes: 2,
  });

  assert.equal(completed?.focus?.linkedFirstMove, true);
  assert.equal(completed?.focus?.label, "Open the exact document.");
  assert.match(completed?.accessibleLabel ?? "", /You made the first move/);
  assert.match(completed?.accessibleLabel ?? "", /Open the exact document/);
  assert.match(stopped?.accessibleLabel ?? "", /stopped when you chose/i);
  assert.match(stopped?.accessibleLabel ?? "", /time is saved/i);
});

test("a Focus moment merges with its later points and Active Day confirmation", () => {
  const focus = focusCompletionCelebration({
    ...focusSession("completed", 300_000),
    localDate: "2026-10-04",
  });
  assert.ok(focus);
  const confirmed = deriveCelebrations(
    activeDays(8),
    withReward(activeDays(9), "session", 5),
  );
  const withFocus = enqueueCelebrations(createCelebrationQueueState("guest"), [focus]);
  const merged = enqueueCelebrations(withFocus, confirmed);

  assert.equal(merged.current?.kind, "active-day");
  assert.equal(merged.current?.focus?.outcome, "completed");
  assert.equal(merged.current?.activeDayDelta, 1);
  assert.equal(merged.current?.points, 5);
  assert.equal(merged.current?.id, focus.id);
  assert.deepEqual(merged.pending, []);
  assert.match(merged.current?.accessibleLabel ?? "", /Session complete/);
  assert.match(merged.current?.accessibleLabel ?? "", /Active Day \+1/);
});

test("a linked First Move completion has one stable enqueue identity", () => {
  const focus = focusCompletionCelebration({
    ...focusSession("completed", 120_000),
    linkedIntentId: "intent-local",
  });
  assert.ok(focus);
  const once = enqueueCelebrations(createCelebrationQueueState("guest"), [focus]);
  const repeated = enqueueCelebrations(once, [focus]);

  assert.strictEqual(repeated, once);
  assert.equal(once.current?.id, "celebration:session:source-session:2026-10-05:focus-completion");
  assert.deepEqual(once.pending, []);
});

test("a linked First Move Stop and save cannot enqueue twice", () => {
  const focus = focusCompletionCelebration({
    ...focusSession("stopped", 45_000),
    linkedIntentId: "intent-local",
  });
  assert.ok(focus);
  const once = enqueueCelebrations(createCelebrationQueueState("guest"), [focus]);
  const repeated = enqueueCelebrations(once, [focus]);

  assert.strictEqual(repeated, once);
  assert.equal(once.current?.focus?.outcome, "stopped");
  assert.deepEqual(once.pending, []);
});

test("consuming the pending First Move cannot re-enqueue its closed session", () => {
  const completedSession = {
    ...focusSession("completed", 120_000),
    linkedIntentId: "intent-local",
  };
  const beforeIntentUpdate = focusCompletionCelebration(completedSession);
  const afterIntentUpdate = focusCompletionCelebration({ ...completedSession });
  assert.ok(beforeIntentUpdate);
  assert.ok(afterIntentUpdate);
  const once = enqueueCelebrations(createCelebrationQueueState("guest"), [
    beforeIntentUpdate,
  ]);
  const repeated = enqueueCelebrations(once, [afterIntentUpdate]);

  assert.equal(afterIntentUpdate.id, beforeIntentUpdate.id);
  assert.strictEqual(repeated, once);
});

test("authenticated canonical confirmation enriches instead of replaying Focus", () => {
  const focus = focusCompletionCelebration(focusSession("completed", 300_000));
  assert.ok(focus);
  const confirmed = deriveCelebrations(
    activeDays(8),
    withReward(activeDays(9), "session", 5),
  );
  const shown = enqueueCelebrations(createCelebrationQueueState("account:user-1"), [
    focus,
  ]);
  const enriched = enqueueCelebrations(shown, confirmed);
  const repeatedConfirmation = enqueueCelebrations(enriched, confirmed);

  assert.equal(enriched.current?.id, focus.id);
  assert.equal(enriched.current?.activeDayDelta, 1);
  assert.deepEqual(enriched.pending, []);
  assert.strictEqual(repeatedConfirmation, enriched);
});

test("Guest local Focus save remains one presentation without cloud rewards", () => {
  const before = createEmptyState();
  const after = structuredClone(before);
  after.sessions = [{
    ...focusSession("completed", 120_000),
    linkedIntentId: "intent-local",
  }];
  const focus = focusCompletionCelebration(after.sessions[0]!);
  assert.ok(focus);
  const localRewards = deriveCelebrations(before, after);
  const shown = enqueueCelebrations(createCelebrationQueueState("guest"), [
    ...localRewards,
    focus,
  ]);

  assert.deepEqual(localRewards, []);
  assert.equal(shown.current?.id, focus.id);
  assert.deepEqual(shown.pending, []);
});

test("a linked First Move completion and its reward remain one celebration", () => {
  const focus = focusCompletionCelebration({
    ...focusSession("completed", 120_000),
    label: "Open the exact document.",
    linkedIntentId: "intent-local",
    targetDurationMinutes: 2,
  });
  assert.ok(focus);
  const confirmed = deriveCelebrations(
    activeDays(8),
    withReward(activeDays(9), "session", 5),
  );
  const merged = enqueueCelebrations(
    enqueueCelebrations(createCelebrationQueueState("guest"), [focus]),
    confirmed,
  );

  assert.equal(merged.current?.focus?.linkedFirstMove, true);
  assert.equal(merged.current?.activeDayDelta, 1);
  assert.deepEqual(merged.pending, []);
  assert.match(merged.current?.accessibleLabel ?? "", /made the first move/i);
  assert.match(merged.current?.accessibleLabel ?? "", /Active Day \+1/);
});

test("a dismissed Focus source does not reopen at the same level but may upgrade to a milestone", () => {
  const focus = focusCompletionCelebration(focusSession("completed", 300_000));
  assert.ok(focus);
  const shown = enqueueCelebrations(createCelebrationQueueState("guest"), [focus]);
  const dismissed = dismissCurrentCelebration(shown);
  const sameLevel = deriveCelebrations(
    activeDays(8),
    withReward(activeDays(9), "session", 5),
  );
  const suppressed = enqueueCelebrations(dismissed, sameLevel);
  assert.equal(suppressed.current, undefined);

  const milestone = deriveCelebrations(
    activeDays(34),
    withReward(activeDays(35), "session", 5),
  );
  const upgraded = enqueueCelebrations(suppressed, milestone);
  assert.equal(upgraded.current?.level, 3);
  assert.equal(upgraded.current?.kind, "milestone");
});

test("one Focus completion coalesces points, Active Day, and milestone without restarting", () => {
  const focus = focusCompletionCelebration(focusSession("completed", 300_000));
  assert.ok(focus);
  const milestone = deriveCelebrations(
    activeDays(34),
    withReward(activeDays(35), "session", 5),
  );
  const merged = enqueueCelebrations(
    enqueueCelebrations(createCelebrationQueueState("account:user-1"), [focus]),
    milestone,
  );

  assert.equal(merged.current?.id, focus.id);
  assert.equal(merged.current?.kind, "milestone");
  assert.equal(merged.current?.points, 5);
  assert.equal(merged.current?.activeDayDelta, 1);
  assert.equal(merged.current?.milestone?.day, 35);
  assert.deepEqual(merged.pending, []);
});

test("two separate Focus sessions retain independent celebration identities", () => {
  const first = focusCompletionCelebration(focusSession("completed", 120_000));
  const second = focusCompletionCelebration({
    ...focusSession("completed", 180_000),
    id: "second-session",
  });
  assert.ok(first);
  assert.ok(second);
  const queued = enqueueCelebrations(createCelebrationQueueState("guest"), [
    first,
    second,
  ]);

  assert.equal(queued.current?.id, first.id);
  assert.deepEqual(queued.pending.map((event) => event.id), [second.id]);
});

test("equal hydrated or remounted state does not derive a celebration", () => {
  const state = withReward(activeDays(35), "task", 5);
  state.progress.unlockedMilestones = [21];
  state.progress.grantedMilestones = [21];
  const rehydrated = structuredClone(state);

  assert.deepEqual(deriveCelebrations(state, state), []);
  assert.deepEqual(deriveCelebrations(state, rehydrated), []);
});

test("a consumed Focus completion is not replayed after hydration or remount", () => {
  const focus = focusCompletionCelebration(focusSession("completed", 300_000));
  assert.ok(focus);
  const shown = enqueueCelebrations(createCelebrationQueueState("guest"), [focus]);
  const consumed = dismissCurrentCelebration(shown);
  const replay = enqueueCelebrations(consumed, [focus]);

  assert.strictEqual(replay, consumed);
  assert.equal(replay.current, undefined);
  assert.deepEqual(replay.pending, []);
});

test("derivation is presentation-only and leaves source state untouched", () => {
  const before = activeDays(20);
  const after = withReward(activeDays(21), "reflection", 5);
  after.progress.unlockedMilestones = [21];
  const beforeSnapshot = structuredClone(before);
  const afterSnapshot = structuredClone(after);

  const events: CelebrationEvent[] = deriveCelebrations(before, after);

  assert.equal(events[0]?.kind, "milestone");
  assert.deepEqual(before, beforeSnapshot);
  assert.deepEqual(after, afterSnapshot);
});

function activeDays(total: number): AppState {
  const state = createEmptyState();
  state.progress = {
    ...state.progress,
    activeDateKeys: Array.from({ length: total }, (_, index) =>
      `2026-09-${String(index + 1).padStart(2, "0")}`,
    ),
    totalActiveDays: total,
  };
  return state;
}

function withReward(
  state: AppState,
  source: RewardSource,
  points: number,
): AppState {
  const next = structuredClone(state);
  next.rewardEvents.push({
    id: `reward-${source}`,
    source,
    sourceId: `source-${source}`,
    dateKey: "2026-10-05",
    points,
    createdAt: "2026-10-05T12:00:00.000Z",
  });
  next.progress.points += points;
  return next;
}

function focusSession(
  status: "completed" | "stopped",
  actualElapsedMs: number,
): ActivitySession {
  return {
    id: "source-session",
    mode: "countdown",
    direction: "Work & Study",
    label: "Focus time",
    status,
    startedAt: "2026-10-05T11:55:00.000Z",
    localDate: "2026-10-05",
    accumulatedElapsedMs: actualElapsedMs,
    actualElapsedMs,
    endedAt: "2026-10-05T12:00:00.000Z",
  };
}
