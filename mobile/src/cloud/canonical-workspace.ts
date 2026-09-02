import {
  DIRECTIONS,
  INTENDED_DURATIONS,
  STUCK_STATES,
  WEEKDAYS,
  createEmptyState,
  type ActivityIntent,
  type ActivitySession,
  type AppState,
  type DailyPlanRecord,
  type Direction,
  type Habit,
  type IntendedDuration,
  type JournalEntry,
  type MorningAttempt,
  type MorningCheck,
  type RewardEvent,
  type Task,
  type Weekday,
} from "../domain/models.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CAT_ITEM_IDS = new Set([
  "kitten-milk",
  "cat-food",
  "cat-treat",
  "yarn-toy",
  "teaser-wand",
  "high-five",
  "paw-shake",
  "outdoor-garden",
  "butterfly",
  "cat-bed",
  "window-cushion",
]);

export interface CanonicalWorkspace {
  state: AppState;
  dailyPlans: DailyPlanRecord[];
  /** The already-validated RPC payload, retained so captured dates/timezones are not discarded. */
  canonicalPayload: Record<string, unknown>;
}

export function validateCanonicalWorkspace(value: unknown): CanonicalWorkspace {
  if (!isRecord(value)) throw new Error("Cloud workspace response is invalid.");

  const tasks = rows(value.tasks, "tasks");
  const activeTasks = tasks.filter((task) => !task.deleted_at);
  const taskCompletions = rows(value.task_completions, "task completions").filter(
    (completion) => !completion.deleted_at,
  );
  const habits = rows(value.habits, "habits");
  const activeHabits = habits.filter((habit) => !habit.deleted_at);
  const habitWeekdays = rows(value.habit_schedule_weekdays, "habit weekdays").filter(
    (entry) => !entry.deleted_at,
  );
  const habitCompletions = rows(value.habit_completions, "habit completions").filter(
    (completion) => !completion.deleted_at,
  );
  const intents = rows(value.activity_intents, "activity intents");
  const sessions = rows(value.activity_sessions, "activity sessions").filter(
    (session) => !session.deleted_at,
  );
  const plans = rows(value.daily_plans, "daily plans").filter((plan) => !plan.deleted_at);
  const planItems = rows(value.daily_plan_items, "daily plan items").filter(
    (item) => !item.deleted_at,
  );
  const checks = rows(value.morning_checks, "morning checks");
  const attempts = rows(value.morning_attempts, "morning attempts");
  const journals = rows(value.journal_entries, "journal entries").filter(
    (journal) => !journal.deleted_at,
  );
  const rewards = rows(value.reward_ledger, "reward ledger");
  const inventoryEvents = rows(value.inventory_events, "inventory events");
  const inventory = rows(value.inventory_balances, "inventory balances");
  const milestones = rows(value.milestone_grants, "milestone grants");
  const activeDays = array(value.active_days).map(date);
  const profile = isRecord(value.profile) ? value.profile : {};
  const settings = isRecord(value.settings) ? value.settings : {};

  validateCanonicalDatesAndTimezones({
    profile,
    taskCompletions,
    habitCompletions,
    sessions,
    plans,
    checks,
    attempts,
    journals,
    rewards,
    inventoryEvents,
  });

  const mappedTasks: Task[] = activeTasks.map((row, order) => ({
    id: uuid(row.id),
    title: text(row.title),
    direction: direction(row.direction),
    order,
    createdAt: instant(row.created_at),
    updatedAt: instant(row.updated_at),
    completedOn: taskCompletions
      .filter((completion) => uuid(completion.task_id) === row.id)
      .map((completion) => date(completion.local_date)),
  }));

  const mappedHabits: Habit[] = activeHabits.map((row) => {
    const scheduleKind = row.schedule_kind === "weekdays" ? "weekdays" : "daily";
    return {
      id: uuid(row.id),
      title: text(row.title),
      direction: direction(row.direction),
      schedule:
        scheduleKind === "weekdays"
          ? {
              kind: "weekdays",
              weekdays: habitWeekdays
                .filter((entry) => uuid(entry.habit_id) === row.id)
                .map((entry) => weekday(entry.weekday)),
            }
          : { kind: "daily" },
      createdAt: instant(row.created_at),
      updatedAt: instant(row.updated_at),
      completedOn: habitCompletions
        .filter((completion) => uuid(completion.habit_id) === row.id)
        .map((completion) => date(completion.local_date)),
    };
  });

  const mappedIntents: ActivityIntent[] = intents
    .filter((row) => !row.deleted_at && row.status === "pending")
    .map((row) => ({
      id: uuid(row.id),
      stuckState: stuckState(row.stuck_state),
      direction: direction(row.direction),
      moveText: text(row.move_text),
      intendedDurationMinutes: duration(row.intended_duration_minutes),
      linkedTaskId: optionalUuid(row.linked_task_id),
      linkedHabitId: optionalUuid(row.linked_habit_id),
      createdAt: instant(row.created_at),
      status: "pending",
    }));

  const mappedSessions: ActivitySession[] = sessions.map((row) => {
    const session: ActivitySession = {
      id: uuid(row.id),
      mode: sessionMode(row.mode),
      status: sessionStatus(row.status),
      direction: direction(row.direction),
      label: text(row.label),
      targetDurationMinutes: optionalNumber(row.target_duration_minutes),
      linkedTaskId: optionalUuid(row.linked_task_id),
      linkedHabitId: optionalUuid(row.linked_habit_id),
      linkedIntentId: optionalUuid(row.linked_intent_id),
      startedAt: instant(row.started_at),
      lastResumedAt: optionalInstant(row.last_resumed_at),
      accumulatedElapsedMs: finiteNumber(row.accumulated_elapsed_ms),
      endedAt: optionalInstant(row.ended_at),
      actualElapsedMs: optionalNumber(row.actual_elapsed_ms),
      reviewedAt: optionalInstant(row.reviewed_at),
    };
    validateSessionContract(session);
    return session;
  });

  const mappedRewards: RewardEvent[] = rewards.map((row) => ({
    id: uuid(row.id),
    source: rewardSource(row.source_type),
    sourceId: optionalUuid(row.source_id) ?? uuid(row.id),
    dateKey: date(row.local_date),
    points: finiteNumber(row.points_tenths) / 10,
    createdAt: instant(row.created_at),
  }));

  const mappedJournals: JournalEntry[] = journals.map((row) => ({
    dateKey: date(row.local_date),
    whatHelped: optionalText(row.what_helped),
    completed: optionalText(row.completed),
    difficult: optionalText(row.difficult),
    nextStep: optionalText(row.next_step),
    mood: optionalRating(row.mood),
    energy: optionalRating(row.energy),
    freeText: optionalText(row.free_text),
    updatedAt: instant(row.updated_at),
  }));

  const mappedChecks: MorningCheck[] = checks.map((row) => ({
    dateKey: date(row.local_date),
    verifiedAt: instant(row.verified_at),
    captureMethod: captureMethod(row.capture_method),
    verifierMode: verifierMode(row.verifier_mode),
  }));

  const mappedAttempts: MorningAttempt[] = attempts.map((row) => ({
    dateKey: date(row.local_date),
    count: boundedInteger(row.attempt_count, 0, 3),
  }));

  const milestoneDays = milestones.map((row) => milestone(row.milestone_day));
  const state: AppState = {
    ...createEmptyState(),
    tasks: mappedTasks,
    habits: mappedHabits,
    activityIntents: keepOnePendingIntent(mappedIntents),
    sessions: keepOneOpenSession(mappedSessions),
    rewardEvents: mappedRewards,
    journalEntries: mappedJournals,
    morningChecks: mappedChecks,
    morningAttempts: mappedAttempts,
    inventory: {
      items: inventory.flatMap((row) => {
        const itemId = catItemId(row.item_id);
        const quantity = boundedInteger(row.quantity, 0, 999);
        return quantity > 0 ? [{ itemId, quantity }] : [];
      }),
      selectedFurnitureId: optionalCatItemId(settings.selected_furniture_id),
    },
    progress: {
      points: finiteNumber(value.points_tenths) / 10,
      activeDateKeys: activeDays,
      unlockedMilestones: milestoneDays,
      grantedMilestones: milestoneDays,
      firstUseDate: optionalDate(profile.first_use_local_date),
      lastActiveDate: activeDays.at(-1),
      journeyDay: 0,
      totalActiveDays: activeDays.length,
      gentleStreak: 0,
    },
  };

  const dailyPlans: DailyPlanRecord[] = plans.map((row) => ({
    dateKey: date(row.local_date),
    items: planItems
      .filter((item) => uuid(item.daily_plan_id) === row.id)
      .map((entry) => ({
        id: uuid(entry.id),
        group: group(entry.item_group),
        title: text(entry.title),
        firstStep: text(entry.first_step),
        category: direction(entry.direction),
        durationMinutes: duration(entry.duration_minutes),
      })),
  }));

  verifyCanonicalWorkspace(
    value,
    state,
    dailyPlans,
    tasks,
    habits,
    intents,
    inventoryEvents,
  );

  return {
    state,
    dailyPlans,
    canonicalPayload: structuredClone(value),
  };
}

