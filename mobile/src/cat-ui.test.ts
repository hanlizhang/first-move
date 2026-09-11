import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./app/(tabs)/cat.tsx", import.meta.url),
  "utf8",
);
const pixelKittenSource = readFileSync(
  new URL("./components/pixel-kitten.tsx", import.meta.url),
  "utf8",
);
const domainSource = readFileSync(
  new URL("./domain/cat.ts", import.meta.url),
  "utf8",
);
const providerSource = readFileSync(
  new URL("./app-state/app-provider.tsx", import.meta.url),
  "utf8",
);

test("Mobile Cat presents a real room, store, balance, progress, and inventory", () => {
  for (const label of [
    "Cat Room",
    "Current points",
    "Growth chapter",
    "active day",
    "Owned things",
    "Store",
    "Food",
    "Toys",
    "Furniture",
    "Tricks",
  ]) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /getCatRoomView\(localWorkspace, today\)/);
  assert.match(source, /PixelKitten/);
});

test("approved furnishings are selectable and render as static room objects", () => {
  for (const itemId of [
    "cat-bed",
    "window-cushion",
    "scratching-post",
    "cat-tree",
  ]) {
    assert.match(source, new RegExp(itemId));
  }
  for (const label of [
    "Cat bed in room",
    "Window perch in room",
    "Scratching post in room",
    "Cat tree in room",
  ]) {
    assert.match(source, new RegExp(label));
  }
});

test("owned Cat v1B items expose visible, ownership-gated actions", () => {
  for (const label of [
    "Feed ",
    "Sit together",
    "Explore room",
    "Nap",
    "Play with yarn",
    "Chase toy mouse",
    "Play with teaser wand",
    "End wand play",
    "Scratch",
    "Watch from perch",
    "Climb / perch",
    "High-five",
    "Paw shake",
    "Visit garden",
    "Return to room",
    "Follow butterfly",
    "Room furniture",
    "Clear furnishing",
  ]) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /selectCatFurniture/);
  assert.match(source, /foodPose/);
  assert.match(source, /catInteractionAvailability\(ownedItemIds, room\.selectedFurniture\?\.id\)/);
});

