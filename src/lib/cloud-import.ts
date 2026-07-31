import { normalizeAppState } from "./app-state.ts";
import { DAILY_PLAN_STORAGE_KEY, loadDailyPlans } from "./daily-plan-state.ts";
import { type CloudBackup, type CloudBackupStore, type EntityMapping, sha256 } from "./cloud-backup.ts";
import { isDateKey } from "./dates.ts";
import { STORAGE_KEY } from "./repository.ts";
import type { AppState } from "./models.ts";

export interface CloudImportPackage {
  snapshotHash: string;
  schemaVersion: 8;
  timezone: string;
  payload: Record<string, unknown>;
  mappings: EntityMapping[];
  localState: AppState;
  completionPreflightReport: CompletionStructuralDiagnostic[];
  safeDiagnostic: SafeCloudImportDiagnostic;
}

type IdFactory = () => string;

export class CloudImportDiagnosticError extends Error {
  readonly code: string;
  readonly structuralDiagnostic?: CompletionStructuralDiagnostic;
  readonly safeDiagnostic?: SafeCloudImportDiagnostic;

  constructor(code: string, message: string, structuralDiagnostic?: CompletionStructuralDiagnostic, safeDiagnostic?: SafeCloudImportDiagnostic) {
    super(message);
    this.code = code;
    this.structuralDiagnostic = structuralDiagnostic;
    this.safeDiagnostic = safeDiagnostic;
    this.name = "CloudImportDiagnosticError";
  }
}

export interface SafeCloudImportDiagnostic {
  errorCode: string;
  phase: "mapping" | "payload" | "preflight-complete";
  rpcAttempted: false;
  entityType?: string;
  rewardSource?: string;
  rewardIdShape?: string;
  hashedSourceId?: string;
  dateKey?: string;
  parentExists?: boolean;
  parentMappingExists?: boolean;
  completionMappingExists?: boolean;
  completionPayloadExists?: boolean;
  activeCompletionExists?: boolean;
  historicalRewardExists?: boolean;
  placeholderParentCreated?: boolean;
  mappingEntityTypesPresent: string[];
  mappingCountByEntityType: Record<string, number>;
  localCountsByEntityType: Record<string, number>;
  rewardCountsBySourceType: Record<string, number>;
  linkedIntentIdPresent?: boolean;
  linkedIntentIdType?: string;
  linkedIntentIdShape?: string;
  hashedLinkedIntentId?: string;
  referencingSessionMappingExists?: boolean;
  currentIntentRecordExists?: boolean;
  placeholderIntentCreated?: boolean;
  distinctReferencedIntentCount?: number;
  currentIntentCount?: number;
  placeholderIntentCount?: number;
}

export interface CompletionStructuralDiagnostic {
  sourceType: "task" | "habit";
  hashedLocalSourceId: string;
  dateKey: string;
  parentExists: boolean;
  activeCompletionContainsDate: boolean;
  completionMappingExists: boolean;
  completionPayloadRowExists: boolean;
}

