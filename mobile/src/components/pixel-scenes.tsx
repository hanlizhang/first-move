import { useEffect, useState, type ReactNode } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Circle } from "react-native-svg";

import type { CatPose } from "../domain/cat.ts";
import type { CatItemId } from "../domain/cat-items.ts";
import type { Direction } from "../domain/models.ts";
import { PixelKitten } from "./pixel-kitten.tsx";

export const pixelPalette = {
  cream: "#FFFBEF",
  creamStrong: "#F9EFD9",
  peach: "#EFCBA2",
  orange: "#C6864F",
  orangeDark: "#8B5A35",
  brown: "#4A2F21",
  pink: "#E6A8A8",
  coral: "#D95F76",
} as const;

export function PixelKittenScene({
  accessibilityLabel,
  attention = false,
  pose = "sitting",
}: {
  accessibilityLabel: string;
  attention?: boolean;
  pose?: CatPose;
}) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [emphasis] = useState(() => new Animated.Value(1));

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    emphasis.stopAnimation();
    emphasis.setValue(1);
    if (!attention || reduceMotion) return undefined;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(emphasis, {
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          toValue: 0.45,
          useNativeDriver: true,
        }),
        Animated.timing(emphasis, {
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          toValue: 1,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [attention, emphasis, reduceMotion]);

  return (
    <View style={styles.kittenScene}>
      {attention ? (
        <Animated.View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.emphasisMarks, { opacity: emphasis }]}
        >
          <View style={[styles.attentionPixel, styles.attentionPixelOne]} />
          <View style={[styles.attentionPixel, styles.attentionPixelTwo]} />
          <View style={[styles.attentionPixel, styles.attentionPixelFour]} />
          <View style={[styles.attentionPixel, styles.attentionPixelFive]} />
        </Animated.View>
      ) : null}
      <View style={styles.kittenSceneSprite}>
        <PixelKitten
          accessibilityLabel={accessibilityLabel}
          blinking={false}
          centerArtwork
          hero
          pose={pose}
          showFloor={false}
        />
      </View>
      <View accessibilityElementsHidden style={styles.kittenSceneFloor}>
        <View style={styles.kittenSceneFloorHighlight} />
      </View>
    </View>
  );
}

export function PixelFocusRing({
  accessibilityLabel,
  label,
  live = false,
  progress,
  size = 232,
  value,
}: {
  accessibilityLabel: string;
  label: string;
  live?: boolean;
  progress?: number;
  size?: number;
  value: string;
}) {
  const stroke = Math.max(10, Math.round(size * 0.052));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const shownProgress = progress === undefined ? 0.72 : Math.max(0, Math.min(1, progress));

  return (
    <View style={[styles.focusRing, { height: size, width: size }]}>
      <Svg
        accessibilityElementsHidden
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        width={size}
      >
        <Circle
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radius}
          stroke={pixelPalette.peach}
          strokeWidth={stroke}
        />
        {shownProgress > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            fill="none"
            r={radius}
            stroke={pixelPalette.orangeDark}
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - shownProgress)}
            strokeLinecap="square"
            strokeWidth={stroke}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      <View style={styles.focusRingContent}>
        <Text
          adjustsFontSizeToFit
          accessibilityLabel={accessibilityLabel}
          accessibilityLiveRegion={live ? "polite" : "none"}
          minimumFontScale={0.72}
          numberOfLines={1}
          style={[styles.focusRingValue, { fontSize: Math.round(size * 0.235) }]}
        >
          {value}
        </Text>
        <Text style={styles.focusRingLabel}>{label}</Text>
      </View>
    </View>
  );
}

