import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFocusLinkOptions,
  filterFocusLinkOptions,
  focusLinkFields,
  focusLinkKey,
  parseFocusDurationInput,
  sessionReferenceCatalog,
} from "./focus.ts";
import { createEmptyState } from "./models.ts";

const timestamp = "2026-08-09T09:00:00.000Z";

test("Focus link choices preserve stable IDs without copying canonical parents", () => {
  const local = createEmptyState();
  local.tasks = [
    {
      id: "local:task:with:colons",
      title: "Local task",
      direction: "Work & Study",
      order: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      completedOn: [],
    },
  ];
  const canonical = createEmptyState();
  canonical.tasks = [
    {
      id: "10000000-0000-4000-8000-000000000001",
      title: "Cloud task",
      direction: "Daily Life",
      order: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      completedOn: [],
    },
  ];
  canonical.habits = [
    {
      id: "20000000-0000-4000-8000-000000000001",
      title: "Cloud habit",
      direction: "Exercise & Movement",
      schedule: { kind: "daily" },
      createdAt: timestamp,
      updatedAt: timestamp,
      completedOn: [],
    },
  ];

  const options = buildFocusLinkOptions(local, canonical);
  assert.deepEqual(
    options.map(({ key, source }) => ({ key, source })),
    [
      { key: "task:local:task:with:colons", source: "local" },
      {
        key: "task:10000000-0000-4000-8000-000000000001",
        source: "canonical",
      },
      {
        key: "habit:20000000-0000-4000-8000-000000000001",
        source: "canonical",
      },
    ],
  );
  assert.deepEqual(focusLinkFields("task:local:task:with:colons"), {
    linkedTaskId: "local:task:with:colons",
  });
  assert.deepEqual(
    focusLinkFields("habit:20000000-0000-4000-8000-000000000001"),
    { linkedHabitId: "20000000-0000-4000-8000-000000000001" },
  );
  assert.equal(local.tasks.length, 1);
  assert.equal(local.habits.length, 0);
});

test("local Focus parents win duplicate IDs and form a domain reference catalog", () => {
  const local = createEmptyState();
  local.tasks = [
    {
      id: "same-id",
      title: "Local working copy",
      direction: "Rest",
      order: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      completedOn: [],
    },
  ];
  const canonical = createEmptyState();
  canonical.tasks = [
    {
      ...local.tasks[0]!,
      title: "Canonical duplicate",
      direction: "Daily Life",
    },
  ];

  const options = buildFocusLinkOptions(local, canonical);
  assert.equal(options.length, 1);
  assert.equal(options[0]?.title, "Local working copy");
  assert.equal(options[0]?.source, "local");
  assert.deepEqual(sessionReferenceCatalog(options), {
    tasks: [
      { id: "same-id", title: "Local working copy", direction: "Rest" },
    ],
    habits: [],
  });
});

test("custom countdown validation accepts only whole minutes from 1 through 720", () => {
  assert.equal(parseFocusDurationInput("1"), 1);
  assert.equal(parseFocusDurationInput(" 50 "), 50);
  assert.equal(parseFocusDurationInput("720"), 720);
  for (const value of ["", "0", "721", "2.5", "1e2", "minutes"]) {
    assert.equal(parseFocusDurationInput(value), undefined);
  }
  assert.equal(focusLinkKey("habit", "habit:legacy"), "habit:habit:legacy");
});

test("Focus link search matches titles, kinds, and directions without changing identity", () => {
  const state = createEmptyState();
  state.tasks = [
    {
      id: "10000000-0000-4000-8000-000000000001",
      title: "Apply to a few jobs",
      direction: "Work & Study",
      order: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      completedOn: [],
    },
  ];
  state.habits = [
    {
      id: "20000000-0000-4000-8000-000000000001",
      title: "Evening stretch",
      direction: "Exercise & Movement",
      schedule: { kind: "daily" },
      createdAt: timestamp,
      updatedAt: timestamp,
      completedOn: [],
    },
  ];
  const options = buildFocusLinkOptions(state);

  assert.deepEqual(
    filterFocusLinkOptions(options, " jobs ").map((option) => option.key),
    ["task:10000000-0000-4000-8000-000000000001"],
  );
  assert.deepEqual(
    filterFocusLinkOptions(options, "habit").map((option) => option.key),
    ["habit:20000000-0000-4000-8000-000000000001"],
  );
  assert.deepEqual(
    filterFocusLinkOptions(options, "movement").map((option) => option.key),
    ["habit:20000000-0000-4000-8000-000000000001"],
  );
});