interface CompletionImport {
  sourceType: "task" | "habit";
  parentId: string;
  dateKey: string;
  active: boolean;
  occurredAt: string;
  deletedAt: string | null;
}

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
  const importModel = buildCompletionImportModel(localState);
  const existingMappings = await backupStore.getMappings(backup.hash);
  const mappingSpecs = collectMappingSpecs(localState, plans, importModel);
  const hashedSpecs = await Promise.all(mappingSpecs.map(async (spec) => ({
    ...spec,
    payloadHash: await sha256(JSON.stringify(spec.payload)),
  })));
  const additions = hashedSpecs.filter((spec) => {
    const existing = existingMappings?.find((mapping) =>
      mapping.entityType === spec.entityType && mapping.localId === spec.localId);
    if (existing && existing.payloadHash !== spec.payloadHash) {
      throw new Error("Saved import mapping does not match this snapshot.");
    }
    return !existing;
  }).map(({ entityType, localId, payloadHash }) => ({
    entityType, localId, cloudId: idFactory(), payloadHash,
  }));
  const mappings = existingMappings
    ? await backupStore.mergeMappings(backup.hash, additions)
    : await backupStore.addMappings(backup.hash, additions);
  const identityHashes = new Map(await Promise.all(mappingSpecs.map(async (spec) => [
    `${spec.entityType}\u0000${spec.localId}`, await sha256(spec.localId),
  ] as const)));

  const diagnosticFor = (code: string, entityType: string, localId: string, phase: "mapping" | "payload"): SafeCloudImportDiagnostic => {
    const reward = localState.rewardEvents.find((event) => rewardMappingIdentity(event).entityType === entityType && rewardMappingIdentity(event).localId === localId);
    const referencingSession = entityType === "activity_intent"
      ? localState.sessions.find((session) => session.linkedIntentId === localId) : undefined;
    return safeDiagnosticSummary(localState, mappings, importModel, {
      errorCode: code, phase, entityType, reward, referencingSession,
      hashedSourceId: identityHashes.get(`${entityType}\u0000${localId}`) ?? "unavailable",
    });
  };
  for (const spec of mappingSpecs) {
    if (!mappings.some((mapping) => mapping.entityType === spec.entityType && mapping.localId === spec.localId)) {
      const code = mappingErrorCode(spec.entityType);
      throw new CloudImportDiagnosticError(code, "Local import relationships could not be prepared.", undefined, diagnosticFor(code, spec.entityType, spec.localId, "mapping"));
    }
  }

  const id = (entityType: string, localId: string) => {
    const mapping = mappings.find((candidate) => candidate.entityType === entityType && candidate.localId === localId);
    if (!mapping) {
      const code = mappingErrorCode(entityType);
      throw new CloudImportDiagnosticError(code, "Local import relationships could not be prepared.", undefined, diagnosticFor(code, entityType, localId, "payload"));
    }
    return mapping.cloudId;
  };
  const taskCompletions = importModel.completions.filter((entry) => entry.sourceType === "task").map((entry) => ({
    id: id("task_completion", completionLocalId(entry.parentId, entry.dateKey)),
    task_id: id("task", entry.parentId), local_date: entry.dateKey, timezone,
    occurred_at: entry.occurredAt, deleted_at: entry.deletedAt,
  }));
  const habitCompletions = importModel.completions.filter((entry) => entry.sourceType === "habit").map((entry) => ({
    id: id("habit_completion", completionLocalId(entry.parentId, entry.dateKey)),
    habit_id: id("habit", entry.parentId), local_date: entry.dateKey, timezone,
    occurred_at: entry.occurredAt, deleted_at: entry.deletedAt,
  }));
  const completionPreflightReport = await assertRewardCompletionStructure(localState, mappings, [...taskCompletions, ...habitCompletions]);
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
    tasks: importModel.tasks.map((task, order) => ({
      id: id("task", task.localId), title: task.current?.title ?? "Deleted task", direction: task.current?.direction ?? "Daily Life",
      rank: String(task.current?.order ?? order).padStart(12, "0"), created_at: task.current?.createdAt ?? task.deletedAt,
      deleted_at: task.deletedAt,
    })),
    task_completions: taskCompletions,
    habits: importModel.habits.map((habit) => ({
      id: id("habit", habit.localId), title: habit.current?.title ?? "Deleted habit", direction: habit.current?.direction ?? "Daily Life",
      schedule_kind: habit.current?.schedule.kind ?? "daily", created_at: habit.current?.createdAt ?? habit.deletedAt,
      deleted_at: habit.deletedAt,
    })),
    habit_schedule_weekdays: localState.habits.flatMap((habit) =>
      habit.schedule.kind === "weekdays" ? habit.schedule.weekdays.map((weekday) => ({
        id: id("habit_schedule_weekday", `${habit.id}:${weekday}`), habit_id: id("habit", habit.id), weekday,
      })) : []),
    habit_completions: habitCompletions,
    activity_intents: importModel.intents.map((source) => ({
      id: id("activity_intent", source.localId), stuck_state: source.current?.stuckState ?? "unsure what is needed",
      direction: source.current?.direction ?? "Daily Life",
      move_text: source.current?.moveText ?? "Unavailable historical First Move", intended_duration_minutes: source.current?.intendedDurationMinutes ?? 2,
      linked_task_id: source.current?.linkedTaskId ? id("task", source.current.linkedTaskId) : null,
      linked_habit_id: source.current?.linkedHabitId ? id("habit", source.current.linkedHabitId) : null,
      status: source.current?.status ?? "consumed", created_at: source.current?.createdAt ?? source.deletedAt,
      deleted_at: source.deletedAt,
    })),
    activity_sessions: importModel.sessions.map((entry) => {
      const session = entry.current;
      return {
      id: id("activity_session", entry.localId), mode: session?.mode ?? "stopwatch", status: session?.status ?? "stopped",
      direction: session?.direction ?? "Daily Life", label: session?.label ?? "Deleted session", target_duration_minutes: session?.targetDurationMinutes ?? null,
      linked_task_id: session?.linkedTaskId ? id("task", session.linkedTaskId) : null,
      linked_habit_id: session?.linkedHabitId ? id("habit", session.linkedHabitId) : null,
      linked_intent_id: session?.linkedIntentId ? id("activity_intent", session.linkedIntentId) : null,
      started_at: session?.startedAt ?? entry.deletedAt, last_resumed_at: session?.lastResumedAt ?? null,
      accumulated_elapsed_ms: session?.accumulatedElapsedMs ?? 0, ended_at: session?.endedAt ?? entry.deletedAt,
      actual_elapsed_ms: session?.actualElapsedMs ?? 0, reviewed_at: session?.reviewedAt ?? null,
      local_date: (session?.endedAt ?? session?.startedAt ?? entry.deletedAt ?? "").slice(0, 10), timezone,
      deleted_at: entry.deletedAt,
      };
    }),
    daily_plans: plans.map((plan) => ({
      id: id("daily_plan", plan.dateKey), local_date: plan.dateKey, timezone,
    })),
    daily_plan_items: plans.flatMap((plan) => plan.items.map((item, position) => ({
      id: id("daily_plan_item", `${plan.dateKey}:${item.id}:${position}`),
      daily_plan_id: id("daily_plan", plan.dateKey), item_group: item.group, title: item.title,
      first_step: item.firstStep, direction: item.category, duration_minutes: item.durationMinutes, position,
    }))),
    morning_checks: importModel.morningChecks.map((entry) => ({
      id: id("morning_check", entry.localId), local_date: entry.localId, timezone,
      verified_at: entry.current?.verifiedAt ?? `${entry.localId}T12:00:00.000Z`,
      capture_method: entry.current?.captureMethod ?? "upload", verifier_mode: entry.current?.verifierMode ?? "mock",
    })),
    morning_attempts: localState.morningAttempts.map((attempt) => ({
      local_date: attempt.dateKey, timezone, attempt_count: attempt.count,
    })),
    journal_entries: importModel.journals.map((source) => ({
      id: id("journal_entry", source.localId), local_date: source.localId, timezone,
      mood: source.current?.mood ?? null, energy: source.current?.energy ?? null, what_helped: source.current?.whatHelped ?? null,
      completed: source.current?.completed ?? null, difficult: source.current?.difficult ?? null, next_step: source.current?.nextStep ?? null,
      free_text: source.current?.freeText ?? null, updated_at: source.current?.updatedAt ?? source.deletedAt,
      deleted_at: source.deletedAt,
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
        tasks: importModel.tasks.length, task_completions: taskCompletions.length,
        habits: importModel.habits.length, habit_completions: habitCompletions.length,
        activity_intents: importModel.intents.length, activity_sessions: importModel.sessions.length,
        daily_plans: plans.length, journal_entries: importModel.journals.length,
        morning_checks: importModel.morningChecks.length, reward_ledger: rewardRows.length,
      },
      points_tenths: rewardRows.reduce((total, event) => total + event.points_tenths, 0),
      inventory_balances: Object.fromEntries(localState.inventory.items.filter((item) => item.quantity > 0).map((item) => [item.itemId, item.quantity])),
      milestones: [...localState.progress.grantedMilestones].sort((a, b) => a - b),
      active_days: localState.progress.activeDateKeys.length,
    },
  };
  const safeDiagnostic = safeDiagnosticSummary(localState, mappings, importModel, {
    errorCode: "IMPORT_PREFLIGHT_OK", phase: "preflight-complete",
  });
  return { snapshotHash: backup.hash, schemaVersion: 8, timezone, payload, mappings, localState, completionPreflightReport, safeDiagnostic };
}

