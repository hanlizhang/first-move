import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./app/(tabs)/focus.tsx", import.meta.url),
  "utf8",
);

test("Mobile Focus exposes the three independent Session entry paths", () => {
  assert.match(source, /Pending First Move/);
  assert.match(source, /Start this First Move/);
  assert.match(source, /Quick Countdown/);
  assert.match(source, /Start countdown/);
  assert.match(source, /Stopwatch/);
  assert.match(source, /Start stopwatch/);
  assert.ok(source.indexOf("Pending First Move") < source.indexOf("Quick Countdown"));
  assert.doesNotMatch(source, /cancelPendingIntent/);
});

test("Mobile Focus makes persistence automatic and review optional", () => {
  assert.match(source, /Saved automatically/);
  assert.match(source, /Edit details/);
  assert.match(source, /Save changes/);
  assert.doesNotMatch(source, /Save session/);
});

test("canonical link choices are gated to the current Supabase Auth UUID", () => {
  assert.match(source, /cloud\.userId === auth\.user\.id/);
  assert.match(source, /Synced read-only item/);
  assert.match(source, /cloud business data remains read-only/);
});
