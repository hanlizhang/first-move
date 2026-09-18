import {
  DIRECTIONS,
  INTENDED_DURATIONS,
  isDirection,
  isIntendedDuration,
  type AppState,
  type DailyPlanRecord,
  type Direction,
  type IntendedDuration,
  type PlanningReviewItem,
} from "./models.ts";
import { replacePendingIntent } from "./app-state.ts";
import { createUuidV4, isUuid } from "./ids.ts";
import { addTask } from "./tasks-habits.ts";

export const MAX_BRAIN_DUMP_LENGTH = 2_000;

export interface PlannedItem {
  title: string;
  category: Direction;
  durationMinutes: IntendedDuration;
  firstStep: string;
}

export interface DayPlan {
  firstMove: PlannedItem;
  priorityTasks: PlannedItem[];
  optionalTasks: PlannedItem[];
  suggestedCategory: Direction;
  suggestedDuration: IntendedDuration;
}

type Clock = () => string;
type IdFactory = () => string;

export function parseDayPlan(value: unknown): DayPlan | undefined {
  if (!isRecord(value) || !isPlannedItem(value.firstMove)) return undefined;
  if (
    !Array.isArray(value.priorityTasks) ||
    value.priorityTasks.length > 3 ||
    !value.priorityTasks.every(isPlannedItem) ||
    !Array.isArray(value.optionalTasks) ||
    value.optionalTasks.length > 3 ||
    !value.optionalTasks.every(isPlannedItem) ||
    !isDirection(value.suggestedCategory) ||
    !isIntendedDuration(value.suggestedDuration)
  ) {
    return undefined;
  }
  return {
    firstMove: value.firstMove,
    priorityTasks: value.priorityTasks,
    optionalTasks: value.optionalTasks,
    suggestedCategory: value.suggestedCategory,
    suggestedDuration: value.suggestedDuration,
  };
}

export function planToReviewItems(
  plan: DayPlan,
  idFactory: IdFactory = createUuidV4,
): PlanningReviewItem[] {
  return [
    reviewItem(plan.firstMove, "first-move", idFactory),
    ...plan.priorityTasks.map((item) => reviewItem(item, "priority", idFactory)),
    ...plan.optionalTasks.map((item) => reviewItem(item, "optional", idFactory)),
  ];
}

export function blankPlanningReviewItem(
  group: PlanningReviewItem["group"] = "first-move",
  idFactory: IdFactory = createUuidV4,
): PlanningReviewItem {
  return {
    id: idFactory(),
    group,
    title: "",
    firstStep: "",
    category: "Daily Life",
    durationMinutes: 2,
  };
}

export function validPlanningReview(items: PlanningReviewItem[]): boolean {
  return (
    items.length > 0 &&
    items.filter((item) => item.group === "first-move").length <= 1 &&
    items.filter((item) => item.group === "priority").length <= 3 &&
    items.filter((item) => item.group === "optional").length <= 3 &&
    items.every(isPlanningReviewItem)
  );
}

export function normalizeDailyPlans(value: unknown): DailyPlanRecord[] {
  if (!Array.isArray(value)) return [];
  const plans = new Map<string, DailyPlanRecord>();
  for (const candidate of value) {
    if (!isRecord(candidate) || !isLocalDate(candidate.dateKey) || !Array.isArray(candidate.items)) {
      continue;
    }
    const items = candidate.items.filter(isPlanningReviewItem);
    if (items.length !== candidate.items.length || !validPlanningReview(items)) continue;
    plans.set(candidate.dateKey, { dateKey: candidate.dateKey, items });
  }
  return [...plans.values()];
}

export function upsertDailyPlan(
  plans: DailyPlanRecord[],
  plan: DailyPlanRecord,
): DailyPlanRecord[] {
  const normalized = normalizeDailyPlans([plan])[0];
  if (!normalized) return plans;
  return [...plans.filter((candidate) => candidate.dateKey !== plan.dateKey), normalized];
}

export function applyPlanningReview(
  state: AppState,
  items: PlanningReviewItem[],
  clock: Clock = () => new Date().toISOString(),
  idFactory: IdFactory = createUuidV4,
): AppState {
  if (!validPlanningReview(items)) return state;
  let next = state;
  for (const item of items.filter((candidate) => candidate.group !== "first-move")) {
    next = addTask(next, { title: item.title, direction: item.category }, clock, idFactory);
  }
  return applyConfirmedPlanFirstMove(next, items, clock, idFactory);
}

export function applyConfirmedPlanFirstMove(
  state: AppState,
  items: PlanningReviewItem[],
  clock: Clock = () => new Date().toISOString(),
  idFactory: IdFactory = createUuidV4,
): AppState {
  if (!validPlanningReview(items)) return state;
  const firstMove = items.find((item) => item.group === "first-move");
  if (!firstMove) return state;
  return replacePendingIntent(
    state,
    {
      stuckState: "unsure what is needed",
      direction: firstMove.category,
      moveText: firstMove.firstStep,
      intendedDurationMinutes: firstMove.durationMinutes,
    },
    clock,
    idFactory,
  );
}

export function nextAvailableReviewGroup(
  items: PlanningReviewItem[],
): "priority" | "optional" | undefined {
  if (items.filter((item) => item.group === "optional").length < 3) return "optional";
  if (items.filter((item) => item.group === "priority").length < 3) return "priority";
  return undefined;
}

export function canMoveReviewItemToGroup(
  items: PlanningReviewItem[],
  itemId: string,
  group: PlanningReviewItem["group"],
): boolean {
  const limit = group === "first-move" ? 1 : 3;
  return items.filter((item) => item.id !== itemId && item.group === group).length < limit;
}

function reviewItem(
  item: PlannedItem,
  group: PlanningReviewItem["group"],
  idFactory: IdFactory,
): PlanningReviewItem {
  return { ...item, id: idFactory(), group };
}

function isPlannedItem(value: unknown): value is PlannedItem {
  return (
    isRecord(value) &&
    validText(value.title) &&
    validText(value.firstStep) &&
    isDirection(value.category) &&
    isIntendedDuration(value.durationMinutes)
  );
}

function isPlanningReviewItem(value: unknown): value is PlanningReviewItem {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isUuid(value.id) &&
    (value.group === "first-move" || value.group === "priority" || value.group === "optional") &&
    validText(value.title) &&
    validText(value.firstStep) &&
    isDirection(value.category) &&
    isIntendedDuration(value.durationMinutes)
  );
}

function validText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 160;
}

function isLocalDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const PLANNING_DIRECTIONS = DIRECTIONS;
export const PLANNING_DURATIONS = INTENDED_DURATIONS;
