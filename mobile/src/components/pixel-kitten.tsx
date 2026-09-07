import { StyleSheet, View } from "react-native";
import Svg, {
  Circle,
  G,
  Line,
  Path,
  Polygon,
  Rect,
  Text as SvgText,
} from "react-native-svg";

import type { CatPose } from "../domain/cat.ts";

interface PixelKittenProps {
  accessibilityLabel: string;
  pose: CatPose;
}

// Source of truth: the Web PixelKitten in src/app/first-move-app.tsx.
// Keep the 160x110 canvas, baseline, palette, and pose geometry aligned.
export function PixelKitten({ accessibilityLabel, pose }: PixelKittenProps) {
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
      style={styles.sprite}
    >
      <Svg accessibilityElementsHidden viewBox="0 0 160 110" width="100%" height="100%">
        <Rect x={8} y={94} width={144} height={4} fill="#b08968" />
        <Rect x={18} y={98} width={124} height={3} fill="#ddb892" />
        {pose === "sleeping" ? (
          <SleepingKitten />
        ) : pose === "walking" ? (
          <WalkingKitten />
        ) : pose === "milk" ? (
          <DrinkingKitten />
        ) : pose === "food" ? (
          <EatingKitten />
        ) : pose === "treat" ? (
          <LickingKitten />
        ) : pose === "yarn" ? (
          <PlayingKitten />
        ) : pose === "wand" ? (
          <WandKitten />
        ) : pose === "high-five" ? (
          <HighFiveKitten />
        ) : pose === "paw-shake" ? (
          <PawShakeKitten />
        ) : pose === "butterfly" ? (
          <ButterflyKitten />
        ) : (
          <SittingKitten />
        )}
      </Svg>
    </View>
  );
}

const fur = "#b77945";
const furDark = "#7c4a2d";
const furLight = "#e7bd8c";
const ink = "#3f2d24";

function CatFace({
  happy = false,
  sleepy = false,
  x,
  y,
}: {
  happy?: boolean;
  sleepy?: boolean;
  x: number;
  y: number;
}) {
  return (
    <G>
      <Polygon points={`${x},${y + 12} ${x + 5},${y} ${x + 13},${y + 12}`} fill={furDark} />
      <Polygon points={`${x + 27},${y + 12} ${x + 35},${y} ${x + 40},${y + 12}`} fill={furDark} />
      <Polygon points={`${x + 4},${y + 9} ${x + 6},${y + 4} ${x + 10},${y + 10}`} fill="#e8a4a4" />
      <Polygon points={`${x + 30},${y + 10} ${x + 34},${y + 4} ${x + 36},${y + 9}`} fill="#e8a4a4" />
      <Rect x={x + 4} y={y + 9} width={32} height={24} fill={fur} />
      <Rect x={x + 1} y={y + 15} width={38} height={12} fill={fur} />
      <Rect x={x + 10} y={y + 20} width={20} height={13} fill={furLight} />
      {sleepy || happy ? (
        <>
          <Rect x={x + 9} y={y + 18} width={6} height={2} fill={ink} />
          <Rect x={x + 25} y={y + 18} width={6} height={2} fill={ink} />
        </>
      ) : (
        <>
          <Rect x={x + 10} y={y + 17} width={4} height={5} fill={ink} />
          <Rect x={x + 26} y={y + 17} width={4} height={5} fill={ink} />
        </>
      )}
      <Rect x={x + 18} y={y + 23} width={4} height={3} fill={furDark} />
      <Rect x={x + 16} y={y + 27} width={3} height={1} fill={furDark} />
      <Rect x={x + 21} y={y + 27} width={3} height={1} fill={furDark} />
      <Whiskers x={x} y={y} />
    </G>
  );
}

function Whiskers({ x, y }: { x: number; y: number }) {
  return (
    <G stroke={ink} strokeWidth={1}>
      <Line x1={x + 12} y1={y + 26} x2={x - 3} y2={y + 23} />
      <Line x1={x + 12} y1={y + 29} x2={x - 4} y2={y + 31} />
      <Line x1={x + 28} y1={y + 26} x2={x + 43} y2={y + 23} />
      <Line x1={x + 28} y1={y + 29} x2={x + 44} y2={y + 31} />
    </G>
  );
}