interface ImportParent<T> { localId: string; current?: T; deletedAt: string | null }
interface CompletionImportModel {
  tasks: Array<ImportParent<AppState["tasks"][number]>>;
  habits: Array<ImportParent<AppState["habits"][number]>>;
  completions: CompletionImport[];
  sessions: Array<ImportParent<AppState["sessions"][number]>>;
  journals: Array<ImportParent<AppState["journalEntries"][number]>>;
  morningChecks: Array<ImportParent<AppState["morningChecks"][number]>>;
  intents: Array<ImportParent<AppState["activityIntents"][number]>>;
}

function buildCompletionImportModel(state: AppState): CompletionImportModel {
  const taskParents = new Map<string, ImportParent<AppState["tasks"][number]>>(
    state.tasks.map((task) => [task.id, { localId: task.id, current: task, deletedAt: null }]),
  );
  const habitParents = new Map<string, ImportParent<AppState["habits"][number]>>(
    state.habits.map((habit) => [habit.id, { localId: habit.id, current: habit, deletedAt: null }]),
  );
  const completions = new Map<string, CompletionImport>();
  const sessions = new Map<string, ImportParent<AppState["sessions"][number]>>(
    state.sessions.map((session) => [session.id, { localId: session.id, current: session, deletedAt: null }]),
  );
  const journals = new Map<string, ImportParent<AppState["journalEntries"][number]>>(
    state.journalEntries.map((entry) => [entry.dateKey, { localId: entry.dateKey, current: entry, deletedAt: null }]),
  );
  const morningChecks = new Map<string, ImportParent<AppState["morningChecks"][number]>>(
    state.morningChecks.map((check) => [check.dateKey, { localId: check.dateKey, current: check, deletedAt: null }]),
  );
  const intents = new Map<string, ImportParent<AppState["activityIntents"][number]>>(
    state.activityIntents.map((intent) => [intent.id, { localId: intent.id, current: intent, deletedAt: null }]),
  );
  const addActive = (sourceType: "task" | "habit", parentId: string, dateKey: string) => {
    if (!parentId || !isDateKey(dateKey)) throwCompletionIdentityError(sourceType);
    completions.set(`${sourceType}\u0000${completionLocalId(parentId, dateKey)}`, {
      sourceType, parentId, dateKey, active: true,
      occurredAt: `${dateKey}T12:00:00.000Z`, deletedAt: null,
    });
  };
  for (const task of state.tasks) for (const date of new Set(task.completedOn)) addActive("task", task.id, date);
  for (const habit of state.habits) for (const date of new Set(habit.completedOn)) addActive("habit", habit.id, date);

  for (const reward of state.rewardEvents) {
    if (reward.source !== "task" && reward.source !== "habit") continue;
    if (!reward.sourceId || !isDateKey(reward.dateKey)) throwCompletionIdentityError(reward.source);
    const parents = reward.source === "task" ? taskParents : habitParents;
    if (!parents.has(reward.sourceId)) {
      parents.set(reward.sourceId, { localId: reward.sourceId, deletedAt: reward.createdAt });
    }
    const key = `${reward.source}\u0000${completionLocalId(reward.sourceId, reward.dateKey)}`;
    const active = completions.get(key);
    if (active) {
      active.occurredAt = reward.createdAt;
    } else {
      completions.set(key, {
        sourceType: reward.source, parentId: reward.sourceId, dateKey: reward.dateKey,
        active: false, occurredAt: reward.createdAt, deletedAt: reward.createdAt,
      });
    }
  }
  for (const reward of state.rewardEvents) {
    if (reward.source === "session" && !sessions.has(reward.sourceId)) {
      sessions.set(reward.sourceId, { localId: reward.sourceId, deletedAt: reward.createdAt });
    } else if (reward.source === "reflection" && !journals.has(reward.dateKey)) {
      journals.set(reward.dateKey, { localId: reward.dateKey, deletedAt: reward.createdAt });
    } else if (reward.source === "morning" && !morningChecks.has(reward.dateKey)) {
      morningChecks.set(reward.dateKey, { localId: reward.dateKey, deletedAt: null });
    }
  }
  for (const intent of state.activityIntents) {
    if (intent.linkedTaskId && !taskParents.has(intent.linkedTaskId)) taskParents.set(intent.linkedTaskId, { localId: intent.linkedTaskId, deletedAt: intent.createdAt });
    if (intent.linkedHabitId && !habitParents.has(intent.linkedHabitId)) habitParents.set(intent.linkedHabitId, { localId: intent.linkedHabitId, deletedAt: intent.createdAt });
  }
  for (const session of state.sessions) {
    if (session.linkedTaskId && !taskParents.has(session.linkedTaskId)) taskParents.set(session.linkedTaskId, { localId: session.linkedTaskId, deletedAt: session.startedAt });
    if (session.linkedHabitId && !habitParents.has(session.linkedHabitId)) habitParents.set(session.linkedHabitId, { localId: session.linkedHabitId, deletedAt: session.startedAt });
    if (session.linkedIntentId?.trim() && !intents.has(session.linkedIntentId)) {
      intents.set(session.linkedIntentId, { localId: session.linkedIntentId, deletedAt: session.endedAt ?? session.startedAt });
    }
  }
  return {
    tasks: [...taskParents.values()], habits: [...habitParents.values()], completions: [...completions.values()],
    sessions: [...sessions.values()], journals: [...journals.values()], morningChecks: [...morningChecks.values()],
    intents: [...intents.values()],
  };
}

