import { addTask, createPendingIntent, getPendingIntent } from "./app-state.ts";
import { DIRECTIONS, INTENDED_DURATIONS, type AppState, type Direction, type IntendedDuration } from "./models.ts";
import { nextShorterDuration } from "./templates.ts";
import type { DayPlan, PlannedItem } from "./day-planning.ts";

export type ReviewGroup = "first-move" | "priority" | "optional";
export interface PlanningReviewItem extends PlannedItem { id: string; group: ReviewGroup }

export function planToReviewItems(plan: DayPlan): PlanningReviewItem[] {
  return [
    { ...plan.firstMove, id: "first-move", group: "first-move" },
    ...plan.priorityTasks.map((item, index) => ({ ...item, id: `priority-${index}`, group: "priority" as const })),
    ...plan.optionalTasks.map((item, index) => ({ ...item, id: `optional-${index}`, group: "optional" as const })),
  ];
}

export function makeReviewItemSmaller(item: PlanningReviewItem): PlanningReviewItem {
  const firstStep = item.firstStep.startsWith("Do only this first:") ? item.firstStep : `Do only this first: ${item.firstStep}`;
  return { ...item, durationMinutes: nextShorterDuration(item.durationMinutes), firstStep: firstStep.slice(0, 160) };
}

export function validPlanningReview(items: PlanningReviewItem[]): boolean {
  return items.length > 0 && items.filter((item) => item.group === "first-move").length <= 1 && items.filter((item) => item.group === "priority").length <= 3 && items.filter((item) => item.group === "optional").length <= 3 && items.every((item) => item.title.trim() && item.firstStep.trim() && DIRECTIONS.includes(item.category as Direction) && INTENDED_DURATIONS.includes(item.durationMinutes as IntendedDuration));
}

export function applyPlanningReview(state: AppState, items: PlanningReviewItem[]): AppState {
  if (!validPlanningReview(items)) return state;
  let next = state;
  for (const item of items.filter((candidate) => candidate.group !== "first-move")) next = addTask(next, { title: item.title, direction: item.category });
  const firstMove = items.find((item) => item.group === "first-move");
  if (firstMove && !getPendingIntent(next)) next = createPendingIntent(next, { stuckState: "unsure what is needed", direction: firstMove.category, moveText: firstMove.firstStep, intendedDurationMinutes: firstMove.durationMinutes });
  return next;
}
