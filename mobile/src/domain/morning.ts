import type {
  AppState,
  MorningCheck,
} from "./models.ts";

export function completeMorningCheck(
  state: AppState,
  dateKey: string,
  captureMethod: MorningCheck["captureMethod"],
  verifierMode: MorningCheck["verifierMode"],
  options: { clock?: () => string } = {},
): AppState {
  if (!isLocalDate(dateKey) || state.morningChecks.some((check) => check.dateKey === dateKey)) {
    return state;
  }
  const verifiedAt = (options.clock ?? (() => new Date().toISOString()))();
  const check: MorningCheck = { dateKey, verifiedAt, captureMethod, verifierMode };
  return {
    ...state,
    morningChecks: [...state.morningChecks, check],
  };
}

export function morningStep(input: {
  complete: boolean;
  skipped: boolean;
}): "verify" | "plan" {
  return input.complete || input.skipped ? "plan" : "verify";
}

function isLocalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
