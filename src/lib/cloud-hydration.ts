import { normalizeAppState } from "./app-state.ts";
import { DAILY_PLAN_STORAGE_KEY, type DailyPlanRecord } from "./daily-plan-state.ts";
import { DIRECTIONS, INTENDED_DURATIONS, WEEKDAYS, type AppState, type Direction, type IntendedDuration, type Weekday } from "./models.ts";
import { STORAGE_KEY, type StorageLike } from "./repository.ts";

export interface CanonicalWorkspace {
  state: AppState;
  dailyPlans: DailyPlanRecord[];
}

export function validateCanonicalWorkspace(value: unknown): CanonicalWorkspace {
  if (!isRecord(value)) throw new Error("Cloud workspace response is invalid.");
  const tasks = array(value.tasks);
  const taskCompletions = array(value.task_completions);
  const habits = array(value.habits);
  const habitWeekdays = array(value.habit_schedule_weekdays);
  const habitCompletions = array(value.habit_completions);
  const intents = array(value.activity_intents);
  const sessions = array(value.activity_sessions);
  const plans = array(value.daily_plans);
  const planItems = array(value.daily_plan_items);
  const checks = array(value.morning_checks);
  const attempts = array(value.morning_attempts);
  const journals = array(value.journal_entries);
  const rewards = array(value.reward_ledger);
  const inventory = array(value.inventory_balances);
  const milestones = array(value.milestone_grants);
  const profile = isRecord(value.profile) ? value.profile : {};
  const settings = isRecord(value.settings) ? value.settings : {};

  const state = normalizeAppState({
    schemaVersion: 8,
    tasks: tasks.map((task, order) => {
      const row = record(task);
      return {
        id: text(row.id), title: text(row.title), direction: direction(row.direction), order,
        createdAt: instant(row.created_at), updatedAt: instant(row.updated_at),
        completedOn: taskCompletions.filter((completion) => record(completion).task_id === row.id).map((completion) => date(record(completion).local_date)),
      };
    }),
    habits: habits.map((habit) => {
      const row = record(habit);
      const scheduleKind = row.schedule_kind === "weekdays" ? "weekdays" : "daily";
      return {
        id: text(row.id), title: text(row.title), direction: direction(row.direction),
        schedule: scheduleKind === "weekdays"
          ? { kind: "weekdays", weekdays: habitWeekdays.filter((entry) => record(entry).habit_id === row.id).map((entry) => weekday(record(entry).weekday)) }
          : { kind: "daily" },
        createdAt: instant(row.created_at), updatedAt: instant(row.updated_at),
        completedOn: habitCompletions.filter((completion) => record(completion).habit_id === row.id).map((completion) => date(record(completion).local_date)),
      };
    }),
    activityIntents: intents.filter((intent) => record(intent).status === "pending").map((intent) => {
      const row = record(intent);
      return {
        id: text(row.id), stuckState: text(row.stuck_state), direction: direction(row.direction),
        moveText: text(row.move_text), intendedDurationMinutes: duration(row.intended_duration_minutes),
        linkedTaskId: optionalText(row.linked_task_id), linkedHabitId: optionalText(row.linked_habit_id),
        createdAt: instant(row.created_at), status: "pending",
      };
    }),
    sessions: sessions.map((session) => {
      const row = record(session);
      return {
        id: text(row.id), mode: row.mode, status: row.status, direction: direction(row.direction),
        label: text(row.label), targetDurationMinutes: optionalNumber(row.target_duration_minutes),
        linkedTaskId: optionalText(row.linked_task_id), linkedHabitId: optionalText(row.linked_habit_id),
        linkedIntentId: optionalText(row.linked_intent_id), startedAt: instant(row.started_at),
        lastResumedAt: optionalText(row.last_resumed_at), accumulatedElapsedMs: number(row.accumulated_elapsed_ms),
        endedAt: optionalText(row.ended_at), actualElapsedMs: optionalNumber(row.actual_elapsed_ms),
        reviewedAt: optionalText(row.reviewed_at),
      };
    }),
    rewardEvents: rewards.map((reward) => {
      const row = record(reward);
      return {
        id: text(row.id), source: row.source_type === "purchase" ? "store" : row.source_type,
        sourceId: optionalText(row.source_id) ?? text(row.id), dateKey: date(row.local_date),
        points: number(row.points_tenths) / 10, createdAt: instant(row.created_at),
      };
    }),
    journalEntries: journals.map((journal) => {
      const row = record(journal);
      return {
        dateKey: date(row.local_date), whatHelped: optionalText(row.what_helped), completed: optionalText(row.completed),
        difficult: optionalText(row.difficult), nextStep: optionalText(row.next_step),
        mood: optionalNumber(row.mood), energy: optionalNumber(row.energy),
        freeText: optionalText(row.free_text), updatedAt: instant(row.updated_at),
      };
    }),
    morningChecks: checks.map((check) => {
      const row = record(check);
      return {
        dateKey: date(row.local_date), verifiedAt: instant(row.verified_at),
        captureMethod: row.capture_method, verifierMode: row.verifier_mode,
      };
    }),
    morningAttempts: attempts.map((attempt) => {
      const row = record(attempt);
      return { dateKey: date(row.local_date), count: number(row.attempt_count) };
    }),
    inventory: {
      items: inventory.map((item) => ({ itemId: text(record(item).item_id), quantity: number(record(item).quantity) })),
      selectedFurnitureId: optionalText(settings.selected_furniture_id),
    },
    progress: {
      points: number(value.points_tenths) / 10,
      activeDateKeys: array(value.active_days).map(date),
      unlockedMilestones: milestones.map((item) => number(record(item).milestone_day)),
      grantedMilestones: milestones.map((item) => number(record(item).milestone_day)),
      firstUseDate: optionalText(profile.first_use_local_date),
      totalActiveDays: array(value.active_days).length,
    },
  });
  const dailyPlans: DailyPlanRecord[] = plans.map((plan) => {
    const row = record(plan);
    return {
      dateKey: date(row.local_date),
      items: planItems.filter((item) => record(item).daily_plan_id === row.id).map((item) => {
        const entry = record(item);
        return {
          id: text(entry.id), group: group(entry.item_group), title: text(entry.title),
          firstStep: text(entry.first_step), category: direction(entry.direction),
          durationMinutes: duration(entry.duration_minutes),
        };
      }),
    };
  });
  verifyCanonicalWorkspace(value, state, dailyPlans);
  return { state, dailyPlans };
}

