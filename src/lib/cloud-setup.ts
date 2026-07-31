import type { SupabaseClient } from "@supabase/supabase-js";

import { createImmutableBackup, createIndexedDbBackupStore, type CloudBackupStore, type LocalStorageReader } from "./cloud-backup.ts";
import { CloudImportDiagnosticError, prepareCloudImport } from "./cloud-import.ts";
import type { SafeCloudImportDiagnostic } from "./cloud-import.ts";
import { replaceLocalWorkspace, validateCanonicalWorkspace, type CanonicalWorkspace } from "./cloud-hydration.ts";

export type CloudSetupPhase = "set-up" | "preparing-backup" | "importing" | "verifying" | "cloud-copy-ready" | "failed";
export type AccountCloudState = "unauthenticated" | "request-failed" | "empty" | "existing";

export const CLOUD_SETUP_LABELS: Record<CloudSetupPhase, string> = {
  "set-up": "Set up sync",
  "preparing-backup": "Preparing backup",
  importing: "Importing",
  verifying: "Verifying",
  "cloud-copy-ready": "Cloud copy ready",
  failed: "Setup failed",
};

export interface CloudSetupDependencies {
  client: Pick<SupabaseClient, "rpc" | "auth">;
  storage: LocalStorageReader & { setItem(key: string, value: string): void };
  backupStore: CloudBackupStore;
  timezone: string;
  deviceId: string;
  reportSafeDiagnostic?: (report: SafeCloudImportDiagnostic) => void;
}

export async function detectAccountCloudState(client: Pick<SupabaseClient, "rpc" | "auth">): Promise<AccountCloudState> {
  const { data: authData, error: authError } = await client.auth.getSession();
  if (authError) return "request-failed";
  if (!authData.session) return "unauthenticated";
  const { data, error } = await client.rpc("cloud_workspace_status");
  if (error) return "request-failed";
  return isRecord(data) && data.initialized === true ? "existing" : "empty";
}

export function browserCloudSetupDependencies(client: Pick<SupabaseClient, "rpc" | "auth">): CloudSetupDependencies {
  const dependencies: CloudSetupDependencies = {
    client,
    storage: window.localStorage,
    backupStore: createIndexedDbBackupStore(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    deviceId: crypto.randomUUID(),
  };
  if (process.env.NODE_ENV === "development") {
    dependencies.reportSafeDiagnostic = (report) => {
      Object.defineProperty(window, "__FIRST_MOVE_CLOUD_IMPORT_PREFLIGHT__", {
        configurable: true,
        value: Object.freeze(structuredClone(report)),
      });
    };
  }
  return dependencies;
}

export async function importThisDevice(
  dependencies: CloudSetupDependencies,
  onPhase: (phase: CloudSetupPhase) => void,
): Promise<CanonicalWorkspace> {
  onPhase("preparing-backup");
  const backup = await createImmutableBackup(dependencies.storage, dependencies.backupStore);
  let prepared;
  try {
    prepared = await prepareCloudImport(backup, dependencies.backupStore, dependencies.timezone);
    dependencies.reportSafeDiagnostic?.(prepared.safeDiagnostic);
  } catch (error) {
    const diagnostic = safeCloudImportDiagnostic(error);
    if (diagnostic) dependencies.reportSafeDiagnostic?.(diagnostic);
    throw error;
  }
  onPhase("importing");
  const { error } = await dependencies.client.rpc("initialize_cloud_workspace_v2", {
    p_choice: "import_local",
    p_device_id: dependencies.deviceId,
    p_snapshot_sha256: prepared.snapshotHash,
    p_source_schema_version: prepared.schemaVersion,
    p_timezone: prepared.timezone,
    p_payload: prepared.payload,
  });
  if (error) {
    const recovered = await recoverCompletedImport(dependencies, onPhase);
    if (recovered) return recovered;
    throw new Error(error.message.includes("workspace_not_empty") ? "This account already has cloud progress." : "Import failed.");
  }
  onPhase("verifying");
  let workspace: CanonicalWorkspace;
  try {
    const canonical = await dependencies.client.rpc("get_cloud_workspace_v2");
    if (canonical.error) throw new Error("canonical_read_failed");
    workspace = validateCanonicalWorkspace(canonical.data);
  } catch (validationError) {
    const recovered = await recoverCompletedImport(dependencies, onPhase);
    if (recovered) return recovered;
    throw validationError;
  }
  onPhase("cloud-copy-ready");
  return workspace;
}

async function recoverCompletedImport(
  dependencies: CloudSetupDependencies,
  onPhase: (phase: CloudSetupPhase) => void,
): Promise<CanonicalWorkspace | undefined> {
  try {
    const accountState = await detectAccountCloudState(dependencies.client);
    if (accountState !== "existing") return undefined;
    onPhase("verifying");
    const { data, error } = await dependencies.client.rpc("get_cloud_workspace_v2");
    if (error) return undefined;
    const workspace = validateCanonicalWorkspace(data);
    onPhase("cloud-copy-ready");
    return workspace;
  } catch {
    return undefined;
  }
}

export function cloudSetupErrorMessage(error: unknown, development: boolean): string {
  const message = error instanceof Error
    ? error.message
    : "Cloud setup failed. Your local progress and backup are unchanged.";
  const diagnostic = error instanceof CloudImportDiagnosticError ? error.structuralDiagnostic : undefined;
  const safeStructure = diagnostic
    ? ` source=${diagnostic.sourceType} sourceHash=${diagnostic.hashedLocalSourceId} date=${diagnostic.dateKey} parent=${diagnostic.parentExists} active=${diagnostic.activeCompletionContainsDate} mapping=${diagnostic.completionMappingExists} payload=${diagnostic.completionPayloadRowExists}`
    : "";
  return development && error instanceof CloudImportDiagnosticError
    ? `${message} (${error.code}${safeStructure})`
    : message;
}

export function safeCloudImportDiagnostic(error: unknown): SafeCloudImportDiagnostic | undefined {
  if (!(error instanceof CloudImportDiagnosticError)) return undefined;
  return error.safeDiagnostic ?? {
    errorCode: error.code, phase: "mapping", rpcAttempted: false,
    mappingEntityTypesPresent: [], mappingCountByEntityType: {}, localCountsByEntityType: {}, rewardCountsBySourceType: {},
  };
}

export async function copySafeCloudImportDiagnostic(
  diagnostic: SafeCloudImportDiagnostic,
  writeText: (value: string) => Promise<void>,
): Promise<void> {
  await writeText(JSON.stringify(diagnostic, null, 2));
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
  const { data, error } = await dependencies.client.rpc("get_cloud_workspace_v2");
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