function verifyCanonicalWorkspace(
  raw: Record<string, unknown>,
  state: AppState,
  dailyPlans: DailyPlanRecord[],
  taskParents: Record<string, unknown>[],
  habitParents: Record<string, unknown>[],
  intentParents: Record<string, unknown>[],
  inventoryEvents: Record<string, unknown>[],
): void {
  if (
    state.tasks.length !== taskParents.filter((task) => !task.deleted_at).length ||
    state.habits.length !== habitParents.filter((habit) => !habit.deleted_at).length ||
    state.sessions.length !== rows(raw.activity_sessions, "activity sessions").filter((row) => !row.deleted_at).length ||
    state.journalEntries.length !== rows(raw.journal_entries, "journal entries").filter((row) => !row.deleted_at).length ||
    dailyPlans.length !== rows(raw.daily_plans, "daily plans").filter((row) => !row.deleted_at).length
  ) {
    throw new Error("Cloud record count verification failed.");
  }

  const pointsTenths = state.rewardEvents.reduce(
    (total, event) => total + Math.round(event.points * 10),
    0,
  );
  if (pointsTenths !== finiteNumber(raw.points_tenths)) {
    throw new Error("Cloud point balance verification failed.");
  }

  const eventQuantities = new Map<string, number>();
  for (const row of inventoryEvents) {
    const itemId = catItemId(row.item_id);
    eventQuantities.set(
      itemId,
      (eventQuantities.get(itemId) ?? 0) + finiteNumber(row.quantity_delta),
    );
  }
  const balanceRows = rows(raw.inventory_balances, "inventory balances");
  for (const row of balanceRows) {
    const itemId = catItemId(row.item_id);
    if ((eventQuantities.get(itemId) ?? 0) !== finiteNumber(row.quantity)) {
      throw new Error("Cloud inventory verification failed.");
    }
  }

  for (const session of state.sessions) {
    if (session.linkedTaskId && !taskParents.some((task) => task.id === session.linkedTaskId)) {
      throw new Error("Cloud task reference is invalid.");
    }
    if (session.linkedHabitId && !habitParents.some((habit) => habit.id === session.linkedHabitId)) {
      throw new Error("Cloud habit reference is invalid.");
    }
    if (session.linkedIntentId && !intentParents.some((intent) => intent.id === session.linkedIntentId)) {
      throw new Error("Cloud intent reference is invalid.");
    }
  }
}

