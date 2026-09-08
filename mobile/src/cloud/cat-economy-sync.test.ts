import assert from "node:assert/strict";
import test from "node:test";

import type { AppState } from "../domain/models.ts";
import { selectCatFurniture } from "../domain/cat.ts";
import {
  createMobileRepositoryWithStore,
  type AsyncKeyValueStore,
} from "../local/repository-core.ts";
import { canonicalPayload } from "../test-fixtures/canonical.ts";
import { createMobileSyncQueue, type SyncEconomicCommands } from "./sync-queue.ts";
import {
  formatMobileSyncDiagnostic,
  MobileSyncRuntime,
  SYNC_CLOUD_WORKSPACE_RPC,
  type MobileSyncClient,
} from "./sync-runtime.ts";

const USER_ID = "90000000-0000-4000-8000-000000000001";
const DEVICE_ID = "d0000000-0000-4000-8000-000000000001";
const PURCHASE_ID = "a0000000-0000-4000-8000-000000000001";
const OUTER_ID = "b0000000-0000-4000-8000-000000000001";
const CONSUME_OUTER_ID = "c0000000-0000-4000-8000-000000000001";
const NOW = "2026-09-06T10:00:00.000Z";
const TODAY = "2026-09-06";

function memoryStore(): AsyncKeyValueStore {
  const values = new Map<string, string>();
  return {
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
  };
}

function startingPayload() {
  return canonicalPayload({
    profile: { timezone: "Europe/Zurich", first_use_local_date: "2026-09-01" },
    tasks: [],
    task_completions: [],
    reward_ledger: [
      {
        id: "13000000-0000-4000-8000-000000000011",
        source_type: "task",
        source_id: "11000000-0000-4000-8000-000000000011",
        local_date: "2026-09-01",
        timezone: "Europe/Zurich",
        points_tenths: 1000,
        created_at: "2026-09-01T10:00:00.000Z",
      },
    ],
    inventory_events: [
      {
        id: "14000000-0000-4000-8000-000000000011",
        item_id: "kitten-milk",
        quantity_delta: 2,
        local_date: "2026-09-01",
        timezone: "Europe/Zurich",
        created_at: "2026-09-01T10:00:00.000Z",
      },
    ],
    inventory_balances: [{ item_id: "kitten-milk", quantity: 2 }],
    active_days: ["2026-09-01", "2026-09-02", "2026-09-03"],
    points_tenths: 1000,
  });
}

class EconomicCloud {
  raw = startingPayload();
  calls: { name: string; parameters?: Record<string, unknown> }[] = [];
  loseNextWriteResponse = false;
  rejectNextWrite?: string;
  failNextWrite?: { code?: string; message: string };
  private receipts = new Set<string>();
  private eventIndex = 20;

  async rpc(name: string, parameters?: Record<string, unknown>) {
    this.calls.push({ name, parameters });
    if (name === "cloud_workspace_status") {
      return { data: { initialized: true }, error: null };
    }
    if (name === "get_cloud_workspace_v2") {
      return { data: this.raw, error: null };
    }
    assert.equal(name, SYNC_CLOUD_WORKSPACE_RPC);
    if (this.failNextWrite) {
      const error = this.failNextWrite;
      this.failNextWrite = undefined;
      return { data: null, error };
    }
    if (this.rejectNextWrite) {
      const message = this.rejectNextWrite;
      this.rejectNextWrite = undefined;
      return { data: null, error: { message, code: "P0001" } };
    }
    const outerMutationId = String(parameters?.p_mutation_id);
    if (!this.receipts.has(outerMutationId)) {
      const state = parameters?.p_state as AppState;
      const selectedFurnitureId = state.inventory.selectedFurnitureId;
      if (selectedFurnitureId) {
        assert.ok(this.balance(selectedFurnitureId) > 0);
      }
      this.raw.settings = {
        selected_furniture_id: selectedFurnitureId ?? null,
      };
      this.applyCommands(
        parameters?.p_commands as SyncEconomicCommands,
        outerMutationId,
      );
      this.receipts.add(outerMutationId);
    }
    if (this.loseNextWriteResponse) {
      this.loseNextWriteResponse = false;
      return { data: { invalid: true }, error: null };
    }
    return { data: this.raw, error: null };
  }