function CurvedTail({
  raised = false,
  x,
  y,
}: {
  raised?: boolean;
  x: number;
  y: number;
}) {
  return raised ? (
    <G fill={furDark}>
      <Rect x={x} y={y} width={7} height={25} />
      <Rect x={x + 5} y={y - 8} width={16} height={7} />
      <Rect x={x + 16} y={y - 3} width={7} height={12} />
    </G>
  ) : (
    <G fill={furDark}>
      <Rect x={x} y={y} width={22} height={7} />
      <Rect x={x + 17} y={y - 9} width={7} height={14} />
      <Rect x={x + 20} y={y - 13} width={10} height={6} />
    </G>
  );
}

function SittingKitten() {
  return (
    <G>
      <CurvedTail x={93} y={81} />
      <Rect x={65} y={49} width={34} height={39} fill={fur} />
      <Rect x={71} y={55} width={22} height={33} fill={furLight} />
      <CatFace x={62} y={17} />
      <Rect x={64} y={82} width={8} height={12} fill={furDark} />
      <Rect x={74} y={82} width={8} height={12} fill={fur} />
      <Rect x={86} y={82} width={8} height={12} fill={fur} />
      <Rect x={96} y={82} width={8} height={12} fill={furDark} />
    </G>
  );
}

function WalkingKitten() {
  return <WalkingFrame />;
}

function WalkingFrame() {
  return (
    <G>
      <CurvedTail x={40} y={58} raised />
      <Rect x={51} y={51} width={50} height={27} fill={fur} />
      <Rect x={57} y={57} width={36} height={16} fill={furLight} />
      <CatFace x={93} y={35} />
      <Rect x={55} y={75} width={8} height={19} fill={furDark} />
      <Rect x={70} y={75} width={8} height={14} fill={fur} />
      <Rect x={86} y={75} width={8} height={19} fill={fur} />
      <Rect x={99} y={75} width={8} height={14} fill={furDark} />
    </G>
  );
}

function SleepingKitten() {
  return (
    <G>
      <CurvedTail x={98} y={82} />
      <Rect x={48} y={65} width={62} height={25} fill={fur} />
      <Rect x={57} y={72} width={45} height={18} fill={furLight} />
      <CatFace x={30} y={55} sleepy />
      <Rect x={54} y={85} width={12} height={7} fill={furDark} />
      <Rect x={68} y={85} width={12} height={7} fill={fur} />
      <Rect x={82} y={85} width={12} height={7} fill={fur} />
      <Rect x={96} y={85} width={12} height={7} fill={furDark} />
      <SvgText x={112} y={57} fill={ink} fontSize={10} fontWeight="bold">z</SvgText>
      <SvgText x={121} y={48} fill={ink} fontSize={8} fontWeight="bold">z</SvgText>
    </G>
  );
}

function DrinkingKitten() {
  return (
    <G>
      <Rect x={121} y={88} width={27} height={6} fill="#8aa4a8" />
      <Rect x={125} y={86} width={19} height={3} fill="#f8fafc" />
      <Rect x={112} y={59} width={8} height={26} fill="#f4f1de" />
      <Rect x={114} y={62} width={4} height={7} fill="#9ad1d4" />
      <CurvedTail x={42} y={75} />
      <Rect x={52} y={62} width={49} height={24} fill={fur} />
      <Rect x={59} y={68} width={34} height={15} fill={furLight} />
      <CatFace x={99} y={49} />
      <Rect x={57} y={82} width={10} height={12} fill={furDark} />
      <Rect x={72} y={84} width={10} height={10} fill={fur} />
      <Rect x={91} y={84} width={10} height={10} fill={furDark} />
    </G>
  );
}

