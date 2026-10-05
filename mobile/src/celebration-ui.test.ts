import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const providerSource = readFileSync(
  new URL("./components/celebration-provider.tsx", import.meta.url),
  "utf8",
);
const qaSource = readFileSync(
  new URL("./components/celebration-qa-panel.tsx", import.meta.url),
  "utf8",
);
const layoutSource = readFileSync(
  new URL("./app/_layout.tsx", import.meta.url),
  "utf8",
);
const appProviderSource = readFileSync(
  new URL("./app-state/app-provider.tsx", import.meta.url),
  "utf8",
);
const settingsSource = readFileSync(
  new URL("./app/(tabs)/settings.tsx", import.meta.url),
  "utf8",
);
const syncRuntimeSource = readFileSync(
  new URL("./cloud/sync-runtime.ts", import.meta.url),
  "utf8",
);
const focusSource = readFileSync(
  new URL("./app/(tabs)/focus.tsx", import.meta.url),
  "utf8",
);

test("one global renderer presents compact, daily, and milestone levels", () => {
  assert.equal((providerSource.match(/<CelebrationRenderer/g) ?? []).length, 1);
  assert.match(providerSource, /event\.level === 1/);
  assert.match(providerSource, /event\.level === 2/);
  assert.match(providerSource, /PointsCelebration/);
  assert.match(providerSource, /ActiveDayCelebration/);
  assert.match(providerSource, /FocusCompletionCelebration/);
  assert.match(providerSource, /MilestoneCelebration/);
  assert.match(providerSource, /pointerEvents="none"/);
  assert.match(providerSource, /<Modal/);
});

test("reduced motion retains content while removing scale and rise motion", () => {
  assert.match(providerSource, /AccessibilityInfo\.isReduceMotionEnabled\(\)/);
  assert.match(providerSource, /"reduceMotionChanged"/);
  assert.match(providerSource, /reduceMotion \? 1 : 0\.94/);
  assert.match(providerSource, /reduceMotion \? 0 : 8/);
  assert.match(providerSource, /duration: reduceMotion \? 0 : 220/);
  assert.match(providerSource, /duration: reduceMotion \? 140 : 240/);
  assert.match(providerSource, /duration: reduceMotion \? 0 : 420/);
  assert.match(providerSource, /translateY: reduceMotion[\s\S]*?\? 0/);
  assert.match(providerSource, /forceReduceMotion=\{__DEV__ && previewReducedMotion\}/);
  assert.match(qaSource, /setPreviewReducedMotion\(!previewReducedMotion\)/);
});

test("Active Day and milestone moments use the pixel step scene and full-screen warm surfaces", () => {
  assert.match(providerSource, /function PixelStepScene/);
  assert.match(providerSource, /<PixelKitten/);
  assert.match(providerSource, /styles\.pixelPlatformOne/);
  assert.match(providerSource, /styles\.pixelPlatformTwo/);
  assert.match(providerSource, /styles\.pixelPlatformThree/);
  assert.match(providerSource, /styles\.rewardReveal/);
  assert.match(providerSource, /presentationStyle="overFullScreen"/);
  assert.match(providerSource, /styles\.dailyBackground/);
  assert.match(providerSource, /styles\.milestoneBackground/);
  assert.doesNotMatch(providerSource, /activeDaySheet|milestoneSheet/);
});

test("Focus completion is presentation-only and preserves normal Focus history", () => {
  assert.match(focusSource, /const \{ presentFocusCompletion \} = useCelebrations\(\)/);
  assert.match(focusSource, /completed\?\.status === "completed"[\s\S]*?presentFocusCompletion\(completed\)/);
  assert.match(focusSource, /candidate\?\.status === "completed" \|\| candidate\?\.status === "stopped"/);
  assert.match(focusSource, /if \(closedSession\) presentFocusCompletion\(closedSession\)/);
  assert.match(focusSource, /<SessionReview/);
  assert.doesNotMatch(focusSource, /previewCelebration|rewardEvents\.push|progress\.points/);
});

test("blocking celebrations expose a coherent summary and accessible Continue", () => {
  assert.match(providerSource, /accessibilityLabel=\{event\.accessibleLabel\}/);
  assert.match(providerSource, /AccessibilityInfo\.setAccessibilityFocus/);
  assert.match(providerSource, /accessibilityViewIsModal/);
  assert.match(providerSource, /accessibilityRole="button"/);
  assert.match(providerSource, />Continue</);
});

test("the provider surrounds app state and derives only after a successful action mutation", () => {
  assert.ok(layoutSource.indexOf("<CelebrationProvider>") < layoutSource.indexOf("<AppProvider>"));
  assert.match(appProviderSource, /const trackedRecipe = \(current: AppState\)/);
  assert.match(appProviderSource, /presentWorkspaceTransition\(ownerKey, transitionBefore, next\)/);
  const updateBoundary = appProviderSource.slice(
    appProviderSource.indexOf("const updateLocalWorkspace = useCallback"),
    appProviderSource.indexOf("const buyCatItem = useCallback"),
  );
  assert.match(updateBoundary, /presentWorkspaceTransition/);
  assert.match(updateBoundary, /owner\.kind === "guest" && transitionBefore/);
  assert.match(appProviderSource, /presentConfirmedTransition\(before, after\)/);
  assert.match(syncRuntimeSource, /presentConfirmedTransition\?\./);
  assert.ok(
    syncRuntimeSource.indexOf("queue.save(this.record)") <
      syncRuntimeSource.indexOf("presentConfirmedTransition?."),
  );
  assert.doesNotMatch(
    appProviderSource.slice(appProviderSource.indexOf("const buyCatItem = useCallback")),
    /presentWorkspaceTransition/,
  );
});

test("Celebration QA is development-only and has no durable mutation path", () => {
  assert.match(settingsSource, /__DEV__ \? <CelebrationQaPanel \/>/);
  assert.match(qaSource, /if \(!__DEV__\) return null/);
  for (const preview of [
    "points",
    "active-day",
    "milestone",
    "combined",
    "focus-completed",
    "focus-stopped",
  ]) {
    assert.match(qaSource, new RegExp(`previewCelebration\\(\"${preview}\"\\)`));
  }
  assert.doesNotMatch(
    qaSource,
    /updateLocalWorkspace|buyCatItem|feedCatFood|AsyncStorage|syncRuntime|inventory\.items|progress\./,
  );
});