export function PixelDirectionIcon({
  direction,
  size = 48,
}: {
  direction: Direction;
  size?: number;
}) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.directionIcon, { height: size, width: size }]}
    >
      <View style={[styles.directionCanvas, { transform: [{ scale: size / 48 }] }]}> 
        {direction === "Work & Study" ? (
          <>
            <View style={styles.laptopScreen}>
              <View style={styles.laptopPage} />
            </View>
            <View style={styles.laptopBase} />
          </>
        ) : null}
        {direction === "Daily Life" ? (
          <>
            <View style={styles.homeRoof} />
            <View style={styles.homeBody}>
              <View style={styles.homeDoor} />
              <View style={styles.homeWindow} />
            </View>
          </>
        ) : null}
        {direction === "Exercise & Movement" ? (
          <>
            <View style={styles.dumbbellBar} />
            <View style={[styles.dumbbellWeight, styles.dumbbellWeightLeft]} />
            <View style={[styles.dumbbellWeight, styles.dumbbellWeightRight]} />
          </>
        ) : null}
        {direction === "Intentional Entertainment" ? (
          <View style={styles.controllerBody}>
            <View style={styles.controllerDpadHorizontal} />
            <View style={styles.controllerDpadVertical} />
            <View style={styles.controllerButtonOne} />
            <View style={styles.controllerButtonTwo} />
          </View>
        ) : null}
        {direction === "Rest" ? (
          <>
            <View style={styles.restMoon}>
              <View style={styles.restMoonCutout} />
            </View>
            <View style={styles.restPillow} />
          </>
        ) : null}
      </View>
    </View>
  );
}

export function PixelCoinIcon({ size = 28 }: { size?: number }) {
  return (
    <View accessibilityElementsHidden style={[styles.iconBox, { height: size, width: size }]}>
      <View style={[styles.coin, { borderWidth: Math.max(2, Math.round(size * 0.1)) }]}> 
        <View style={styles.coinShine} />
        <View style={styles.coinCatEarLeft} />
        <View style={styles.coinCatEarRight} />
        <View style={styles.coinCatFace}>
          <View style={styles.coinCatEyeLeft} />
          <View style={styles.coinCatEyeRight} />
          <View style={styles.coinCatMuzzle} />
        </View>
      </View>
    </View>
  );
}

export function PixelMilestoneIcon({ size = 28 }: { size?: number }) {
  return (
    <View accessibilityElementsHidden style={[styles.iconBox, { height: size, width: size }]}> 
      <View style={styles.medalRibbonLeft} />
      <View style={styles.medalRibbonRight} />
      <View style={styles.medalDisc}>
        <View style={styles.medalStarHorizontal} />
        <View style={styles.medalStarVertical} />
      </View>
    </View>
  );
}

export function PixelStoreIcon({ size = 28 }: { size?: number }) {
  return (
    <View accessibilityElementsHidden style={[styles.iconBox, { height: size, width: size }]}> 
      <View style={[styles.smallIconCanvas, { transform: [{ scale: size / 28 }] }]}> 
        <View style={styles.storeRoof} />
        <View style={styles.storeBuilding}>
          <View style={styles.storeAwning}>
            <View style={styles.storeAwningStripe} />
          </View>
          <View style={styles.storeWindow} />
          <View style={styles.storeDoor} />
        </View>
      </View>
    </View>
  );
}

export function PixelCollectionIcon({ size = 28 }: { size?: number }) {
  return (
    <View accessibilityElementsHidden style={[styles.iconBox, { height: size, width: size }]}> 
      <View style={[styles.smallIconCanvas, { transform: [{ scale: size / 28 }] }]}> 
        <View style={styles.collectionHandle} />
        <View style={styles.collectionBag}>
          <View style={styles.collectionFlap} />
          <View style={styles.collectionPocket} />
        </View>
      </View>
    </View>
  );
}

export function PixelItemIcon({
  itemId,
  size = 64,
}: {
  itemId: CatItemId;
  size?: number;
}) {
  if (isFoodItemId(itemId)) {
    return <PixelFoodIcon itemId={itemId} size={size} />;
  }

  const kittenPose = itemKittenPose(itemId);
  if (kittenPose) {
    return (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.itemIcon, { height: size, width: size }]}
      >
        <PixelKitten
          accessibilityLabel=""
          pose={kittenPose}
          showFloor={false}
        />
      </View>
    );
  }

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.itemIcon, { height: size, width: size }]}
    >
      <View style={[styles.itemCanvas, { transform: [{ scale: size / 64 }] }]}> 
        {itemId === "yarn-toy" ? <YarnVisual /> : null}
        {itemId === "toy-mouse" ? <MouseVisual /> : null}
        {itemId === "teaser-wand" ? <WandVisual /> : null}
        {itemId === "scratching-post" ? <ScratchingPostVisual /> : null}
        {itemId === "cat-bed" ? <CatBedVisual /> : null}
        {itemId === "window-cushion" ? <WindowCushionVisual /> : null}
        {itemId === "cat-tree" ? <CatTreeVisual /> : null}
        {itemId === "outdoor-garden" ? <GardenVisual /> : null}
        {itemId === "butterfly" ? <ButterflyVisual /> : null}
      </View>
    </View>
  );
}

