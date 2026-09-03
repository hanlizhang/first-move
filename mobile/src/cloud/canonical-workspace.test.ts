import assert from "node:assert/strict";
import test from "node:test";

import { validateCanonicalWorkspace } from "./canonical-workspace.ts";
import { canonicalPayload, TASK_ID } from "../test-fixtures/canonical.ts";

test("canonical v2 payload preserves UUID mapping, date, timezone source, and balances", () => {
  const workspace = validateCanonicalWorkspace(canonicalPayload());
  assert.equal(workspace.state.tasks[0]?.id, TASK_ID);
  assert.deepEqual(workspace.state.tasks[0]?.completedOn, ["2026-07-29"]);
  assert.equal(workspace.state.progress.points, 5);
  assert.deepEqual(workspace.state.inventory.items, [{ itemId: "kitten-milk", quantity: 2 }]);
  assert.equal(
    (workspace.canonicalPayload.task_completions as Record<string, unknown>[])[0]?.timezone,
    "Europe/Berlin",
  );
});

test("hydration retains a historical Session link to a completed Web Task UUID", () => {
  const sessionId = "19000000-0000-4000-8000-000000000001";
  const payload = canonicalPayload({
    activity_sessions: [
      {
        id: sessionId,
        mode: "stopwatch",
        status: "stopped",
        direction: "Daily Life",
        label: "Historical cloud task session",
        linked_task_id: TASK_ID,
        started_at: "2026-07-29T09:00:00Z",
        accumulated_elapsed_ms: 60_000,
        ended_at: "2026-07-29T09:01:00Z",
        actual_elapsed_ms: 60_000,
        local_date: "2026-07-29",
        timezone: "Europe/Berlin",
      },
    ],
  });

  const workspace = validateCanonicalWorkspace(payload);

  assert.equal(workspace.state.tasks[0]?.id, TASK_ID);
  assert.deepEqual(workspace.state.tasks[0]?.completedOn, ["2026-07-29"]);
  assert.equal(workspace.state.sessions[0]?.id, sessionId);
  assert.equal(workspace.state.sessions[0]?.linkedTaskId, TASK_ID);
  assert.equal(
    (workspace.canonicalPayload.tasks as Record<string, unknown>[])[0]?.id,
    TASK_ID,
  );
});

test("canonical validation rejects point, inventory, UUID, and timezone corruption", () => {
  assert.throws(
    () => validateCanonicalWorkspace(canonicalPayload({ points_tenths: 40 })),
    /point balance/,
  );
  assert.throws(
    () =>
      validateCanonicalWorkspace(
        canonicalPayload({ inventory_balances: [{ item_id: "kitten-milk", quantity: 3 }] }),
      ),
    /inventory/,
  );
  assert.throws(
    () =>
      validateCanonicalWorkspace(
        canonicalPayload({
          tasks: [
            {
              id: "not-a-uuid",
              title: "Bad",
              direction: "Daily Life",
              rank: "0",
              created_at: "2026-07-29T08:00:00Z",
              updated_at: "2026-07-29T08:00:00Z",
            },
          ],
        }),
      ),
    /UUID/,
  );
  const invalidTimezone = canonicalPayload();
  (invalidTimezone.task_completions as Record<string, unknown>[])[0]!.timezone = "Mars/Olympus";
  assert.throws(() => validateCanonicalWorkspace(invalidTimezone), /timezone/);
});

test("tombstoned relationship parents stay available for historical validation but hidden from active UI", () => {
  const deletedTaskId = "17000000-0000-4000-8000-000000000001";
  const session = {
    id: "19000000-0000-4000-8000-000000000001",
    mode: "stopwatch",
    status: "stopped",
    direction: "Daily Life",
    label: "Historical",
    linked_task_id: deletedTaskId,
    started_at: "2026-07-29T09:00:00Z",
    accumulated_elapsed_ms: 0,
    ended_at: "2026-07-29T09:00:00Z",
    actual_elapsed_ms: 0,
    local_date: "2026-07-29",
    timezone: "Europe/Berlin",
  };
  const deletedTask = {
    id: deletedTaskId,
    title: "Deleted task",
    direction: "Daily Life",
    rank: "1",
    created_at: "2026-07-29T08:00:00Z",
    updated_at: "2026-07-29T08:00:00Z",
    deleted_at: "2026-07-29T09:00:00Z",
  };
  const base = canonicalPayload();
  const workspace = validateCanonicalWorkspace({
    ...base,
    tasks: [...(base.tasks as unknown[]), deletedTask],
    activity_sessions: [session],
  });
  assert.equal(workspace.state.tasks.some((task) => task.id === deletedTaskId), false);
  assert.equal(workspace.state.sessions[0]?.linkedTaskId, deletedTaskId);
  assert.throws(
    () => validateCanonicalWorkspace({ ...base, activity_sessions: [session] }),
    /task reference/,
  );
});
