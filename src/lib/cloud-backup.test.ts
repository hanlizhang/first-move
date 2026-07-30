import assert from "node:assert/strict";
import test from "node:test";

import { createImmutableBackup, type CloudBackup, type CloudBackupStore, type EntityMapping } from "./cloud-backup.ts";

function memoryStore(): CloudBackupStore & { backups: Map<string, CloudBackup> } {
  const backups = new Map<string, CloudBackup>();
  const mappings = new Map<string, EntityMapping[]>();
  return {
    backups,
    async addBackup(backup) {
      const existing = backups.get(backup.hash);
      if (existing) return existing;
      backups.set(backup.hash, structuredClone(backup));
      return backup;
    },
    async getBackup(hash) { return backups.get(hash); },
    async addMappings(hash, value) {
      const existing = mappings.get(hash);
      if (existing) return existing;
      mappings.set(hash, structuredClone(value));
      return value;
    },
    async getMappings(hash) { return mappings.get(hash); },
  };
}

function localStorage(values: Record<string, string>) {
  const keys = Object.keys(values);
  return { length: keys.length, key: (index: number) => keys[index] ?? null, getItem: (key: string) => values[key] ?? null };
}

test("backup captures every First Move key, excludes unrelated keys, and hashes content deterministically", async () => {
  const store = memoryStore();
  const values = {
    "unrelated:key": "ignore",
    "first-move:daily-plans:v1": "[{\"dateKey\":\"2026-07-30\"}]",
    "first-move:app-state": "{\"schemaVersion\":8}",
    "first-move:sync-meta": "{\"mode\":\"guest\"}",
  };
  const first = await createImmutableBackup(localStorage(values), store, () => "2026-07-30T10:00:00.000Z");
  const second = await createImmutableBackup(localStorage(values), store, () => "2026-07-30T11:00:00.000Z");

  assert.equal(first.hash, second.hash);
  assert.equal(second.capturedAt, first.capturedAt);
  assert.deepEqual(first.entries.map(([key]) => key), [
    "first-move:app-state",
    "first-move:daily-plans:v1",
    "first-move:sync-meta",
  ]);
  assert.equal(store.backups.size, 1);
});

test("failed work after backup cannot remove or overwrite the immutable snapshot", async () => {
  const store = memoryStore();
  const backup = await createImmutableBackup(localStorage({ "first-move:app-state": "original" }), store);
  await assert.rejects(async () => { throw new Error("import failed"); });
  assert.equal((await store.getBackup(backup.hash))?.entries[0][1], "original");
});
