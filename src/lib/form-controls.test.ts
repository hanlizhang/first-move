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
