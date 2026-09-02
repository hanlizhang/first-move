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
        user: { id: string; email?: string };
      } | null;
    };
    error: unknown | null;
  }>;
}

export async function restoreAuthSession(auth: SessionReader): Promise<AuthEvent> {
  try {
    const { data, error } = await auth.getSession();
    if (error) {
      return {
        type: "FAILED",
        message: "We could not restore the secure session. Guest Mode is still available.",
      };
    }
    return {
      type: "SESSION_RESTORED",
      user: data.session
        ? { id: data.session.user.id, email: data.session.user.email }
        : null,
    };
  } catch {
    return {
      type: "FAILED",
      message: "We could not restore the secure session. Guest Mode is still available.",
    };
  }
}
