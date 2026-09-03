import {
  AppState as NativeAppState,
  type AppStateStatus,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
  cloudHydrationForUser,
  type CloudHydrationState,
} from "../cloud/read-only-hydration.ts";
import {
  MobileSyncRuntime,
  defaultMobileSyncDependencies,
  type MobileSyncClient,
  type MobileSyncSnapshot,
} from "../cloud/sync-runtime.ts";
import { createMobileSyncQueue } from "../cloud/sync-queue.ts";
import { createEmptyState, type AppState } from "../domain/models.ts";
import { reconcileRunningCountdown } from "../domain/sessions.ts";
import {
  createMobileRepository,
  localWorkspaceKey,
} from "../local/repository.ts";
import { getSupabaseClient } from "../supabase/client.ts";
import { localWorkspaceOwnerForAuth } from "./local-workspace-owner.ts";
import {
  createWorkspaceStartupController,
  type WorkspaceStartupResult,
} from "./workspace-startup.ts";

type LocalWorkspaceStatus = "loading" | "ready" | "error";

interface AppContextValue {
  auth: AuthState;
  cloud: CloudHydrationState;
  sync: AppSyncState;
  localWorkspace: AppState;
  localWorkspaceStatus: LocalWorkspaceStatus;
  localWorkspaceMessage?: string;
  workspaceEditable: boolean;
  continueAsGuest(): void;
  openSignIn(): void;
  sendMagicLink(email: string): Promise<void>;
  signOut(): Promise<void>;
  retryAuthRestore(): Promise<void>;
  refreshCloud(): Promise<void>;
  updateLocalWorkspace(
    recipe: (current: AppState) => AppState,
  ): Promise<AppState | undefined>;
}

export type AppSyncState =
  | { status: "local"; pendingCount: 0 }
  | MobileSyncSnapshot;

const AppContext = createContext<AppContextValue | undefined>(undefined);
const repository = createMobileRepository();
const syncQueue = createMobileSyncQueue(AsyncStorage);
const defaultSyncDependencies = defaultMobileSyncDependencies();
const guestWorkspaceKey = localWorkspaceKey({ kind: "guest" });

