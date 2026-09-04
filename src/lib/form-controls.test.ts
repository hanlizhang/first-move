import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const applicationFormSources = [
  "src/app/auth-settings.tsx",
  "src/app/day-planner.tsx",
  "src/app/first-move-app.tsx",
];

test("application form controls expose stable id and name attributes", () => {
  const missing: string[] = [];
  for (const file of applicationFormSources) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/<(input|select|textarea)\b([^>]*)>/g)) {
      const attributes = match[2];
      if (!/\bid=/.test(attributes) || !/\bname=/.test(attributes)) {
        missing.push(`${file}:${match.index}:${match[1]}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

test("Focus keeps the pending First Move separate from Quick Countdown and optional review", () => {
  const source = readFileSync("src/app/first-move-app.tsx", "utf8");
  const focusPanel = source.slice(source.indexOf("function FocusPanel"), source.indexOf("function SessionReview"));
  const sessionReview = source.slice(source.indexOf("function SessionReview"), source.indexOf("function DailyReflection"));

  assert.match(focusPanel, /Pending First Move/);
  assert.match(focusPanel, /Start this First Move/);
  assert.match(focusPanel, /Quick Countdown/);
  assert.match(focusPanel, /No linked item/);
  assert.match(focusPanel, /buildFocusLinkOptions\(state, today\)/);
  assert.match(focusPanel, /focusLinkFields\(buildFocusLinkOptions\(current, localDateKey\(\)\), countdownLink\)/);
  assert.match(focusPanel, /focusLinkFields\(buildFocusLinkOptions\(current, localDateKey\(\)\), stopwatchLink\)/);
  assert.doesNotMatch(focusPanel, /state\.tasks\.map/);
  assert.doesNotMatch(focusPanel, /state\.habits\.map/);
  assert.match(focusPanel, /onClick=\{beginCountdown\}>Start countdown/);
  assert.ok(focusPanel.indexOf("Start this First Move") < focusPanel.indexOf("Quick Countdown"));
  assert.doesNotMatch(focusPanel, /Pending First Move: \{pendingIntent\.moveText\}/);
  assert.match(sessionReview, /useState\(false\)/);
  assert.match(sessionReview, /Saved automatically/);
  assert.match(sessionReview, /Edit details/);
  assert.match(sessionReview, /Save changes/);
  assert.match(sessionReview, /state\.tasks\.map/);
  assert.match(sessionReview, /state\.habits\.map/);
  assert.doesNotMatch(sessionReview, />Save session</);
});