test("transient Cat poses do not share the authenticated economic-write disable state", () => {
  assert.match(source, /pendingAuthenticatedWrite/);
  assert.match(source, /transientInteractionDisabled/);
  assert.match(source, /economicWriteDisabled/);
  assert.match(source, /localWorkspaceLoaded: localWorkspaceStatus === "ready"/);

  for (const label of [
    "Sit together",
    "Explore room",
    "Nap",
    "Play with yarn",
    "High-five",
    "Paw shake",
    "Follow butterfly",
  ]) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(
      source,
      new RegExp(`disabled=\\{transientInteractionDisabled\\}[^>]+label="${escaped}"|label="${escaped}"[^>]+disabled=\\{transientInteractionDisabled\\}`),
      label,
    );
  }

  assert.match(
    source,
    /disabled=\{transientInteractionDisabled\}\s+label=\{visual\.action === "wand" \? "End wand play" : "Play with teaser wand"\}/,
  );
  assert.match(
    source,
    /disabled=\{transientInteractionDisabled\}\s+label=\{garden \? "Return to room" : "Visit garden"\}/,
  );

  assert.match(source, /disabled=\{previewSafeEconomicDisabled\}\s+key=\{item\.id\}\s+label=\{`Feed/);
  assert.match(source, /disabled=\{previewSafeEconomicDisabled \|\| room\.selectedFurniture/);
  assert.match(source, /<CatStore\s+disabled=\{economicWriteDisabled\}/);
});

test("Mobile Cat QA controls are __DEV__-only and feed the production room view", () => {
  assert.match(source, /catQaPreviewEnabled\(__DEV__\)/);
  assert.match(source, /\{__DEV__ \? \(\s*<CatQaPreviewPanel/);
  assert.match(source, /Cat QA · DEV ONLY/);
  assert.match(source, /accessibilityState=\{\{ expanded \}\}/);
  assert.match(source, /Preview only\. Does not change your real account, points, inventory, or cloud data\./);
  assert.match(source, /Preview: \{previewSummary\}/);
  assert.match(source, /Reset Preview/);
  assert.match(source, /createCatQaPreviewWorkspace\(localWorkspace, qaProjection\)/);
  assert.match(source, /getCatRoomView\(previewWorkspace, today\)/);

  const panel = source.slice(
    source.indexOf("function CatQaPreviewPanel"),
    source.indexOf("function useCatRoomInteractions"),
  );
  assert.doesNotMatch(panel, /updateLocalWorkspace|buyCatItem|feedCatFood|purchaseAvailability/);
});

test("Mobile Cat QA preview exits before sync and economy mutations", () => {
  const buy = source.slice(source.indexOf("async function buy("), source.indexOf("async function feed("));
  const feed = source.slice(source.indexOf("async function feed("), source.indexOf("async function chooseFurniture("));
  const furniture = source.slice(source.indexOf("async function chooseFurniture("), source.indexOf("function toggleQaPreviewOwnership"));

  assert.ok(buy.indexOf("if (qaPreviewActive)") < buy.indexOf("await buyCatItem"));
  assert.ok(feed.indexOf("if (qaPreviewActive)") < feed.indexOf("await feedCatFood"));
  assert.ok(furniture.indexOf("if (qaPreviewActive)") < furniture.indexOf("updateLocalWorkspace"));
  assert.match(source, /disabled=\{previewActive \|\| disabled \|\| availability !== "available"\}/);
  assert.match(source, /setQaPreviewActiveDay\(undefined\);[\s\S]*?setQaPreviewOwnedItemIds\(\[\]\);[\s\S]*?setQaPreviewFurnitureId\(undefined\);/);
});

test("transient interactions replace timers, settle, and clean up on navigation or unmount", () => {
  assert.match(source, /createCatSequenceScheduler/);
  assert.match(source, /sequenceScheduler\.cancel\(\)/);
  assert.match(source, /activeActionRef\.current = action/);
  assert.match(source, /settle\(settleScene\)/);
  assert.match(source, /useFocusEffect/);
  assert.match(source, /idleScheduler\.cancel\(\)/);
  assert.match(source, /mountedRef\.current = false/);
  assert.match(source, /cancelActive\(false\)/);
});

test("target-based phases face from their planned Cat point instead of stale animation state", () => {
  assert.match(source, /const facingOrigin = step\.point \?\? currentPoint;/);
  assert.match(source, /facingTowardRoomPoint\(facingOrigin, step\.targetPoint, visualRef\.current\.facing\)/);
  assert.match(source, /MOBILE_SCRATCH_PLACEMENT = catScratchingPostPlacement\(\)/);
  assert.match(source, /MOBILE_BUTTERFLY_STEPS = catButterflyFollowSteps\(\)/);
  assert.doesNotMatch(
    source,
    /facingTowardRoomPoint\(currentPoint, step\.targetPoint, visualRef\.current\.facing\)/,
  );
});

test("feeding reacts before the economic write and pending flags always clear", () => {
  assert.match(source, /canStartCatFoodInteraction\(localWorkspace, item\.id\)/);
  const immediatePose = source.indexOf("catInteractions.playFood(foodPose(foodVisual));");
  const remoteWrite = source.indexOf("await feedCatFood(item.id, today);");
  assert.ok(immediatePose >= 0);
  assert.ok(remoteWrite > immediatePose);
  assert.doesNotMatch(source.slice(remoteWrite), /setPose\(foodPose/);
  assert.equal((source.match(/finally \{\s+setSavingId\(undefined\);\s+\}/g) ?? []).length, 3);
  assert.match(source, /pendingItemId === item\.id\s+\? `Buying \$\{item\.name\}…`/);
  assert.match(source, /queuedItemId === item\.id\s+\? "Waiting to sync…"/);
  assert.match(source, /syncPending && availability === "available"\s+\? "Sync pending…"/);
});

test("queued Cat economy messages distinguish offline, FIFO-blocked, and online wait states", () => {
  assert.match(source, /outcome === "queued-offline"/);
  assert.match(source, /outcome === "queued-blocked"/);
  assert.match(source, /Purchase is saved and waiting to sync\./);
  assert.match(source, /saved behind an earlier change and waiting to sync/);
  assert.match(providerSource, /result\.queueReason === "offline"/);
  assert.match(providerSource, /result\.queueReason === "blocked-by-earlier"/);
  assert.doesNotMatch(
    source,
    /outcome === "queued"\) return [^\n]*back online/,
  );
});

test("development sync diagnostics expose only safe failure and queue summaries", () => {
  assert.match(source, /__DEV__/);
  assert.match(source, /Development sync diagnostic/);
  assert.match(source, /formatMobileSyncDiagnostic\(sync\)/);
  assert.doesNotMatch(source, /console\.(?:log|warn|error)/);
});

test("absence return copy and current interaction caption use separate surfaces", () => {
  assert.match(source, /room\.returnMessage/);
  assert.match(source, /visual\.caption/);
  assert.match(source, /catReactionCaption\(pose, selectedFurnitureRef\.current\)/);
  assert.match(domainSource, /Nothing was lost/);
  assert.match(source, /symbolic journey, not a literal kitten age/);
  assert.doesNotMatch(
    source,
    /Canonical balance|Read-only|Later Mobile work|economic architecture|M1E makes no/i,
  );
});

test("touch wand play clamps targets, follows in bounded steps, pounces, and stops explicitly", () => {
  assert.match(source, /type GestureResponderEvent/);
  assert.match(source, /onStartShouldSetResponder/);
  assert.match(source, /onResponderMove: moveWandFromTouch/);
  assert.match(source, /normalizedRoomPoint\(/);
  assert.match(source, /stepTowardRoomPoint\(/);
  assert.match(source, /shouldWandPounce\(/);
  assert.match(source, /WAND_POUNCE_COOLDOWN_MS/);
  assert.match(source, /activeActionRef\.current === "wand"/);
  assert.match(source, /target: "wand"/);
  assert.match(source, /toggleWand/);
  assert.match(source, /settle\("room"\)/);
  assert.match(source, /Moving teaser wand target/);
});

test("React Native Animated keeps chase frames out of Cat screen React state", () => {
  assert.match(source, /new Animated\.Value\(0\)/);
  assert.match(source, /Animated\.parallel/);
  assert.match(source, /Animated\.timing/);
  assert.match(source, /useNativeDriver: true/);
  assert.match(source, /transform: \[\s*\{ translateX: interactions\.catTranslateX \}/);
  assert.doesNotMatch(source, /setInterval\(/);
});

test("reduced motion preserves discrete target, pose, facing, and immediate scroll changes", () => {
  assert.match(source, /AccessibilityInfo\.isReduceMotionEnabled\(\)/);
  assert.match(source, /"reduceMotionChanged"/);
  assert.match(source, /stepTowardRoomPoint\([\s\S]*?!reducedMotionRef\.current/);
  assert.match(source, /setReducedMotion\(value\)/);
  assert.match(source, /animated: !catInteractions\.reducedMotion/);
  assert.doesNotMatch(source, /reducedMotionRef\.current && action === "scratch"/);
  assert.match(source, /userInitiated && step\.discreteReducedMotionPlacement/);
  assert.match(source, /!reducedMotionRef\.current &&[\s\S]*?selectedFurnitureRef\.current === "cat-bed"/);
  assert.match(source, /setTargetPoint\(nextTarget\)/);
  assert.match(source, /facingTowardRoomPoint/);
});

test("yarn and mouse use visible, meaningfully distinct sequences", () => {
  assert.match(source, /sequence === "yarn"/);
  assert.match(source, /"anticipating" : index === 1 \? "yarn" : "sitting"/);
  assert.match(source, /sequence === "mouse"/);
  assert.match(source, /"anticipating" : index === 1 \? "walking" : "mouse"/);
  assert.match(source, /Yarn ball in room/);
  assert.match(source, /Toy mouse in room/);
  assert.match(source, /styles\.yarnBall/);
  assert.match(source, /styles\.mouseBody/);
});

test("furniture interactions place the kitten at bed, perch, post, and tree targets", () => {
  assert.match(source, /furnitureId === "cat-bed"/);
  assert.match(source, /playSequence\("bed-nap"\)/);
  assert.match(source, /furnitureId === "window-cushion"/);
  assert.match(source, /playSequence\("perch"\)/);
  assert.match(source, /temporaryFurniture: "scratching-post"/);
  assert.match(source, /pose: index % 2 === 0 \? "scratching-left" : "scratching-right"/);
  assert.match(source, /CAT_ROOM_LAYOUT\.catTreeMidAnchor/);
  assert.match(source, /CAT_ROOM_LAYOUT\.catTreeTopAnchor/);
  assert.match(source, /pose: index === 0 \? "climbing" : "perched"/);
  assert.match(source, /visual\.temporaryFurniture && visual\.temporaryFurniture !== room\.selectedFurniture\?\.id/);
});

test("Mobile commands measure the Cat Room and request at most one scroll at command start", () => {
  assert.match(source, /catRoomRef\.current\?\.measureInWindow/);
  assert.match(source, /catRoomScrollTarget\(/);
  assert.match(source, /scrollViewRef\.current\?\.scrollTo\(/);
  assert.match(source, /const beginVisualCommand = \(command: \(\) => void\) => \{\s*onVisualCommandStart\(\);\s*command\(\);/);
  const controller = source.slice(source.indexOf("function useCatRoomInteractions"), source.indexOf("function catVisualSteps"));
  assert.doesNotMatch(controller, /onVisualCommandStart|scrollTo\(/);
});

test("Mobile food props and hand poses are visibly distinct", () => {
  assert.match(source, /catFoodVisualFor\(item\.id\)/);
  for (const pose of ["wet-food", "freeze-dried-treat"]) {
    assert.match(pixelKittenSource, new RegExp(`pose === "${pose}"`));
  }
  for (const visual of ["DrinkingKitten", "WetFoodKitten", "EatingKitten", "LickingKitten", "FreezeDriedTreatKitten"]) {
    assert.match(pixelKittenSource, new RegExp(`function ${visual}`));
  }
  const highFive = pixelKittenSource.slice(pixelKittenSource.indexOf("function HighFiveKitten"), pixelKittenSource.indexOf("function PawShakeKitten"));
  const pawShake = pixelKittenSource.slice(pixelKittenSource.indexOf("function PawShakeKitten"), pixelKittenSource.indexOf("function ButterflyKitten"));
  assert.notEqual(highFive, pawShake);
  assert.match(highFive, /y=\{24\}/);
  assert.match(pawShake, /y=\{91\}/);
});

test("tricks settle automatically and butterfly stays in an explicit garden scene", () => {
  assert.match(source, /sequence === "high-five"/);
  assert.match(source, /sequence === "paw-shake"/);
  assert.match(source, /sequence === "butterfly" \? "garden" : "room"/);
  assert.match(source, /activeActionRef\.current = scene === "garden" \? "garden" : undefined/);
  assert.match(source, /available\.butterfly && garden/);
  assert.match(source, /Butterfly in garden/);
  assert.match(source, /ownsMouse=\{available\.mouse && !garden\}/);
  assert.match(source, /ownsYarn=\{available\.yarn && !garden\}/);
  assert.match(source, /gardenFloor/);
});

test("idle behavior starts after five minutes and all transient state stays local-only", () => {
  assert.match(source, /createCatIdleScheduler/);
  assert.match(source, /idleScheduler\.start\(\)/);
  assert.match(source, /selectedFurnitureRef\.current === "cat-bed"/);
  assert.match(source, /selectedFurnitureRef\.current === "window-cushion"/);
  const controllerStart = source.indexOf("function useCatRoomInteractions");
  const controllerEnd = source.indexOf("function CatRoom", controllerStart);
  const controller = source.slice(controllerStart, controllerEnd);
  assert.doesNotMatch(controller, /updateLocalWorkspace|buyCatItem|feedCatFood|reward|inventory|sync/);
});

test("Mobile PixelKitten carries over the Web SVG canvas, baseline, palette, and poses", () => {
  assert.match(pixelKittenSource, /from "react-native-svg"/);
  assert.match(pixelKittenSource, /viewBox="0 0 160 110"/);
  assert.match(pixelKittenSource, /x=\{8\} y=\{94\} width=\{144\} height=\{4\} fill="#b08968"/);
  for (const color of ["#b77945", "#7c4a2d", "#e7bd8c", "#3f2d24"]) {
    assert.match(pixelKittenSource, new RegExp(color));
  }
  for (const pose of [
    "SittingKitten",
    "WalkingKitten",
    "SleepingKitten",
    "DrinkingKitten",
    "WetFoodKitten",
    "EatingKitten",
    "LickingKitten",
    "FreezeDriedTreatKitten",
    "PlayingKitten",
    "WandKitten",
    "HighFiveKitten",
    "PawShakeKitten",
    "ButterflyKitten",
  ]) {
    assert.match(pixelKittenSource, new RegExp(`function ${pose}`));
  }
});
