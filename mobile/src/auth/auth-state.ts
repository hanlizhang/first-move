export interface AuthenticatedUser {
  id: string;
  email?: string;
}

export type AuthState =
  | { status: "loading" }
  | { status: "signed-out"; message?: string }
  | { status: "guest"; message?: string }
  | { status: "authenticated"; user: AuthenticatedUser; message?: string }
  | { status: "error"; message: string; recoverTo: "signed-out" | "guest" };

export type AuthEvent =
  | { type: "RESTORE_STARTED" }
  | { type: "SESSION_RESTORED"; user: AuthenticatedUser | null }
  | { type: "CONTINUE_AS_GUEST"; message?: string }
  | { type: "OPEN_SIGN_IN" }
  | { type: "MAGIC_LINK_SENT" }
  | { type: "AUTHENTICATED"; user: AuthenticatedUser }
  | { type: "SIGNED_OUT" }
  | { type: "ACCOUNT_DELETION_ACCEPTED" }
  | { type: "FAILED"; message: string; recoverTo?: "signed-out" | "guest" };

export const initialAuthState: AuthState = { status: "loading" };

export function reduceAuthState(state: AuthState, event: AuthEvent): AuthState {
  switch (event.type) {
    case "RESTORE_STARTED":
      return { status: "loading" };
    case "SESSION_RESTORED":
      return event.user
        ? { status: "authenticated", user: event.user }
        : { status: "signed-out" };
    case "CONTINUE_AS_GUEST":
      return { status: "guest", message: event.message };
    case "OPEN_SIGN_IN":
      return { status: "signed-out" };
    case "MAGIC_LINK_SENT":
      return {
        status: "signed-out",
        message: "Check your email for your secure sign-in link.",
      };
    case "AUTHENTICATED":
      return { status: "authenticated", user: event.user };
    case "SIGNED_OUT":
      if (state.status === "guest") return state;
      return {
        status: "signed-out",
        message: "Signed out. Guest and cached local data are still on this device.",
      };
    case "ACCOUNT_DELETION_ACCEPTED":
      return {
        status: "signed-out",
        message:
          "Account deletion is in progress. This account’s local data and session were removed from this device.",
      };
    case "FAILED":
      return {
        status: "error",
        message: event.message,
        recoverTo: event.recoverTo ?? (state.status === "guest" ? "guest" : "signed-out"),
      };
  }
}

export interface SessionReader {
  getSession(): Promise<{
    data: {
      session: {
        access_token: string;
        user: { id: string; email?: string };
      } | null;
    };
    error: unknown | null;
  }>;
  getUser(accessToken: string): Promise<{
    data: { user: { id: string; email?: string } | null };
    error: { code?: string; status?: number } | null;
  }>;
}

export interface AuthRestoreSafety {
  isAccountBlocked?(userId: string): Promise<boolean>;
  onRejectedAccount?(userId: string): Promise<void>;
  onInvalidSession?(userId: string): Promise<void>;
}

export async function restoreAuthSession(
  auth: SessionReader,
  safety: AuthRestoreSafety = {},
): Promise<AuthEvent> {
  try {
    const { data, error } = await auth.getSession();
    if (error) {
      return {
        type: "FAILED",
        message: "We could not restore the secure session. Guest Mode is still available.",
      };
    }
    const session = data.session;
    if (!session) return { type: "SESSION_RESTORED", user: null };
    const storedUserId = session.user.id;
    if (await safety.isAccountBlocked?.(storedUserId)) {
      await rejectAccount(safety, storedUserId);
      return { type: "SESSION_RESTORED", user: null };
    }

    const live = await auth.getUser(session.access_token);
    if (live.error) {
      if (isDefinitivelyMissingAuthIdentity(live.error)) {
        await rejectAccount(safety, storedUserId);
        return { type: "SESSION_RESTORED", user: null };
      }
      if (isDefinitivelyInvalidAuthSession(live.error)) {
        await rejectSession(safety, storedUserId);
        return { type: "SESSION_RESTORED", user: null };
      }
      return authRestoreFailure();
    }
    if (!live.data.user || live.data.user.id !== storedUserId) {
      await rejectSession(safety, storedUserId);
      return { type: "SESSION_RESTORED", user: null };
    }
    return {
      type: "SESSION_RESTORED",
      user: { id: live.data.user.id, email: live.data.user.email },
    };
  } catch {
    return authRestoreFailure();
  }
}

async function rejectAccount(
  safety: AuthRestoreSafety,
  userId: string,
): Promise<void> {
  try {
    await safety.onRejectedAccount?.(userId);
  } catch {
    // Authentication remains rejected even if local cleanup needs a later retry.
  }
}

async function rejectSession(
  safety: AuthRestoreSafety,
  userId: string,
): Promise<void> {
  try {
    await safety.onInvalidSession?.(userId);
  } catch {
    // The session stays rejected even if local credential cleanup must retry.
  }
}

export function isDefinitivelyMissingAuthIdentity(error: {
  code?: string;
  status?: number;
}): boolean {
  return error.code === "user_not_found";
}

export function isDefinitivelyInvalidAuthSession(error: {
  code?: string;
  status?: number;
}): boolean {
  return (
    error.status === 401 ||
    error.status === 403 ||
    error.code === "session_not_found" ||
    error.code === "session_expired" ||
    error.code === "bad_jwt" ||
    error.code === "no_authorization"
  );
}

function authRestoreFailure(): AuthEvent {
  return {
    type: "FAILED",
    message: "We could not validate the secure session. Guest Mode is still available.",
  };
}
