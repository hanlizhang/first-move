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
const pixelScenesSource = readFileSync(
  new URL("./components/pixel-scenes.tsx", import.meta.url),
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

test("Mobile Cat presents a room-first screen with compact HUD utilities", () => {
  for (const label of [
    "Cat Room",
    "Available points",
    "Growth and milestones",
    "active day",
    "Store",
    "Food",
    "Toys",
    "Furniture",
    "Activities",
  ]) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /getCatRoomView\(localWorkspace, today\)/);
  assert.match(source, /PixelKitten/);
  assert.match(source, /PixelCoinIcon/);
  assert.match(source, /PixelMilestoneIcon/);
  assert.match(source, /PixelCollectionIcon/);
  assert.match(source, /PixelStoreIcon/);
  assert.match(source, /const \[growthExpanded, setGrowthExpanded\]/);
  assert.match(source, /useWindowDimensions\(\)/);
  assert.match(source, /roomHeight = Math\.min\(600, Math\.max\(460, windowHeight - 220\)\)/);
  assert.match(source, /<SafeAreaView[^>]+style=\{styles\.roomSafeArea\}/);
  assert.doesNotMatch(source, /<Stat label="Current points"|<Stat label="Growth chapter"/);
  assert.doesNotMatch(source, /Your collection|Owned things|Owned items/);
});

test("Cat Room keeps one Store entry and gives Store and milestones distinct pixel symbols", () => {
  assert.equal((source.match(/accessibilityLabel="Open Cat Store"/g) ?? []).length, 1);
  assert.match(pixelScenesSource, /storeBuilding/);
  assert.match(pixelScenesSource, /storeAwning/);
  assert.match(pixelScenesSource, /medalDisc/);
  assert.match(pixelScenesSource, /medalRibbonLeft/);
  assert.doesNotMatch(pixelScenesSource, /storeHandle|storeBag|bookLeft|bookRight/);
  assert.doesNotMatch(pixelScenesSource, /storeStepOne|storeStepTwo|storeStepThree/);
});

test("food and treat thumbnails render objects without a kitten performer", () => {
  const itemPoseMapping = pixelScenesSource.slice(
    pixelScenesSource.indexOf("function itemKittenPose"),
    pixelScenesSource.indexOf("function Bowl"),
  );
  assert.doesNotMatch(itemPoseMapping, /kitten-milk|wet-kitten-food|cat-food|cat-treat|freeze-dried-treat/);
  for (const visual of [
    "MilkBowlVisual",
    "WetFoodBowlVisual",
    "KibbleBowlVisual",
    "TreatStickVisual",
    "TreatCubesVisual",
  ]) {
    assert.match(pixelScenesSource, new RegExp(`<${visual} \\/>`));
  }
  assert.match(pixelScenesSource, /export function PixelFoodIcon/);
  assert.match(pixelScenesSource, /if \(isFoodItemId\(itemId\)\)/);
  assert.doesNotMatch(pixelScenesSource, /skewX|treatNotch/);
});

test("Items is a compact owned-object tray with reusable artwork and quantity badges", () => {
  assert.match(source, /accessibilityLabel="Open Items"/);
  assert.match(source, /const \[itemsExpanded, setItemsExpanded\] = useState\(initialItemsExpanded\)/);
  assert.match(source, /accessibilityLabel="Items tray"/);
  assert.match(pixelScenesSource, /export function PixelCollectionIcon/);
  assert.match(source, /<PixelItemIcon itemId=\{item\.id\} size=\{48\} \/>/);
  assert.match(source, /<Text style=\{styles\.itemTrayQuantityText\}>×\{quantity\}<\/Text>/);
  for (const section of ["Food", "Toys", "Furniture", "Activities"]) {
    assert.match(source, new RegExp(`ItemTraySection label="${section}"`));
  }
  assert.doesNotMatch(source, /function Inventory|styles\.inventoryShelf|Your collection/);
  assert.doesNotMatch(source, /item\.name\.slice\(0, 1\)/);
  for (const itemId of ["yarn-toy", "toy-mouse", "teaser-wand", "scratching-post"]) {
    assert.match(pixelScenesSource, new RegExp(`itemId === "${itemId}"`));
  }
});

test("Cat Store keeps item imagery beside name, description, price, unlock, and ownership", () => {
  const store = source.slice(source.indexOf("function CatStore"), source.indexOf("function purchaseButtonLabel"));
  assert.match(store, /<PixelItemIcon itemId=\{item\.id\} size=\{64\} \/>/);
  assert.match(store, /item\.name/);
  assert.match(store, /item\.description/);
  assert.match(store, /Unlocks at \$\{item\.unlockActiveDays\} active days/);
  assert.match(store, /formatPoints\(item\.price\)/);
  assert.match(store, /purchaseButtonLabel\(availability\)/);
});

