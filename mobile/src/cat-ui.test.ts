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

test("owned food, yarn, wand, tricks, butterfly, and furniture expose visible actions", () => {
  for (const label of [
    "Feed ",
    "Sit together",
    "Explore room",
    "Nap",
    "Play with yarn",
    "Play with teaser wand",
    "High-five",
    "Paw shake",
    "Visit garden",
    "Follow butterfly",
    "Room furniture",
    "Clear furnishing",
  ]) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /selectCatFurniture/);
  assert.match(source, /foodPose/);
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
    "Play with teaser wand",
    "High-five",
    "Paw shake",
    "Visit garden",
    "Follow butterfly",
  ]) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(
      source,
      new RegExp(`disabled=\\{transientInteractionDisabled\\}[^>]+label="${escaped}"|label="${escaped}"[^>]+disabled=\\{transientInteractionDisabled\\}`),
      label,
    );
  }

  assert.match(source, /disabled=\{economicWriteDisabled\}\s+key=\{item\.id\}\s+label=\{`Feed/);
  assert.match(source, /disabled=\{economicWriteDisabled \|\| room\.selectedFurniture/);
  assert.match(source, /<CatStore\s+disabled=\{economicWriteDisabled\}/);
});

test("absence return copy and current interaction caption use separate surfaces", () => {
  assert.match(source, /room\.returnMessage/);
  assert.match(source, /catReactionCaption\(pose, room\.selectedFurniture\?\.id\)/);
  assert.match(domainSource, /Nothing was lost/);
  assert.match(source, /symbolic journey, not a literal kitten age/);
  assert.doesNotMatch(
    source,
    /Canonical balance|Read-only|Later Mobile work|economic architecture|M1E makes no/i,
  );
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
    "EatingKitten",
    "LickingKitten",
    "PlayingKitten",
    "WandKitten",
    "HighFiveKitten",
    "PawShakeKitten",
    "ButterflyKitten",
  ]) {
    assert.match(pixelKittenSource, new RegExp(`function ${pose}`));
  }
});
