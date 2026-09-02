import assert from "node:assert/strict";
import test from "node:test";

import type { AuthState } from "../auth/auth-state.ts";
import { localWorkspaceOwnerForAuth } from "./local-workspace-owner.ts";

test("authenticated, signed-out, and Guest Mode select different local owners", () => {
  const authenticated: AuthState = {
    status: "authenticated",
    user: { id: "account-a" },
  };
  const signedOut: AuthState = { status: "signed-out" };
  const guest: AuthState = { status: "guest" };

  assert.deepEqual(
    localWorkspaceOwnerForAuth(authenticated.status, authenticated.user.id),
    {
    kind: "account",
    userId: "account-a",
    },
  );
  assert.equal(localWorkspaceOwnerForAuth(signedOut.status), undefined);
  assert.deepEqual(localWorkspaceOwnerForAuth(guest.status), { kind: "guest" });
});
