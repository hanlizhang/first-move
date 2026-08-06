import {
  AppState as NativeAppState,
  type AppStateStatus,
} from "react-native";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";

import {
  initialAuthState,
  reduceAuthState,
  restoreAuthSession,
  type AuthState,
} from "../auth/auth-state.ts";
import { requestMagicLink } from "../auth/magic-link.ts";
import { signOutWithoutDeletingLocalData } from "../auth/sign-out.ts";
import {
  hydrateInitializedWorkspace,
  type CloudHydrationState,
  type CloudRpcClient,
} from "../cloud/read-only-hydration.ts";
import { createMobileRepository } from "../local/repository.ts";
import { getSupabaseClient } from "../supabase/client.ts";

interface AppContextValue {
  auth: AuthState;
  cloud: CloudHydrationState;
  continueAsGuest(): void;
  openSignIn(): void;
  sendMagicLink(email: string): Promise<void>;
  signOut(): Promise<void>;
  retryAuthRestore(): Promise<void>;
  refreshCloud(): Promise<void>;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);
const repository = createMobileRepository();

export function AppProvider({ children }: { children: ReactNode }) {
  const [auth, dispatch] = useReducer(reduceAuthState, initialAuthState);
  const [cloud, setCloud] = useState<CloudHydrationState>({ status: "idle" });
  const clientRef = useRef<SupabaseClient | undefined>(undefined);

  const resolveClient = useCallback(() => {
    const client = clientRef.current ?? getSupabaseClient();
    clientRef.current = client;
    return client;
  }, []);

  const restore = useCallback(async () => {
    dispatch({ type: "RESTORE_STARTED" });
    try {
      await repository.loadGuestWorkspace();
      const client = resolveClient();
      dispatch(await restoreAuthSession(client.auth));
    } catch {
      dispatch({
        type: "FAILED",
        message: "Account services are not configured. Guest Mode is still available.",
      });
    }
  }, [resolveClient]);

  useEffect(() => {
    void restore();
  }, [restore]);

  useEffect(() => {
    let client: SupabaseClient;
    try {
      client = resolveClient();
    } catch {
      return;
    }
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      dispatchSession(session);
    });
    return () => data.subscription.unsubscribe();
  }, [resolveClient]);

  useEffect(() => {
    let client: SupabaseClient;
    try {
      client = resolveClient();
    } catch {
      return;
    }
    const applyRefreshState = (state: AppStateStatus) => {
      if (state === "active") client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
    };
    applyRefreshState(NativeAppState.currentState);
    const subscription = NativeAppState.addEventListener("change", applyRefreshState);
    return () => {
      subscription.remove();
      client.auth.stopAutoRefresh();
    };
  }, [resolveClient]);

  const hydrate = useCallback(
    async (userId: string) => {
      setCloud({ status: "loading" });
      try {
        const client = resolveClient();
        const rpcClient: CloudRpcClient = {
          rpc: async (name) => {
            const response = await client.rpc(name);
            return { data: response.data, error: response.error };
          },
        };
        setCloud(await hydrateInitializedWorkspace(rpcClient, repository, userId));
      } catch {
        setCloud({
          status: "error",
          message:
            "Cloud progress could not be loaded or verified. Guest and cached local data were not changed.",
        });
      }
    },
    [resolveClient],
  );

  useEffect(() => {
    if (auth.status !== "authenticated") return;
    const timer = setTimeout(() => void hydrate(auth.user.id), 0);
    return () => clearTimeout(timer);
  }, [auth, hydrate]);

  const continueAsGuest = useCallback(() => {
    dispatch({ type: "CONTINUE_AS_GUEST" });
  }, []);

  const openSignIn = useCallback(() => {
    dispatch({ type: "OPEN_SIGN_IN" });
  }, []);

  const sendMagicLink = useCallback(
    async (email: string) => {
      try {
        const result = await requestMagicLink(resolveClient().auth, email);
        if (result.ok) dispatch({ type: "MAGIC_LINK_SENT" });
        else dispatch({ type: "FAILED", message: result.message, recoverTo: "signed-out" });
      } catch {
        dispatch({
          type: "FAILED",
          message: "Sync across devices is unavailable right now. Guest Mode still works.",
          recoverTo: "signed-out",
        });
      }
    },
    [resolveClient],
  );

  const signOut = useCallback(async () => {
    try {
      const result = await signOutWithoutDeletingLocalData(resolveClient().auth);
      if (!result.ok) {
        dispatch({
          type: "FAILED",
          message: result.message,
          recoverTo: "guest",
        });
        return;
      }
      setCloud({ status: "idle" });
      dispatch({ type: "SIGNED_OUT" });
    } catch {
      dispatch({
        type: "FAILED",
        message: "We could not sign you out. Please try again.",
        recoverTo: "guest",
      });
    }
  }, [resolveClient]);

  const refreshCloud = useCallback(async () => {
    if (auth.status === "authenticated") await hydrate(auth.user.id);
  }, [auth, hydrate]);

  const value = useMemo<AppContextValue>(
    () => ({
      auth,
      cloud,
      continueAsGuest,
      openSignIn,
      sendMagicLink,
      signOut,
      retryAuthRestore: restore,
      refreshCloud,
    }),
    [
      auth,
      cloud,
      continueAsGuest,
      openSignIn,
      sendMagicLink,
      signOut,
      restore,
      refreshCloud,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;

  function dispatchSession(session: Session | null): void {
    if (!session) {
      setCloud({ status: "idle" });
      dispatch({ type: "SIGNED_OUT" });
      return;
    }
    dispatch({
      type: "AUTHENTICATED",
      user: { id: session.user.id, email: session.user.email },
    });
  }
}

export function useFirstMoveApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error("useFirstMoveApp must be used inside AppProvider.");
  return context;
}
