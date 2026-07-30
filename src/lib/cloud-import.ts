import { normalizeAppState } from "./app-state.ts";
import { DAILY_PLAN_STORAGE_KEY, loadDailyPlans } from "./daily-plan-state.ts";
import { type CloudBackup, type CloudBackupStore, type EntityMapping, sha256 } from "./cloud-backup.ts";
import { STORAGE_KEY } from "./repository.ts";
import type { AppState } from "./models.ts";

export interface CloudImportPackage {
  snapshotHash: string;
  schemaVersion: 8;
  timezone: string;
  payload: Record<string, unknown>;
  mappings: EntityMapping[];
  localState: AppState;
}

type IdFactory = () => string;

export async function prepareCloudImport(
  backup: CloudBackup,
  backupStore: CloudBackupStore,
  timezone: string,
  idFactory: IdFactory = () => crypto.randomUUID(),
): Promise<CloudImportPackage> {
  if (backup.schemaVersion !== 8) throw new Error("Unsupported local data version.");
  const values = new Map(backup.entries);
  const localState = normalizeAppState(parseJson(values.get(STORAGE_KEY)));
  const plans = loadDailyPlans({ getItem: (key) => values.get(key) ?? null });
  const existingMappings = await backupStore.getMappings(backup.hash);
  const mappingSpecs = collectMappingSpecs(localState, plans);
  const mappings = existingMappings ?? await Promise.all(mappingSpecs.map(async ({ entityType, localId, payload }) => ({
    entityType,
    localId,
    cloudId: idFactory(),
    payloadHash: await sha256(JSON.stringify(payload)),
  })));
  if (!existingMappings) await backupStore.addMappings(backup.hash, mappings);
  assertMappings(mappingSpecs, mappings);

  const id = (entityType: string, localId: string) => {
    const mapping = mappings.find((candidate) => candidate.entityType === entityType && candidate.localId === localId);
    if (!mapping) throw new Error(`Missing ${entityType} mapping.`);
    return mapping.cloudId;
  };
  const occurredAt = (dateKey: string) => `${dateKey}T12:00:00.000Z`;
  const taskCompletions = localState.tasks.flatMap((task) => task.completedOn.map((dateKey) => ({
    id: id("task_completion", `${task.id}:${dateKey}`), task_id: id("task", task.id), local_date: dateKey,
    timezone, occurred_at: occurredAt(dateKey),
  })));
  const habitCompletions = localState.habits.flatMap((habit) => habit.completedOn.map((dateKey) => ({
    id: id("habit_completion", `${habit.id}:${dateKey}`), habit_id: id("habit", habit.id), local_date: dateKey,
    timezone, occurred_at: occurredAt(dateKey),
  })));
  const rewardRows = localState.rewardEvents.map((event) => {
    const sourceType = event.source === "store" ? "purchase" : event.source;
    const sourceId = rewardSourceId(event, id);
    return {
      id: id("reward_event", event.id), source_type: sourceType, source_id: sourceId,
      local_date: event.dateKey, timezone, points_tenths: Math.round(event.points * 10),
      idempotency_key: `import:${event.id}`, created_at: event.createdAt,
    };
  }).filter((event) => event.points_tenths !== 0);
  const inventoryEvents = localState.inventory.items.filter((item) => item.quantity > 0).map((item) => ({
    id: id("inventory_event", item.itemId), item_id: item.itemId, kind: "correction",
    quantity_delta: item.quantity, idempotency_key: `import-opening:${backup.hash}:${item.itemId}`,
    local_date: localState.progress.lastActiveDate ?? localState.progress.firstUseDate ?? new Date().toISOString().slice(0, 10),
    timezone,
  }));

  const payload = {
    mappings: mappings.map((mapping) => ({
      entity_type: mapping.entityType, local_id: mapping.localId, cloud_id: mapping.cloudId,
      payload_sha256: mapping.payloadHash,
    })),
    profile: { first_use_local_date: localState.progress.firstUseDate ?? null },
    settings: { selected_furniture_id: localState.inventory.selectedFurnitureId ?? null },
    tasks: localState.tasks.map((task) => ({
      id: id("task", task.id), title: task.title, direction: task.direction,
      rank: String(task.order).padStart(12, "0"), created_at: task.createdAt,
    })),
    task_completions: taskCompletions,
    habits: localState.habits.map((habit) => ({
      id: id("habit", habit.id), title: habit.title, direction: habit.direction,
      schedule_kind: habit.schedule.kind, created_at: habit.createdAt,
    })),
    habit_schedule_weekdays: localState.habits.flatMap((habit) =>
      habit.schedule.kind === "weekdays" ? habit.schedule.weekdays.map((weekday) => ({
        id: id("habit_schedule_weekday", `${habit.id}:${weekday}`), habit_id: id("habit", habit.id), weekday,
      })) : []),
    habit_completions: habitCompletions,
    activity_intents: localState.activityIntents.map((intent) => ({
      id: id("activity_intent", intent.id), stuck_state: intent.stuckState, direction: intent.direction,
      move_text: intent.moveText, intended_duration_minutes: intent.intendedDurationMinutes,
      linked_task_id: intent.linkedTaskId ? id("task", intent.linkedTaskId) : null,
      linked_habit_id: intent.linkedHabitId ? id("habit", intent.linkedHabitId) : null,
      status: intent.status, created_at: intent.createdAt,
    })),
    activity_sessions: localState.sessions.map((session) => ({
      id: id("activity_session", session.id), mode: session.mode, status: session.status,
      direction: session.direction, label: session.label, target_duration_minutes: session.targetDurationMinutes ?? null,
      linked_task_id: session.linkedTaskId ? id("task", session.linkedTaskId) : null,
      linked_habit_id: session.linkedHabitId ? id("habit", session.linkedHabitId) : null,
      linked_intent_id: session.linkedIntentId ? id("activity_intent", session.linkedIntentId) : null,
      started_at: session.startedAt, last_resumed_at: session.lastResumedAt ?? null,
      accumulated_elapsed_ms: session.accumulatedElapsedMs, ended_at: session.endedAt ?? null,
      actual_elapsed_ms: session.actualElapsedMs ?? null, reviewed_at: session.reviewedAt ?? null,
      local_date: (session.endedAt ?? session.startedAt).slice(0, 10), timezone,
    })),
    daily_plans: plans.map((plan) => ({
      id: id("daily_plan", plan.dateKey), local_date: plan.dateKey, timezone,
    })),
    daily_plan_items: plans.flatMap((plan) => plan.items.map((item, position) => ({
      id: id("daily_plan_item", `${plan.dateKey}:${item.id}:${position}`),
      daily_plan_id: id("daily_plan", plan.dateKey), item_group: item.group, title: item.title,
      first_step: item.firstStep, direction: item.category, duration_minutes: item.durationMinutes, position,
    }))),
    morning_checks: localState.morningChecks.map((check) => ({
      id: id("morning_check", check.dateKey), local_date: check.dateKey, timezone,
      verified_at: check.verifiedAt, capture_method: check.captureMethod, verifier_mode: check.verifierMode,
    })),
    morning_attempts: localState.morningAttempts.map((attempt) => ({
      local_date: attempt.dateKey, timezone, attempt_count: attempt.count,
    })),
    journal_entries: localState.journalEntries.map((entry) => ({
      id: id("journal_entry", entry.dateKey), local_date: entry.dateKey, timezone,
      mood: entry.mood ?? null, energy: entry.energy ?? null, what_helped: entry.whatHelped ?? null,
      completed: entry.completed ?? null, difficult: entry.difficult ?? null, next_step: entry.nextStep ?? null,
      free_text: entry.freeText ?? null, updated_at: entry.updatedAt,
    })),
    reward_ledger: rewardRows,
    inventory_events: inventoryEvents,
    inventory_balances: localState.inventory.items.filter((item) => item.quantity > 0).map((item) => ({
      item_id: item.itemId, quantity: item.quantity,
    })),
    milestone_grants: localState.progress.grantedMilestones.map((day) => ({
      id: id("milestone_grant", String(day)), milestone_day: day,
      active_day_count: Math.max(day, localState.progress.totalActiveDays),
    })),
    expected: {
      record_counts: {
        tasks: localState.tasks.length, task_completions: taskCompletions.length,
        habits: localState.habits.length, habit_completions: habitCompletions.length,
        activity_intents: localState.activityIntents.length, activity_sessions: localState.sessions.length,
        daily_plans: plans.length, journal_entries: localState.journalEntries.length,
        morning_checks: localState.morningChecks.length, reward_ledger: rewardRows.length,
      },
      points_tenths: rewardRows.reduce((total, event) => total + event.points_tenths, 0),
      inventory_balances: Object.fromEntries(localState.inventory.items.filter((item) => item.quantity > 0).map((item) => [item.itemId, item.quantity])),
      milestones: [...localState.progress.grantedMilestones].sort((a, b) => a - b),
      active_days: localState.progress.activeDateKeys.length,
    },
  };
  return { snapshotHash: backup.hash, schemaVersion: 8, timezone, payload, mappings, localState };
}