  private applyCommands(commands: SyncEconomicCommands, outerMutationId: string) {
    for (const purchase of commands.purchases) {
      const prices: Partial<Record<string, number>> = {
        "kitten-milk": 50,
        "yarn-toy": 250,
      };
      const price = prices[purchase.itemId];
      assert.ok(price !== undefined);
      const currentPoints = Number(this.raw.points_tenths);
      assert.ok(currentPoints >= price);
      this.raw.reward_ledger.push({
        id: this.nextUuid(),
        source_type: "purchase",
        source_id: purchase.mutationId,
        local_date: purchase.localDate,
        timezone: "Europe/Zurich",
        points_tenths: -price,
        created_at: NOW,
      });
      this.raw.points_tenths = currentPoints - price;
      this.addInventoryEvent(purchase.itemId, 1, purchase.localDate);
    }
    for (const consumption of commands.consumptions) {
      const receipt = `${outerMutationId}:${consumption.itemId}`;
      assert.ok(!this.receipts.has(receipt));
      const balance = this.balance(consumption.itemId);
      assert.ok(balance >= consumption.quantity);
      this.addInventoryEvent(
        consumption.itemId,
        -consumption.quantity,
        consumption.localDate,
      );
      this.receipts.add(receipt);
    }
  }

  private addInventoryEvent(itemId: string, delta: number, localDate: string) {
    this.raw.inventory_events.push({
      id: this.nextUuid(),
      item_id: itemId,
      quantity_delta: delta,
      local_date: localDate,
      timezone: "Europe/Zurich",
      created_at: NOW,
    });
    const quantity = this.balance(itemId) + delta;
    this.raw.inventory_balances = this.raw.inventory_balances.filter(
      (row) => row.item_id !== itemId,
    );
    if (quantity > 0) this.raw.inventory_balances.push({ item_id: itemId, quantity });
  }

  private balance(itemId: string): number {
    return this.raw.inventory_balances.find((row) => row.item_id === itemId)?.quantity ?? 0;
  }

  private nextUuid(): string {
    this.eventIndex += 1;
    return `ee000000-0000-4000-8000-${String(this.eventIndex).padStart(12, "0")}`;
  }
}

function harness(
  cloud = new EconomicCloud(),
  uuids = [PURCHASE_ID, OUTER_ID],
  store = memoryStore(),
) {
  const repository = createMobileRepositoryWithStore(store);
  const queue = createMobileSyncQueue(store, () => DEVICE_ID);
  let uuidIndex = 0;
  let online = true;
  const client: MobileSyncClient = {
    auth: {
      async getSession() {
        return { data: { session: { user: { id: USER_ID } } }, error: null };
      },
    },
    rpc: (name, parameters) => cloud.rpc(name, parameters),
  };
  const runtime = new MobileSyncRuntime({
    userId: USER_ID,
    client,
    repository,
    queue,
    isCurrent: () => true,
    online: () => online,
    timezone: () => "Europe/Zurich",
    now: () => NOW,
    uuid: () => uuids[uuidIndex++]!,
    async applyCanonical(workspace, hydratedAt) {
      await repository.saveCloudWorkspace(USER_ID, workspace, hydratedAt);
      await repository.saveLocalWorkspace({ kind: "account", userId: USER_ID }, workspace.state);
    },
    applyWorkingState(_state: AppState) {},
    setCloudState() {},
  });
  return {
    cloud,
    queue,
    repository,
    runtime,
    setOnline(value: boolean) {
      online = value;
    },
    store,
  };
}

function syncCalls(cloud: EconomicCloud) {
  return cloud.calls.filter((call) => call.name === SYNC_CLOUD_WORKSPACE_RPC);
}

