import assert from "node:assert/strict";
import test from "node:test";

import { createPendingIntent } from "../domain/app-state.ts";
import { createEmptyState, type AppState, type DailyPlanRecord } from "../domain/models.ts";
import { deleteReflection, saveReflection } from "../domain/reflections.ts";
import {
  addHabit,
  addTask,
  editHabit,
  editTask,
  softDeleteHabit,
  softDeleteTask,
  toggleHabitCompletion,
  toggleTaskCompletion,
} from "../domain/tasks-habits.ts";
import {
  cancelSession,
  completeSessionIfElapsed,
  pauseSession,
  resumeSession,
  reviewSession,
  startCountdown,
  startCountdownFromIntent,
  startStopwatch,
  stopSession,
} from "../domain/sessions.ts";
import {
  createMobileRepositoryWithStore,
  type AsyncKeyValueStore,
} from "../local/repository-core.ts";
import { canonicalPayload } from "../test-fixtures/canonical.ts";
import { createMobileSyncQueue } from "./sync-queue.ts";
import {
  MobileSyncRuntime,
  SYNC_CLOUD_WORKSPACE_RPC,
  type MobileSyncClient,
} from "./sync-runtime.ts";

const USER_A = "90000000-0000-4000-8000-000000000001";
const USER_B = "90000000-0000-4000-8000-000000000002";
const DEVICE_ID = "d0000000-0000-4000-8000-000000000001";
const TASK_ID = "10000000-0000-4000-8000-000000000010";
const HABIT_ID = "20000000-0000-4000-8000-000000000020";
const INTENT_ID = "30000000-0000-4000-8000-000000000030";
const SESSION_ID = "40000000-0000-4000-8000-000000000040";
const SESSION_2_ID = "40000000-0000-4000-8000-000000000041";
const SESSION_3_ID = "40000000-0000-4000-8000-000000000042";
const MUTATION_IDS = Array.from(
  { length: 32 },
  (_, index) => `f${String(index + 1).padStart(7, "0")}-0000-4000-8000-000000000001`,
);
const NOW = "2026-09-02T10:00:00.000Z";
const TODAY = "2026-09-02";

function memoryStore(): AsyncKeyValueStore & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
  };
}

function emptyCanonical(overrides: Record<string, unknown> = {}) {
  return canonicalPayload({
    profile: { timezone: "Europe/Zurich", first_use_local_date: null },
    tasks: [],
    task_completions: [],
    habits: [],
    habit_schedule_weekdays: [],
    habit_completions: [],
    activity_intents: [],
    activity_sessions: [],
    daily_plans: [],
    daily_plan_items: [],
    morning_checks: [],
    morning_attempts: [],
    journal_entries: [],
    reward_ledger: [],
    inventory_events: [],
    inventory_balances: [],
    milestone_grants: [],
    active_days: [],
    points_tenths: 0,
    ...overrides,
  });
}

class FakeCloud {
  initialized = true;
  raw: Record<string, unknown> = emptyCanonical();
  calls: { name: string; parameters?: Record<string, unknown> }[] = [];
  receipts = new Set<string>();
  failWrites = false;
  invalidWriteResponseOnce = false;
  invalidReads = false;
  private taskParents = new Map<string, Record<string, unknown>>();
  private habitParents = new Map<string, Record<string, unknown>>();
  private intentParents = new Map<string, Record<string, unknown>>();
  private journalRows = new Map<string, Record<string, unknown>>();
  private rewards = new Map<string, Record<string, unknown>>();

  async rpc(name: string, parameters?: Record<string, unknown>) {
    this.calls.push({ name, parameters });
    if (name === "cloud_workspace_status") {
      return { data: { initialized: this.initialized }, error: null };
    }
    if (name === "get_cloud_workspace_v2") {
      return {
        data: this.invalidReads ? { private_payload: "never-apply-this" } : this.raw,
        error: null,
      };
    }
    assert.equal(name, SYNC_CLOUD_WORKSPACE_RPC);
    if (this.failWrites) {
      return { data: null, error: { message: "Failed to fetch" } };
    }
    const mutationId = String(parameters?.p_mutation_id);
    if (!this.receipts.has(mutationId)) {
      this.receipts.add(mutationId);
      this.raw = this.applyState(parameters?.p_state as AppState, parameters?.p_daily_plans as DailyPlanRecord[]);
    }
    if (this.invalidWriteResponseOnce) {
      this.invalidWriteResponseOnce = false;
      return { data: { invalid: true }, error: null };
    }
    return { data: this.raw, error: null };
  }

