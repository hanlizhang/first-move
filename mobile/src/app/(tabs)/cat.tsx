import { useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  useFirstMoveApp,
  type CatEconomyActionOutcome,
} from "../../app-state/app-provider.tsx";
import { PixelKitten } from "../../components/pixel-kitten.tsx";
import { useCurrentLocalDate } from "../../components/use-current-local-date.ts";
import { Body, Card, LoadingState, Screen } from "../../components/ui.tsx";
import {
  catActionDisableState,
  catReactionCaption,
  getCatRoomView,
  inventoryQuantity,
  purchaseAvailability,
  selectCatFurniture,
  type CatPose,
  type CatRoomView,
} from "../../domain/cat.ts";
import {
  CAT_STORE_CATEGORIES,
  CAT_STORE_ITEMS,
  catItem,
  isCatItemUnlocked,
  type CatCatalogItem,
  type CatItemId,
} from "../../domain/cat-items.ts";
import { colors, radii, spacing, touchTarget, typography } from "../../theme/tokens.ts";

type CatSection = "room" | "store";

export default function CatScreen() {
  const {
    auth,
    buyCatItem,
    localWorkspace,
    localWorkspaceMessage,
    localWorkspaceStatus,
    sync,
    updateLocalWorkspace,
    feedCatFood,
    workspaceEditable,
  } = useFirstMoveApp();
  const today = useCurrentLocalDate();
  const room = useMemo(
    () => getCatRoomView(localWorkspace, today),
    [localWorkspace, today],
  );
  const [section, setSection] = useState<CatSection>("room");
  const [savingId, setSavingId] = useState<string>();
  const [notice, setNotice] = useState("");
  const [pose, setPose] = useState<CatPose>("sitting");
  const pendingAuthenticatedWrite =
    auth.status === "authenticated" && sync.pendingCount > 0;
  const { transientInteractionDisabled, economicWriteDisabled } =
    catActionDisableState({
      localWorkspaceLoaded: localWorkspaceStatus === "ready",
      workspaceEditable,
      actionSaving: Boolean(savingId),
      pendingAuthenticatedWrite,
    });

  if (localWorkspaceStatus === "loading") {
    return (
      <Screen title="Cat Room">
        <LoadingState label="Opening the Cat Room…" />
      </Screen>
    );
  }

  async function buy(item: CatCatalogItem) {
    setSavingId(item.id);
    const outcome = await buyCatItem(item.id, today);
    setNotice(purchaseMessage(item, outcome));
    setSavingId(undefined);
  }

  async function feed(item: CatCatalogItem) {
    setSavingId(item.id);
    const outcome = await feedCatFood(item.id, today);
    if (outcome === "used") {
      setPose(foodPose(item.id));
      setNotice("");
    } else {
      setNotice(consumptionMessage(outcome));
    }
    setSavingId(undefined);
  }

  function play(nextPose: CatPose) {
    setPose(nextPose);
    setNotice("");
  }

  async function chooseFurniture(itemId?: CatItemId) {
    setSavingId(itemId ?? "room-clear");
    const next = await updateLocalWorkspace((state) =>
      selectCatFurniture(state, itemId),
    );
    setNotice(
      next
        ? itemId
          ? `${catItem(itemId)?.name ?? "Furniture"} is now in the room.`
          : "The room has a little more open space."
        : "That room choice could not be saved yet.",
    );
    setSavingId(undefined);
  }

  return (
    <Screen
      eyebrow="Cat"
      title="Cat Room"
      description="A cozy companion and a few rewards for the steps you choose to take."
    >
      <View accessibilityRole="tablist" style={styles.sectionTabs}>
        <SectionTab active={section === "room"} label="Room" onPress={() => setSection("room")} />
        <SectionTab active={section === "store"} label="Store" onPress={() => setSection("store")} />
      </View>

      {localWorkspaceMessage ? (
        <Card tone="warning"><Body>{localWorkspaceMessage}</Body></Card>
      ) : null}
      {!workspaceEditable && auth.status === "authenticated" ? (
        <Card tone="warning"><Body>The Cat Room will be ready when this account finishes loading.</Body></Card>
      ) : null}
      {pendingAuthenticatedWrite ? (
        <Card tone="warning"><Body>Your Cat Room change is safe and waiting to sync.</Body></Card>
      ) : null}
      {notice ? (
        <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>
      ) : null}

      {section === "room" ? (
        <CatRoom
          economicWriteDisabled={economicWriteDisabled}
          transientInteractionDisabled={transientInteractionDisabled}
          onChooseFurniture={(itemId) => void chooseFurniture(itemId)}
          onFeed={(item) => void feed(item)}
          onPlay={play}
          pose={pose}
          room={room}
        />
      ) : (
        <CatStore
          disabled={economicWriteDisabled}
          onBuy={(item) => void buy(item)}
          room={room}
          state={localWorkspace}
        />
      )}
    </Screen>
  );
}

