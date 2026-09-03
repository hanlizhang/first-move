import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createEmptyState } from "../domain/models.ts";
import { addTask } from "../domain/tasks-habits.ts";
import {
  GUEST_WORKSPACE_KEY,
  accountLocalWorkspaceKey,
  createMobileRepositoryWithStore,
  type AsyncKeyValueStore,
} from "../local/repository-core.ts";
import {
  WORKSPACE_STARTUP_SELECTION_KEY,
  createWorkspaceStartupController,
} from "./workspace-startup.ts";

function memoryStore(initial: ReadonlyMap<string, string> = new Map()) {
  const values = new Map(initial);
  const reads: string[] = [];
  const store: AsyncKeyValueStore = {
    async getItem(key) {
      reads.push(key);
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
  };
  return { reads, store, values };
}

test("clean Guest startup creates a ready local workspace without restoring auth", async () => {
  const memory = memoryStore();
  const repository = createMobileRepositoryWithStore(memory.store);
  const controller = createWorkspaceStartupController(memory.store, repository);
  let authRestoreCalls = 0;

  const selectedGuest = await controller.enterGuest();
  const restartedController = createWorkspaceStartupController(
    memory.store,
    repository,
  );
  const result = await restartedController.start(async () => {
    authRestoreCalls += 1;
    return { type: "SESSION_RESTORED", user: null };
  });

  assert.equal(selectedGuest?.mode, "guest");
  assert.equal(result?.mode, "guest");
  assert.equal(result?.mode === "guest" ? result.status : undefined, "ready");
  assert.equal(result?.mode === "guest" ? result.state.schemaVersion : undefined, 8);
  assert.deepEqual(result?.mode === "guest" ? result.state.tasks : undefined, []);
  assert.equal(authRestoreCalls, 0);
  assert.ok(memory.values.has(GUEST_WORKSPACE_KEY));
  assert.equal(memory.values.get(WORKSPACE_STARTUP_SELECTION_KEY), "guest");
});

test("existing Guest workspace is restored from only the Guest namespace", async () => {
  const memory = memoryStore();
  const repository = createMobileRepositoryWithStore(memory.store);
  const existing = addTask(
    createEmptyState(),
    { title: "Keep the local task", direction: "Work & Study" },
    () => "2026-09-02T08:00:00.000Z",
    () => "10000000-0000-4000-8000-000000000001",
  );
  await repository.saveGuestWorkspace(existing);
  await memory.store.setItem(WORKSPACE_STARTUP_SELECTION_KEY, "guest");
  await memory.store.setItem(
    accountLocalWorkspaceKey("account-a"),
    JSON.stringify({ version: 1, state: createEmptyState() }),
  );
  memory.reads.length = 0;

  const controller = createWorkspaceStartupController(memory.store, repository);
  const result = await controller.start(async () => {
    throw new Error("Supabase must not run for Guest startup");
  });

  assert.equal(result?.mode, "guest");
  assert.equal(
    result?.mode === "guest" ? result.state.tasks[0]?.title : undefined,
    "Keep the local task",
  );
  assert.deepEqual(memory.reads, [
    WORKSPACE_STARTUP_SELECTION_KEY,
    GUEST_WORKSPACE_KEY,
  ]);
});

test("offline Guest startup does not call the unavailable account bootstrap", async () => {
  const memory = memoryStore(
    new Map([[WORKSPACE_STARTUP_SELECTION_KEY, "guest"]]),
  );
  const repository = createMobileRepositoryWithStore(memory.store);
  const controller = createWorkspaceStartupController(memory.store, repository);

  const result = await controller.start(async () => {
    throw new Error("network offline");
  });

  assert.equal(result?.mode, "guest");
  assert.equal(result?.mode === "guest" ? result.status : undefined, "ready");
});

test("signed-in startup remains pending until account auth bootstrap resolves", async () => {
  const memory = memoryStore(
    new Map([[WORKSPACE_STARTUP_SELECTION_KEY, "account"]]),
  );
  const repository = createMobileRepositoryWithStore(memory.store);
  const controller = createWorkspaceStartupController(memory.store, repository);
  let resolveAuth: ((value: { type: "AUTHENTICATED"; user: { id: string } }) => void) | undefined;
  const auth = new Promise<{ type: "AUTHENTICATED"; user: { id: string } }>(
    (resolve) => {
      resolveAuth = resolve;
    },
  );
  let settled = false;

  const startup = controller.start(() => auth);
  void startup.then(() => {
    settled = true;
  });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(memory.reads.includes(GUEST_WORKSPACE_KEY), false);

  resolveAuth?.({ type: "AUTHENTICATED", user: { id: "account-a" } });
  const result = await startup;
  assert.deepEqual(result, {
    mode: "account",
    authEvent: { type: "AUTHENTICATED", user: { id: "account-a" } },
  });
});

test("sign-out account to Guest ignores disposed account work and resolves locally", async () => {
  const memory = memoryStore(
    new Map([[WORKSPACE_STARTUP_SELECTION_KEY, "account"]]),
  );
  const repository = createMobileRepositoryWithStore(memory.store);
  const controller = createWorkspaceStartupController(memory.store, repository);
  let resolveAccount: (() => void) | undefined;
  const disposedAccountBootstrap = new Promise<void>((resolve) => {
    resolveAccount = resolve;
  });
  const accountStartup = controller.start(async () => {
    await disposedAccountBootstrap;
    return {
      type: "AUTHENTICATED" as const,
      user: { id: "account-a" },
    };
  });

  await Promise.resolve();
  const guestStartup = await controller.enterGuest();
  resolveAccount?.();

  assert.equal(guestStartup?.mode, "guest");
  assert.equal(await accountStartup, undefined);
  assert.equal(memory.values.get(WORKSPACE_STARTUP_SELECTION_KEY), "guest");
  assert.equal(memory.reads.includes(accountLocalWorkspaceKey("account-a")), false);

  const provider = readFileSync(
    new URL("./app-provider.tsx", import.meta.url),
    "utf8",
  );
  const guestBoundary = provider.match(
    /const enterGuestBoundary[\s\S]*?const applyGuestStartup/,
  )?.[0];
  assert.match(guestBoundary ?? "", /syncRuntimeRef\.current\?\.dispose\(\)/);
  assert.match(guestBoundary ?? "", /accountBootstrapEnabledRef\.current = false/);
});