type PixelFoodItemId = Extract<
  CatItemId,
  "kitten-milk" | "wet-kitten-food" | "cat-food" | "cat-treat" | "freeze-dried-treat"
>;

function isFoodItemId(itemId: CatItemId): itemId is PixelFoodItemId {
  return itemId === "kitten-milk" ||
    itemId === "wet-kitten-food" ||
    itemId === "cat-food" ||
    itemId === "cat-treat" ||
    itemId === "freeze-dried-treat";
}

export function PixelFoodIcon({
  itemId,
  size = 64,
}: {
  itemId: PixelFoodItemId;
  size?: number;
}) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.itemIcon, { height: size, width: size }]}
    >
      <View style={[styles.itemCanvas, { transform: [{ scale: size / 64 }] }]}> 
        {itemId === "kitten-milk" ? <MilkBowlVisual /> : null}
        {itemId === "wet-kitten-food" ? <WetFoodBowlVisual /> : null}
        {itemId === "cat-food" ? <KibbleBowlVisual /> : null}
        {itemId === "cat-treat" ? <TreatStickVisual /> : null}
        {itemId === "freeze-dried-treat" ? <TreatCubesVisual /> : null}
      </View>
    </View>
  );
}

export function PixelStepScene({
  reduceMotion,
  variant,
}: {
  reduceMotion: boolean;
  variant: "daily" | "focus" | "milestone";
}) {
  const [reveal] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));

  useEffect(() => {
    reveal.setValue(reduceMotion ? 1 : 0);
    const animation = Animated.timing(reveal, {
      duration: reduceMotion ? 0 : 420,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [reduceMotion, reveal, variant]);

  const kittenPose = variant === "focus" ? "walking" : variant === "milestone" ? "perched" : "sitting";
  return (
    <View accessibilityElementsHidden style={styles.stepScene}>
      <View style={[styles.pixelSpark, styles.pixelSparkOne]} />
      <View style={[styles.pixelSpark, styles.pixelSparkTwo]} />
      {variant === "milestone" ? (
        <Animated.View style={[styles.rewardReveal, { opacity: reveal }]}>
          <View style={styles.rewardPixelTop} />
          <View style={styles.rewardPixelCore} />
        </Animated.View>
      ) : null}
      <View style={styles.stepsRow}>
        <View style={[styles.pixelPlatform, styles.pixelPlatformOne]}>
          <View style={styles.stepHighlight} />
        </View>
        <View style={[styles.pixelPlatform, styles.pixelPlatformTwo]}>
          <View style={styles.stepHighlight} />
        </View>
        <View style={[styles.pixelPlatform, styles.pixelPlatformThree]}>
          <View style={styles.stepHighlight} />
        </View>
      </View>
      <Animated.View
        style={[
          styles.stepKitten,
          variant === "focus" && styles.stepKittenFocus,
          {
            opacity: reveal,
            transform: [{
              translateY: reduceMotion
                ? 0
                : reveal.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }),
            }],
          },
        ]}
      >
        <PixelKitten
          accessibilityLabel="Pixel kitten taking a small step"
          blinking={variant === "milestone"}
          pose={kittenPose}
          showFloor={false}
        />
      </Animated.View>
    </View>
  );
}

function itemKittenPose(itemId: CatItemId): CatPose | undefined {
  if (itemId === "high-five") return "high-five";
  if (itemId === "paw-shake") return "paw-shake";
  return undefined;
}

function Bowl({ children }: { children: ReactNode }) {
  return (
    <View style={styles.bowlObject}>
      <View style={styles.bowlContents}>{children}</View>
      <View style={styles.bowlRim} />
      <View style={styles.bowlBase} />
    </View>
  );
}

function MilkBowlVisual() {
  return <Bowl><View style={styles.milkSurface} /></Bowl>;
}

function WetFoodBowlVisual() {
  return (
    <Bowl>
      <View style={[styles.foodMound, styles.wetFoodMound]} />
      <View style={[styles.foodBit, styles.foodBitOne]} />
      <View style={[styles.foodBit, styles.foodBitTwo]} />
    </Bowl>
  );
}

function KibbleBowlVisual() {
  return (
    <Bowl>
      <View style={[styles.kibble, styles.kibbleOne]} />
      <View style={[styles.kibble, styles.kibbleTwo]} />
      <View style={[styles.kibble, styles.kibbleThree]} />
      <View style={[styles.kibble, styles.kibbleFour]} />
    </Bowl>
  );
}