function CatRoom({
  economicWriteDisabled,
  onChooseFurniture,
  onFeed,
  onPlay,
  pose,
  room,
  transientInteractionDisabled,
}: {
  economicWriteDisabled: boolean;
  onChooseFurniture(itemId?: CatItemId): void;
  onFeed(item: CatCatalogItem): void;
  onPlay(pose: CatPose): void;
  pose: CatPose;
  room: CatRoomView;
  transientInteractionDisabled: boolean;
}) {
  const gardenOwned = room.ownedScenes.some(({ item }) => item.id === "outdoor-garden");
  const garden = gardenOwned && (pose === "garden" || pose === "butterfly");
  const butterfly = room.ownedInteractions.some(({ item }) => item.id === "butterfly");
  const yarn = room.ownedToys.some(({ item }) => item.id === "yarn-toy");
  const wand = room.ownedToys.some(({ item }) => item.id === "teaser-wand");
  const highFive = room.ownedTricks.some(({ item }) => item.id === "high-five");
  const pawShake = room.ownedTricks.some(({ item }) => item.id === "paw-shake");
  const caption = catReactionCaption(pose, room.selectedFurniture?.id);

  return (
    <>
      <View style={styles.statGrid}>
        <Stat label="Current points" value={formatPoints(room.points)} />
        <Stat label="Growth chapter" value={room.stage} />
      </View>
      <Card>
        <Text style={styles.progressTitle}>
          {room.activeDays} active day{room.activeDays === 1 ? "" : "s"}
        </Text>
        <Body muted>
          {room.nextUnlock
            ? `Next: ${room.nextUnlock.label} at ${room.nextUnlock.day} active days.`
            : "All core Cat Room adventures are unlocked."}
        </Body>
        <View style={styles.growthStory}>
          <Text style={styles.growthTitle}>{room.growthStory.title}</Text>
          <Body>{room.growthStory.description}</Body>
          {room.growthStory.nextMilestone ? (
            <Body muted>
              Next story chapter: {room.growthStory.nextMilestone.label} around day {room.growthStory.nextMilestone.day}.
            </Body>
          ) : null}
          <Text style={styles.symbolicNote}>
            Active days are a symbolic journey, not a literal kitten age.
          </Text>
        </View>
      </Card>

      {room.returnMessage ? (
        <Card tone="success">
          <Text accessibilityLiveRegion="polite" style={styles.returnMessage}>
            {room.returnMessage}
          </Text>
        </Card>
      ) : null}

      <View
        accessibilityLabel={`${room.stage}. ${caption}`}
        style={[styles.room, garden && styles.gardenRoom]}
      >
        <View style={styles.window}><View style={styles.windowPane} /><View style={styles.windowPane} /></View>
        {garden ? <Text style={styles.gardenDetail}>✿ ･ﾟ 🦋 ･ﾟ ✿</Text> : null}
        <FurnitureVisual itemId={room.selectedFurniture?.id} />
        <PixelKitten accessibilityLabel={caption} pose={pose} />
        <View style={styles.roomMessage}>
          <Text accessibilityLiveRegion="polite" style={styles.roomMessageText}>{caption}</Text>
        </View>
      </View>

      <Card>
        <Text style={styles.cardTitle}>Spend time together</Text>
        <ActionGroup label="Kitten moments">
          <ActionButton disabled={transientInteractionDisabled} label="Sit together" onPress={() => onPlay("sitting")} />
          <ActionButton disabled={transientInteractionDisabled} label="Explore room" onPress={() => onPlay("walking")} />
          <ActionButton disabled={transientInteractionDisabled} label="Nap" onPress={() => onPlay("sleeping")} />
        </ActionGroup>
        {room.ownedFood.length > 0 ? (
          <ActionGroup label="Food">
            {room.ownedFood.map(({ item, quantity }) => (
              <ActionButton
                disabled={economicWriteDisabled}
                key={item.id}
                label={`Feed ${item.name} · ${quantity}`}
                onPress={() => onFeed(item)}
              />
            ))}
          </ActionGroup>
        ) : (
          <Body muted>Food you buy will appear here.</Body>
        )}
        {yarn || wand ? (
          <ActionGroup label="Toys">
            {yarn ? (
              <ActionButton
                disabled={transientInteractionDisabled}
                label="Play with yarn"
                onPress={() => onPlay("yarn")}
              />
            ) : null}
            {wand ? (
              <ActionButton
                disabled={transientInteractionDisabled}
                label="Play with teaser wand"
                onPress={() => onPlay("wand")}
              />
            ) : null}
          </ActionGroup>
        ) : null}
        {highFive || pawShake || butterfly || gardenOwned ? (
          <ActionGroup label="Tricks & adventures">
            {highFive ? (
              <ActionButton disabled={transientInteractionDisabled} label="High-five" onPress={() => onPlay("high-five")} />
            ) : null}
            {pawShake ? (
              <ActionButton disabled={transientInteractionDisabled} label="Paw shake" onPress={() => onPlay("paw-shake")} />
            ) : null}
            {gardenOwned ? (
              <ActionButton disabled={transientInteractionDisabled} label="Visit garden" onPress={() => onPlay("garden")} />
            ) : null}
            {butterfly ? (
              <ActionButton disabled={transientInteractionDisabled} label="Follow butterfly" onPress={() => onPlay("butterfly")} />
            ) : null}
          </ActionGroup>
        ) : null}
      </Card>

      <Inventory room={room} />

      {room.ownedFurniture.length > 0 ? (
        <Card>
          <Text style={styles.cardTitle}>Room furniture</Text>
          <Body muted>Choose one owned furnishing to show in the room.</Body>
          <View style={styles.actionWrap}>
            {room.ownedFurniture.map(({ item }) => (
              <ActionButton
                disabled={economicWriteDisabled || room.selectedFurniture?.id === item.id}
                key={item.id}
                label={room.selectedFurniture?.id === item.id ? `${item.name} · In room` : item.name}
                onPress={() => onChooseFurniture(item.id)}
              />
            ))}
            {room.selectedFurniture ? (
              <ActionButton disabled={economicWriteDisabled} label="Clear furnishing" onPress={() => onChooseFurniture(undefined)} />
            ) : null}
          </View>
        </Card>
      ) : null}
    </>
  );
}