function EatingKitten() {
  return (
    <G>
      <Rect x={122} y={86} width={25} height={8} fill="#52796f" />
      <G fill="#7c4a2d">
        <Rect x={126} y={82} width={4} height={4} />
        <Rect x={133} y={81} width={4} height={4} />
        <Rect x={140} y={83} width={4} height={3} />
        <Rect x={130} y={85} width={4} height={2} />
      </G>
      <CurvedTail x={42} y={75} />
      <Rect x={52} y={62} width={49} height={24} fill={fur} />
      <Rect x={59} y={68} width={34} height={15} fill={furLight} />
      <CatFace x={99} y={49} />
      <Rect x={57} y={82} width={10} height={12} fill={furDark} />
      <Rect x={70} y={84} width={10} height={10} fill={fur} />
      <Rect x={86} y={84} width={10} height={10} fill={fur} />
      <Rect x={99} y={82} width={10} height={12} fill={furDark} />
    </G>
  );
}

function LickingKitten() {
  return (
    <G>
      <Rect x={125} y={63} width={14} height={27} fill="#d97757" />
      <Rect x={128} y={67} width={8} height={5} fill="#f8d5c2" />
      <Rect x={121} y={75} width={5} height={4} fill="#e8a4a4" />
      <CurvedTail x={43} y={76} />
      <Rect x={58} y={55} width={43} height={31} fill={fur} />
      <CatFace x={78} y={28} happy />
      <Rect x={63} y={81} width={9} height={13} fill={furDark} />
      <Rect x={78} y={81} width={9} height={13} fill={fur} />
      <Rect x={95} y={81} width={9} height={13} fill={furDark} />
    </G>
  );
}

function PlayingKitten() {
  return (
    <G>
      <CurvedTail x={43} y={75} raised />
      <Rect x={58} y={55} width={43} height={31} fill={fur} />
      <CatFace x={74} y={25} />
      <Rect x={62} y={81} width={8} height={13} fill={furDark} />
      <Rect x={74} y={81} width={8} height={13} fill={fur} />
      <Rect x={91} y={78} width={28} height={7} fill={fur} />
      <Rect x={105} y={84} width={8} height={8} fill={furDark} />
      <Circle cx={130} cy={86} r={10} fill="#9c6644" />
      <Path d="M120 87h20M126 78l8 17M122 81l15 11" stroke="#f0d5b5" strokeWidth={2} />
    </G>
  );
}

function WandKitten() {
  return (
    <G>
      <CurvedTail x={43} y={75} raised />
      <Rect x={58} y={55} width={43} height={31} fill={fur} />
      <CatFace x={74} y={25} />
      <Rect x={62} y={81} width={8} height={13} fill={furDark} />
      <Rect x={76} y={81} width={8} height={13} fill={fur} />
      <Rect x={94} y={74} width={25} height={7} fill={fur} />
      <Rect x={111} y={79} width={8} height={8} fill={furDark} />
    </G>
  );
}

function HighFiveKitten() {
  return (
    <G>
      <SittingKitten />
      <Rect x={105} y={53} width={9} height={28} fill={fur} />
      <Rect x={113} y={50} width={8} height={9} fill={furDark} />
      <Rect x={128} y={45} width={20} height={28} rx={3} fill="#d8a47f" />
      <Rect x={122} y={51} width={10} height={7} fill="#d8a47f" />
    </G>
  );
}

function PawShakeKitten() {
  return (
    <G>
      <SittingKitten />
      <Rect x={98} y={78} width={28} height={8} fill={fur} />
      <Rect x={119} y={80} width={25} height={12} rx={3} fill="#d8a47f" />
      <Rect x={137} y={70} width={10} height={20} fill="#d8a47f" />
    </G>
  );
}

function ButterflyKitten() {
  return (
    <G>
      <PlayingKitten />
      <G transform="translate(2 -15)">
        <Rect x={128} y={42} width={3} height={9} fill="#50394c" />
        <Rect x={120} y={39} width={8} height={7} fill="#f4a261" />
        <Rect x={131} y={39} width={8} height={7} fill="#e76f51" />
      </G>
    </G>
  );
}

const styles = StyleSheet.create({
  sprite: {
    aspectRatio: 160 / 110,
    maxWidth: 250,
    width: "76%",
    zIndex: 3,
  },
});
