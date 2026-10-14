import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panelSource = readFileSync(
  new URL("./components/account-deletion-panel.tsx", import.meta.url),
  "utf8",
);
const settingsSource = readFileSync(
  new URL("./app/(tabs)/settings.tsx", import.meta.url),
  "utf8",
);

test("authenticated Settings exposes a discoverable deletion panel while Guest renders none", () => {
  assert.match(settingsSource, /<AccountDeletionPanel \/>/);
  assert.match(panelSource, /if \(auth\.status !== "authenticated"\) return null/);
  assert.match(panelSource, /title="Delete account"/);
});

test("deletion UX requires exact confirmation and a fresh email-link path", () => {
  assert.match(panelSource, /MOBILE_ACCOUNT_DELETION_CONFIRMATION/);
  assert.match(panelSource, /Email me a fresh sign-in link/);
  assert.match(panelSource, /within five minutes/);
  assert.match(panelSource, /Permanently delete account/);
});

test("deletion UX has no obsolete subscription warning or management action", () => {
  assert.doesNotMatch(panelSource, /subscription|Apple billing|RevenueCat|manageSubscription/i);
  assert.match(panelSource, /Permanently delete your First Move account and synced cloud data/);
});
