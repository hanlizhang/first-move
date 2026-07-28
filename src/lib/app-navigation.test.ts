import assert from "node:assert/strict";
import test from "node:test";

import { APP_VIEW_LABELS, APP_VIEWS, plannerPresentation, visibleView } from "./app-navigation.ts";

test("only one main app view is visible", () => {
  for (const active of APP_VIEWS) assert.equal(Object.values(visibleView(active)).filter(Boolean).length, 1);
  assert.equal(APP_VIEW_LABELS.cat, "Cat Store");
  assert.equal(APP_VIEW_LABELS.settings, "Settings");
});

test("planner follows morning, new-plan, compact, and review states", () => {
  assert.equal(plannerPresentation(false, false, false), "morning");
  assert.equal(plannerPresentation(true, false, false), "full");
  assert.equal(plannerPresentation(true, true, false), "summary");
  assert.equal(plannerPresentation(true, true, true), "review");
});