function CatStore({
  disabled,
  onBuy,
  room,
  state,
}: {
  disabled: boolean;
  onBuy(item: CatCatalogItem): void;
  room: CatRoomView;
  state: Parameters<typeof purchaseAvailability>[0];
}) {
  return (
    <>
      <View style={styles.storeBalance}>
        <Text style={styles.storeBalanceLabel}>Current points</Text>
        <Text style={styles.storeBalanceValue}>{formatPoints(room.points)}</Text>
      </View>
      <Body muted>
        Food and treats can be bought again. Toys, furniture, and tricks stay yours. Locked rewards open with active days, never streaks.
      </Body>
      {CAT_STORE_CATEGORIES.map((category) => (
        <View key={category} style={styles.storeSection}>
          <Text accessibilityRole="header" style={styles.categoryTitle}>{category}</Text>
          {CAT_STORE_ITEMS.filter((item) => item.category === category).map((item) => {
            const quantity = inventoryQuantity(state, item.id);
            const availability = purchaseAvailability(state, item.id);
            const unlocked = isCatItemUnlocked(item, room.activeDays);
            return (
              <View key={item.id} style={styles.storeItem}>
                <View style={styles.storeItemCopy}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemDescription}>
                    {unlocked ? item.description : `Unlocks at ${item.unlockActiveDays} active days`}
                  </Text>
                  {item.kind === "food" && quantity > 0 ? (
                    <Text style={styles.ownedText}>Owned: {quantity}</Text>
                  ) : null}
                </View>
                <View style={styles.priceColumn}>
                  <Text style={styles.price}>{formatPoints(item.price)}</Text>
                  <ActionButton
                    disabled={disabled || availability !== "available"}
                    label={purchaseButtonLabel(availability)}
                    onPress={() => onBuy(item)}
                  />
                </View>
              </View>
            );
          })}
        </View>
      ))}
      <Card tone="success">
        <Text style={styles.cardTitle}>Build a room at your pace</Text>
        <Body>
          Consumables can be replenished. Every toy, furnishing, and trick you buy stays yours.
        </Body>
      </Card>
    </>
  );
}