function collectMappingSpecs(state: AppState, plans: ReturnType<typeof loadDailyPlans>, model: CompletionImportModel) {
  const specs: Array<{ entityType: string; localId: string; payload: unknown }> = [];
  const identities = new Set<string>();
  const add = (entityType: string, localId: string, payload: unknown) => {
    const identity = `${entityType}\u0000${localId}`;
    if (identities.has(identity)) return;
    identities.add(identity);
    specs.push({ entityType, localId, payload });
  };
  for (const task of model.tasks) add("task", task.localId, task.current ?? { deletedAt: task.deletedAt });
  for (const completion of model.completions.filter((entry) => entry.sourceType === "task")) {
    add("task_completion", completionLocalId(completion.parentId, completion.dateKey), { taskId: completion.parentId, date: completion.dateKey });
  }
  for (const habit of model.habits) {
    add("habit", habit.localId, habit.current ?? { deletedAt: habit.deletedAt });
    const current = habit.current;
    if (!current) continue;
    if (current.schedule.kind === "weekdays") for (const weekday of current.schedule.weekdays) add("habit_schedule_weekday", `${current.id}:${weekday}`, { habitId: current.id, weekday });
  }
  for (const completion of model.completions.filter((entry) => entry.sourceType === "habit")) {
    add("habit_completion", completionLocalId(completion.parentId, completion.dateKey), { habitId: completion.parentId, date: completion.dateKey });
  }
  for (const intent of model.intents) add("activity_intent", intent.localId, intent.current ?? { deletedAt: intent.deletedAt });
  for (const session of model.sessions) add("activity_session", session.localId, session.current ?? { deletedAt: session.deletedAt });
  for (const plan of plans) {
    add("daily_plan", plan.dateKey, plan);
    plan.items.forEach((item, position) => add("daily_plan_item", `${plan.dateKey}:${item.id}:${position}`, item));
  }
  for (const check of model.morningChecks) add("morning_check", check.localId, check.current ?? { historical: true });
  for (const attempt of state.morningAttempts) add("morning_attempt", attempt.dateKey, attempt);
  for (const entry of model.journals) add("journal_entry", entry.localId, entry.current ?? { deletedAt: entry.deletedAt });
  for (const reward of state.rewardEvents) add("reward_event", reward.id, reward);
  for (const item of state.inventory.items.filter((candidate) => candidate.quantity > 0)) {
    add("inventory_event", item.itemId, item);
    add("inventory_balance", item.itemId, item);
  }
  for (const day of state.progress.grantedMilestones) add("milestone_grant", String(day), day);
  return specs;
}

