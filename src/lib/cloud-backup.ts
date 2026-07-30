import { SCHEMA_VERSION } from "./models.ts";

export const CLOUD_BACKUP_DATABASE = "first-move-cloud-setup";
export const CLOUD_BACKUP_VERSION = 1;
export const FIRST_MOVE_STORAGE_PREFIX = "first-move:";

export interface LocalStorageReader {
  length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
}

export interface CloudBackup {
  hash: string;
  capturedAt: string;
  schemaVersion: number;
  entries: ReadonlyArray<readonly [string, string]>;
}

export interface EntityMapping {
  entityType: string;
  localId: string;
  cloudId: string;
  payloadHash: string;
}

export interface CloudBackupStore {
  addBackup(backup: CloudBackup): Promise<CloudBackup>;
  getBackup(hash: string): Promise<CloudBackup | undefined>;
  addMappings(hash: string, mappings: EntityMapping[]): Promise<EntityMapping[]>;
  getMappings(hash: string): Promise<EntityMapping[] | undefined>;
}

export async function createImmutableBackup(
  storage: LocalStorageReader,
  backupStore: CloudBackupStore,
  clock: () => string = () => new Date().toISOString(),
): Promise<CloudBackup> {
  const entries: Array<readonly [string, string]> = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(FIRST_MOVE_STORAGE_PREFIX)) continue;
    const value = storage.getItem(key);
    if (value !== null) entries.push([key, value]);
  }
  entries.sort(([left], [right]) => left.localeCompare(right));
  const hash = await sha256(JSON.stringify(entries));
  const backup = await backupStore.addBackup({
    hash,
    capturedAt: clock(),
    schemaVersion: SCHEMA_VERSION,
    entries,
  });
  if (await sha256(JSON.stringify(backup.entries)) !== backup.hash) {
    throw new Error("Local backup verification failed.");
  }
  return backup;
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createIndexedDbBackupStore(indexedDBFactory: IDBFactory = indexedDB): CloudBackupStore {
  const open = () => new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDBFactory.open(CLOUD_BACKUP_DATABASE, CLOUD_BACKUP_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("backups")) database.createObjectStore("backups", { keyPath: "hash" });
      if (!database.objectStoreNames.contains("mappings")) database.createObjectStore("mappings", { keyPath: "hash" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local backup storage."));
  });

  return {
    async addBackup(backup) {
      const existing = await readRecord<CloudBackup>(open, "backups", backup.hash);
      if (existing) return existing;
      await addRecord(open, "backups", backup);
      return backup;
    },
    getBackup(hash) {
      return readRecord<CloudBackup>(open, "backups", hash);
    },
    async addMappings(hash, mappings) {
      const existing = await readRecord<{ hash: string; mappings: EntityMapping[] }>(open, "mappings", hash);
      if (existing) return existing.mappings;
      await addRecord(open, "mappings", { hash, mappings });
      return mappings;
    },
    async getMappings(hash) {
      return (await readRecord<{ hash: string; mappings: EntityMapping[] }>(open, "mappings", hash))?.mappings;
    },
  };
}

async function readRecord<T>(
  open: () => Promise<IDBDatabase>,
  storeName: string,
  key: IDBValidKey,
): Promise<T | undefined> {
  const database = await open();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const request = database.transaction(storeName, "readonly").objectStore(storeName).get(key);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => reject(request.error ?? new Error("Could not read local backup."));
    });
  } finally {
    database.close();
  }
}

async function addRecord(
  open: () => Promise<IDBDatabase>,
  storeName: string,
  value: unknown,
): Promise<void> {
  const database = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = database.transaction(storeName, "readwrite").objectStore(storeName).add(value);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("Could not save local backup."));
    });
  } finally {
    database.close();
  }
}
