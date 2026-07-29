export type CloudSyncStatus = "not-initialized" | "importing" | "synchronized" | "offline" | "error";

export function accountSyncLabel(authenticated: boolean, cloudStatus: CloudSyncStatus = "not-initialized"): string {
  if (!authenticated) return "Sign in to sync";
  if (cloudStatus === "importing") return "Syncing…";
  if (cloudStatus === "synchronized") return "Synced";
  if (cloudStatus === "offline") return "Offline · saved locally";
  if (cloudStatus === "error") return "Sync needs attention";
  return "Set up sync";
}
