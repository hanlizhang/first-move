import assert from "node:assert/strict";
import test from "node:test";

import { selectFirstMoveTemplate } from "../domain/templates.ts";
import {
  RECENT_FIRST_MOVE_TEMPLATE_LIMIT,
  createRecentFirstMoveRepository,
  recentFirstMoveTemplateKey,
  rememberRecentTemplate,
} from "./recent-first-moves-core.ts";

const USER_A = "10000000-0000-4000-8000-000000000001";
const USER_B = "20000000-0000-4000-8000-000000000002";

test("recent template IDs are deduplicated and capped", () => {
  let recent: string[] = [];
  for (let index = 0; index < 12; index += 1) {
    recent = rememberRecentTemplate(recent, `template-${index}`);
  }
  assert.equal(recent.length, RECENT_FIRST_MOVE_TEMPLATE_LIMIT);
  assert.equal(recent[0], "template-11");
  assert.equal(recent.at(-1), "template-4");
  assert.deepEqual(
    rememberRecentTemplate(recent, "template-8").filter(
      (id) => id === "template-8",
    ),
    ["template-8"],
  );
});

test("guest and account presentation histories use separate local keys", () => {
  assert.notEqual(
    recentFirstMoveTemplateKey({ kind: "guest" }),
    recentFirstMoveTemplateKey({ kind: "account", userId: USER_A }),
  );
  assert.notEqual(
    recentFirstMoveTemplateKey({ kind: "account", userId: USER_A }),
    recentFirstMoveTemplateKey({ kind: "account", userId: USER_B }),
  );
});

test("serialized local selection avoids a recent template", async () => {
  const values = new Map<string, string>();
  const repository = createRecentFirstMoveRepository({
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
  });
  const owner = { kind: "guest" } as const;
  const choose = (recentTemplateIds: readonly string[]) =>
    selectFirstMoveTemplate({
      stuckState: "knows what to do but cannot start",
      direction: "Work & Study",
      durationMinutes: 2,
      recentTemplateIds,
    });
  const first = await repository.chooseAndRemember(owner, choose);
  const second = await repository.chooseAndRemember(owner, choose);

  assert.notEqual(second.id, first.id);
  assert.deepEqual(await repository.load(owner), [second.id, first.id]);
});

test("malformed or unavailable cosmetic history never blocks selection", async () => {
  const repository = createRecentFirstMoveRepository({
    async getItem() {
      return "not-json";
    },
    async setItem() {
      throw new Error("storage unavailable");
    },
  });
  const selected = await repository.chooseAndRemember(
    { kind: "guest" },
    (recentTemplateIds) =>
      selectFirstMoveTemplate({
        stuckState: "unsure what is needed",
        direction: "Rest",
        recentTemplateIds,
      }),
  );
  assert.ok(selected.text.trim());
});