function collectMappingSpecs(state: AppState, plans: ReturnType<typeof loadDailyPlans>) {
  const specs: Array<{ entityType: string; localId: string; payload: unknown }> = [];
  const add = (entityType: string, localId: string, payload: unknown) => specs.push({ entityType, localId, payload });
  for (const task of state.tasks) {
    add("task", task.id, task);
    for (const date of task.completedOn) add("task_completion", `${task.id}:${date}`, { taskId: task.id, date });
  }
  for (const habit of state.habits) {
    add("habit", habit.id, habit);
    if (habit.schedule.kind === "weekdays") for (const weekday of habit.schedule.weekdays) add("habit_schedule_weekday", `${habit.id}:${weekday}`, { habitId: habit.id, weekday });
    for (const date of habit.completedOn) add("habit_completion", `${habit.id}:${date}`, { habitId: habit.id, date });
  }
  for (const intent of state.activityIntents) add("activity_intent", intent.id, intent);
  for (const session of state.sessions) add("activity_session", session.id, session);
  for (const plan of plans) {
    add("daily_plan", plan.dateKey, plan);
    plan.items.forEach((item, position) => add("daily_plan_item", `${plan.dateKey}:${item.id}:${position}`, item));
  }
  for (const check of state.morningChecks) add("morning_check", check.dateKey, check);
  for (const attempt of state.morningAttempts) add("morning_attempt", attempt.dateKey, attempt);
  for (const entry of state.journalEntries) add("journal_entry", entry.dateKey, entry);
  for (const reward of state.rewardEvents) add("reward_event", reward.id, reward);
  for (const item of state.inventory.items.filter((candidate) => candidate.quantity > 0)) {
    add("inventory_event", item.itemId, item);
    add("inventory_balance", item.itemId, item);
  }
  for (const day of state.progress.grantedMilestones) add("milestone_grant", String(day), day);
  return specs;
}