  private applyState(state: AppState, plans: DailyPlanRecord[]) {
    const activeTaskIds = new Set(state.tasks.map((task) => task.id));
    for (const [id, row] of this.taskParents) {
      if (!activeTaskIds.has(id)) row.deleted_at = NOW;
    }
    for (const task of state.tasks) {
      this.taskParents.set(task.id, {
        id: task.id,
        title: task.title,
        direction: task.direction,
        rank: String(task.order).padStart(12, "0"),
        created_at: task.createdAt,
        updated_at: NOW,
        deleted_at: null,
      });
    }

    const activeHabitIds = new Set(state.habits.map((habit) => habit.id));
    for (const [id, row] of this.habitParents) {
      if (!activeHabitIds.has(id)) row.deleted_at = NOW;
    }
    for (const habit of state.habits) {
      this.habitParents.set(habit.id, {
        id: habit.id,
        title: habit.title,
        direction: habit.direction,
        schedule_kind: habit.schedule.kind,
        created_at: habit.createdAt,
        updated_at: NOW,
        deleted_at: null,
      });
    }

    const activeIntentIds = new Set(state.activityIntents.map((intent) => intent.id));
    for (const [id, row] of this.intentParents) {
      if (!activeIntentIds.has(id)) {
        row.status = "cancelled";
        row.deleted_at = NOW;
      }
    }
    for (const intent of state.activityIntents) {
      this.intentParents.set(intent.id, {
        id: intent.id,
        stuck_state: intent.stuckState,
        direction: intent.direction,
        move_text: intent.moveText,
        intended_duration_minutes: intent.intendedDurationMinutes,
        linked_task_id: intent.linkedTaskId ?? null,
        linked_habit_id: intent.linkedHabitId ?? null,
        status: "pending",
        created_at: intent.createdAt,
        deleted_at: null,
      });
    }

    const taskCompletions = state.tasks.flatMap((task, taskIndex) =>
      task.completedOn.map((date, dateIndex) => {
        const id = stableUuid(0x51, taskIndex * 10 + dateIndex);
        this.rewards.set(`task:${task.id}:${date}`, rewardRow(id, "task", 50, date));
        return completionRow(id, "task_id", task.id, date);
      }),
    );
    const habitCompletions = state.habits.flatMap((habit, habitIndex) =>
      habit.completedOn.map((date, dateIndex) => {
        const id = stableUuid(0x61, habitIndex * 10 + dateIndex);
        this.rewards.set(`habit:${habit.id}:${date}`, rewardRow(id, "habit", 30, date));
        return completionRow(id, "habit_id", habit.id, date);
      }),
    );
    for (const session of state.sessions) {
      if (
        (session.status === "completed" || session.status === "stopped") &&
        (session.actualElapsedMs ?? 0) >= 60_000
      ) {
        const minutes = (session.actualElapsedMs ?? 0) / 60_000;
        const points = Math.round(
          session.status === "completed" ? minutes : minutes * 0.3,
        );
        this.rewards.set(
          `session:${session.id}`,
          rewardRow(session.id, "session", points, (session.endedAt ?? session.startedAt).slice(0, 10)),
        );
      }
    }
    const activeJournalDates = new Set(state.journalEntries.map((entry) => entry.dateKey));
    for (const [dateKey, row] of this.journalRows) {
      if (!activeJournalDates.has(dateKey)) row.deleted_at = NOW;
    }
    for (const entry of state.journalEntries) {
      const existing = this.journalRows.get(entry.dateKey);
      const id = String(existing?.id ?? stableUuid(0xd1, this.journalRows.size));
      this.journalRows.set(entry.dateKey, {
        id,
        local_date: entry.dateKey,
        timezone: "Europe/Zurich",
        mood: entry.mood ?? null,
        energy: entry.energy ?? null,
        what_helped: entry.whatHelped ?? null,
        completed: entry.completed ?? null,
        difficult: entry.difficult ?? null,
        next_step: entry.nextStep ?? null,
        free_text: entry.freeText ?? null,
        updated_at: NOW,
        deleted_at: null,
      });
      if (!this.rewards.has(`reflection:${entry.dateKey}`)) {
        this.rewards.set(
          `reflection:${entry.dateKey}`,
          rewardRow(id, "reflection", 20, entry.dateKey),
        );
      }
    }
    const rewards = [...this.rewards.values()];

    return emptyCanonical({
      tasks: [...this.taskParents.values()],
      task_completions: taskCompletions,
      habits: [...this.habitParents.values()],
      habit_schedule_weekdays: state.habits.flatMap((habit, habitIndex) =>
        habit.schedule.kind === "weekdays"
          ? habit.schedule.weekdays.map((weekday, weekdayIndex) => ({
              id: stableUuid(0x71 + habitIndex, weekdayIndex),
              habit_id: habit.id,
              weekday,
              deleted_at: null,
            }))
          : [],
      ),
      habit_completions: habitCompletions,
      activity_intents: [...this.intentParents.values()],
      activity_sessions: state.sessions.map((session) => ({
        id: session.id,
        mode: session.mode,
        status: session.status,
        direction: session.direction,
        label: session.label,
        target_duration_minutes: session.targetDurationMinutes ?? null,
        linked_task_id: session.linkedTaskId ?? null,
        linked_habit_id: session.linkedHabitId ?? null,
        linked_intent_id: session.linkedIntentId ?? null,
        started_at: session.startedAt,
        last_resumed_at: session.lastResumedAt ?? null,
        accumulated_elapsed_ms: session.accumulatedElapsedMs,
        ended_at: session.endedAt ?? null,
        actual_elapsed_ms: session.actualElapsedMs ?? null,
        reviewed_at: session.reviewedAt ?? null,
        local_date: session.startedAt.slice(0, 10),
        timezone: "Europe/Zurich",
        deleted_at: null,
      })),
      daily_plans: plans.map((plan, index) => ({
        id: stableUuid(0x81, index),
        local_date: plan.dateKey,
        timezone: "Europe/Zurich",
        deleted_at: null,
      })),
      daily_plan_items: plans.flatMap((plan, planIndex) =>
        plan.items.map((item, itemIndex) => ({
          id: stableUuid(0x91 + planIndex, itemIndex),
          daily_plan_id: stableUuid(0x81, planIndex),
          item_group: item.group,
          title: item.title,
          first_step: item.firstStep,
          direction: item.category,
          duration_minutes: item.durationMinutes,
          position: itemIndex,
          deleted_at: null,
        })),
      ),
      journal_entries: [...this.journalRows.values()],
      reward_ledger: rewards,
      points_tenths: rewards.reduce(
        (total, reward) => total + Number(reward.points_tenths),
        0,
      ),
      active_days: [
        ...new Set(rewards.map((reward) => String(reward.local_date))),
      ],
    });
  }
}