function rewardSourceId(
  event: AppState["rewardEvents"][number],
  id: (type: string, localId: string) => string,
): string {
  if (event.source === "task") {
    return id("task_completion", completionLocalId(event.sourceId, event.dateKey));
  }
  if (event.source === "habit") {
    return id("habit_completion", completionLocalId(event.sourceId, event.dateKey));
  }
  if (event.source === "session") return id("activity_session", event.sourceId);
  if (event.source === "morning") return id("morning_check", event.dateKey);
  if (event.source === "reflection") return id("journal_entry", event.dateKey);
  return id("reward_event", event.id);
}

function rewardMappingIdentity(event: AppState["rewardEvents"][number]): { entityType: string; localId: string } {
  if (event.source === "task") return { entityType: "task_completion", localId: completionLocalId(event.sourceId, event.dateKey) };
  if (event.source === "habit") return { entityType: "habit_completion", localId: completionLocalId(event.sourceId, event.dateKey) };
  if (event.source === "session") return { entityType: "activity_session", localId: event.sourceId };
  if (event.source === "morning") return { entityType: "morning_check", localId: event.dateKey };
  if (event.source === "reflection") return { entityType: "journal_entry", localId: event.dateKey };
  return { entityType: "reward_event", localId: event.id };
}

function mappingErrorCode(entityType: string): string {
  const codes: Record<string, string> = {
    task: "IMPORT_TASK_PARENT_MAPPING_MISSING",
    habit: "IMPORT_HABIT_PARENT_MAPPING_MISSING",
    task_completion: "IMPORT_TASK_COMPLETION_MAPPING_MISSING",
    habit_completion: "IMPORT_HABIT_COMPLETION_MAPPING_MISSING",
    activity_session: "IMPORT_SESSION_SOURCE_MAPPING_MISSING",
    morning_check: "IMPORT_MORNING_SOURCE_MAPPING_MISSING",
    journal_entry: "IMPORT_REFLECTION_SOURCE_MAPPING_MISSING",
    reward_event: "IMPORT_PURCHASE_SOURCE_MAPPING_MISSING",
    milestone_grant: "IMPORT_MILESTONE_SOURCE_MAPPING_MISSING",
    activity_intent: "IMPORT_ACTIVITY_INTENT_MAPPING_MISSING",
    habit_schedule_weekday: "IMPORT_HABIT_SCHEDULE_MAPPING_MISSING",
    daily_plan: "IMPORT_DAILY_PLAN_MAPPING_MISSING",
    daily_plan_item: "IMPORT_DAILY_PLAN_ITEM_MAPPING_MISSING",
    inventory_event: "IMPORT_INVENTORY_EVENT_MAPPING_MISSING",
    inventory_balance: "IMPORT_INVENTORY_BALANCE_MAPPING_MISSING",
  };
  return codes[entityType] ?? "IMPORT_REWARD_SOURCE_MAPPING_MISSING";
}