test("approved furnishings are selectable and render as directly interactive room objects", () => {
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
  assert.match(source, /<FurnitureVisual\s+itemId=\{room\.selectedFurniture\?\.id\}\s+onPress=\{activatePlacedFurniture\}/);
  assert.match(source, /accessibilityHint="Starts a nap"/);
  assert.match(source, /accessibilityHint="Shows watch and nap choices"/);
  assert.match(source, /accessibilityHint="Starts scratching"/);
  assert.match(source, /accessibilityHint="Starts climbing and perching"/);
});

test("owned Cat items route directly to existing interaction and placement handlers", () => {
  assert.match(source, /const feedAndClose[\s\S]*?onFeed\(item\)/);
  assert.match(source, /itemId === "yarn-toy"[\s\S]*?playSequence\("yarn"\)/);
  assert.match(source, /itemId === "toy-mouse"[\s\S]*?playSequence\("mouse"\)/);
  assert.match(source, /itemId === "teaser-wand"[\s\S]*?toggleWand\(\)/);
  assert.match(source, /onPress=\{\(\) => chooseFurnitureAndClose\(item\.id\)\}/);
  assert.match(source, /itemId === "scratching-post"[\s\S]*?playSequence\("scratch"\)/);
  assert.match(source, /itemId === "cat-tree"[\s\S]*?playSequence\("tree"\)/);
  assert.match(source, /itemId === "window-cushion"[\s\S]*?setFurnitureChoice\("window-cushion"\)/);
  assert.match(source, /selectCatFurniture/);
  assert.match(source, /foodPose/);
  assert.match(source, /catInteractionAvailability\(ownedItemIds, room\.selectedFurniture\?\.id\)/);
});

test("Cat Room keeps only Items and Store as top-level action controls", () => {
  assert.match(source, /accessibilityLabel="Open Items"/);
  assert.match(source, /accessibilityLabel="Open Cat Store"/);
  assert.match(source, /accessibilityState=\{\{ expanded: itemsExpanded \}\}/);
  assert.match(source, /style=\{styles\.floatingSheet\}/);
  assert.doesNotMatch(source, /CatInteractionCategory|InteractionCategoryButton|styles\.categoryRow/);
  for (const category of ["Care", "Play", "Relax"]) {
    assert.doesNotMatch(source, new RegExp(`label="${category}"`));
  }
});