test("authenticated purchase keeps local points canonical until the validated server response", async () => {
  const fixture = harness();
  await fixture.runtime.start();
  const result = await fixture.runtime.purchaseInventoryItem("yarn-toy", TODAY);
  assert.equal(result.outcome, "applied");

  const call = syncCalls(fixture.cloud)[0];
  const submittedState = call?.parameters?.p_state as AppState;
  assert.equal(submittedState.progress.points, 100);
  assert.equal(submittedState.inventory.items.some((item) => item.itemId === "yarn-toy"), false);
  assert.deepEqual(call?.parameters?.p_commands, {
    purchases: [{ mutationId: PURCHASE_ID, itemId: "yarn-toy", localDate: TODAY }],
    consumptions: [],
  });

  const canonical = await fixture.repository.loadLocalWorkspace({ kind: "account", userId: USER_ID });
  assert.equal(canonical.progress.points, 75);
  assert.deepEqual(
    canonical.inventory.items.find((item) => item.itemId === "yarn-toy"),
    { itemId: "yarn-toy", quantity: 1 },
  );
  assert.ok(canonical.progress.points >= 0);
  assert.equal((await fixture.queue.load(USER_ID)).pending.length, 0);
  assert.equal(fixture.runtime.getSnapshot().status, "synced");
  assert.equal(fixture.runtime.getSnapshot().queueSummary.totalCount, 0);
});

test("online RPC failure keeps purchase pending without labeling the runtime offline", async () => {
  const cloud = new EconomicCloud();
  cloud.failNextWrite = { code: "XX000", message: "internal server error" };
  const fixture = harness(cloud);
  await fixture.runtime.start();

  const result = await fixture.runtime.purchaseInventoryItem("kitten-milk", TODAY);
  assert.equal(result.outcome, "queued");
  assert.equal(result.queueReason, "sync-failure");
  assert.equal((await fixture.queue.load(USER_ID)).pending.length, 1);
  assert.deepEqual(fixture.runtime.getSnapshot().diagnostic, {
    failureClass: "rpc-server",
    safeErrorCode: "XX000",
    safeMessageClass: "server-internal-error",
  });
  assert.equal(fixture.runtime.getSnapshot().status, "error");
  assert.equal(fixture.runtime.getSnapshot().queueSummary.purchaseCount, 1);
  assert.equal(fixture.runtime.getSnapshot().queueSummary.headType, "purchase");
  const canonical = await fixture.repository.loadLocalWorkspace({
    kind: "account",
    userId: USER_ID,
  });
  assert.equal(canonical.progress.points, 100);
  assert.equal(canonical.inventory.items.find((item) => item.itemId === "kitten-milk")?.quantity, 2);
});

test("an unrelated server error cannot masquerade as an economic rejection", async () => {
  const cloud = new EconomicCloud();
  cloud.failNextWrite = {
    code: "XX000",
    message: "insufficient_points appeared only in internal context",
  };
  const fixture = harness(cloud);
  await fixture.runtime.start();

  const result = await fixture.runtime.purchaseInventoryItem("kitten-milk", TODAY);
  assert.equal(result.outcome, "queued");
  assert.equal(result.queueReason, "sync-failure");
  assert.equal((await fixture.queue.load(USER_ID)).pending.length, 1);
  assert.deepEqual(fixture.runtime.getSnapshot().diagnostic, {
    failureClass: "rpc-server",
    safeErrorCode: "XX000",
    safeMessageClass: "server-internal-error",
  });
  assert.doesNotMatch(
    formatMobileSyncDiagnostic(fixture.runtime.getSnapshot()),
    /appeared only in internal context/,
  );
});