function safeDiagnosticSummary(
  state: AppState,
  mappings: EntityMapping[],
  model: CompletionImportModel,
  context: { errorCode: string; phase: SafeCloudImportDiagnostic["phase"]; entityType?: string; reward?: AppState["rewardEvents"][number]; hashedSourceId?: string; referencingSession?: AppState["sessions"][number] },
): SafeCloudImportDiagnostic {
  const mappingCountByEntityType: Record<string, number> = {};
  for (const mapping of mappings) mappingCountByEntityType[mapping.entityType] = (mappingCountByEntityType[mapping.entityType] ?? 0) + 1;
  const rewardCountsBySourceType: Record<string, number> = {};
  for (const reward of state.rewardEvents) rewardCountsBySourceType[reward.source] = (rewardCountsBySourceType[reward.source] ?? 0) + 1;
  const reward = context.reward;
  const parent = reward?.source === "task" ? state.tasks.find((task) => task.id === reward.sourceId)
    : reward?.source === "habit" ? state.habits.find((habit) => habit.id === reward.sourceId) : undefined;
  const completionType = reward?.source === "task" ? "task_completion" : reward?.source === "habit" ? "habit_completion" : undefined;
  const completionId = reward && completionType ? completionLocalId(reward.sourceId, reward.dateKey) : undefined;
  const linkedIntentId = context.referencingSession?.linkedIntentId;
  const referencedIntentIds = new Set(state.sessions.map((session) => session.linkedIntentId).filter((value): value is string => Boolean(value?.trim())));
  return {
    errorCode: context.errorCode, phase: context.phase, rpcAttempted: false,
    entityType: context.entityType, rewardSource: reward?.source,
    rewardIdShape: reward ? `${reward.source}:<sourceId>:<dateKey>` : undefined,
    hashedSourceId: context.hashedSourceId, dateKey: reward?.dateKey,
    parentExists: reward && (reward.source === "task" || reward.source === "habit") ? Boolean(parent) : undefined,
    parentMappingExists: reward && (reward.source === "task" || reward.source === "habit")
      ? mappings.some((mapping) => mapping.entityType === reward.source && mapping.localId === reward.sourceId) : undefined,
    completionMappingExists: completionType && completionId
      ? mappings.some((mapping) => mapping.entityType === completionType && mapping.localId === completionId) : undefined,
    completionPayloadExists: completionType && completionId
      ? model.completions.some((entry) => entry.sourceType === reward?.source && completionLocalId(entry.parentId, entry.dateKey) === completionId) : undefined,
    activeCompletionExists: parent && reward ? parent.completedOn.includes(reward.dateKey) : undefined,
    historicalRewardExists: Boolean(reward),
    placeholderParentCreated: reward?.source === "task" ? model.tasks.some((item) => item.localId === reward.sourceId && !item.current)
      : reward?.source === "habit" ? model.habits.some((item) => item.localId === reward.sourceId && !item.current) : undefined,
    mappingEntityTypesPresent: Object.keys(mappingCountByEntityType).sort(), mappingCountByEntityType,
    localCountsByEntityType: {
      tasks: state.tasks.length, habits: state.habits.length, taskCompletions: state.tasks.reduce((sum, task) => sum + new Set(task.completedOn).size, 0),
      habitCompletions: state.habits.reduce((sum, habit) => sum + new Set(habit.completedOn).size, 0), sessions: state.sessions.length,
      morningChecks: state.morningChecks.length, journalEntries: state.journalEntries.length, rewardEvents: state.rewardEvents.length,
      placeholderTasks: model.tasks.filter((item) => !item.current).length, placeholderHabits: model.habits.filter((item) => !item.current).length,
      placeholderSessions: model.sessions.filter((item) => !item.current).length, placeholderJournals: model.journals.filter((item) => !item.current).length,
      activityIntents: state.activityIntents.length, placeholderIntents: model.intents.filter((item) => !item.current).length,
    }, rewardCountsBySourceType,
    linkedIntentIdPresent: context.referencingSession ? Boolean(linkedIntentId) : undefined,
    linkedIntentIdType: context.referencingSession ? typeof linkedIntentId : undefined,
    linkedIntentIdShape: linkedIntentId ? (linkedIntentId.includes(":") ? "nonempty-string-with-colon" : "nonempty-string") : undefined,
    hashedLinkedIntentId: context.referencingSession ? context.hashedSourceId : undefined,
    referencingSessionMappingExists: context.referencingSession
      ? mappings.some((mapping) => mapping.entityType === "activity_session" && mapping.localId === context.referencingSession?.id) : undefined,
    currentIntentRecordExists: linkedIntentId ? state.activityIntents.some((intent) => intent.id === linkedIntentId) : undefined,
    placeholderIntentCreated: linkedIntentId ? model.intents.some((intent) => intent.localId === linkedIntentId && !intent.current) : undefined,
    distinctReferencedIntentCount: referencedIntentIds.size,
    currentIntentCount: state.activityIntents.length,
    placeholderIntentCount: model.intents.filter((item) => !item.current).length,
  };
}

