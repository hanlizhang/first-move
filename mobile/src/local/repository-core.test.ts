import assert from "node:assert/strict";
import test from "node:test";

import { validateCanonicalWorkspace } from "../cloud/canonical-workspace.ts";
import { createPendingIntent, getPendingIntent } from "../domain/app-state.ts";
import { localDateKey } from "../domain/dates.ts";
import { createEmptyState } from "../domain/models.ts";
import {
  addHabit,
  addTask,
  softDeleteTask,
  toggleHabitCompletion,
  toggleTaskCompletion,
} from "../domain/tasks-habits.ts";
import {
  getOpenSession,
  pauseSession,
  reconcileRunningCountdown,
  reviewSession,
  startCountdownFromIntent,
  startStopwatch,
  stopSession,
} from "../domain/sessions.ts";
import { canonicalPayload, TASK_ID, USER_ID } from "../test-fixtures/canonical.ts";
import {
  accountLocalWorkspaceKey,
  GUEST_WORKSPACE_KEY,
  cloudCacheKey,
  createMobileRepositoryWithStore,
  migrateGuestEnvelope,
} from "./repository-core.ts";

function memoryStore() {
  const values = new Map<string, string>();
  return {
    values,
    async getItem(key: string) {
      return values.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

test("guest migration wraps a legacy schema-v8 state and safely resets malformed data", () => {
  const legacy = createEmptyState();
  legacy.tasks = [
    {
      id: "local-task",
      title: "Guest task",
      direction: "Rest",
      order: 0,
      createdAt: "2026-08-02T08:00:00Z",
      updatedAt: "2026-08-02T08:00:00Z",
      completedOn: [],
    },
  ];
  assert.equal(migrateGuestEnvelope(legacy).state.tasks[0]?.title, "Guest task");
  assert.deepEqual(migrateGuestEnvelope({ broken: true }).state, createEmptyState());
});

test("guest migration repairs individual malformed records without discarding valid data", () => {
  const migrated = migrateGuestEnvelope({
    version: 1,
    state: {
      ...createEmptyState(),
      tasks: [
        {
          id: "kept",
          title: "Keep this task",
          direction: "Daily Life",
          order: 8,
          createdAt: "2026-08-09T08:00:00Z",
          updatedAt: "2026-08-09T08:00:00Z",
          completedOn: [],
        },
        { id: "removed", title: "Invalid", direction: "Other" },
      ],
    },
  });
  assert.equal(migrated.state.tasks.length, 1);
  assert.equal(migrated.state.tasks[0]?.id, "kept");
  assert.equal(migrated.state.tasks[0]?.order, 0);
});

test("serialized guest updates persist a pending intent without losing adjacent writes", async () => {
  const store = memoryStore();
  const repository = createMobileRepositoryWithStore(store);
  const first = repository.updateGuestWorkspace((state) =>
    createPendingIntent(
      state,
      {
        stuckState: "unsure what is needed",
        direction: "Rest",
        moveText: "Pause for two minutes.",
        intendedDurationMinutes: 2,
      },
      () => "2026-08-09T09:00:00Z",
      () => "intent-local",
    ),
  );
  const second = repository.updateGuestWorkspace((state) => ({
    ...state,
    progress: { ...state.progress, journeyDay: state.progress.journeyDay + 1 },
  }));

  await Promise.all([first, second]);
  const loaded = await repository.loadGuestWorkspace();
  assert.equal(getPendingIntent(loaded)?.id, "intent-local");
  assert.equal(loaded.progress.journeyDay, 1);
});

test("validated account cache is namespaced and never replaces guest data", async () => {
  const store = memoryStore();
  const repository = createMobileRepositoryWithStore(store);
  const guest = createEmptyState();
  guest.tasks = [
    {
      id: "local-only",
      title: "Local only",
      direction: "Rest",
      order: 0,
      createdAt: "2026-08-02T08:00:00Z",
      updatedAt: "2026-08-02T08:00:00Z",
      completedOn: [],
    },
  ];
  await repository.saveGuestWorkspace(guest);
  const guestBefore = store.values.get(GUEST_WORKSPACE_KEY);
  await repository.saveCloudWorkspace(
    USER_ID,
    validateCanonicalWorkspace(canonicalPayload()),
    "2026-08-02T12:00:00Z",
  );
  assert.equal(store.values.get(GUEST_WORKSPACE_KEY), guestBefore);
  assert.ok(store.values.has(cloudCacheKey(USER_ID)));
  assert.equal((await repository.loadCloudWorkspace(USER_ID))?.state.tasks[0]?.title, "Cloud task");
});

test("guest and authenticated local workspaces stay isolated without deletion or merging", async () => {
  const store = memoryStore();
  const repository = createMobileRepositoryWithStore(store);
  const guestOwner = { kind: "guest" } as const;
  const accountOwner = { kind: "account", userId: USER_ID } as const;

  await repository.updateLocalWorkspace(guestOwner, (state) =>
    createPendingIntent(
      state,
      {
        stuckState: "needs intentional rest",
        direction: "Rest",
        moveText: "Set up one quiet place.",
        intendedDurationMinutes: 2,
      },
      () => "2026-08-09T09:00:00Z",
      () => "guest-intent",
    ),
  );
  await repository.updateLocalWorkspace(accountOwner, (state) =>
    createPendingIntent(
      state,
      {
        stuckState: "knows what to do but cannot start",
        direction: "Work & Study",
        moveText: "Open the account document.",
        intendedDurationMinutes: 5,
      },
      () => "2026-08-09T09:01:00Z",
      () => "account-intent",
    ),
  );

  assert.equal(
    getPendingIntent(await repository.loadLocalWorkspace(guestOwner))?.id,
    "guest-intent",
  );
  assert.equal(
    getPendingIntent(await repository.loadLocalWorkspace(accountOwner))?.id,
    "account-intent",
  );
  assert.equal(
    getPendingIntent(
      await repository.loadLocalWorkspace({ kind: "account", userId: "account-b" }),
    ),
    undefined,
  );
  assert.ok(store.values.has(GUEST_WORKSPACE_KEY));
  assert.ok(store.values.has(accountLocalWorkspaceKey(USER_ID)));
});

test("an account-owned running or paused session restores from AsyncStorage", async () => {
  const store = memoryStore();
  const repository = createMobileRepositoryWithStore(store);
  const owner = { kind: "account", userId: USER_ID } as const;
  const startMs = Date.parse("2026-08-09T09:00:00.000Z");

  await repository.updateLocalWorkspace(owner, (state) =>
    startCountdownFromIntent(
      createPendingIntent(
        state,
        {
          stuckState: "overwhelmed by a large task",
          direction: "Daily Life",
          moveText: "Put one item in its place.",
          intendedDurationMinutes: 5,
        },
        () => new Date(startMs).toISOString(),
        () => "account-timer-intent",
      ),
      "account-timer-intent",
      startMs,
      () => "account-session",
    ),
  );
  assert.equal(
    getOpenSession(await repository.loadLocalWorkspace(owner))?.status,
    "running",
  );

  await repository.updateLocalWorkspace(owner, (state) =>
    pauseSession(state, "account-session", startMs + 45_000),
  );
  const restored = getOpenSession(await repository.loadLocalWorkspace(owner));
  assert.equal(restored?.status, "paused");
  assert.equal(restored?.accumulatedElapsedMs, 45_000);
});

test("completion is persisted before optional review and retains its historical intent", async () => {
  const store = memoryStore();
  const repository = createMobileRepositoryWithStore(store);
  const owner = { kind: "guest" } as const;
  const startMs = Date.parse("2026-08-09T09:00:00.000Z");

  await repository.updateLocalWorkspace(owner, (state) =>
    startCountdownFromIntent(
      createPendingIntent(
        state,
        {
          stuckState: "knows what to do but cannot start",
          direction: "Work & Study",
          moveText: "Open the saved draft.",
          intendedDurationMinutes: 2,
        },
        () => new Date(startMs).toISOString(),
        () => "persisted-intent",
      ),
      "persisted-intent",
      startMs,
      () => "persisted-session",
    ),
  );
  await repository.updateLocalWorkspace(owner, (state) =>
    reconcileRunningCountdown(state, startMs + 180_000),
  );

  const savedBeforeReview = await repository.loadLocalWorkspace(owner);
  assert.equal(savedBeforeReview.sessions[0]?.status, "completed");
  assert.equal(savedBeforeReview.sessions[0]?.actualElapsedMs, 120_000);
  assert.equal(savedBeforeReview.sessions[0]?.localDate, localDateKey(new Date(startMs)));
  assert.ok(savedBeforeReview.sessions[0]?.timezone);
  assert.equal(savedBeforeReview.sessions[0]?.reviewedAt, undefined);
  assert.equal(savedBeforeReview.activityIntents[0]?.status, "consumed");
  assert.equal(savedBeforeReview.activityIntents[0]?.moveText, "Open the saved draft.");

  await repository.updateLocalWorkspace(owner, (state) =>
    reviewSession(
      state,
      "persisted-session",
      { label: "Opened the saved draft", direction: "Work & Study" },
      startMs + 190_000,
    ),
  );
  const reviewed = await repository.loadLocalWorkspace(owner);
  assert.equal(reviewed.sessions[0]?.label, "Opened the saved draft");
  assert.equal(reviewed.sessions[0]?.actualElapsedMs, 120_000);
  assert.equal(reviewed.sessions[0]?.linkedIntentId, "persisted-intent");
});

test("standalone Stopwatch records stay isolated by local workspace owner", async () => {
  const store = memoryStore();
  const repository = createMobileRepositoryWithStore(store);
  const startMs = Date.parse("2026-08-09T09:00:00.000Z");
  const guestOwner = { kind: "guest" } as const;
  const accountOwner = { kind: "account", userId: USER_ID } as const;

  await repository.updateLocalWorkspace(guestOwner, (state) =>
    stopSession(
      startStopwatch(
        state,
        { direction: "Rest", label: "Guest pause" },
        startMs,
        () => "guest-stopwatch",
      ),
      "guest-stopwatch",
      startMs + 10_000,
    ),
  );
  await repository.updateLocalWorkspace(accountOwner, (state) =>
    stopSession(
      startStopwatch(
        state,
        { direction: "Daily Life", label: "Account tidy" },
        startMs,
        () => "account-stopwatch",
      ),
      "account-stopwatch",
      startMs + 20_000,
    ),
  );

  assert.deepEqual(
    (await repository.loadLocalWorkspace(guestOwner)).sessions.map(({ id }) => id),
    ["guest-stopwatch"],
  );
  assert.deepEqual(
    (await repository.loadLocalWorkspace(accountOwner)).sessions.map(({ id }) => id),
    ["account-stopwatch"],
  );
  assert.equal(
    (await repository.loadLocalWorkspace({ kind: "account", userId: "account-b" }))
      .sessions.length,
    0,
  );
});

test("M1D Task and Habit writes stay serialized in their local owner namespace", async () => {
  const store = memoryStore();
  const repository = createMobileRepositoryWithStore(store);
  const guestOwner = { kind: "guest" } as const;
  const accountOwner = { kind: "account", userId: USER_ID } as const;
  const taskId = "40000000-0000-4000-8000-000000000001";
  const habitId = "50000000-0000-4000-8000-000000000001";

  await repository.updateLocalWorkspace(guestOwner, (state) =>
    toggleTaskCompletion(
      addTask(
        state,
        { title: "Guest Task", direction: "Daily Life" },
        () => "2026-09-02T08:00:00.000Z",
        () => taskId,
      ),
      taskId,
      "2026-09-02",
      () => "2026-09-02T08:01:00.000Z",
    ),
  );
  await repository.updateLocalWorkspace(accountOwner, (state) =>
    toggleHabitCompletion(
      addHabit(
        state,
        {
          title: "Account Habit",
          direction: "Exercise & Movement",
          schedule: { kind: "daily" },
        },
        () => "2026-09-02T08:02:00.000Z",
        () => habitId,
      ),
      habitId,
      "2026-09-02",
      () => "2026-09-02T08:03:00.000Z",
    ),
  );
  await repository.saveCloudWorkspace(
    USER_ID,
    validateCanonicalWorkspace(canonicalPayload()),
    "2026-09-02T08:04:00.000Z",
  );

  assert.deepEqual((await repository.loadLocalWorkspace(guestOwner)).tasks, [
    {
      id: taskId,
      title: "Guest Task",
      direction: "Daily Life",
      order: 0,
      createdAt: "2026-09-02T08:00:00.000Z",
      updatedAt: "2026-09-02T08:01:00.000Z",
      completedOn: ["2026-09-02"],
    },
  ]);
  assert.equal((await repository.loadLocalWorkspace(guestOwner)).habits.length, 0);
  assert.equal((await repository.loadLocalWorkspace(accountOwner)).tasks.length, 0);
  assert.equal((await repository.loadLocalWorkspace(accountOwner)).habits[0]?.id, habitId);
  assert.equal((await repository.loadCloudWorkspace(USER_ID))?.state.tasks[0]?.id, TASK_ID);

  await repository.updateLocalWorkspace(guestOwner, (state) =>
    softDeleteTask(state, taskId),
  );
  assert.equal((await repository.loadLocalWorkspace(guestOwner)).tasks.length, 0);
  assert.equal((await repository.loadLocalWorkspace(accountOwner)).habits[0]?.id, habitId);
  assert.equal((await repository.loadCloudWorkspace(USER_ID))?.state.tasks[0]?.id, TASK_ID);
});
