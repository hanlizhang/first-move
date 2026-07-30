export type CloudSyncStatus =
  | "not-initialized"
  | "preparing-backup"
  | "importing"
  | "verifying"
  | "cloud-copy-ready"
  | "offline"
  | "error";

export function accountSyncLabel(authenticated: boolean, cloudStatus: CloudSyncStatus = "not-initialized"): string {
  if (!authenticated) return "Sign in to sync";
  if (cloudStatus === "preparing-backup") return "Preparing backup";
  if (cloudStatus === "importing") return "Importing";
  if (cloudStatus === "verifying") return "Verifying";
  if (cloudStatus === "cloud-copy-ready") return "Cloud copy ready";
  if (cloudStatus === "offline") return "Offline · saved locally";
  if (cloudStatus === "error") return "Setup failed";
  return "Set up sync";
}