function stableUuid(prefix: number, index: number): string {
  return `${prefix.toString(16).padStart(2, "0")}000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
}

function completionRow(
  id: string,
  parentKey: "task_id" | "habit_id",
  parentId: string,
  date: string,
) {
  return {
    id,
    [parentKey]: parentId,
    local_date: date,
    timezone: "Europe/Zurich",
    occurred_at: `${date}T11:00:00.000Z`,
    deleted_at: null,
  };
}

function rewardRow(
  sourceId: string,
  sourceType: "task" | "habit" | "session" | "reflection",
  pointsTenths: number,
  date: string,
) {
  return {
    id: stableUuid(
      sourceType === "task"
        ? 0xa1
        : sourceType === "habit"
          ? 0xb1
          : sourceType === "session"
            ? 0xc1
            : 0xe1,
      sourceId.charCodeAt(0),
    ),
    source_type: sourceType,
    source_id: sourceId,
    local_date: date,
    timezone: "Europe/Zurich",
    points_tenths: pointsTenths,
    created_at: `${date}T11:00:00.000Z`,
  };
}

function harness(options: {
  store?: ReturnType<typeof memoryStore>;
  cloud?: FakeCloud;
  userId?: string;
  online?: boolean;
} = {}) {
  const store = options.store ?? memoryStore();
  const cloud = options.cloud ?? new FakeCloud();
  const repository = createMobileRepositoryWithStore(store);
  const queue = createMobileSyncQueue(store, () => DEVICE_ID);
  let online = options.online ?? true;
  let current = true;
  let authUser: string | undefined = options.userId ?? USER_A;
  let mutationIndex = 0;
  const workingStates: AppState[] = [];
  const canonicalStates: AppState[] = [];
  const cloudStates: unknown[] = [];
  const client: MobileSyncClient = {
    auth: {
      async getSession() {
        return {
          data: { session: authUser ? { user: { id: authUser } } : null },
          error: null,
        };
      },
    },
    rpc: (name, parameters) => cloud.rpc(name, parameters),
  };
  const userId = options.userId ?? USER_A;
  const runtime = new MobileSyncRuntime({
    userId,
    client,
    repository,
    queue,
    isCurrent: () => current,
    online: () => online,
    timezone: () => "Europe/Zurich",
    now: () => NOW,
    uuid: () => MUTATION_IDS[mutationIndex++]!,
    async applyCanonical(workspace, hydratedAt) {
      await repository.saveCloudWorkspace(userId, workspace, hydratedAt);
      await repository.saveLocalWorkspace({ kind: "account", userId }, workspace.state);
      canonicalStates.push(structuredClone(workspace.state));
      workingStates.push(structuredClone(workspace.state));
    },
    applyWorkingState(state) {
      workingStates.push(structuredClone(state));
    },
    setCloudState(state) {
      cloudStates.push(state);
    },
  });
  return {
    authUser: (value?: string) => {
      authUser = value;
    },
    canonicalStates,
    client,
    cloud,
    cloudStates,
    current: (value: boolean) => {
      current = value;
    },
    online: (value: boolean) => {
      online = value;
    },
    queue,
    repository,
    runtime,
    store,
    userId,
    workingStates,
  };
}

function syncCalls(cloud: FakeCloud) {
  return cloud.calls.filter((call) => call.name === SYNC_CLOUD_WORKSPACE_RPC);
}

test("initialized hydration replaces an unreconciled account-local array with an editable canonical working copy", async () => {
  const fixture = harness();
  const local = createEmptyState();
  local.tasks = [
    {
      id: TASK_ID,
      title: "Never upload this unreconciled row",
      direction: "Rest",
      order: 0,
      createdAt: NOW,
      updatedAt: NOW,
      completedOn: [],
    },
  ];
  await fixture.repository.saveLocalWorkspace(
    { kind: "account", userId: USER_A },
    local,
  );
  fixture.cloud.raw = emptyCanonical({
    tasks: [
      {
        id: TASK_ID,
        title: "Canonical Task",
        direction: "Daily Life",
        rank: "000000000000",
        created_at: NOW,
        updated_at: NOW,
      },
    ],
  });

  await fixture.runtime.start();

  assert.equal(fixture.runtime.getSnapshot().status, "synced");
  assert.equal(fixture.runtime.canWrite(), true);
  assert.equal(
    (await fixture.repository.loadLocalWorkspace({ kind: "account", userId: USER_A }))
      .tasks[0]?.title,
    "Canonical Task",
  );
  assert.equal(syncCalls(fixture.cloud).length, 0);
});

test("Task create, edit, completion, and deletion stay ordered through queue and canonical response", async () => {
  const fixture = harness();
  await fixture.runtime.start();
  fixture.online(false);
  await fixture.runtime.mutate((state) =>
    addTask(state, { title: "Apply", direction: "Work & Study" }, () => NOW, () => TASK_ID),
  );
  await fixture.runtime.mutate((state) =>
    editTask(state, TASK_ID, { title: "Apply to jobs", direction: "Daily Life" }, () => NOW),
  );
  await fixture.runtime.mutate((state) =>
    toggleTaskCompletion(state, TASK_ID, TODAY, () => NOW),
  );
  await fixture.runtime.mutate((state) => softDeleteTask(state, TASK_ID));

  const queued = await fixture.queue.load(USER_A);
  assert.equal(queued.pending.length, 4);
  assert.equal(queued.pending[0]?.state.tasks[0]?.title, "Apply");
  assert.equal(queued.pending[1]?.state.tasks[0]?.title, "Apply to jobs");
  assert.deepEqual(queued.pending[2]?.state.tasks[0]?.completedOn, [TODAY]);
  assert.equal(queued.pending[3]?.state.tasks.length, 0);

  fixture.online(true);
  await fixture.runtime.retry();
  assert.equal((await fixture.queue.load(USER_A)).pending.length, 0);
  assert.equal(syncCalls(fixture.cloud).length, 4);
  assert.deepEqual(syncCalls(fixture.cloud)[0]?.parameters?.p_commands, {
    purchases: [],
    consumptions: [],
  });
  assert.equal(
    (await fixture.repository.loadLocalWorkspace({ kind: "account", userId: USER_A }))
      .tasks.length,
    0,
  );
  assert.equal(fixture.runtime.getSnapshot().status, "synced");
});

test("Habit create, schedule edit, check-in, and deletion sync through canonical responses", async () => {
  const fixture = harness();
  await fixture.runtime.start();
  fixture.online(false);
  await fixture.runtime.mutate((state) =>
    addHabit(
      state,
      { title: "Walk", direction: "Exercise & Movement", schedule: { kind: "daily" } },
      () => NOW,
      () => HABIT_ID,
    ),
  );
  await fixture.runtime.mutate((state) =>
    editHabit(
      state,
      HABIT_ID,
      {
        title: "Short walk",
        direction: "Rest",
        schedule: { kind: "weekdays", weekdays: ["mon", "wed"] },
      },
      () => NOW,
    ),
  );
  await fixture.runtime.mutate((state) =>
    toggleHabitCompletion(state, HABIT_ID, TODAY, () => NOW),
  );
  await fixture.runtime.mutate((state) => softDeleteHabit(state, HABIT_ID));

  fixture.online(true);
  await fixture.runtime.retry();
  const calls = syncCalls(fixture.cloud);
  assert.equal(calls.length, 4);
  assert.deepEqual(
    (calls[1]?.parameters?.p_state as AppState).habits[0]?.schedule,
    { kind: "weekdays", weekdays: ["mon", "wed"] },
  );
  assert.deepEqual(
    (calls[2]?.parameters?.p_state as AppState).habits[0]?.completedOn,
    [TODAY],
  );
  assert.equal((await fixture.queue.load(USER_A)).pending.length, 0);
});

test("authenticated Journal create, edit, delete, and recreate keep reward authority on the server", async () => {
  const fixture = harness();
  await fixture.runtime.start();
  fixture.online(false);

  await fixture.runtime.mutate((state) =>
    saveReflection(
      state,
      TODAY,
      { mood: 4, whatHelped: "A quiet start" },
      { rewardAuthority: "server-authoritative", clock: () => NOW },
    ),
  );
  const queuedCreate = (await fixture.queue.load(USER_A)).pending[0]?.state;
  assert.equal(queuedCreate?.journalEntries[0]?.whatHelped, "A quiet start");
  assert.equal(queuedCreate?.rewardEvents.length, 0);
  assert.equal(queuedCreate?.progress.points, 0);

  fixture.online(true);
  await fixture.runtime.retry();
  let canonical = await fixture.repository.loadLocalWorkspace({
    kind: "account",
    userId: USER_A,
  });
  assert.equal(canonical.journalEntries[0]?.mood, 4);
  assert.equal(canonical.progress.points, 2);
  assert.equal(canonical.rewardEvents[0]?.sourceId, TODAY);
  const journalId = String((fixture.cloud.raw.journal_entries as { id: string }[])[0]?.id);

  fixture.online(false);
  await fixture.runtime.mutate((state) =>
    saveReflection(
      state,
      TODAY,
      { energy: 3, completed: "Edited once" },
      { rewardAuthority: "server-authoritative", clock: () => NOW },
    ),
  );
  fixture.online(true);
  await fixture.runtime.retry();
  canonical = await fixture.repository.loadLocalWorkspace({ kind: "account", userId: USER_A });
  assert.equal(canonical.journalEntries[0]?.completed, "Edited once");
  assert.equal(canonical.progress.points, 2);
  assert.equal(canonical.rewardEvents.filter((event) => event.source === "reflection").length, 1);

  fixture.online(false);
  await fixture.runtime.mutate((state) => deleteReflection(state, TODAY));
  fixture.online(true);
  await fixture.runtime.retry();
  canonical = await fixture.repository.loadLocalWorkspace({ kind: "account", userId: USER_A });
  assert.equal(canonical.journalEntries.length, 0);
  assert.equal(canonical.progress.points, 2);

  fixture.online(false);
  await fixture.runtime.mutate((state) =>
    saveReflection(
      state,
      TODAY,
      { nextStep: "Return tomorrow" },
      { rewardAuthority: "server-authoritative", clock: () => NOW },
    ),
  );
  fixture.online(true);
  await fixture.runtime.retry();
  canonical = await fixture.repository.loadLocalWorkspace({ kind: "account", userId: USER_A });
  assert.equal(canonical.progress.points, 2);
  assert.equal(canonical.rewardEvents.filter((event) => event.source === "reflection").length, 1);
  assert.equal(
    (fixture.cloud.raw.journal_entries as { id: string }[])[0]?.id,
    journalId,
  );
});

test("scoped Mobile writes pass canonical daily plans through unchanged", async () => {
  const fixture = harness();
  fixture.cloud.raw = emptyCanonical({
    daily_plans: [
      {
        id: stableUuid(0x81, 0),
        local_date: TODAY,
        timezone: "Europe/Zurich",
        deleted_at: null,
      },
    ],
    daily_plan_items: [
      {
        id: stableUuid(0x91, 0),
        daily_plan_id: stableUuid(0x81, 0),
        item_group: "first-move",
        title: "Existing plan",
        first_step: "Open it",
        direction: "Daily Life",
        duration_minutes: 2,
        position: 0,
        deleted_at: null,
      },
    ],
  });
  await fixture.runtime.start();
  fixture.online(false);
  await fixture.runtime.mutate((state) =>
    addTask(state, { title: "Scoped change", direction: "Rest" }, () => NOW, () => TASK_ID),
  );
  fixture.online(true);
  await fixture.runtime.retry();
  assert.deepEqual(syncCalls(fixture.cloud)[0]?.parameters?.p_daily_plans, [
    {
      dateKey: TODAY,
      items: [
        {
          id: stableUuid(0x91, 0),
          group: "first-move",
          title: "Existing plan",
          firstStep: "Open it",
          category: "Daily Life",
          durationMinutes: 2,
        },
      ],
    },
  ]);
});

test("pending Intent and complete Session lifecycle/review changes are queued parent-first", async () => {
  const fixture = harness();
  await fixture.runtime.start();
  fixture.online(false);
  const startMs = Date.parse(NOW);
  await fixture.runtime.mutate((state) =>
    createPendingIntent(
      state,
      {
        stuckState: "knows what to do but cannot start",
        direction: "Work & Study",
        moveText: "Open the draft",
        intendedDurationMinutes: 2,
      },
      () => NOW,
      () => INTENT_ID,
    ),
  );
  await fixture.runtime.mutate((state) =>
    startCountdownFromIntent(state, INTENT_ID, startMs, () => SESSION_ID),
  );
  await fixture.runtime.mutate((state) => pauseSession(state, SESSION_ID, startMs + 20_000));
  await fixture.runtime.mutate((state) => resumeSession(state, SESSION_ID, startMs + 30_000));
  await fixture.runtime.mutate((state) =>
    completeSessionIfElapsed(state, SESSION_ID, startMs + 150_000),
  );
  await fixture.runtime.mutate((state) =>
    reviewSession(
      state,
      SESSION_ID,
      { label: "Opened the draft", direction: "Work & Study" },
      startMs + 160_000,
    ),
  );
  await fixture.runtime.mutate((state) =>
    stopSession(
      startStopwatch(
        state,
        { direction: "Rest", label: "Pause" },
        startMs + 170_000,
        () => SESSION_2_ID,
      ),
      SESSION_2_ID,
      startMs + 240_000,
    ),
  );
  await fixture.runtime.mutate((state) =>
    cancelSession(
      startCountdown(
        state,
        { direction: "Daily Life", durationMinutes: 2 },
        startMs + 250_000,
        () => SESSION_3_ID,
      ),
      SESSION_3_ID,
    ),
  );

  const queued = (await fixture.queue.load(USER_A)).pending;
  assert.equal(queued.length, 8);
  assert.equal(queued[0]?.state.activityIntents[0]?.id, INTENT_ID);
  assert.equal(queued[1]?.state.sessions[0]?.linkedIntentId, INTENT_ID);
  assert.equal(queued[4]?.state.activityIntents.length, 0);
  assert.equal(queued[4]?.state.sessions[0]?.status, "completed");
  assert.equal(queued[5]?.state.sessions[0]?.reviewedAt, new Date(startMs + 160_000).toISOString());
  assert.equal(queued[6]?.state.sessions[1]?.status, "stopped");
  assert.equal(queued[7]?.state.sessions.some((session) => session.id === SESSION_3_ID), false);
});

test("app restart restores a pending owner queue and later retries the same mutation ID", async () => {
  const store = memoryStore();
  const cloud = new FakeCloud();
  const first = harness({ store, cloud });
  await first.runtime.start();
  first.online(false);
  await first.runtime.mutate((state) =>
    addTask(state, { title: "Offline Task", direction: "Rest" }, () => NOW, () => TASK_ID),
  );
  const originalMutationId = (await first.queue.load(USER_A)).pending[0]?.mutationId;
  first.runtime.dispose();

  const restarted = harness({ store, cloud, online: false });
  await restarted.runtime.start();
  assert.equal(restarted.runtime.getSnapshot().status, "offline");
  assert.equal(restarted.runtime.canWrite(), true);
  assert.equal(
    (await restarted.repository.loadLocalWorkspace({ kind: "account", userId: USER_A }))
      .tasks[0]?.title,
    "Offline Task",
  );
  restarted.online(true);
  await restarted.runtime.retry();
  assert.equal(syncCalls(cloud).at(-1)?.parameters?.p_mutation_id, originalMutationId);
  assert.equal((await restarted.queue.load(USER_A)).pending.length, 0);
});

test("a server-applied mutation retries idempotently when its first response is invalid", async () => {
  const fixture = harness();
  await fixture.runtime.start();
  fixture.online(false);
  await fixture.runtime.mutate((state) =>
    toggleTaskCompletion(
      addTask(state, { title: "Reward once", direction: "Rest" }, () => NOW, () => TASK_ID),
      TASK_ID,
      TODAY,
      () => NOW,
    ),
  );
  fixture.cloud.invalidWriteResponseOnce = true;
  fixture.online(true);
  await fixture.runtime.retry();
  assert.equal(fixture.runtime.getSnapshot().status, "error");
  assert.equal((await fixture.queue.load(USER_A)).pending.length, 1);
  const firstMutationId = syncCalls(fixture.cloud).at(-1)?.parameters?.p_mutation_id;

  await fixture.runtime.retry();
  const writes = syncCalls(fixture.cloud);
  assert.equal(writes.at(-1)?.parameters?.p_mutation_id, firstMutationId);
  assert.equal(fixture.cloud.receipts.size, 1);
  assert.equal(
    (fixture.cloud.raw.reward_ledger as unknown[]).length,
    1,
  );
});

test("refresh never reads over a failed pending mutation", async () => {
  const fixture = harness();
  await fixture.runtime.start();
  fixture.online(false);
  await fixture.runtime.mutate((state) =>
    addTask(state, { title: "Keep pending", direction: "Rest" }, () => NOW, () => TASK_ID),
  );
  const readsBefore = fixture.cloud.calls.filter((call) => call.name === "get_cloud_workspace_v2").length;
  fixture.cloud.failWrites = true;
  fixture.online(true);
  await fixture.runtime.refresh();
  const readsAfter = fixture.cloud.calls.filter((call) => call.name === "get_cloud_workspace_v2").length;
  assert.equal(readsAfter, readsBefore);
  assert.equal((await fixture.queue.load(USER_A)).pending.length, 1);
  assert.equal(
    (await fixture.repository.loadLocalWorkspace({ kind: "account", userId: USER_A }))
      .tasks[0]?.title,
    "Keep pending",
  );
});

test("sign-out leaves the account queue durable and prevents dispatch", async () => {
  const fixture = harness();
  await fixture.runtime.start();
  fixture.online(false);
  await fixture.runtime.mutate((state) =>
    addTask(state, { title: "Account A pending", direction: "Rest" }, () => NOW, () => TASK_ID),
  );
  fixture.authUser(undefined);
  fixture.current(false);
  fixture.runtime.dispose();
  fixture.online(true);
  await fixture.runtime.retry();
  assert.equal(syncCalls(fixture.cloud).length, 0);
  assert.equal((await fixture.queue.load(USER_A)).pending.length, 1);
});

test("the current Supabase UUID is revalidated before every queued dispatch", async () => {
  const fixture = harness();
  await fixture.runtime.start();
  fixture.online(false);
  await fixture.runtime.mutate((state) =>
    addTask(state, { title: "First", direction: "Rest" }, () => NOW, () => TASK_ID),
  );
  await fixture.runtime.mutate((state) =>
    editTask(state, TASK_ID, { title: "Second", direction: "Rest" }, () => NOW),
  );
  let sessionChecks = 0;
  fixture.client.auth.getSession = async () => {
    sessionChecks += 1;
    return {
      data: {
        session:
          sessionChecks <= 2
            ? { user: { id: USER_A } }
            : { user: { id: USER_B } },
      },
      error: null,
    };
  };
  fixture.online(true);
  await fixture.runtime.retry();
  assert.equal(syncCalls(fixture.cloud).length, 1);
  assert.equal((await fixture.queue.load(USER_A)).pending.length, 1);
});

test("account A and account B queues and working copies never cross", async () => {
  const store = memoryStore();
  const cloud = new FakeCloud();
  const accountA = harness({ store, cloud, userId: USER_A });
  await accountA.runtime.start();
  accountA.online(false);
  await accountA.runtime.mutate((state) =>
    addTask(state, { title: "Only A", direction: "Rest" }, () => NOW, () => TASK_ID),
  );
  accountA.current(false);
  accountA.runtime.dispose();

  const accountB = harness({ store, cloud, userId: USER_B });
  await accountB.runtime.start();
  assert.equal(syncCalls(cloud).length, 0);
  assert.equal((await accountB.queue.load(USER_A)).pending.length, 1);
  assert.equal((await accountB.queue.load(USER_B)).pending.length, 0);
  assert.equal(
    (await accountB.repository.loadLocalWorkspace({ kind: "account", userId: USER_B }))
      .tasks.some((task) => task.title === "Only A"),
    false,
  );
});

test("Guest updates never call a cloud RPC", async () => {
  const fixture = harness();
  await fixture.repository.updateGuestWorkspace((state) =>
    addTask(state, { title: "Guest only", direction: "Rest" }, () => NOW, () => TASK_ID),
  );
  assert.equal(fixture.cloud.calls.length, 0);
  assert.equal((await fixture.repository.loadGuestWorkspace()).tasks[0]?.title, "Guest only");
});

test("uninitialized account remains write-disabled and never dispatches a mutation", async () => {
  const fixture = harness();
  fixture.cloud.initialized = false;
  await fixture.runtime.start();
  const result = await fixture.runtime.mutate((state) =>
    addTask(state, { title: "Blocked", direction: "Rest" }, () => NOW, () => TASK_ID),
  );
  assert.equal(fixture.runtime.getSnapshot().status, "write-disabled");
  assert.equal(result, undefined);
  assert.equal(syncCalls(fixture.cloud).length, 0);
});

test("invalid canonical refresh never replaces a valid local working copy", async () => {
  const fixture = harness();
  await fixture.runtime.start();
  const before = await fixture.repository.loadLocalWorkspace({ kind: "account", userId: USER_A });
  fixture.cloud.invalidReads = true;
  await fixture.runtime.refresh();
  const after = await fixture.repository.loadLocalWorkspace({ kind: "account", userId: USER_A });
  assert.deepEqual(after, before);
  assert.equal(fixture.runtime.getSnapshot().status, "error");
});

test("a safe no-pending refresh applies newer validated Web canonical state", async () => {
  const fixture = harness();
  await fixture.runtime.start();
  fixture.cloud.raw = emptyCanonical({
    tasks: [
      {
        id: TASK_ID,
        title: "Created on Web",
        direction: "Work & Study",
        rank: "000000000000",
        created_at: NOW,
        updated_at: NOW,
        deleted_at: null,
      },
    ],
  });
  await fixture.runtime.refresh();
  assert.equal(
    (await fixture.repository.loadLocalWorkspace({ kind: "account", userId: USER_A }))
      .tasks[0]?.title,
    "Created on Web",
  );
  assert.equal(fixture.runtime.getSnapshot().status, "synced");
});

test("a stale owner response cannot update the visible owner", async () => {
  const fixture = harness();
  await fixture.runtime.start();
  const appliedBefore = fixture.canonicalStates.length;
  let resolveRead: ((value: { data: unknown; error: null }) => void) | undefined;
  const originalRpc = fixture.client.rpc;
  fixture.client.rpc = async (name, parameters) => {
    if (name === "get_cloud_workspace_v2") {
      return new Promise((resolve) => {
        resolveRead = resolve;
      });
    }
    return originalRpc(name, parameters);
  };
  const refresh = fixture.runtime.refresh();
  await Promise.resolve();
  await Promise.resolve();
  fixture.current(false);
  resolveRead?.({ data: emptyCanonical(), error: null });
  await refresh;
  assert.equal(fixture.canonicalStates.length, appliedBefore);
});

test("sync failures never log private payloads, tokens, or backend details", async () => {
  const fixture = harness();
  const logs: unknown[][] = [];
  const original = {
    error: console.error,
    log: console.log,
    warn: console.warn,
  };
  console.error = (...values) => logs.push(values);
  console.log = (...values) => logs.push(values);
  console.warn = (...values) => logs.push(values);
  try {
    await fixture.runtime.start();
    fixture.online(false);
    await fixture.runtime.mutate((state) =>
      addTask(
        state,
        { title: "private journal-like payload", direction: "Rest" },
        () => NOW,
        () => TASK_ID,
      ),
    );
    fixture.cloud.failWrites = true;
    fixture.online(true);
    await fixture.runtime.retry();
  } finally {
    console.error = original.error;
    console.log = original.log;
    console.warn = original.warn;
  }
  assert.deepEqual(logs, []);
});
