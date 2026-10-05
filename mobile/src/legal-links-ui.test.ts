import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panelSource = readFileSync(
  new URL("./components/legal-links-panel.tsx", import.meta.url),
  "utf8",
);
const settingsSource = readFileSync(
  new URL("./app/(tabs)/settings.tsx", import.meta.url),
  "utf8",
);

test("Guest and authenticated Settings both render the legal links", () => {
  assert.match(settingsSource, /<LegalLinksPanel \/>/);
  assert.doesNotMatch(panelSource, /auth\.status/);
});

test("Settings links exactly the three public First Move pages", () => {
  assert.match(panelSource, /label="Privacy Policy"/);
  assert.match(panelSource, /label="Terms of Use"/);
  assert.match(panelSource, /label="Support"/);
  assert.match(panelSource, /accessibilityRole="link"/);
  assert.match(panelSource, /https:\/\/firstmovestartsmall\.com\/privacy/);
  assert.match(panelSource, /https:\/\/firstmovestartsmall\.com\/terms/);
  assert.match(panelSource, /https:\/\/firstmovestartsmall\.com\/support/);
  assert.match(panelSource, /Linking\.openURL/);
});
