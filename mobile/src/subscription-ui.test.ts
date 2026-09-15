import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const settingsSource = readFileSync(
  new URL("./app/(tabs)/settings.tsx", import.meta.url),
  "utf8",
);
const panelSource = readFileSync(
  new URL("./components/subscription-panel.tsx", import.meta.url),
  "utf8",
);
const nativeSource = readFileSync(
  new URL("./subscriptions/revenuecat-native.ts", import.meta.url),
  "utf8",
);

test("Settings includes the minimal authenticated and Guest Pro presentation", () => {
  assert.match(settingsSource, /<SubscriptionPanel\s*\/>/);
  for (const label of [
    "First Move Pro",
    "Current plan:",
    "Upgrade to Pro",
    "Restore purchases",
    "Sign in to purchase or restore",
    "Guest Mode remains fully functional",
  ]) {
    assert.match(panelSource, new RegExp(label));
  }
  assert.match(panelSource, /subscription\.status === "free"[\s\S]*?<PrimaryButton/);
});

test("the app delegates products and localized prices to the current RevenueCat Offering", () => {
  assert.match(nativeSource, /RevenueCatUI\.presentPaywall\(/);
  assert.doesNotMatch(nativeSource, /\boffering\s*:/i);
  assert.doesNotMatch(
    `${panelSource}\n${nativeSource}`,
    /firstmove_pro_(monthly|annual)|[$€£]\s*\d|\d+[.,]\d{2}\s*(USD|EUR|CHF|GBP)/i,
  );
});

test("dismissal and empty restore feedback stay neutral", () => {
  assert.match(panelSource, /case "cancelled":[\s\S]*?tone: "neutral"/);
  assert.match(panelSource, /case "free":[\s\S]*?plan remains Free[\s\S]*?tone: "neutral"/);
});
