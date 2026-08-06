import assert from "node:assert/strict";
import test from "node:test";

import { validateCanonicalWorkspace } from "../cloud/canonical-workspace.ts";
import { createEmptyState } from "../domain/models.ts";
import { canonicalPayload, USER_ID } from "../test-fixtures/canonical.ts";
import {
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