function validateCanonicalDatesAndTimezones(input: {
  profile: Record<string, unknown>;
  taskCompletions: Record<string, unknown>[];
  habitCompletions: Record<string, unknown>[];
  sessions: Record<string, unknown>[];
  plans: Record<string, unknown>[];
  checks: Record<string, unknown>[];
  attempts: Record<string, unknown>[];
  journals: Record<string, unknown>[];
  rewards: Record<string, unknown>[];
  inventoryEvents: Record<string, unknown>[];
}): void {
  if (input.profile.timezone !== undefined) timezone(input.profile.timezone);
  const dayRows = [
    ...input.taskCompletions,
    ...input.habitCompletions,
    ...input.sessions,
    ...input.plans,
    ...input.checks,
    ...input.attempts,
    ...input.journals,
    ...input.rewards,
    ...input.inventoryEvents,
  ];
  for (const row of dayRows) {
    date(row.local_date);
    timezone(row.timezone);
  }
}

function keepOnePendingIntent(intents: ActivityIntent[]): ActivityIntent[] {
  const pending = intents.find((intent) => intent.status === "pending");
  return pending ? [pending] : [];
}

function keepOneOpenSession(sessions: ActivitySession[]): ActivitySession[] {
  let keptOpen = false;
  return sessions.filter((session) => {
    if (session.status === "completed" || session.status === "stopped") return true;
    if (keptOpen) return false;
    keptOpen = true;
    return true;
  });
}

