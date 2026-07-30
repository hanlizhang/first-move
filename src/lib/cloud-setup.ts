import type { SupabaseClient } from "@supabase/supabase-js";

import { createImmutableBackup, createIndexedDbBackupStore, type CloudBackupStore, type LocalStorageReader } from "./cloud-backup.ts";
import { prepareCloudImport } from "./cloud-import.ts";
import { replaceLocalWorkspace, validateCanonicalWorkspace, type CanonicalWorkspace } from "./cloud-hydration.ts";

export type CloudSetupPhase = "set-up" | "preparing-backup" | "importing" | "verifying" | "cloud-copy-ready" | "failed";
export type AccountCloudState = "empty" | "existing";

export const CLOUD_SETUP_LABELS: Record<CloudSetupPhase, string> = {
  "set-up": "Set up sync",
  "preparing-backup": "Preparing backup",
  importing: "Importing",
  verifying: "Verifying",
  "cloud-copy-ready": "Cloud copy ready",
  failed: "Setup failed",
};

export interface CloudSetupDependencies {
  client: Pick<SupabaseClient, "rpc">;
  storage: LocalStorageReader & { setItem(key: string, value: string): void };
  backupStore: CloudBackupStore;
  timezone: string;
  deviceId: string;
}

export async function detectAccountCloudState(client: Pick<SupabaseClient, "rpc">): Promise<AccountCloudState> {
  const { data, error } = await client.rpc("cloud_workspace_status");
  if (error) throw new Error("Could not check cloud workspace.");
  return isRecord(data) && data.initialized === true ? "existing" : "empty";
}

export function browserCloudSetupDependencies(client: Pick<SupabaseClient, "rpc">): CloudSetupDependencies {
  return {
    client,
    storage: window.localStorage,
    backupStore: createIndexedDbBackupStore(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    deviceId: crypto.randomUUID(),
  };
}

export async function importThisDevice(
  dependencies: CloudSetupDependencies,
  onPhase: (phase: CloudSetupPhase) => void,
): Promise<CanonicalWorkspace> {
  onPhase("preparing-backup");
  const backup = await createImmutableBackup(dependencies.storage, dependencies.backupStore);
  const prepared = await prepareCloudImport(backup, dependencies.backupStore, dependencies.timezone);
  onPhase("importing");
  const { data, error } = await dependencies.client.rpc("initialize_cloud_workspace", {
    p_choice: "import_local",
    p_device_id: dependencies.deviceId,
    p_snapshot_sha256: prepared.snapshotHash,
    p_source_schema_version: prepared.schemaVersion,
    p_timezone: prepared.timezone,
    p_payload: prepared.payload,
  });
  if (error) throw new Error(error.message.includes("workspace_not_empty") ? "This account already has cloud progress." : "Import failed.");
  onPhase("verifying");
  const workspace = validateCanonicalWorkspace(data);
  onPhase("cloud-copy-ready");
  return workspace;
}

export async function startFresh(
  dependencies: CloudSetupDependencies,
  onPhase: (phase: CloudSetupPhase) => void,
): Promise<CanonicalWorkspace> {
  onPhase("preparing-backup");
  const backup = await createImmutableBackup(dependencies.storage, dependencies.backupStore);
  onPhase("importing");
  const { data, error } = await dependencies.client.rpc("initialize_cloud_workspace", {
    p_choice: "start_fresh",
    p_device_id: dependencies.deviceId,
    p_snapshot_sha256: backup.hash,
    p_source_schema_version: backup.schemaVersion,
    p_timezone: dependencies.timezone,
    p_payload: {},
  });
  if (error) throw new Error(error.message.includes("workspace_not_empty") ? "This account already has cloud progress." : "Setup failed.");
  onPhase("verifying");
  const workspace = validateCanonicalWorkspace(data);
  onPhase("cloud-copy-ready");
  return workspace;
}

export async function hydrateCloudProgress(
  dependencies: CloudSetupDependencies,
  onPhase: (phase: CloudSetupPhase) => void,
): Promise<CanonicalWorkspace> {
  onPhase("preparing-backup");
  await createImmutableBackup(dependencies.storage, dependencies.backupStore);
  onPhase("verifying");
  const { data, error } = await dependencies.client.rpc("get_cloud_workspace");
  if (error) throw new Error("Could not load cloud progress.");
  const workspace = validateCanonicalWorkspace(data);
  replaceLocalWorkspace(dependencies.storage, workspace);
  onPhase("cloud-copy-ready");
  return workspace;
}

export function defaultBrowserBackupStore(): CloudBackupStore {
  return createIndexedDbBackupStore();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
