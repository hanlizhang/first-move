export const APP_VIEWS = ["first-moves", "focus", "today", "tasks", "habits", "cat"] as const;
export type AppView = (typeof APP_VIEWS)[number];

export const APP_VIEW_LABELS: Record<AppView, string> = {
  "first-moves": "First Moves",
  focus: "Focus",
  today: "Today",
  tasks: "Tasks",
  habits: "Habits",
  cat: "Cat Store",
};

export type PlannerPresentation = "morning" | "full" | "summary" | "review";

export function plannerPresentation(morningComplete: boolean, planConfirmed: boolean, reviewing: boolean): PlannerPresentation {
  if (!morningComplete) return "morning";
  if (reviewing && planConfirmed) return "review";
  return planConfirmed ? "summary" : "full";
}

export function visibleView(activeView: AppView): Record<AppView, boolean> {
  return Object.fromEntries(APP_VIEWS.map((view) => [view, view === activeView])) as Record<AppView, boolean>;
}
