import { isHabitActive, isTaskActive } from "./app-state.ts";
import type { AppState, Direction } from "./models.ts";

export type FocusLinkKind = "task" | "habit";

export interface FocusLinkOption {
  key: string;
  kind: FocusLinkKind;
  id: string;
  title: string;
  direction: Direction;
}

export function buildFocusLinkOptions(state: AppState, dateKey: string): FocusLinkOption[] {
  return [
    ...state.tasks
      .filter((task) => isTaskActive(task, dateKey))
      .map((task) => ({
        key: `task:${task.id}`,
        kind: "task" as const,
        id: task.id,
        title: task.title,
        direction: task.direction,
      })),
    ...state.habits
      .filter((habit) => isHabitActive(habit, dateKey))
      .map((habit) => ({
        key: `habit:${habit.id}`,
        kind: "habit" as const,
        id: habit.id,
        title: habit.title,
        direction: habit.direction,
      })),
  ];
}

export function findFocusLinkOption(
  options: readonly FocusLinkOption[],
  key: string,
): FocusLinkOption | undefined {
  return options.find((option) => option.key === key);
}

export function focusLinkFields(
  options: readonly FocusLinkOption[],
  key: string,
): { linkedTaskId?: string; linkedHabitId?: string } {
  const option = findFocusLinkOption(options, key);
  if (!option) return {};
  return option.kind === "task"
    ? { linkedTaskId: option.id }
    : { linkedHabitId: option.id };
}