function Inventory({ room }: { room: CatRoomView }) {
  const groups = [
    ["Food & treats", room.ownedFood],
    ["Toys", room.ownedToys],
    ["Furniture", room.ownedFurniture],
    ["Tricks", room.ownedTricks],
    ["Adventures", [...room.ownedScenes, ...room.ownedInteractions]],
  ] as const;
  const hasAnything = groups.some(([, entries]) => entries.length > 0);
  return (
    <Card>
      <Text style={styles.cardTitle}>Owned things</Text>
      {!hasAnything ? (
        <Body muted>Your first Cat Store reward will appear here.</Body>
      ) : (
        groups.map(([label, entries]) =>
          entries.length > 0 ? (
            <View key={label} style={styles.inventoryGroup}>
              <Text style={styles.inventoryLabel}>{label}</Text>
              <Text style={styles.inventoryText}>
                {entries.map(({ item, quantity }) => item.durable ? item.name : `${item.name} × ${quantity}`).join(" · ")}
              </Text>
            </View>
          ) : null,
        )
      )}
    </Card>
  );
}

function SectionTab({ active, label, onPress }: { active: boolean; label: string; onPress(): void }) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.sectionTab, active && styles.sectionTabActive, pressed && styles.pressed]}
    >
      <Text style={[styles.sectionTabText, active && styles.sectionTabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <View style={styles.stat}><Text style={styles.statLabel}>{label}</Text><Text style={styles.statValue}>{value}</Text></View>;
}

function ActionGroup({ children, label }: { children: ReactNode; label: string }) {
  return <View style={styles.actionGroup}><Text style={styles.actionLabel}>{label}</Text><View style={styles.actionWrap}>{children}</View></View>;
}

function ActionButton({ disabled, label, onPress }: { disabled?: boolean; label: string; onPress(): void }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.actionButton, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Text style={styles.actionButtonText}>{label}</Text>
    </Pressable>
  );
}

function FurnitureVisual({ itemId }: { itemId?: CatItemId }) {
  if (itemId === "cat-bed") return <View accessibilityLabel="Cat bed in room" style={styles.catBed} />;
  if (itemId === "window-cushion") return <View accessibilityLabel="Window perch in room" style={styles.windowCushion} />;
  if (itemId === "scratching-post") {
    return (
      <View accessibilityLabel="Scratching post in room" style={styles.scratchingPost}>
        <View style={styles.scratchingPostTop} />
        <View style={styles.scratchingPostColumn} />
        <View style={styles.scratchingPostBase} />
      </View>
    );
  }
  if (itemId === "cat-tree") {
    return (
      <View accessibilityLabel="Cat tree in room" style={styles.catTree}>
        <View style={styles.catTreeTop} />
        <View style={styles.catTreeUpperPost} />
        <View style={styles.catTreeMiddle} />
        <View style={styles.catTreeLowerPost} />
        <View style={styles.catTreeBase} />
      </View>
    );
  }
  return null;
}

