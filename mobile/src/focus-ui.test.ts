import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./app/(tabs)/focus.tsx", import.meta.url),
  "utf8",
);
const pickerSource = readFileSync(
  new URL("./components/focus-link-picker.tsx", import.meta.url),
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

test("Focus links use the current owner authoritative working copy", () => {
  assert.match(source, /buildFocusLinkOptions\(localWorkspace, today\)/);
  assert.doesNotMatch(source, /canonicalState/);
  assert.match(pickerSource, /Working item/);
  assert.match(source, /owner-scoped retry queue|queue in order/);
});

test("Focus uses one compact searchable linked-item field", () => {
  assert.match(source, /FocusLinkPicker/);
  assert.doesNotMatch(source, /function LinkPicker/);
  assert.match(pickerSource, /Search Tasks and Habits/);
  assert.match(pickerSource, /No linked item/);
  assert.match(pickerSource, /Tasks/);
  assert.match(pickerSource, /Habits/);
  assert.match(pickerSource, /Selected/);
});
