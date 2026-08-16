import type { CanonicalWorkspace } from "./canonical-workspace.ts";
import { validateCanonicalWorkspace } from "./canonical-workspace.ts";
import type { MobileRepository } from "../local/repository.ts";

export const CLOUD_WORKSPACE_STATUS_RPC = "cloud_workspace_status" as const;
export const GET_CLOUD_WORKSPACE_RPC = "get_cloud_workspace_v2" as const;

export type CloudHydrationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "setup-unavailable"; message: string }
  | { status: "ready"; workspace: CanonicalWorkspace; hydratedAt: string }
  | { status: "error"; message: string };

export interface CloudRpcClient {
  rpc(
    name: typeof CLOUD_WORKSPACE_STATUS_RPC | typeof GET_CLOUD_WORKSPACE_RPC,
  ): Promise<{ data: unknown; error: unknown | null }>;
}

export async function hydrateInitializedWorkspace(
  client: CloudRpcClient,
  repository: MobileRepository,
  userId: string,
  now: () => string = () => new Date().toISOString(),
): Promise<CloudHydrationState> {
  try {
    const statusResponse = await client.rpc(CLOUD_WORKSPACE_STATUS_RPC);
    if (statusResponse.error || !isRecord(statusResponse.data)) {
      return hydrationError();
    }
    if (statusResponse.data.initialized !== true) {
      return {
        status: "setup-unavailable",
        message:
          "This account has no cloud workspace yet. Cloud setup is not available in Mobile M1B; keep using local progress on this device.",
      };
    }

    const workspaceResponse = await client.rpc(GET_CLOUD_WORKSPACE_RPC);
    if (workspaceResponse.error) return hydrationError();
    const workspace = validateCanonicalWorkspace(workspaceResponse.data);
    const hydratedAt = now();
    await repository.saveCloudWorkspace(userId, workspace, hydratedAt);
    return { status: "ready", workspace, hydratedAt };
  } catch {
    return hydrationError();
  }
}

function hydrationError(): CloudHydrationState {
  return {
    status: "error",
    message:
      "Cloud progress could not be loaded or verified. Guest and cached local data were not changed.",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