function purchaseButtonLabel(availability: ReturnType<typeof purchaseAvailability>): string {
  if (availability === "available") return "Buy";
  if (availability === "locked") return "Locked";
  if (availability === "already-owned") return "Owned";
  if (availability === "insufficient") return "Need more points";
  return "Unavailable";
}

function purchaseMessage(item: CatCatalogItem, outcome: CatEconomyActionOutcome): string {
  if (outcome === "purchased") return `${item.name} is yours.`;
  if (outcome === "queued") return `${item.name} is saved for purchase when you’re back online.`;
  if (outcome === "insufficient") return "Not enough points yet. Nothing was lost.";
  if (outcome === "already-owned") return `${item.name} is already yours.`;
  if (outcome === "locked") return `This opens at ${item.unlockActiveDays} active days.`;
  return "That purchase could not be completed. Your points and items are safe.";
}

function consumptionMessage(outcome: CatEconomyActionOutcome): string {
  if (outcome === "queued") return "Feeding is saved and will finish when you’re back online.";
  if (outcome === "empty") return "There is none of that food in the cupboard yet.";
  return "That snack could not be used. Your inventory is safe.";
}

function foodPose(itemId: CatItemId): CatPose {
  if (itemId === "kitten-milk") return "milk";
  if (itemId === "cat-treat" || itemId === "freeze-dried-treat") return "treat";
  return "food";
}

function formatPoints(points: number): string {
  return `${Number.isInteger(points) ? points.toFixed(0) : points.toFixed(1)} points`;
}

