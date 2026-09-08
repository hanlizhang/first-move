import { daysBetween, isDateKey, localDateKey, previousDateKey } from "./dates.ts";
import type { AppState, UserProgress } from "./models.ts";
import { CAT_MILESTONES, type CatItemId } from "./cat-items.ts";

export type KittenStage = "New kitten" | "Beginning weaning" | "Playful kitten" | "Curious kitten" | "Cozy companion" | "Adventure milestone";

export interface CatGrowthStory {
  title: KittenStage;
  description: string;
  nextMilestone?: { day: number; label: KittenStage };
}

const CAT_GROWTH_CHAPTERS = [
  { day: 1, title: "New kitten", description: "A new kitten settles in with milk, rest, and short room explorations." },
  { day: 21, title: "Beginning weaning", description: "Wet kitten food joins gentle mealtimes, with a scratching post ready in the room." },
  { day: 28, title: "Playful kitten", description: "The kitten grows more confident with the toys already gathered in the room." },
  { day: 35, title: "Curious kitten", description: "Kibble joins the menu while familiar play keeps the kitten curious." },
  { day: 50, title: "Cozy companion", description: "Treats, simple tricks, and a favorite sleep spot make the room feel lived in." },
  { day: 100, title: "Adventure milestone", description: "The garden and butterfly open a bigger scene to explore together." },
] as const satisfies ReadonlyArray<{ day: number; title: KittenStage; description: string }>;

export function syncProgress(state: AppState, today = localDateKey(), ensureFirstUse = false): AppState {
  const activeDateKeys = qualifyingActiveDates(state);
  const firstUseDate = isDateKey(state.progress.firstUseDate)
    ? state.progress.firstUseDate
    : activeDateKeys[0] ?? (ensureFirstUse ? today : undefined);
  const lastActiveDate = activeDateKeys.at(-1);
  const totalActiveDays = activeDateKeys.length;
  const thresholds = [21, 50, 100] as const;
  const unlockedMilestones = thresholds.filter(
    (threshold) => totalActiveDays >= threshold || state.progress.unlockedMilestones.includes(threshold),
  );
  const grantedMilestones = [...state.progress.grantedMilestones];
  let inventoryItems = [...state.inventory.items];
  for (const milestone of CAT_MILESTONES) {
    if (totalActiveDays < milestone.day || grantedMilestones.includes(milestone.day)) continue;
    for (const grant of milestone.grants) inventoryItems = addInventory(inventoryItems, grant.itemId, grant.quantity);
    grantedMilestones.push(milestone.day);
  }
  const progress: UserProgress = {
    ...state.progress,
    activeDateKeys,
    firstUseDate,
    lastActiveDate,
    journeyDay: firstUseDate ? Math.max(1, daysBetween(firstUseDate, today) + 1) : 0,
    totalActiveDays,
    gentleStreak: calculateGentleStreak(activeDateKeys, today),
    unlockedMilestones,
    grantedMilestones: grantedMilestones.sort((a, b) => a - b),
  };
  return { ...state, progress, inventory: { ...state.inventory, items: inventoryItems } };
}

function addInventory(items: AppState["inventory"]["items"], itemId: CatItemId, quantity: number) {
  const current = items.find((item) => item.itemId === itemId)?.quantity ?? 0;
  return [...items.filter((item) => item.itemId !== itemId), { itemId, quantity: current + quantity }];
}

export function qualifyingActiveDates(state: AppState): string[] {
  const dates = new Set<string>();
  for (const event of state.rewardEvents) {
    if ((event.source === "task" || event.source === "habit" || event.source === "morning" || event.source === "reflection") && isDateKey(event.dateKey)) {
      dates.add(event.dateKey);
    }
  }
  for (const session of state.sessions) {
    if (
      (session.status === "completed" || session.status === "stopped") &&
      (session.actualElapsedMs ?? 0) >= 60_000 &&
      session.endedAt
    ) {
      dates.add(localDateKey(new Date(session.endedAt)));
    }
  }
  for (const entry of state.journalEntries) if (isDateKey(entry.dateKey)) dates.add(entry.dateKey);
  return [...dates].sort();
}

export function kittenStage(totalActiveDays: number): KittenStage {
  return catGrowthStory(totalActiveDays).title;
}

export function catGrowthStory(totalActiveDays: number): CatGrowthStory {
  const days = Math.max(0, totalActiveDays);
  const current = [...CAT_GROWTH_CHAPTERS].reverse().find((chapter) => days >= chapter.day) ?? CAT_GROWTH_CHAPTERS[0];
  const next = CAT_GROWTH_CHAPTERS.find((chapter) => chapter.day > days);
  return {
    title: current.title,
    description: current.description,
    nextMilestone: next ? { day: next.day, label: next.title } : undefined,
  };
}

export function gentleReturnMessage(lastActiveDate: string | undefined, today: string): string | undefined {
  if (!lastActiveDate || !isDateKey(lastActiveDate) || daysBetween(lastActiveDate, today) < 2) return undefined;
  return "While you were away, your kitten was exploring. It is glad to see you—nothing was lost.";
}

function calculateGentleStreak(activeDateKeys: string[], today: string): number {
  const dates = new Set(activeDateKeys);
  const latest = activeDateKeys.at(-1);
  if (!latest || daysBetween(latest, today) > 1) return 0;
  let streak = 0;
  let cursor = latest;
  while (dates.has(cursor)) {
    streak += 1;
    cursor = previousDateKey(cursor);
  }
  return streak;
}
