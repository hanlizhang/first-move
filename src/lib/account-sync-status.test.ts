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
    "preparing-backup": "Preparing backup",
    importing: "Importing",
    verifying: "Verifying",
    "cloud-copy-ready": "Cloud copy ready",
    offline: "Offline · saved locally",
    error: "Setup failed",
  };
  for (const [status, label] of Object.entries(labels) as [CloudSyncStatus, string][]) {
    assert.equal(accountSyncLabel(true, status), label);
  }
});

test("guest mode never claims a cloud-sync state", () => {
  assert.equal(accountSyncLabel(false, "cloud-copy-ready"), "Sign in to sync");
});

test("Phase B2 account labels never claim synchronization", () => {
  for (const status of ["not-initialized", "preparing-backup", "importing", "verifying", "cloud-copy-ready", "offline", "error"] as const) {
    assert.notEqual(accountSyncLabel(true, status), "Synced");
  }
});