function TreatStickVisual() {
  return (
    <View style={styles.treatStick}>
      <View style={styles.treatStickTop} />
      <View style={styles.treatStickStripe} />
      <View style={styles.treatStickBottom} />
    </View>
  );
}

function TreatCubesVisual() {
  return (
    <>
      <View style={[styles.treatCube, styles.treatCubeOne]} />
      <View style={[styles.treatCube, styles.treatCubeTwo]} />
      <View style={[styles.treatCube, styles.treatCubeThree]} />
      <View style={[styles.treatCube, styles.treatCubeFour]} />
    </>
  );
}

function YarnVisual() {
  return (
    <>
      <View style={styles.yarnBall}>
        <View style={[styles.yarnStripe, styles.yarnStripeOne]} />
        <View style={[styles.yarnStripe, styles.yarnStripeTwo]} />
      </View>
      <View style={styles.yarnTail} />
    </>
  );
}

function MouseVisual() {
  return (
    <>
      <View style={styles.mouseTail} />
      <View style={styles.mouseBody}>
        <View style={styles.mouseEar} />
        <View style={styles.mouseEye} />
        <View style={styles.mouseNose} />
      </View>
    </>
  );
}

function WandVisual() {
  return (
    <>
      <View style={styles.wandHandle} />
      <View style={styles.wandString} />
      <View style={styles.wandTip} />
    </>
  );
}

function ScratchingPostVisual() {
  return (
    <>
      <View style={styles.scratchingPostTop} />
      <View style={styles.scratchingPostColumn} />
      <View style={styles.scratchingPostBase} />
    </>
  );
}

function CatBedVisual() {
  return <View style={styles.catBed} />;
}

function WindowCushionVisual() {
  return (
    <>
      <View style={styles.cushionWindow} />
      <View style={styles.windowCushion} />
    </>
  );
}

function CatTreeVisual() {
  return (
    <>
      <View style={styles.treeTop} />
      <View style={styles.treeUpperPost} />
      <View style={styles.treeMiddle} />
      <View style={styles.treeLowerPost} />
      <View style={styles.treeBase} />
    </>
  );
}

function GardenVisual() {
  return (
    <>
      <View style={styles.gardenSun} />
      <View style={[styles.gardenStem, styles.gardenStemOne]} />
      <View style={[styles.gardenStem, styles.gardenStemTwo]} />
      <View style={[styles.gardenFlower, styles.gardenFlowerOne]} />
      <View style={[styles.gardenFlower, styles.gardenFlowerTwo]} />
      <View style={styles.gardenGround} />
    </>
  );
}

function ButterflyVisual() {
  return (
    <View style={styles.butterfly}>
      <View style={[styles.butterflyWing, styles.butterflyWingLeft]} />
      <View style={styles.butterflyBody} />
      <View style={[styles.butterflyWing, styles.butterflyWingRight]} />
    </View>
  );
}

