import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const settings = readFileSync(new URL("./app/(tabs)/settings.tsx", import.meta.url), "utf8");
const account = readFileSync(new URL("./components/account-panel.tsx", import.meta.url), "utf8");
const legal = readFileSync(new URL("./components/legal-links-panel.tsx", import.meta.url), "utf8");

test("normal Settings sections use lightweight rows while account deletion stays separated", () => {
  assert.match(settings, /title="Settings"/);
  assert.match(account, /styles\.section/);
  assert.match(legal, /accessibilityRole="link"/);
  assert.match(legal, /minHeight: touchTarget/);
  assert.match(settings, /<AccountDeletionPanel \/>/);
  assert.doesNotMatch(account, /function Metric|styles\.metrics/);
});

test("Settings keeps its account, privacy, legal, and deletion sections without paid or AI controls", () => {
  const presentation = `${settings}\n${account}\n${legal}`;
  assert.doesNotMatch(presentation, /RevenueCat|paywall|Upgrade to Pro|Restore purchases|First Move Pro|AiAccessPanel|SubscriptionPanel/i);
  assert.doesNotMatch(account, /server checks|device workspace|local cache/i);
  assert.match(settings, /<AccountPanel \/>/);
  assert.match(settings, /<LegalLinksPanel \/>/);
  assert.match(settings, /<AccountDeletionPanel \/>/);
});
