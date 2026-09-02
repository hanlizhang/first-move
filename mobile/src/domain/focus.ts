import { isFocusDuration, type AppState, type Direction } from "./models.ts";
import type { SessionReferenceCatalog } from "./sessions.ts";

export type FocusLinkKind = "task" | "habit";

export interface FocusLinkOption {
  key: string;
  kind: FocusLinkKind;
  id: string;
  title: string;
  direction: Direction;
  source: "local" | "canonical";
}

export function buildFocusLinkOptions(
  localWorkspace: AppState,
  canonicalWorkspace?: AppState,
): FocusLinkOption[] {
  const options: FocusLinkOption[] = [];
  const seen = new Set<string>();

  add(localWorkspace, "local");
  if (canonicalWorkspace) add(canonicalWorkspace, "canonical");
  return options;

  function add(state: AppState, source: FocusLinkOption["source"]): void {
    for (const task of state.tasks) {
      append("task", task.id, task.title, task.direction, source);
    }
    for (const habit of state.habits) {
      append("habit", habit.id, habit.title, habit.direction, source);
    }
  }

  function append(
    kind: FocusLinkKind,
    id: string,
    title: string,
    direction: Direction,
    source: FocusLinkOption["source"],
  ): void {
    const key = focusLinkKey(kind, id);
    if (seen.has(key)) return;
    seen.add(key);
    options.push({ key, kind, id, title, direction, source });
  }
}

export function focusLinkKey(kind: FocusLinkKind, id: string): string {
  return `${kind}:${id}`;
}

export function findFocusLinkOption(
  options: readonly FocusLinkOption[],
  key: string,
): FocusLinkOption | undefined {
  return options.find((option) => option.key === key);
}

export function focusLinkFields(key: string): {
  linkedTaskId?: string;
  linkedHabitId?: string;
} {
  if (key.startsWith("task:")) {
    const id = key.slice("task:".length);
    return id ? { linkedTaskId: id } : {};
  }
  if (key.startsWith("habit:")) {
    const id = key.slice("habit:".length);
    return id ? { linkedHabitId: id } : {};
  }
  return {};
}

export function parseFocusDurationInput(value: string): number | undefined {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return undefined;
  const minutes = Number(normalized);
  return isFocusDuration(minutes) ? minutes : undefined;
}

export function sessionReferenceCatalog(
  options: readonly FocusLinkOption[],
): SessionReferenceCatalog {
  return {
    tasks: options
      .filter((option) => option.kind === "task")
      .map(({ id, title, direction }) => ({ id, title, direction })),
    habits: options
      .filter((option) => option.kind === "habit")
      .map(({ id, title, direction }) => ({ id, title, direction })),
  };
}