test("authenticated purchase retry reuses both mutation IDs and applies once", async () => {
  const cloud = new EconomicCloud();
  cloud.loseNextWriteResponse = true;
  const fixture = harness(cloud);
  await fixture.runtime.start();
  const first = await fixture.runtime.purchaseInventoryItem("kitten-milk", TODAY);
  assert.equal(first.outcome, "queued");
  assert.equal(first.queueReason, "sync-failure");
  assert.equal((await fixture.queue.load(USER_ID)).pending.length, 1);

  await fixture.runtime.retry();
  const calls = syncCalls(cloud);
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.parameters?.p_mutation_id, OUTER_ID);
  assert.equal(calls[1]?.parameters?.p_mutation_id, OUTER_ID);
  assert.deepEqual(calls[0]?.parameters?.p_commands, calls[1]?.parameters?.p_commands);
  assert.equal(
    cloud.raw.reward_ledger.filter((row) => row.source_type === "purchase").length,
    1,
  );
  const canonical = await fixture.repository.loadLocalWorkspace({ kind: "account", userId: USER_ID });
  assert.equal(canonical.progress.points, 95);
  assert.equal(canonical.inventory.items.find((item) => item.itemId === "kitten-milk")?.quantity, 3);
  assert.equal(fixture.runtime.getSnapshot().status, "synced");
  assert.equal(fixture.runtime.getSnapshot().queueSummary.totalCount, 0);
});

test("authenticated consume retry is idempotent and canonical inventory never goes below zero", async () => {
  const cloud = new EconomicCloud();
  cloud.loseNextWriteResponse = true;
  const fixture = harness(cloud, [CONSUME_OUTER_ID]);
  await fixture.runtime.start();
  const first = await fixture.runtime.consumeInventoryItem("kitten-milk", TODAY);
  assert.equal(first.outcome, "queued");
  const pendingCanonical = await fixture.repository.loadLocalWorkspace({
    kind: "account",
    userId: USER_ID,
  });
  assert.equal(pendingCanonical.progress.points, 100);
  assert.equal(
    pendingCanonical.inventory.items.find((item) => item.itemId === "kitten-milk")?.quantity,
    2,
  );

  await fixture.runtime.retry();
  const calls = syncCalls(cloud);
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.parameters?.p_mutation_id, CONSUME_OUTER_ID);
  assert.deepEqual(calls[0]?.parameters?.p_commands, {
    purchases: [],
    consumptions: [{ itemId: "kitten-milk", quantity: 1, localDate: TODAY }],
  });
  const consumeEvents = cloud.raw.inventory_events.filter(
    (row) => row.item_id === "kitten-milk" && Number(row.quantity_delta) < 0,
  );
  assert.equal(consumeEvents.length, 1);
  const canonical = await fixture.repository.loadLocalWorkspace({ kind: "account", userId: USER_ID });
  assert.equal(canonical.inventory.items.find((item) => item.itemId === "kitten-milk")?.quantity, 1);
  assert.ok(canonical.inventory.items.every((item) => item.quantity >= 0));
});

test("offline authenticated consumption stays queued without changing canonical inventory", async () => {
  const cloud = new EconomicCloud();
  const fixture = harness(cloud, [CONSUME_OUTER_ID]);
  await fixture.runtime.start();
  fixture.setOnline(false);

  const result = await fixture.runtime.consumeInventoryItem("kitten-milk", TODAY);
  assert.equal(result.outcome, "queued");
  assert.equal((await fixture.queue.load(USER_ID)).pending.length, 1);
  assert.equal(syncCalls(cloud).length, 0);

  const canonical = await fixture.repository.loadLocalWorkspace({
    kind: "account",
    userId: USER_ID,
  });
  assert.equal(canonical.progress.points, 100);
  assert.equal(
    canonical.inventory.items.find((item) => item.itemId === "kitten-milk")?.quantity,
    2,
  );
  assert.equal(
    cloud.raw.inventory_events.filter((row) => Number(row.quantity_delta) < 0).length,
    0,
  );
});

