import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const accountPanel = readFileSync(
  new URL("./components/account-panel.tsx", import.meta.url),
  "utf8",
);
const provider = readFileSync(
  new URL("./app-state/app-provider.tsx", import.meta.url),
  "utf8",
);
const runtime = readFileSync(
  new URL("./cloud/sync-runtime.ts", import.meta.url),
  "utf8",
);
const hydration = readFileSync(
  new URL("./cloud/read-only-hydration.ts", import.meta.url),
  "utf8",
);

test("Mobile exposes honest authenticated sync states and manual retry", () => {
  for (const label of [
    "Loading cloud progress",
    "Cloud writes disabled",
    "Pending sync",
    "Syncing",
    "Synced",
    "Offline · retry pending",
    "Sync error",
  ]) {
    assert.match(accountPanel, new RegExp(label.replace("·", "\\·")));
  }
  assert.match(accountPanel, /Retry and refresh/);
  assert.match(provider, /syncRuntimeRef\.current\?\.retry\(\)/);
  assert.match(provider, /owner\.kind === "guest"/);
  assert.match(provider, /syncRuntimeRef\.current\?\.mutate\(recipe\)/);
});

test("Mobile reuses only the frozen Web Sync v1 RPC names", () => {
  assert.match(hydration, /cloud_workspace_status/);
  assert.match(hydration, /get_cloud_workspace_v2/);
  assert.match(runtime, /sync_cloud_workspace_v1/);
  assert.doesNotMatch(runtime, /initialize_cloud_workspace/);
  assert.doesNotMatch(runtime, /console\.(log|warn|error)/);
});
