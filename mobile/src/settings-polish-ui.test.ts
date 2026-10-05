import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const settings = readFileSync(new URL("./app/(tabs)/settings.tsx", import.meta.url), "utf8");
const account = readFileSync(new URL("./components/account-panel.tsx", import.meta.url), "utf8");
const legal = readFileSync(new URL("./components/legal-links-panel.tsx", import.meta.url), "utf8");
const subscription = readFileSync(new URL("./components/subscription-panel.tsx", import.meta.url), "utf8");
const ai = readFileSync(new URL("./components/ai-access-panel.tsx", import.meta.url), "utf8");

test("normal Settings sections use lightweight rows while account deletion stays separated", () => {
  assert.match(settings, /title="Settings"/);
  assert.match(account, /styles\.section/);
  assert.match(legal, /accessibilityRole="link"/);
  assert.match(legal, /minHeight: touchTarget/);
  assert.match(settings, /<AccountDeletionPanel \/>/);
  assert.doesNotMatch(account, /function Metric|styles\.metrics/);
});

test("Settings copy avoids implementation terminology while preserving purchase controls", () => {
  const presentation = `${account}\n${subscription}\n${ai}`;
  assert.doesNotMatch(
    presentation,
    /RevenueCat purchases|RevenueCat paywall|server checks|device workspace|local cache/i,
  );
  assert.match(subscription, /Upgrade to Pro/);
  assert.match(subscription, /Restore purchases/);
});
