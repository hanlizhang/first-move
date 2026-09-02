import type { AuthState } from "../auth/auth-state.ts";
import type { LocalWorkspaceOwner } from "../local/repository-core.ts";

export function localWorkspaceOwnerForAuth(
  status: AuthState["status"],
  authenticatedUserId?: string,
): LocalWorkspaceOwner | undefined {
  if (status === "guest") return { kind: "guest" };
  if (status === "authenticated" && authenticatedUserId) {
    return { kind: "account", userId: authenticatedUserId };
  }
  return undefined;
}