export function replaceLocalWorkspace(
  storage: StorageLike,
  workspace: CanonicalWorkspace,
): void {
  const previousState = storage.getItem(STORAGE_KEY);
  const previousPlans = storage.getItem(DAILY_PLAN_STORAGE_KEY);
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(workspace.state));
    storage.setItem(DAILY_PLAN_STORAGE_KEY, JSON.stringify(workspace.dailyPlans));
  } catch (error) {
    if (previousState !== null) storage.setItem(STORAGE_KEY, previousState);
    if (previousPlans !== null) storage.setItem(DAILY_PLAN_STORAGE_KEY, previousPlans);
    throw error;
  }
}

function verifyCanonicalWorkspace(raw: Record<string, unknown>, state: AppState, dailyPlans: DailyPlanRecord[]) {
  if (state.tasks.length !== array(raw.tasks).length || state.habits.length !== array(raw.habits).length ||
      state.sessions.length !== array(raw.activity_sessions).length || state.journalEntries.length !== array(raw.journal_entries).length ||
      dailyPlans.length !== array(raw.daily_plans).length) {
    throw new Error("Cloud record count verification failed.");
  }
  const points = state.rewardEvents.reduce((total, event) => Math.round((total + event.points) * 10) / 10, 0);
  if (Math.round(points * 10) !== number(raw.points_tenths)) throw new Error("Cloud point balance verification failed.");
  const eventQuantities = new Map<string, number>();
  for (const item of array(raw.inventory_events)) {
    const row = record(item);
    eventQuantities.set(text(row.item_id), (eventQuantities.get(text(row.item_id)) ?? 0) + number(row.quantity_delta));
  }
  for (const item of state.inventory.items) {
    if ((eventQuantities.get(item.itemId) ?? 0) !== item.quantity) throw new Error("Cloud inventory verification failed.");
  }
  for (const session of state.sessions) {
    if (session.linkedTaskId && !state.tasks.some((task) => task.id === session.linkedTaskId)) throw new Error("Cloud task reference is invalid.");
    if (session.linkedHabitId && !state.habits.some((habit) => habit.id === session.linkedHabitId)) throw new Error("Cloud habit reference is invalid.");
  }
}

function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function record(value: unknown): Record<string, unknown> { if (!isRecord(value)) throw new Error("Cloud row is invalid."); return value; }
function text(value: unknown): string { if (typeof value !== "string" || !value) throw new Error("Cloud text is invalid."); return value; }
function optionalText(value: unknown): string | undefined { return typeof value === "string" && value ? value : undefined; }
function number(value: unknown): number { const parsed = typeof value === "number" ? value : Number(value); if (!Number.isFinite(parsed)) throw new Error("Cloud number is invalid."); return parsed; }
function optionalNumber(value: unknown): number | undefined { return value === null || value === undefined ? undefined : number(value); }
function date(value: unknown): string { return text(value).slice(0, 10); }
function instant(value: unknown): string { return text(value); }
function direction(value: unknown): Direction { const parsed = text(value) as Direction; if (!DIRECTIONS.includes(parsed)) throw new Error("Cloud direction is invalid."); return parsed; }
function duration(value: unknown): IntendedDuration { const parsed = number(value) as IntendedDuration; if (!INTENDED_DURATIONS.includes(parsed)) throw new Error("Cloud duration is invalid."); return parsed; }
function weekday(value: unknown): Weekday { const parsed = text(value) as Weekday; if (!WEEKDAYS.includes(parsed)) throw new Error("Cloud weekday is invalid."); return parsed; }
function group(value: unknown): "first-move" | "priority" | "optional" { if (value !== "first-move" && value !== "priority" && value !== "optional") throw new Error("Cloud plan group is invalid."); return value; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