const styles = StyleSheet.create({
  kittenScene: {
    alignItems: "center",
    alignSelf: "center",
    height: 320,
    justifyContent: "center",
    maxWidth: 380,
    position: "relative",
    width: "100%",
  },
  kittenSceneSprite: {
    alignItems: "center",
    height: 228,
    justifyContent: "center",
    transform: [{ scale: 1.12 }],
    width: 332,
  },
  kittenSceneFloor: {
    backgroundColor: "rgba(139, 90, 53, 0.18)",
    bottom: 55,
    height: 3,
    position: "absolute",
    width: 236,
  },
  kittenSceneFloorHighlight: {
    backgroundColor: "rgba(239, 203, 162, 0.3)",
    height: 2,
    left: 24,
    position: "absolute",
    right: 24,
    top: 3,
  },
  emphasisMarks: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  attentionPixel: { backgroundColor: pixelPalette.pink, height: 18, position: "absolute", width: 7 },
  attentionPixelOne: { left: 64, top: 91, transform: [{ rotate: "-42deg" }] },
  attentionPixelTwo: { height: 7, left: 53, top: 130, transform: [{ rotate: "-10deg" }], width: 17 },
  attentionPixelFour: { right: 64, top: 91, transform: [{ rotate: "42deg" }] },
  attentionPixelFive: { height: 7, right: 53, top: 130, transform: [{ rotate: "10deg" }], width: 17 },
  focusRing: { alignItems: "center", justifyContent: "center", position: "relative" },
  focusRingContent: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  focusRingLabel: {
    color: "#7A6354",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginTop: 8,
    textTransform: "uppercase",
  },
  focusRingValue: {
    color: pixelPalette.brown,
    fontVariant: ["tabular-nums"],
    fontWeight: "800",
    letterSpacing: -1,
    textAlign: "center",
  },
  iconBox: { alignItems: "center", justifyContent: "center", position: "relative" },
  directionIcon: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  directionCanvas: { height: 48, position: "relative", width: 48 },
  laptopScreen: { backgroundColor: pixelPalette.brown, height: 25, left: 7, padding: 4, position: "absolute", top: 6, width: 34 },
  laptopPage: { backgroundColor: pixelPalette.peach, height: 13, width: 26 },
  laptopBase: { backgroundColor: pixelPalette.orange, height: 7, left: 3, position: "absolute", top: 33, width: 42 },
  homeRoof: { backgroundColor: pixelPalette.orangeDark, height: 25, left: 12, position: "absolute", top: 4, transform: [{ rotate: "45deg" }], width: 25 },
  homeBody: { backgroundColor: pixelPalette.orange, height: 24, left: 8, position: "absolute", top: 20, width: 32 },
  homeDoor: { backgroundColor: pixelPalette.brown, bottom: 0, height: 14, left: 6, position: "absolute", width: 8 },
  homeWindow: { backgroundColor: pixelPalette.peach, height: 8, position: "absolute", right: 5, top: 6, width: 8 },
  dumbbellBar: { backgroundColor: pixelPalette.orange, height: 7, left: 8, position: "absolute", top: 21, width: 32 },
  dumbbellWeight: { backgroundColor: pixelPalette.brown, height: 25, position: "absolute", top: 12, width: 8 },
  dumbbellWeightLeft: { left: 6 },
  dumbbellWeightRight: { right: 6 },
  controllerBody: { backgroundColor: pixelPalette.orange, borderColor: pixelPalette.brown, borderRadius: 7, borderWidth: 3, height: 29, left: 4, position: "absolute", top: 10, width: 40 },
  controllerDpadHorizontal: { backgroundColor: pixelPalette.brown, height: 5, left: 6, position: "absolute", top: 10, width: 13 },
  controllerDpadVertical: { backgroundColor: pixelPalette.brown, height: 13, left: 10, position: "absolute", top: 6, width: 5 },
  controllerButtonOne: { backgroundColor: pixelPalette.pink, height: 6, position: "absolute", right: 7, top: 8, width: 6 },
  controllerButtonTwo: { backgroundColor: pixelPalette.brown, bottom: 7, height: 5, position: "absolute", right: 14, width: 5 },
  restMoon: { backgroundColor: pixelPalette.orange, borderRadius: 16, height: 32, left: 4, overflow: "hidden", position: "absolute", top: 3, width: 32 },
  restMoonCutout: { backgroundColor: pixelPalette.creamStrong, borderRadius: 13, height: 27, left: 11, position: "absolute", top: -2, width: 27 },
  restPillow: { backgroundColor: pixelPalette.pink, borderColor: pixelPalette.brown, borderRadius: 4, borderWidth: 2, bottom: 3, height: 15, position: "absolute", right: 2, transform: [{ rotate: "-8deg" }], width: 24 },
  coin: {
    alignItems: "center",
    aspectRatio: 1,
    backgroundColor: "#F5B35F",
    borderColor: pixelPalette.orangeDark,
    borderRadius: 999,
    height: "92%",
    justifyContent: "center",
  },
  coinCore: { backgroundColor: pixelPalette.orangeDark, height: "36%", width: "20%" },
  coinShine: {
    backgroundColor: "#FFE3A0",
    height: "18%",
    left: "18%",
    position: "absolute",
    top: "16%",
    width: "18%",
  },
  coinCatEarLeft: { backgroundColor: pixelPalette.orangeDark, height: "20%", left: "24%", position: "absolute", top: "27%", transform: [{ rotate: "45deg" }], width: "20%" },
  coinCatEarRight: { backgroundColor: pixelPalette.orangeDark, height: "20%", position: "absolute", right: "24%", top: "27%", transform: [{ rotate: "45deg" }], width: "20%" },
  coinCatFace: { backgroundColor: pixelPalette.orangeDark, bottom: "19%", height: "45%", position: "absolute", width: "56%" },
  coinCatEyeLeft: { backgroundColor: "#FFE3A0", height: "17%", left: "19%", position: "absolute", top: "25%", width: "17%" },
  coinCatEyeRight: { backgroundColor: "#FFE3A0", height: "17%", position: "absolute", right: "19%", top: "25%", width: "17%" },
  coinCatMuzzle: { backgroundColor: "#FFE3A0", bottom: "13%", height: "18%", left: "38%", position: "absolute", width: "24%" },
  medalRibbonLeft: { backgroundColor: pixelPalette.pink, height: 15, left: 6, position: "absolute", top: 0, transform: [{ rotate: "-18deg" }], width: 7 },
  medalRibbonRight: { backgroundColor: pixelPalette.orange, height: 15, position: "absolute", right: 6, top: 0, transform: [{ rotate: "18deg" }], width: 7 },
  medalDisc: { alignItems: "center", backgroundColor: "#F5B35F", borderColor: pixelPalette.orangeDark, borderRadius: 10, borderWidth: 2, bottom: 0, height: 21, justifyContent: "center", position: "absolute", width: 21 },
  medalStarHorizontal: { backgroundColor: pixelPalette.orangeDark, height: 4, position: "absolute", width: 11 },
  medalStarVertical: { backgroundColor: pixelPalette.orangeDark, height: 11, position: "absolute", width: 4 },
  smallIconCanvas: { height: 28, position: "relative", width: 28 },
  storeRoof: { backgroundColor: pixelPalette.brown, height: 5, left: 2, position: "absolute", top: 2, width: 24 },
  storeBuilding: { backgroundColor: pixelPalette.peach, borderColor: pixelPalette.brown, borderWidth: 2, bottom: 1, height: 21, left: 3, position: "absolute", width: 22 },
  storeAwning: { backgroundColor: pixelPalette.pink, borderBottomColor: pixelPalette.brown, borderBottomWidth: 2, flexDirection: "row", height: 7, left: -2, position: "absolute", top: 1, width: 22 },
  storeAwningStripe: { backgroundColor: pixelPalette.cream, height: 5, left: 7, position: "absolute", top: 0, width: 6 },
  storeWindow: { backgroundColor: pixelPalette.cream, height: 6, left: 3, position: "absolute", top: 11, width: 7 },
  storeDoor: { backgroundColor: pixelPalette.orangeDark, bottom: 0, height: 9, position: "absolute", right: 3, width: 6 },
  collectionHandle: { borderColor: pixelPalette.brown, borderRadius: 6, borderWidth: 3, height: 11, left: 7, position: "absolute", top: 1, width: 14 },
  collectionBag: { backgroundColor: pixelPalette.orange, borderColor: pixelPalette.brown, borderRadius: 4, borderWidth: 2, bottom: 1, height: 20, left: 3, position: "absolute", width: 22 },
  collectionFlap: { backgroundColor: pixelPalette.peach, borderBottomColor: pixelPalette.brown, borderBottomWidth: 2, height: 7, left: 1, position: "absolute", right: 1, top: 2 },
  collectionPocket: { backgroundColor: pixelPalette.pink, borderColor: pixelPalette.brown, borderWidth: 2, bottom: 2, height: 7, left: 6, position: "absolute", width: 7 },
  itemIcon: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  itemCanvas: { height: 64, position: "relative", width: 64 },
  bowlObject: { height: 44, left: 6, position: "absolute", top: 10, width: 52 },
  bowlContents: { alignItems: "center", height: 18, justifyContent: "flex-end", left: 7, position: "absolute", top: 0, width: 38, zIndex: 2 },
  bowlRim: { backgroundColor: "#F0D5B5", borderColor: pixelPalette.brown, borderRadius: 3, borderWidth: 3, height: 10, left: 2, position: "absolute", top: 16, width: 48, zIndex: 3 },
  bowlBase: { backgroundColor: pixelPalette.orange, borderBottomLeftRadius: 7, borderBottomRightRadius: 7, borderColor: pixelPalette.brown, borderTopWidth: 0, borderWidth: 3, height: 17, left: 7, position: "absolute", top: 24, width: 38 },
  milkSurface: { backgroundColor: "#D8EEF2", borderColor: "#8FB8C1", borderTopWidth: 3, height: 8, width: 34 },
  foodMound: { borderTopLeftRadius: 12, borderTopRightRadius: 12, height: 16, width: 30 },
  wetFoodMound: { backgroundColor: "#B96F5B" },
  foodBit: { backgroundColor: "#D99375", height: 5, position: "absolute", top: 8, width: 5 },
  foodBitOne: { left: 7 },
  foodBitTwo: { right: 8, top: 12 },
  kibble: { backgroundColor: pixelPalette.orangeDark, borderRadius: 4, height: 8, position: "absolute", width: 8 },
  kibbleOne: { bottom: 0, left: 2 },
  kibbleTwo: { bottom: 7, left: 10 },
  kibbleThree: { bottom: 1, right: 7 },
  kibbleFour: { bottom: 8, right: 0 },
  treatStick: { backgroundColor: pixelPalette.pink, borderColor: pixelPalette.brown, borderRadius: 3, borderWidth: 3, height: 50, left: 22, position: "absolute", top: 7, transform: [{ rotate: "10deg" }], width: 20 },
  treatStickTop: { backgroundColor: "#FFF0DB", height: 5, left: 2, position: "absolute", right: 2, top: 3 },
  treatStickStripe: { backgroundColor: pixelPalette.orangeDark, height: 6, left: 2, position: "absolute", right: 2, top: 18 },
  treatStickBottom: { backgroundColor: "#FFF0DB", bottom: 3, height: 4, left: 2, position: "absolute", right: 2 },
  treatCube: { backgroundColor: "#D69259", borderColor: pixelPalette.brown, borderRadius: 2, borderWidth: 2, height: 16, position: "absolute", width: 16 },
  treatCubeOne: { left: 7, top: 31 },
  treatCubeTwo: { left: 19, top: 12 },
  treatCubeThree: { left: 37, top: 27 },
  treatCubeFour: { left: 24, top: 36 },
  yarnBall: { backgroundColor: "#9C6644", borderColor: "#6F422A", borderRadius: 19, borderWidth: 3, height: 38, left: 8, position: "absolute", top: 12, width: 38 },
  yarnStripe: { backgroundColor: "#F0D5B5", height: 3, left: 6, position: "absolute", top: 16, width: 25 },
  yarnStripeOne: { transform: [{ rotate: "28deg" }] },
  yarnStripeTwo: { transform: [{ rotate: "-35deg" }] },
  yarnTail: { borderBottomColor: "#9C6644", borderBottomWidth: 3, borderRadius: 10, bottom: 7, height: 14, position: "absolute", right: 3, transform: [{ rotate: "14deg" }], width: 22 },
  mouseBody: { backgroundColor: "#817A85", borderColor: "#514B55", borderRadius: 14, borderWidth: 3, height: 28, left: 20, position: "absolute", top: 19, width: 36 },
  mouseEar: { backgroundColor: "#C58B9A", borderColor: "#514B55", borderRadius: 7, borderWidth: 2, height: 13, left: 4, position: "absolute", top: -7, width: 13 },
  mouseEye: { backgroundColor: "#2E2930", height: 5, position: "absolute", right: 7, top: 7, width: 5 },
  mouseNose: { backgroundColor: "#C66F7C", height: 6, position: "absolute", right: -5, top: 12, width: 6 },
  mouseTail: { borderColor: "#A36D78", borderRadius: 14, borderTopWidth: 3, height: 18, left: 3, position: "absolute", top: 25, transform: [{ rotate: "-12deg" }], width: 22 },
  wandHandle: { backgroundColor: "#6D4C41", height: 48, position: "absolute", right: 12, top: 2, transform: [{ rotate: "24deg" }], width: 6 },
  wandString: { backgroundColor: "#715B77", height: 38, position: "absolute", right: 28, top: 28, transform: [{ rotate: "38deg" }], width: 2 },
  wandTip: { backgroundColor: "#E76F51", borderColor: "#A83D31", borderRadius: 2, borderWidth: 2, bottom: 0, height: 16, left: 6, position: "absolute", width: 16 },
  scratchingPostTop: { backgroundColor: "#8F5C32", height: 9, left: 20, position: "absolute", top: 5, width: 25 },
  scratchingPostColumn: { backgroundColor: "#C59A6D", borderColor: "#8F5C32", borderWidth: 3, height: 44, left: 25, position: "absolute", top: 12, width: 15 },
  scratchingPostBase: { backgroundColor: "#8F5C32", bottom: 3, height: 10, left: 7, position: "absolute", width: 50 },
  catBed: { backgroundColor: "#D9A4C4", borderColor: "#8C5177", borderRadius: 26, borderWidth: 4, bottom: 8, height: 34, left: 5, position: "absolute", width: 54 },
  cushionWindow: { backgroundColor: "#BFE5F5", borderColor: "#FFFDF2", borderWidth: 4, height: 40, left: 9, position: "absolute", top: 4, width: 46 },
  windowCushion: { backgroundColor: "#D79B62", borderColor: "#8F5C32", borderWidth: 3, bottom: 9, height: 13, left: 6, position: "absolute", width: 52 },
  treeTop: { backgroundColor: "#B8865B", borderColor: "#70452B", borderWidth: 2, height: 9, left: 5, position: "absolute", top: 4, width: 33 },
  treeUpperPost: { backgroundColor: "#C59A6D", height: 22, left: 18, position: "absolute", top: 12, width: 8 },
  treeMiddle: { backgroundColor: "#B8865B", borderColor: "#70452B", borderWidth: 2, height: 9, left: 12, position: "absolute", top: 31, width: 42 },
  treeLowerPost: { backgroundColor: "#C59A6D", height: 18, left: 36, position: "absolute", top: 39, width: 9 },
  treeBase: { backgroundColor: "#8F5C32", bottom: 3, height: 9, left: 8, position: "absolute", width: 50 },
  gardenSun: { backgroundColor: "#F5B35F", height: 14, position: "absolute", right: 8, top: 7, width: 14 },
  gardenStem: { backgroundColor: "#75995B", bottom: 10, position: "absolute", width: 4 },
  gardenStemOne: { height: 26, left: 18 },
  gardenStemTwo: { height: 20, left: 40 },
  gardenFlower: { backgroundColor: pixelPalette.pink, height: 12, position: "absolute", width: 12 },
  gardenFlowerOne: { bottom: 32, left: 14 },
  gardenFlowerTwo: { bottom: 26, left: 36 },
  gardenGround: { backgroundColor: "#75995B", bottom: 5, height: 7, left: 4, position: "absolute", width: 56 },
  butterfly: { alignItems: "center", flexDirection: "row", height: 30, justifyContent: "center", left: 10, position: "absolute", top: 17, width: 44 },
  butterflyWing: { borderRadius: 3, height: 23, width: 18 },
  butterflyWingLeft: { backgroundColor: "#F4A261", transform: [{ rotate: "-18deg" }] },
  butterflyWingRight: { backgroundColor: "#E76F51", transform: [{ rotate: "18deg" }] },
  butterflyBody: { backgroundColor: "#50394C", height: 25, marginHorizontal: -1, width: 5, zIndex: 2 },
  stepScene: { alignSelf: "center", height: 218, maxWidth: 340, position: "relative", width: "100%" },
  stepsRow: { alignItems: "flex-end", bottom: 8, flexDirection: "row", justifyContent: "center", left: 5, position: "absolute", right: 5 },
  pixelPlatform: { borderColor: "#6C4430", borderRadius: 7, borderWidth: 4, overflow: "hidden", width: 92 },
  pixelPlatformOne: { backgroundColor: "#F3B6A2", height: 46 },
  pixelPlatformTwo: { backgroundColor: "#ECA668", borderLeftWidth: 2, height: 78, marginLeft: -3 },
  pixelPlatformThree: { backgroundColor: "#D77B4A", borderLeftWidth: 2, height: 110, marginLeft: -3 },
  stepHighlight: { backgroundColor: "rgba(255,255,255,0.28)", height: 8, left: 5, position: "absolute", right: 5, top: 5 },
  stepKitten: { bottom: 65, position: "absolute", right: 18, width: 190 },
  stepKittenFocus: { bottom: 51, right: 70 },
  pixelSpark: { backgroundColor: "#D95F76", borderRadius: 2, height: 10, position: "absolute", transform: [{ rotate: "12deg" }], width: 10 },
  pixelSparkOne: { left: 28, top: 48 },
  pixelSparkTwo: { height: 7, right: 48, top: 6, width: 7 },
  rewardReveal: { alignItems: "center", position: "absolute", right: 22, top: 22 },
  rewardPixelTop: { backgroundColor: "#D95F76", height: 9, width: 24 },
  rewardPixelCore: { backgroundColor: "#F5B35F", borderColor: "#6C4430", borderWidth: 4, height: 38, width: 42 },
});