function assertMappings(specs: ReturnType<typeof collectMappingSpecs>, mappings: EntityMapping[]) {
  if (mappings.length !== specs.length) throw new Error("Saved import mapping does not match this snapshot.");
  for (const spec of specs) {
    if (!mappings.some((mapping) => mapping.entityType === spec.entityType && mapping.localId === spec.localId)) {
      throw new Error("Saved import mapping is incomplete.");
    }
  }
}

function rewardSourceId(event: AppState["rewardEvents"][number], id: (type: string, localId: string) => string): string {
  if (event.source === "task") return id("task_completion", `${event.sourceId}:${event.dateKey}`);
  if (event.source === "habit") return id("habit_completion", `${event.sourceId}:${event.dateKey}`);
  if (event.source === "session") return id("activity_session", event.sourceId);
  if (event.source === "morning") return id("morning_check", event.dateKey);
  if (event.source === "reflection") return id("journal_entry", event.dateKey);
  return id("reward_event", event.id);
}

function parseJson(value: string | undefined): unknown {
  try {
    return JSON.parse(value ?? "null") as unknown;
  } catch {
    return null;
  }
}

export function backupContainsToothbrushImage(backup: CloudBackup): boolean {
  return backup.entries.some(([key]) => /toothbrush.*(image|photo)|image.*toothbrush/i.test(key));
}

export { DAILY_PLAN_STORAGE_KEY };
