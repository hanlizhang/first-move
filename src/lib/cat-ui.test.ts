import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(
  new URL("../app/first-move-app.tsx", import.meta.url),
  "utf8",
);
const cssSource = readFileSync(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);

test("Web Cat v1B actions are wired through owned-item and selected-furniture gates", () => {
  assert.match(appSource, /catInteractionAvailability\(ownedItemIds, selectedFurnitureId\)/);
  for (const gate of [
    "availability.yarn",
    "availability.mouse",
    "availability.wand",
    "scratchingPostOwned",
    "bedSelected",
    "availability.perch",
    "availability.tree",
    "availability.highFive",
    "availability.pawShake",
    "availability.garden",
    "availability.butterfly",
  ]) {
    assert.match(appSource, new RegExp(gate.replace(".", "\\.")), gate);
  }
  for (const label of [
    "Play with yarn",
    "Chase toy mouse",
    "Play with teaser wand",
    "End wand play",
    "Scratch",
    "Nap in bed",
    "Watch from perch",
    "Climb cat tree",
    "High five",
    "Paw shake",
    "Visit garden",
    "Return to room",
    "Follow butterfly",
  ]) {
    assert.match(appSource, new RegExp(label), label);
  }
});

test("Web teaser wand exposes a clamped pointer and keyboard target with bounded follow and pounce", () => {
  assert.match(appSource, /onPointerDown=\{handlePointerMove\}/);
  assert.match(appSource, /onPointerMove=\{handlePointerMove\}/);
  assert.match(appSource, /normalizedRoomPoint\(event\.clientX - rect\.left/);
  assert.match(appSource, /clampRoomPointToArea\(nextTarget, CAT_ROOM_LAYOUT\.wandPlayArea\)/);
  assert.match(appSource, /stepTowardRoomPoint\(previous, targetRef\.current/);
  assert.match(appSource, /shouldWandPounce\(next, targetRef\.current, Math\.random\(\)\)/);
  assert.match(appSource, /wand-pounce/);
  assert.match(appSource, /event\.key === "Escape"/);
  assert.match(appSource, /End wand play/);
  assert.match(appSource, /cat-wand-target/);
  assert.match(cssSource, /\.cat-stage-kitten-wand\s*\{[\s\S]*transition: left 120ms linear, top 120ms linear/);
});

test("Web reduced motion keeps wand targeting usable without a chase loop", () => {
  assert.match(appSource, /window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
  assert.match(appSource, /setFacing\(\(current\) => facingTowardRoomPoint/);
  assert.match(appSource, /if \(reducedMotion\) \{[\s\S]*?setWandPouncing\(false\);[\s\S]*?return;/);
  assert.match(cssSource, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(cssSource, /\.cat-stage-kitten,[\s\S]*?transition: none/);
});

test("Web yarn and toy mouse render separate targets and distinct phase motion", () => {
  assert.match(appSource, /function YarnBall/);
  assert.match(appSource, /function ToyMouse/);
  assert.match(appSource, /cat-play-stage-phase-\$\{phase\}/);
  assert.match(cssSource, /\.cat-play-stage-phase-yarn-action \.cat-yarn-ball/);
  assert.match(cssSource, /@keyframes room-yarn-bat/);
  assert.match(cssSource, /\.cat-play-stage-phase-mouse-chase \.cat-toy-mouse/);
  assert.match(cssSource, /@keyframes room-mouse-dash/);
  assert.doesNotMatch(
    appSource.slice(appSource.indexOf("function PlayingKitten"), appSource.indexOf("function AlertKitten")),
    /<circle|<path/,
  );
});

test("Web furniture phases place the kitten beside the owned or selected furnishing", () => {
  for (const component of ["ScratchingPost", "CatBed", "WindowPerch", "CatTree"]) {
    assert.match(appSource, new RegExp(`function ${component}`));
  }
  assert.match(cssSource, /\.pixel-kitten-scratching \.scratch-paw-a/);
  assert.match(cssSource, /\.cat-stage-kitten-bed-nap/);
  assert.match(cssSource, /\.cat-stage-kitten-perch/);
  assert.match(cssSource, /\.cat-stage-kitten-tree-climb/);
  assert.match(cssSource, /\.cat-stage-kitten-tree-perch/);
  assert.match(appSource, /CAT_ROOM_LAYOUT\.scratchingPostAnchor/);
  assert.match(appSource, /CAT_ROOM_LAYOUT\.bedAnchor/);
  assert.match(appSource, /CAT_ROOM_LAYOUT\.windowPerchAnchor/);
  assert.match(appSource, /CAT_ROOM_LAYOUT\.catTreeMidAnchor/);
  assert.match(appSource, /CAT_ROOM_LAYOUT\.catTreeTopAnchor/);
  assert.match(appSource, /showFloor=\{false\}/);
  assert.match(cssSource, /aspect-ratio: 16 \/ 9/);
});

test("Web tricks and garden interactions settle and leave the normal room recoverable", () => {
  assert.match(appSource, /showInteraction\("high-five"\)/);
  assert.match(appSource, /showInteraction\("paw-shake"\)/);
  assert.match(appSource, /showInteraction\("butterfly"\)/);
  assert.match(appSource, /interaction === "butterfly" && nextPhase === "sitting"/);
  assert.match(appSource, /setPhase\("garden"\)/);
  assert.match(appSource, /function returnIndoors\(\)[\s\S]*?setOutdoor\(false\)/);
  assert.match(appSource, /function ButterflyTarget/);
  assert.match(cssSource, /@keyframes garden-butterfly-path/);
});

test("Web transient animation work cleans up and stays outside durable state writes", () => {
  assert.match(appSource, /\(\) => actionSequencer\.current\?\.cancel\(\)/);
  assert.match(appSource, /window\.cancelAnimationFrame\(animationFrame\)/);
  assert.match(appSource, /scheduleIdleBehavior\(/);
  assert.match(appSource, /isInteractionActive: \(\) => outdoor \|\| wandActive/);
  const playStage = appSource.slice(
    appSource.indexOf("function CatPlayStage"),
    appSource.indexOf("function YarnBall"),
  );
  assert.doesNotMatch(
    playStage,
    /updateAppState|purchaseCatItem|consumeCatFood|Supabase|reward|inventory/,
  );
});

test("Web Cat QA controls are development-only and project into the real Cat room", () => {
  assert.match(appSource, /catQaPreviewEnabled\(process\.env\.NODE_ENV === "development"\)/);
  assert.match(appSource, /\{qaPreviewAvailable && \(\s*<CatQaPreviewPanel/);
  assert.match(appSource, /Cat QA · DEV ONLY/);
  assert.match(appSource, /<details/);
  assert.match(appSource, /Preview only\. Does not change your real account, points, inventory, or cloud data\./);
  assert.match(appSource, /Preview: \{previewSummary\}/);
  assert.match(appSource, /Reset Preview/);
  assert.match(appSource, /projectCatQaPreview\(/);
  assert.match(appSource, /const availability = catInteractionAvailability\(ownedItemIds, selectedFurnitureId\)/);

  const panel = appSource.slice(
    appSource.indexOf("function CatQaPreviewPanel"),
    appSource.indexOf("function PixelKitten"),
  );
  assert.doesNotMatch(panel, /update\(|updateAppState|purchaseCatItem|consumeCatFood|selectFurniture|Supabase|syncProgress/);
});

test("Web food and hand interactions use distinct production SVG silhouettes", () => {
  for (const visual of ["DrinkingKitten", "WetFoodKitten", "EatingKitten", "LickingKitten", "FreezeDriedTreatKitten"]) {
    assert.match(appSource, new RegExp(`function ${visual}`));
  }
  assert.match(appSource, /catFoodVisualFor\(itemId\)/);
  assert.match(appSource, /pose === "wet-food"/);
  assert.match(appSource, /pose === "freeze-dried-treat"/);
  const highFive = appSource.slice(appSource.indexOf("function HighFiveKitten"), appSource.indexOf("function ProudKitten"));
  const pawShake = appSource.slice(appSource.indexOf("function PawShakeKitten"), appSource.indexOf("function ButterflyKitten"));
  assert.notEqual(highFive, pawShake);
  assert.match(highFive, /y="24"/);
  assert.match(pawShake, /y="91"/);
});

test("Web Cat QA preview exits before every Cat economy or persistence path", () => {
  const buy = appSource.slice(appSource.indexOf("function buy(itemId"), appSource.indexOf("function feed(itemId"));
  const feed = appSource.slice(appSource.indexOf("function feed(itemId"), appSource.indexOf("const ownedFood"));
  const furniture = appSource.slice(appSource.indexOf("function chooseFurniture"), appSource.indexOf("function startWand"));

  assert.ok(buy.indexOf("if (qaPreviewActive)") < buy.indexOf("update((current)"));
  assert.ok(feed.indexOf("if (qaPreviewActive)") < feed.indexOf("consumeCatFood"));
  assert.ok(furniture.indexOf("if (qaPreviewActive)") < furniture.indexOf("selectFurniture"));
  assert.match(buy, /purchaseCatItem/);
  assert.match(feed, /consumeCatFood/);
  assert.match(furniture, /selectFurniture/);
});