const styles = StyleSheet.create({
  sectionTabs: { backgroundColor: colors.surfaceMuted, borderRadius: radii.pill, flexDirection: "row", gap: spacing.xs, padding: spacing.xs },
  sectionTab: { alignItems: "center", borderRadius: radii.pill, flex: 1, justifyContent: "center", minHeight: touchTarget },
  sectionTabActive: { backgroundColor: colors.primary },
  sectionTabText: { color: colors.text, fontSize: typography.body, fontWeight: "800" },
  sectionTabTextActive: { color: "#FFFFFF" },
  notice: { backgroundColor: colors.primarySoft, borderRadius: radii.sm, color: colors.text, fontSize: typography.small, lineHeight: 20, padding: spacing.md },
  statGrid: { flexDirection: "row", gap: spacing.sm },
  stat: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, flex: 1, gap: spacing.xs, minHeight: 92, padding: spacing.md },
  statLabel: { color: colors.textMuted, fontSize: typography.label, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase" },
  statValue: { color: colors.text, fontSize: 20, fontWeight: "900" },
  progressTitle: { color: colors.text, fontSize: typography.body, fontWeight: "800" },
  growthStory: { borderTopColor: colors.border, borderTopWidth: 1, gap: spacing.xs, marginTop: spacing.md, paddingTop: spacing.md },
  growthTitle: { color: colors.text, fontSize: typography.body, fontWeight: "900" },
  symbolicNote: { color: colors.textMuted, fontSize: typography.small, fontStyle: "italic", lineHeight: 20 },
  returnMessage: { color: colors.success, fontSize: typography.body, fontWeight: "700", lineHeight: 22 },
  room: { alignItems: "center", backgroundColor: "#FDECCB", borderColor: "#D9A86C", borderRadius: radii.lg, borderWidth: 1, height: 310, justifyContent: "flex-end", overflow: "hidden", padding: spacing.md, position: "relative" },
  gardenRoom: { backgroundColor: "#DFF2D0", borderColor: "#79A96B" },
  window: { backgroundColor: "#BFE5F5", borderColor: "#FFFFFF", borderWidth: 5, flexDirection: "row", height: 75, left: spacing.lg, position: "absolute", top: spacing.lg, width: 108 },
  windowPane: { borderColor: "#FFFFFF", borderRightWidth: 2, flex: 1 },
  gardenDetail: { color: "#3B6B3B", fontSize: 18, position: "absolute", right: 20, top: 38 },
  roomMessage: { backgroundColor: "rgba(255,255,255,0.9)", borderRadius: radii.sm, marginTop: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, width: "100%" },
  roomMessageText: { color: colors.text, fontSize: typography.small, textAlign: "center" },
  catBed: { backgroundColor: "#D9A4C4", borderColor: "#8C5177", borderRadius: 34, borderWidth: 5, bottom: 59, height: 55, left: 18, position: "absolute", width: 112 },
  windowCushion: { backgroundColor: "#D79B62", borderColor: "#8F5C32", borderRadius: 8, borderWidth: 3, height: 24, left: 20, position: "absolute", top: 92, width: 116 },
  scratchingPost: { bottom: 58, height: 135, left: 26, position: "absolute", width: 82, zIndex: 1 },
  scratchingPostTop: { backgroundColor: "#8F5C32", borderRadius: 7, height: 14, left: 25, position: "absolute", top: 0, width: 32 },
  scratchingPostColumn: { backgroundColor: "#C59A6D", borderColor: "#8F5C32", borderWidth: 3, height: 108, left: 31, position: "absolute", top: 10, width: 20 },
  scratchingPostBase: { backgroundColor: "#8F5C32", borderRadius: 8, bottom: 0, height: 18, left: 2, position: "absolute", width: 78 },
  catTree: { bottom: 57, height: 170, left: 16, position: "absolute", width: 130, zIndex: 1 },
  catTreeTop: { backgroundColor: "#B8865B", borderColor: "#70452B", borderRadius: 9, borderWidth: 3, height: 22, left: 12, position: "absolute", top: 0, width: 74 },
  catTreeUpperPost: { backgroundColor: "#C59A6D", borderColor: "#70452B", borderWidth: 3, height: 62, left: 42, position: "absolute", top: 19, width: 18 },
  catTreeMiddle: { backgroundColor: "#B8865B", borderColor: "#70452B", borderRadius: 8, borderWidth: 3, height: 20, left: 28, position: "absolute", top: 75, width: 92 },
  catTreeLowerPost: { backgroundColor: "#C59A6D", borderColor: "#70452B", borderWidth: 3, height: 63, left: 76, position: "absolute", top: 92, width: 20 },
  catTreeBase: { backgroundColor: "#8F5C32", borderRadius: 8, bottom: 0, height: 18, left: 16, position: "absolute", width: 110 },
  cardTitle: { color: colors.text, fontSize: typography.heading, fontWeight: "800" },
  actionGroup: { gap: spacing.sm, marginTop: spacing.sm },
  actionLabel: { color: colors.textMuted, fontSize: typography.label, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase" },
  actionWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  actionButton: { alignItems: "center", backgroundColor: colors.primarySoft, borderColor: "#C4B5FD", borderRadius: radii.sm, borderWidth: 1, justifyContent: "center", minHeight: touchTarget, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  actionButtonText: { color: colors.primaryPressed, fontSize: typography.small, fontWeight: "800" },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.5 },
  inventoryGroup: { gap: spacing.xs },
  inventoryLabel: { color: colors.textMuted, fontSize: typography.small, fontWeight: "800" },
  inventoryText: { color: colors.text, fontSize: typography.body, lineHeight: 22 },
  storeBalance: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radii.lg, padding: spacing.lg },
  storeBalanceLabel: { color: "#EDE9FE", fontSize: typography.small, fontWeight: "800" },
  storeBalanceValue: { color: "#FFFFFF", fontSize: 30, fontWeight: "900", marginTop: spacing.xs },
  storeSection: { gap: spacing.sm },
  categoryTitle: { color: colors.text, fontSize: typography.heading, fontWeight: "900" },
  storeItem: { alignItems: "flex-start", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, flexDirection: "row", gap: spacing.md, justifyContent: "space-between", padding: spacing.md },
  storeItemCopy: { flex: 1, gap: spacing.xs },
  itemName: { color: colors.text, fontSize: typography.body, fontWeight: "800" },
  itemDescription: { color: colors.textMuted, fontSize: typography.small, lineHeight: 20 },
  ownedText: { color: colors.success, fontSize: typography.small, fontWeight: "800" },
  priceColumn: { alignItems: "flex-end", gap: spacing.sm, maxWidth: 145 },
  price: { color: colors.text, fontSize: typography.body, fontWeight: "900" },
});