function validateSessionContract(session: ActivitySession): void {
  if (
    session.label.trim().length === 0 ||
    session.label.length > 160 ||
    !Number.isInteger(session.accumulatedElapsedMs) ||
    session.accumulatedElapsedMs < 0 ||
    (session.actualElapsedMs !== undefined &&
      (!Number.isInteger(session.actualElapsedMs) || session.actualElapsedMs < 0)) ||
    [session.linkedTaskId, session.linkedHabitId, session.linkedIntentId].filter(Boolean).length > 1
  ) {
    throw new Error("Cloud session is invalid.");
  }
  if (
    session.targetDurationMinutes !== undefined &&
    (!Number.isInteger(session.targetDurationMinutes) ||
      session.targetDurationMinutes < 1 ||
      session.targetDurationMinutes > 720)
  ) {
    throw new Error("Cloud session duration is invalid.");
  }
  if (session.mode === "countdown" && session.targetDurationMinutes === undefined) {
    throw new Error("Cloud countdown duration is invalid.");
  }
  if (
    session.status === "running" &&
    (!session.lastResumedAt || session.endedAt || session.actualElapsedMs !== undefined)
  ) {
    throw new Error("Cloud running session is invalid.");
  }
  if (
    session.status === "paused" &&
    (session.lastResumedAt || session.endedAt || session.actualElapsedMs !== undefined)
  ) {
    throw new Error("Cloud paused session is invalid.");
  }
  if (
    (session.status === "completed" || session.status === "stopped") &&
    (session.lastResumedAt || !session.endedAt || session.actualElapsedMs === undefined)
  ) {
    throw new Error("Cloud closed session is invalid.");
  }
}

function rows(value: unknown, label: string): Record<string, unknown>[] {
  return array(value).map((entry) => {
    if (!isRecord(entry)) throw new Error(`Cloud ${label} row is invalid.`);
    return entry;
  });
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("Cloud workspace collection is invalid.");
  return value;
}

function text(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new Error("Cloud text is invalid.");
  return value;
}

function optionalText(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string") throw new Error("Cloud optional text is invalid.");
  return value || undefined;
}

function uuid(value: unknown): string {
  const parsed = text(value);
  if (!UUID_PATTERN.test(parsed)) throw new Error("Cloud UUID is invalid.");
  return parsed;
}

function optionalUuid(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : uuid(value);
}

function finiteNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error("Cloud number is invalid.");
  return parsed;
}

function optionalNumber(value: unknown): number | undefined {
  return value === null || value === undefined ? undefined : finiteNumber(value);
}