test("the temporary Items tray groups owned objects and dismisses on selection", () => {
  const items = source.slice(
    source.indexOf("{itemsExpanded ? ("),
    source.indexOf("</ScrollView>", source.indexOf("{itemsExpanded ? (")),
  );

  assert.match(items, /room\.ownedFood\.map/);
  assert.match(items, /room\.ownedToys\.map/);
  assert.match(items, /room\.ownedFurniture\.map/);
  assert.match(items, /room\.ownedTricks/);
  for (const handler of ["feedAndClose", "activateToy", "chooseFurnitureAndClose", "activateActivity"]) {
    assert.match(items, new RegExp(handler));
  }
  assert.match(source, /const beginVisualCommand = \(command: \(\) => void\) => \{\s*setFurnitureChoice\(undefined\);\s*setItemsExpanded\(false\);/);
  assert.doesNotMatch(items, /CompanionActionButton|Inventory/);
});

test("transient Cat poses do not share the authenticated economic-write disable state", () => {
  assert.match(source, /pendingAuthenticatedWrite/);
  assert.match(source, /transientInteractionDisabled/);
  assert.match(source, /economicWriteDisabled/);
  assert.match(source, /localWorkspaceLoaded: localWorkspaceStatus === "ready"/);

  assert.match(source, /room\.ownedToys\.map[\s\S]*?disabled=\{transientInteractionDisabled\}/);
  assert.match(source, /room\.ownedFood\.map[\s\S]*?disabled=\{previewSafeEconomicDisabled\}/);
  assert.match(source, /room\.ownedFurniture\.map[\s\S]*?disabled=\{previewSafeEconomicDisabled \|\| room\.selectedFurniture/);
  assert.match(source, /<CatStore\s+disabled=\{economicWriteDisabled\}/);
});

test("food and furniture keep write-sensitive feedback separate from transient companion actions", () => {
  const companionControls = source.slice(
    source.indexOf('{itemsExpanded ? ('),
    source.indexOf('</ScrollView>', source.indexOf('{itemsExpanded ? (')),
  );
  assert.match(companionControls, /quantity=\{quantity\}/);
  assert.match(companionControls, /disabled=\{previewSafeEconomicDisabled\}/);
  assert.match(companionControls, /disabled=\{previewSafeEconomicDisabled \|\| room\.selectedFurniture\?\.id === item\.id\}/);
  assert.match(companionControls, /disabled=\{transientInteractionDisabled\}/);
  assert.match(source, /accessibilityState=\{\{ disabled, selected \}\}/);
});

test("garden controls remain grouped and scene-aware", () => {
  assert.match(source, /itemId === "outdoor-garden"[\s\S]*?garden \? interactions\.returnToRoom : interactions\.visitGarden/);
  assert.match(source, /itemId === "butterfly" && garden/);
  assert.match(source, /item\.id !== "butterfly" \|\| garden/);
});

test("Mobile Cat QA controls are __DEV__-only and feed the production room view", () => {
  assert.match(source, /catQaPreviewEnabled\(__DEV__\)/);
  assert.match(source, /\{__DEV__ && !visualPreview \? \(\s*<CatQaPreviewPanel/);
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

test("target-based phases face from the listener-backed rendered Cat point", () => {
  assert.match(source, /const renderedPoint = renderedCatPoint\(\);/);
  assert.match(source, /facingTowardRoomPoint\(renderedPoint, step\.targetPoint, visualRef\.current\.facing\)/);
  assert.match(source, /MOBILE_SCRATCH_PLACEMENT = catScratchingPostPlacement\(\)/);
  assert.match(source, /MOBILE_BUTTERFLY_STEPS = catButterflyFollowSteps\(\)/);
  assert.doesNotMatch(
    source,
    /facingTowardRoomPoint\(step\.point, step\.targetPoint/,
  );
});

test("Cat Room caption is transient and remains outside the clipped animation scene", () => {
  assert.match(source, /testID="cat-room-scene"/);
  assert.match(source, /testID="cat-room-caption"/);
  assert.match(
    source,
    /<\/View>\s*<TransientCatCaption/,
  );
  assert.match(source, /style=\{\[styles\.room, \{ height: roomHeight \}/);
  assert.match(source, /room: \{[^}]*overflow: "hidden"/);
  assert.match(source, /roomCaption: \{[^}]*alignSelf: "center"/);
  assert.doesNotMatch(source, /roomCaption: \{[^}]*position: "absolute"/);
  assert.match(source, /roomCaptionText: \{[^}]*flexShrink: 1[^}]*lineHeight: 20/);
  assert.match(source, /visible=\{Boolean\(visual\.action\)\}/);
  assert.match(source, /duration: 260/);
  assert.match(source, /if \(reducedMotion\) \{\s*opacity\.setValue\(0\)/);
  assert.doesNotMatch(source, /roomMessage|zIndex: 10/);
});

test("interaction-facing corrections are pose-specific and keep visible targets coherent", () => {
  assert.match(source, /settle\("room", true, "right"\)/);
  assert.match(source, /facing: facingTowardRoomPoint\(CAT_HOME_POINT, destination, "right"\)/);
  assert.match(source, /caption: catReactionCaption\(pose, selectedFurnitureRef\.current\),\s*durationMs: 5_000,\s*facing: "right"/);
  for (const sequence of ["yarn", "mouse", "butterfly"]) {
    assert.match(source, new RegExp(`sequence === "${sequence}"[\\s\\S]*?snapTarget: true`));
  }
  assert.match(source, /index === 0 \|\| step\.snapTarget \? 0 : 260/);
  assert.match(source, /if \(finished && catAnimationRef\.current === animation\)/);
  assert.match(source, /const currentCatPoint = renderedCatPoint\(\);/);
  assert.match(source, /setTargetPoint\(nextTarget, 0\)/);
  assert.match(source, /if \(pouncing\) \{[\s\S]*?commitVisual\(\{ \.\.\.visualRef\.current, facing \}\)/);
  assert.match(source, /normalizedRoomPointFromTranslation\(/);
  assert.match(source, /catTranslateX\.addListener/);
  assert.match(source, /catTranslateY\.addListener/);
  assert.match(source, /Facing uses the[\s\S]*?rendered position[\s\S]*?catPointRef\.current = nextPoint;/);
});

test("scratch uses a fixed paw-contact calibration without changing global sprite facing", () => {
  assert.match(source, /catOffsetPx: MOBILE_SCRATCH_PLACEMENT\.catOffsetPx/);
  assert.match(source, /sequence === "scratch"[\s\S]*?facing: "right" as const/);
  assert.match(source, /baseTranslation\.x \+ pixelOffset\.x/);
  assert.match(pixelKittenSource, /facing === "left" \? "translate\(160 0\) scale\(-1 1\)"/);
  const scratchPose = pixelKittenSource.slice(
    pixelKittenSource.indexOf("function ScratchingKitten"),
    pixelKittenSource.indexOf("function WatchingKitten"),
  );
  assert.match(scratchPose, /<CatFace lookingRight x=\{62\} y=\{17\} \/>/);
  assert.match(scratchPose, /x=\{95\} y=\{62\} width=\{9\} height=\{32\}/);
  assert.match(scratchPose, /x=\{111\} y=\{reachingArmY - 3\}/);
  assert.match(scratchPose, /width=\{18\} height=\{7\}/);
  assert.doesNotMatch(scratchPose, /ScratchingFace|width=\{28\}|width=\{30\}/);
});

test("room layers keep furniture behind the Cat and moving targets above it", () => {
  assert.match(source, /kittenLayer: \{[^}]*zIndex: 3/);
  assert.match(source, /movingTarget: \{[^}]*zIndex: 6/);
  assert.match(source, /scratchingPost: \{[^}]*zIndex: 1/);
  assert.match(source, /catTree: \{[^}]*zIndex: 1/);
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
  assert.match(source, /setTargetPoint\(nextTarget, 0\)/);
  assert.match(source, /facingTowardRoomPoint/);
});

test("yarn and mouse use visible, meaningfully distinct sequences", () => {
  assert.match(source, /sequence === "yarn"/);
  assert.match(source, /"anticipating" : index === 1 \? "yarn" : "sitting"/);
  assert.match(source, /sequence === "mouse"/);
  assert.match(source, /"anticipating" : index === 1 \? "walking" : "mouse"/);
  assert.match(source, /Yarn ball in room/);
  assert.match(source, /Toy mouse in room/);
  assert.match(source, /<PixelItemIcon itemId="yarn-toy" size=\{42\} \/>/);
  assert.match(source, /<PixelItemIcon itemId="toy-mouse" size=\{46\} \/>/);
  assert.match(pixelScenesSource, /function YarnVisual/);
  assert.match(pixelScenesSource, /function MouseVisual/);
});

test("furniture interactions place the kitten at bed, perch, post, and tree targets", () => {
  assert.match(source, /furnitureId === "cat-bed"/);
  assert.match(source, /playSequence\("bed-nap"\)/);
  assert.match(source, /furnitureId === "window-cushion"/);
  assert.match(source, /playSequence\("perch-nap"\)/);
  assert.match(source, /sequence === "perch-nap"[\s\S]*?pose: "sleeping" as const/);
  assert.match(source, /sequence === "perch"[\s\S]*?pose: "watching" as const/);
  assert.match(source, /temporaryFurniture: "scratching-post"/);
  assert.match(source, /pose: index % 2 === 0 \? "scratching-left" : "scratching-right"/);
  assert.match(source, /MOBILE_TREE_STEPS = catTreePlacementSteps\(\)/);
  assert.match(source, /sequence === "tree"[\s\S]*?catOffsetPx: placement\.catOffsetPx/);
  assert.match(source, /sequence === "tree"[\s\S]*?point: placement\.cat/);
  assert.match(source, /pose: index === 0 \? "climbing" : "perched"/);
  assert.match(source, /visual\.temporaryFurniture && visual\.temporaryFurniture !== room\.selectedFurniture\?\.id/);
});

test("Mobile commands measure the Cat Room and request at most one scroll at command start", () => {
  assert.match(source, /catRoomRef\.current\?\.measureInWindow/);
  assert.match(source, /catRoomScrollTarget\(/);
  assert.match(source, /scrollViewRef\.current\?\.scrollTo\(/);
  assert.match(source, /const beginVisualCommand = \(command: \(\) => void\) => \{\s*setFurnitureChoice\(undefined\);\s*setItemsExpanded\(false\);\s*onVisualCommandStart\(\);\s*command\(\);/);
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
  assert.match(source, /item\.id !== "butterfly" \|\| garden/);
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
  assert.match(
    pixelKittenSource,
    /viewBox=\{centerArtwork \? "10\.5 0 160 110" : "0 0 160 110"\}/,
  );
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
