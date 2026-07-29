import assert from "node:assert/strict";
import test from "node:test";

import { accountSyncLabel, type CloudSyncStatus } from "./account-sync-status.ts";

test("account chip distinguishes authentication from synchronization", () => {
  assert.equal(accountSyncLabel(false), "Sign in to sync");
  assert.equal(accountSyncLabel(true), "Set up sync");
});

test("account chip exposes every explicit cloud-sync state", () => {
  const labels: Record<CloudSyncStatus, string> = {
    "not-initialized": "Set up sync",
    importing: "Syncing…",
    synchronized: "Synced",
    offline: "Offline · saved locally",
    error: "Sync needs attention",
  };
  for (const [status, label] of Object.entries(labels) as [CloudSyncStatus, string][]) {
    assert.equal(accountSyncLabel(true, status), label);
  }
});

test("guest mode never claims a cloud-sync state", () => {
  assert.equal(accountSyncLabel(false, "synchronized"), "Sign in to sync");
});