function boundedInteger(value: unknown, minimum: number, maximum: number): number {
  const parsed = finiteNumber(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error("Cloud integer is invalid.");
  }
  return parsed;
}

function date(value: unknown): string {
  const parsed = text(value).slice(0, 10);
  if (!DATE_PATTERN.test(parsed) || Number.isNaN(new Date(`${parsed}T12:00:00Z`).getTime())) {
    throw new Error("Cloud local date is invalid.");
  }
  return parsed;
}

function optionalDate(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : date(value);
}

function instant(value: unknown): string {
  const parsed = text(value);
  if (Number.isNaN(new Date(parsed).getTime())) throw new Error("Cloud timestamp is invalid.");
  return parsed;
}

function optionalInstant(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : instant(value);
}

function timezone(value: unknown): string {
  const parsed = text(value);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: parsed }).format();
  } catch {
    throw new Error("Cloud timezone is invalid.");
  }
  return parsed;
}

function direction(value: unknown): Direction {
  const parsed = text(value) as Direction;
  if (!DIRECTIONS.includes(parsed)) throw new Error("Cloud direction is invalid.");
  return parsed;
}

function stuckState(value: unknown): ActivityIntent["stuckState"] {
  const parsed = text(value) as ActivityIntent["stuckState"];
  if (!STUCK_STATES.includes(parsed)) throw new Error("Cloud stuck state is invalid.");
  return parsed;
}

function duration(value: unknown): IntendedDuration {
  const parsed = finiteNumber(value) as IntendedDuration;
  if (!INTENDED_DURATIONS.includes(parsed)) throw new Error("Cloud duration is invalid.");
  return parsed;
}

function weekday(value: unknown): Weekday {
  const parsed = text(value) as Weekday;
  if (!WEEKDAYS.includes(parsed)) throw new Error("Cloud weekday is invalid.");
  return parsed;
}

function group(value: unknown): "first-move" | "priority" | "optional" {
  if (value !== "first-move" && value !== "priority" && value !== "optional") {
    throw new Error("Cloud plan group is invalid.");
  }
  return value;
}

function sessionMode(value: unknown): ActivitySession["mode"] {
  if (value !== "countdown" && value !== "stopwatch") throw new Error("Cloud session mode is invalid.");
  return value;
}

function sessionStatus(value: unknown): ActivitySession["status"] {
  if (value !== "running" && value !== "paused" && value !== "completed" && value !== "stopped") {
    throw new Error("Cloud session status is invalid.");
  }
  return value;
}

function rewardSource(value: unknown): RewardEvent["source"] {
  if (value === "purchase") return "store";
  if (value === "task" || value === "habit" || value === "session" || value === "morning" || value === "reflection") {
    return value;
  }
  throw new Error("Cloud reward source is invalid.");
}

function captureMethod(value: unknown): MorningCheck["captureMethod"] {
  if (value !== "camera" && value !== "upload") throw new Error("Cloud capture method is invalid.");
  return value;
}

function verifierMode(value: unknown): MorningCheck["verifierMode"] {
  if (value !== "mock" && value !== "live") throw new Error("Cloud verifier mode is invalid.");
  return value;
}

function optionalRating(value: unknown): 1 | 2 | 3 | 4 | 5 | undefined {
  if (value === null || value === undefined) return undefined;
  return boundedInteger(value, 1, 5) as 1 | 2 | 3 | 4 | 5;
}

function milestone(value: unknown): 21 | 50 | 100 {
  const parsed = finiteNumber(value);
  if (parsed !== 21 && parsed !== 50 && parsed !== 100) throw new Error("Cloud milestone is invalid.");
  return parsed;
}

function catItemId(value: unknown): string {
  const parsed = text(value);
  if (!CAT_ITEM_IDS.has(parsed)) throw new Error("Cloud inventory item is invalid.");
  return parsed;
}

function optionalCatItemId(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : catItemId(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
