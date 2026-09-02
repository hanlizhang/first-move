import assert from "node:assert/strict";
import test from "node:test";

import { validateCanonicalWorkspace } from "../cloud/canonical-workspace.ts";
import { createPendingIntent, getPendingIntent } from "../domain/app-state.ts";
import { createEmptyState } from "../domain/models.ts";
import {
  getOpenSession,
  pauseSession,
  startCountdownFromIntent,
} from "../domain/sessions.ts";
import { canonicalPayload, USER_ID } from "../test-fixtures/canonical.ts";
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