export function AppProvider({ children }: { children: ReactNode }) {
  const [auth, dispatch] = useReducer(reduceAuthState, initialAuthState);
  const [cloud, setCloud] = useState<CloudHydrationState>({ status: "idle" });
  const [sync, setSync] = useState<AppSyncState>({
    status: "local",
    pendingCount: 0,
  });
  const [localWorkspace, setLocalWorkspace] = useState<AppState>(createEmptyState);
  const [loadedLocalOwnerKey, setLoadedLocalOwnerKey] = useState<
    string | undefined
  >();
  const [localWorkspaceStatus, setLocalWorkspaceStatus] =
    useState<LocalWorkspaceStatus>("loading");
  const [localWorkspaceMessage, setLocalWorkspaceMessage] = useState<
    string | undefined
  >();
  const [accountBootstrapEnabled, setAccountBootstrapEnabled] = useState(false);
  const [workspaceStartup] = useState(() =>
    createWorkspaceStartupController(AsyncStorage, repository),
  );
  const clientRef = useRef<SupabaseClient | undefined>(undefined);
  const syncRuntimeRef = useRef<MobileSyncRuntime | undefined>(undefined);
  const hydrationRequestRef = useRef(0);
  const accountBootstrapEnabledRef = useRef(false);
  const authenticatedUserId =
    auth.status === "authenticated" ? auth.user.id : undefined;
  const authenticatedUserIdRef = useRef(authenticatedUserId);
  const localOwner = useMemo(
    () => localWorkspaceOwnerForAuth(auth.status, authenticatedUserId),
    [auth.status, authenticatedUserId],
  );
  const activeLocalOwnerKey = localOwner
    ? localWorkspaceKey(localOwner)
    : undefined;
  const activeLocalOwnerKeyRef = useRef(activeLocalOwnerKey);
  const visibleLocalWorkspace = useMemo(
    () =>
      activeLocalOwnerKey && loadedLocalOwnerKey === activeLocalOwnerKey
        ? localWorkspace
        : createEmptyState(),
    [activeLocalOwnerKey, loadedLocalOwnerKey, localWorkspace],
  );
  const visibleLocalWorkspaceStatus: LocalWorkspaceStatus =
    activeLocalOwnerKey && loadedLocalOwnerKey === activeLocalOwnerKey
      ? localWorkspaceStatus
      : "loading";
  const visibleLocalWorkspaceMessage =
    activeLocalOwnerKey && loadedLocalOwnerKey === activeLocalOwnerKey
      ? localWorkspaceMessage
      : undefined;
  const visibleCloud = useMemo<CloudHydrationState>(
    () => cloudHydrationForUser(cloud, authenticatedUserId),
    [authenticatedUserId, cloud],
  );
  const visibleSync = useMemo<AppSyncState>(() => {
    if (auth.status !== "authenticated") {
      return { status: "local", pendingCount: 0 };
    }
    return "userId" in sync && sync.userId === auth.user.id
      ? sync
      : {
          userId: auth.user.id,
          status: "loading",
          pendingCount: 0,
        };
  }, [auth, sync]);
  const workspaceEditable =
    visibleLocalWorkspaceStatus === "ready" &&
    (auth.status === "guest" ||
      (auth.status === "authenticated" &&
        "lastSuccessfulSyncAt" in visibleSync &&
        Boolean(visibleSync.lastSuccessfulSyncAt)));

  const resolveClient = useCallback(() => {
    const client = clientRef.current ?? getSupabaseClient();
    clientRef.current = client;
    return client;
  }, []);

  const restoreAccountAuth = useCallback(async () => {
    try {
      const client = resolveClient();
      return await restoreAuthSession(client.auth);
    } catch {
      return {
        type: "FAILED" as const,
        message: "Account services are not configured. Guest Mode is still available.",
      };
    }
  }, [resolveClient]);

  const enterGuestBoundary = useCallback(() => {
    accountBootstrapEnabledRef.current = false;
    setAccountBootstrapEnabled(false);
    authenticatedUserIdRef.current = undefined;
    activeLocalOwnerKeyRef.current = guestWorkspaceKey;
    hydrationRequestRef.current += 1;
    syncRuntimeRef.current?.dispose();
    syncRuntimeRef.current = undefined;
    setCloud({ status: "idle" });
    setSync({ status: "local", pendingCount: 0 });
  }, []);

  const applyGuestStartup = useCallback(
    (result: Extract<WorkspaceStartupResult, { mode: "guest" }>) => {
      if (activeLocalOwnerKeyRef.current !== guestWorkspaceKey) return;
      setLocalWorkspace(result.state);
      setLoadedLocalOwnerKey(guestWorkspaceKey);
      setLocalWorkspaceStatus(result.status);
      setLocalWorkspaceMessage(
        result.status === "error"
          ? "Local progress could not be loaded. Nothing was deleted; try again before saving a First Move."
          : undefined,
      );
    },
    [],
  );

  const restore = useCallback(async () => {
    accountBootstrapEnabledRef.current = true;
    setAccountBootstrapEnabled(true);
    dispatch({ type: "RESTORE_STARTED" });
    const result = await workspaceStartup.enterAccount(restoreAccountAuth);
    if (result?.mode === "account") dispatch(result.authEvent);
  }, [restoreAccountAuth, workspaceStartup]);

  const dispatchSession = useCallback(
    (session: Session | null) => {
      if (!accountBootstrapEnabledRef.current) return;
      workspaceStartup.selectAccount();
      hydrationRequestRef.current += 1;
      authenticatedUserIdRef.current = session?.user.id;
      if (!session) {
        syncRuntimeRef.current?.dispose();
        syncRuntimeRef.current = undefined;
        setCloud({ status: "idle" });
        setSync({ status: "local", pendingCount: 0 });
        dispatch({ type: "SIGNED_OUT" });
        return;
      }
      dispatch({
        type: "AUTHENTICATED",
        user: { id: session.user.id, email: session.user.email },
      });
    },
    [workspaceStartup],
  );

  useEffect(() => {
    authenticatedUserIdRef.current = authenticatedUserId;
    hydrationRequestRef.current += 1;
  }, [authenticatedUserId]);

  useEffect(() => {
    let active = true;
    void workspaceStartup.start(restoreAccountAuth).then((result) => {
      if (!active || !result) return;
      if (result.mode === "guest") {
        enterGuestBoundary();
        applyGuestStartup(result);
        dispatch({ type: "CONTINUE_AS_GUEST" });
        return;
      }
      accountBootstrapEnabledRef.current = true;
      setAccountBootstrapEnabled(true);
      dispatch(result.authEvent);
    });
    return () => {
      active = false;
      workspaceStartup.cancel();
    };
  }, [applyGuestStartup, enterGuestBoundary, restoreAccountAuth, workspaceStartup]);

  useEffect(() => {
    activeLocalOwnerKeyRef.current = activeLocalOwnerKey;
  }, [activeLocalOwnerKey]);

  useEffect(() => {
    if (
      !localOwner ||
      localOwner.kind !== "account" ||
      !activeLocalOwnerKey
    ) {
      return;
    }
    let active = true;
    const owner = localOwner;
    const ownerKey = activeLocalOwnerKey;
    const timer = setTimeout(() => {
      void loadSelectedWorkspace();
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };

    async function loadSelectedWorkspace() {
      try {
        const loaded = await repository.loadLocalWorkspace(owner);
        const reconciled = reconcileRunningCountdown(loaded, Date.now());
        if (reconciled !== loaded) {
          await repository.saveLocalWorkspace(owner, reconciled);
        }
        if (!active || activeLocalOwnerKeyRef.current !== ownerKey) return;
        setLocalWorkspace(reconciled);
        setLoadedLocalOwnerKey(ownerKey);
        setLocalWorkspaceStatus("ready");
        setLocalWorkspaceMessage(undefined);
      } catch {
        if (!active || activeLocalOwnerKeyRef.current !== ownerKey) return;
        setLocalWorkspace(createEmptyState());
        setLoadedLocalOwnerKey(ownerKey);
        setLocalWorkspaceStatus("error");
        setLocalWorkspaceMessage(
          "Local progress could not be loaded. Nothing was deleted; try again before saving a First Move.",
        );
      }
    }
  }, [activeLocalOwnerKey, localOwner]);

  useEffect(() => {
    if (!accountBootstrapEnabled) return;
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
  }, [accountBootstrapEnabled, dispatchSession, resolveClient]);

  useEffect(() => {
    if (!accountBootstrapEnabled) return;
    let client: SupabaseClient;
    try {
      client = resolveClient();
    } catch {
      return;
    }
    const applyRefreshState = (state: AppStateStatus) => {
      if (state === "active") {
        client.auth.startAutoRefresh();
        void syncRuntimeRef.current?.refresh();
      } else {
        client.auth.stopAutoRefresh();
      }
    };
    applyRefreshState(NativeAppState.currentState);
    const subscription = NativeAppState.addEventListener("change", applyRefreshState);
    return () => {
      subscription.remove();
      client.auth.stopAutoRefresh();
    };
  }, [accountBootstrapEnabled, resolveClient]);

  useEffect(() => {
    if (auth.status !== "authenticated") return;
    const userId = auth.user.id;
    const requestId = hydrationRequestRef.current + 1;
    hydrationRequestRef.current = requestId;
    const ownerKey = localWorkspaceKey({ kind: "account", userId });
    const isCurrent = () =>
      hydrationRequestRef.current === requestId &&
      authenticatedUserIdRef.current === userId;
    let client: SupabaseClient;
    try {
      client = resolveClient();
    } catch {
      const timer = setTimeout(() => {
        setCloud({
          status: "error",
          message:
            "Cloud progress could not be loaded or verified. Local data and pending changes were not replaced.",
        });
      }, 0);
      return () => clearTimeout(timer);
    }
    const syncClient: MobileSyncClient = {
      auth: client.auth,
      async rpc(name, parameters) {
        const response = await client.rpc(name, parameters);
        return { data: response.data, error: response.error };
      },
    };
    const runtime = new MobileSyncRuntime({
      userId,
      client: syncClient,
      repository,
      queue: syncQueue,
      isCurrent,
      ...defaultSyncDependencies,
      async applyCanonical(workspace, hydratedAt) {
        await repository.saveCloudWorkspace(userId, workspace, hydratedAt);
        if (!isCurrent()) return;
        await repository.saveLocalWorkspace(
          { kind: "account", userId },
          workspace.state,
        );
        if (!isCurrent()) return;
        setLocalWorkspace(workspace.state);
        setLoadedLocalOwnerKey(ownerKey);
        setLocalWorkspaceStatus("ready");
        setLocalWorkspaceMessage(undefined);
      },
      applyWorkingState(state) {
        if (!isCurrent()) return;
        setLocalWorkspace(state);
        setLoadedLocalOwnerKey(ownerKey);
        setLocalWorkspaceStatus("ready");
        setLocalWorkspaceMessage(undefined);
      },
      setCloudState(state) {
        if (isCurrent()) setCloud(state);
      },
    });
    syncRuntimeRef.current?.dispose();
    syncRuntimeRef.current = runtime;
    const unsubscribe = runtime.subscribe((snapshot) => {
      if (isCurrent()) setSync(snapshot);
    });
    const timer = setTimeout(() => void runtime.start(), 0);
    return () => {
      clearTimeout(timer);
      unsubscribe();
      runtime.dispose();
      if (syncRuntimeRef.current === runtime) syncRuntimeRef.current = undefined;
    };
  }, [auth, resolveClient]);

  const continueAsGuest = useCallback(() => {
    enterGuestBoundary();
    dispatch({ type: "CONTINUE_AS_GUEST" });
    void workspaceStartup.enterGuest().then((result) => {
      if (result?.mode === "guest") applyGuestStartup(result);
    });
  }, [applyGuestStartup, enterGuestBoundary, workspaceStartup]);

  const openSignIn = useCallback(() => {
    accountBootstrapEnabledRef.current = true;
    setAccountBootstrapEnabled(true);
    workspaceStartup.selectAccount();
    dispatch({ type: "OPEN_SIGN_IN" });
  }, [workspaceStartup]);

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
    syncRuntimeRef.current?.dispose();
    syncRuntimeRef.current = undefined;
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
      setSync({ status: "local", pendingCount: 0 });
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
    if (auth.status === "authenticated") {
      await syncRuntimeRef.current?.retry();
    }
  }, [auth]);

  const updateLocalWorkspace = useCallback(
    async (recipe: (current: AppState) => AppState) => {
      if (!localOwner || !activeLocalOwnerKey) return undefined;
      const owner = localOwner;
      const ownerKey = activeLocalOwnerKey;
      try {
        const next =
          owner.kind === "guest"
            ? await repository.updateLocalWorkspace(owner, recipe)
            : await syncRuntimeRef.current?.mutate(recipe);
        if (!next) {
          if (activeLocalOwnerKeyRef.current === ownerKey) {
            setLocalWorkspaceMessage(
              "Cloud editing is available only after this initialized account has a verified working copy.",
            );
          }
          return undefined;
        }
        if (activeLocalOwnerKeyRef.current !== ownerKey) return next;
        setLocalWorkspace(next);
        setLoadedLocalOwnerKey(ownerKey);
        setLocalWorkspaceStatus("ready");
        setLocalWorkspaceMessage(undefined);
        return next;
      } catch {
        if (activeLocalOwnerKeyRef.current !== ownerKey) return undefined;
        setLocalWorkspaceStatus("error");
        setLocalWorkspaceMessage(
          "This local change could not be saved on this device. Your existing progress was not deleted.",
        );
        return undefined;
      }
    },
    [activeLocalOwnerKey, localOwner],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      auth,
      cloud: visibleCloud,
      sync: visibleSync,
      localWorkspace: visibleLocalWorkspace,
      localWorkspaceStatus: visibleLocalWorkspaceStatus,
      localWorkspaceMessage: visibleLocalWorkspaceMessage,
      workspaceEditable,
      continueAsGuest,
      openSignIn,
      sendMagicLink,
      signOut,
      retryAuthRestore: restore,
      refreshCloud,
      updateLocalWorkspace,
    }),
    [
      auth,
      visibleCloud,
      visibleSync,
      visibleLocalWorkspace,
      visibleLocalWorkspaceStatus,
      visibleLocalWorkspaceMessage,
      workspaceEditable,
      continueAsGuest,
      openSignIn,
      sendMagicLink,
      signOut,
      restore,
      refreshCloud,
      updateLocalWorkspace,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;

}

export function useFirstMoveApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error("useFirstMoveApp must be used inside AppProvider.");
  return context;
}