test("authenticated consumption rejection refreshes canonical state without local consumption", async () => {
  const cloud = new EconomicCloud();
  cloud.rejectNextWrite = "insufficient_inventory";
  const fixture = harness(cloud, [CONSUME_OUTER_ID]);
  await fixture.runtime.start();

  const result = await fixture.runtime.consumeInventoryItem("kitten-milk", TODAY);
  assert.equal(result.outcome, "empty");
  assert.equal((await fixture.queue.load(USER_ID)).pending.length, 0);
  const canonical = await fixture.repository.loadLocalWorkspace({
    kind: "account",
    userId: USER_ID,
  });
  assert.equal(canonical.progress.points, 100);
  assert.equal(
    canonical.inventory.items.find((item) => item.itemId === "kitten-milk")?.quantity,
    2,
  );
  assert.equal(
    cloud.raw.inventory_events.filter((row) => Number(row.quantity_delta) < 0).length,
    0,
  );
});

test("an offline authenticated purchase survives app restart with stable idempotency IDs", async () => {
  const cloud = new EconomicCloud();
  const firstRuntime = harness(cloud);
  await firstRuntime.runtime.start();
  firstRuntime.setOnline(false);
  const queued = await firstRuntime.runtime.purchaseInventoryItem("kitten-milk", TODAY);
  assert.equal(queued.outcome, "queued");
  assert.equal(queued.queueReason, "offline");
  assert.equal(firstRuntime.runtime.getSnapshot().status, "offline");
  assert.deepEqual(firstRuntime.runtime.getSnapshot().diagnostic, {
    failureClass: "offline",
    safeErrorCode: "OFFLINE_DETECTED",
    safeMessageClass: "device-reported-offline",
  });
  assert.equal((await firstRuntime.queue.load(USER_ID)).pending.length, 1);
  firstRuntime.runtime.dispose();

  const restarted = harness(cloud, [], firstRuntime.store);
  await restarted.runtime.start();
  assert.equal((await restarted.queue.load(USER_ID)).pending.length, 0);
  const calls = syncCalls(cloud);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.parameters?.p_mutation_id, OUTER_ID);
  assert.deepEqual(calls[0]?.parameters?.p_commands, {
    purchases: [{ mutationId: PURCHASE_ID, itemId: "kitten-milk", localDate: TODAY }],
    consumptions: [],
  });
  const canonical = await restarted.repository.loadLocalWorkspace({
    kind: "account",
    userId: USER_ID,
  });
  assert.equal(canonical.progress.points, 95);
  assert.equal(canonical.inventory.items.find((item) => item.itemId === "kitten-milk")?.quantity, 3);
});

test("authenticated business rejection clears the command and refreshes canonical points", async () => {
  const cloud = new EconomicCloud();
  cloud.rejectNextWrite = "insufficient_points";
  const fixture = harness(cloud);
  await fixture.runtime.start();
  const result = await fixture.runtime.purchaseInventoryItem("kitten-milk", TODAY);
  assert.equal(result.outcome, "insufficient");
  assert.equal((await fixture.queue.load(USER_ID)).pending.length, 0);
  const canonical = await fixture.repository.loadLocalWorkspace({ kind: "account", userId: USER_ID });
  assert.equal(canonical.progress.points, 100);
  assert.equal(canonical.inventory.items.find((item) => item.itemId === "kitten-milk")?.quantity, 2);
});

test("authenticated selected furniture persists through the existing workspace setting", async () => {
  const cloud = new EconomicCloud();
  cloud.raw.inventory_events.push({
    id: "14000000-0000-4000-8000-000000000012",
    item_id: "cat-bed",
    quantity_delta: 1,
    local_date: "2026-09-01",
    timezone: "Europe/Zurich",
    created_at: "2026-09-01T10:00:00.000Z",
  });
  cloud.raw.inventory_balances.push({ item_id: "cat-bed", quantity: 1 });
  const fixture = harness(cloud, [OUTER_ID]);
  await fixture.runtime.start();
  await fixture.runtime.mutate((state) => selectCatFurniture(state, "cat-bed"));
  await fixture.runtime.retry();
  const canonical = await fixture.repository.loadLocalWorkspace({ kind: "account", userId: USER_ID });
  assert.equal(canonical.inventory.selectedFurnitureId, "cat-bed");
  assert.deepEqual(cloud.raw.settings, { selected_furniture_id: "cat-bed" });
});
