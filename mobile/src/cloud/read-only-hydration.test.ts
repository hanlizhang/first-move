import assert from "node:assert/strict";
import test from "node:test";

import {
  CLOUD_WORKSPACE_STATUS_RPC,
  GET_CLOUD_WORKSPACE_RPC,
  hydrateInitializedWorkspace,
  type CloudRpcClient,
} from "./read-only-hydration.ts";
import { canonicalPayload, USER_ID } from "../test-fixtures/canonical.ts";
import type { MobileRepository } from "../local/repository.ts";

function repository() {
  const saves: { userId: string; hydratedAt: string }[] = [];
  const value: MobileRepository = {
    async loadLocalWorkspace() {
      throw new Error("not used");
    },
    async saveLocalWorkspace() {
      throw new Error("not used");
    },
    async updateLocalWorkspace() {
      throw new Error("not used");
    },
    async loadGuestWorkspace() {
      throw new Error("not used");
    },
    async saveGuestWorkspace() {
      throw new Error("not used");
    },
    async updateGuestWorkspace() {
      throw new Error("not used");
    },
    async loadCloudWorkspace() {
      return undefined;
    },
    async saveCloudWorkspace(userId, _workspace, hydratedAt) {
      saves.push({ userId, hydratedAt });
    },
  };
  return { value, saves };
}

test("empty authenticated account stops at status and exposes the M1 setup boundary", async () => {
  const calls: string[] = [];
  const local = repository();
  const result = await hydrateInitializedWorkspace(
    {
      async rpc(name) {
        calls.push(name);
        return { data: { initialized: false }, error: null };
      },
    },
    local.value,
    USER_ID,
  );
  assert.equal(result.status, "setup-unavailable");
  assert.deepEqual(calls, [CLOUD_WORKSPACE_STATUS_RPC]);
  assert.equal(local.saves.length, 0);
});

test("initialized account uses the exact canonical v2 RPC and caches only after validation", async () => {
  const calls: string[] = [];
  const local = repository();
  const client: CloudRpcClient = {
    async rpc(name) {
      calls.push(name);
      return name === CLOUD_WORKSPACE_STATUS_RPC
        ? { data: { initialized: true, choice: "import_local", status: "completed" }, error: null }
        : { data: canonicalPayload(), error: null };
    },
  };
  const result = await hydrateInitializedWorkspace(
    client,
    local.value,
    USER_ID,
    () => "2026-08-02T12:00:00.000Z",
  );
  assert.equal(result.status, "ready");
  assert.deepEqual(calls, [CLOUD_WORKSPACE_STATUS_RPC, GET_CLOUD_WORKSPACE_RPC]);
  assert.deepEqual(local.saves, [
    { userId: USER_ID, hydratedAt: "2026-08-02T12:00:00.000Z" },
  ]);
});

test("invalid canonical response is never cached and returns a privacy-safe error", async () => {
  const local = repository();
  const result = await hydrateInitializedWorkspace(
    {
      async rpc(name) {
        return name === CLOUD_WORKSPACE_STATUS_RPC
          ? { data: { initialized: true }, error: null }
          : { data: { private_payload: "journal-private-text" }, error: null };
      },
    },
    local.value,
    USER_ID,
  );
  assert.equal(result.status, "error");
  assert.equal(local.saves.length, 0);
  assert.doesNotMatch(JSON.stringify(result), /journal-private-text/);
});