function completionLocalId(parentId: string, dateKey: string): string {
  return `${parentId}:${dateKey}`;
}

function throwCompletionIdentityError(sourceType: "task" | "habit"): never {
  throw new CloudImportDiagnosticError(
    sourceType === "task" ? "IMPORT_TASK_COMPLETION_MAPPING_MISSING" : "IMPORT_HABIT_COMPLETION_MAPPING_MISSING",
    "Local completion history could not be prepared.",
  );
}

export async function buildCompletionPreflightReport(
  state: AppState,
  mappings: EntityMapping[],
  completionRows: Array<Record<string, unknown>>,
): Promise<CompletionStructuralDiagnostic[]> {
  return Promise.all(state.rewardEvents
    .filter((event) => event.source === "task" || event.source === "habit")
    .map(async (event) => {
      const sourceType = event.source as "task" | "habit";
      const parent = sourceType === "task"
        ? state.tasks.find((task) => task.id === event.sourceId)
        : state.habits.find((habit) => habit.id === event.sourceId);
      const mapping = mappings.find((candidate) =>
        candidate.entityType === `${sourceType}_completion` &&
        candidate.localId === completionLocalId(event.sourceId, event.dateKey));
      return {
        sourceType,
        hashedLocalSourceId: await sha256(event.sourceId),
        dateKey: event.dateKey,
        parentExists: Boolean(parent),
        activeCompletionContainsDate: parent?.completedOn.includes(event.dateKey) ?? false,
        completionMappingExists: Boolean(mapping),
        completionPayloadRowExists: Boolean(mapping && completionRows.some((row) => row.id === mapping.cloudId)),
      };
    }));
}

async function assertRewardCompletionStructure(
  state: AppState,
  mappings: EntityMapping[],
  completionRows: Array<Record<string, unknown>>,
): Promise<CompletionStructuralDiagnostic[]> {
  const diagnostics = await buildCompletionPreflightReport(state, mappings, completionRows);
  const failure = diagnostics.find((entry) => !entry.completionMappingExists || !entry.completionPayloadRowExists);
  if (!failure) return diagnostics;
  throw new CloudImportDiagnosticError(
    failure.sourceType === "task" ? "IMPORT_TASK_COMPLETION_MAPPING_MISSING" : "IMPORT_HABIT_COMPLETION_MAPPING_MISSING",
    "Local completion history could not be prepared.",
    failure,
  );
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
