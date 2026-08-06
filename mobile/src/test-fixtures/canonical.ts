export const USER_ID = "90000000-0000-4000-8000-000000000001";
export const TASK_ID = "10000000-0000-4000-8000-000000000001";
export const COMPLETION_ID = "11000000-0000-4000-8000-000000000001";

export function canonicalPayload(overrides: Record<string, unknown> = {}) {
  return {
    profile: { timezone: "Europe/Berlin", first_use_local_date: "2026-07-29" },
    settings: {},
    tasks: [
      {
        id: TASK_ID,
        title: "Cloud task",
        direction: "Daily Life",
        rank: "000000000000",
        created_at: "2026-07-29T08:00:00Z",
        updated_at: "2026-07-29T08:00:00Z",
      },
    ],
    task_completions: [
      {
        id: COMPLETION_ID,
        task_id: TASK_ID,
        local_date: "2026-07-29",
        timezone: "Europe/Berlin",
        occurred_at: "2026-07-29T08:00:00Z",
      },
    ],
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
    reward_ledger: [
      {
        id: "13000000-0000-4000-8000-000000000001",
        source_type: "task",
        source_id: COMPLETION_ID,
        local_date: "2026-07-29",
        timezone: "Europe/Berlin",
        points_tenths: 50,
        created_at: "2026-07-29T08:00:00Z",
      },
    ],
    inventory_events: [
      {
        id: "14000000-0000-4000-8000-000000000001",
        item_id: "kitten-milk",
        quantity_delta: 2,
        local_date: "2026-07-29",
        timezone: "Europe/Berlin",
        created_at: "2026-07-29T08:00:00Z",
      },
    ],
    inventory_balances: [{ item_id: "kitten-milk", quantity: 2 }],
    milestone_grants: [],
    active_days: ["2026-07-29"],
    points_tenths: 50,
    ...overrides,
  };
}
