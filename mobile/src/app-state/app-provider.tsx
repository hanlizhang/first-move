import {
  AppState as NativeAppState,
  type AppStateStatus,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNetworkState } from "expo-network";
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
  aiAccessForUser,
  type MobileAiAccessState,
} from "../ai/access.ts";
import {
  loadMobileAiAccessStatus,
  requestMobileDayPlan,
  requestMobileToothbrushVerification,
  type DayPlanRequestResult,
  type MobileAiSessionSource,
  type ToothbrushRequestResult,
} from "../ai/client.ts";

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
  summarizePendingMutations,
  type AuthenticatedCatEconomyResult,
  type MobileSyncClient,
  type MobileSyncSnapshot,
} from "../cloud/sync-runtime.ts";
import { createMobileSyncQueue } from "../cloud/sync-queue.ts";
import {
  purchaseGuestCatItem,
  purchaseAvailability,
  consumeGuestCatFood,
  inventoryQuantity,
  type CatPurchaseOutcome,
} from "../domain/cat.ts";
import { catItem, type CatItemId } from "../domain/cat-items.ts";
import {
  createEmptyState,
  type AppState,
  type DailyPlanRecord,
  type PlanningReviewItem,
} from "../domain/models.ts";
import {
  applyConfirmedPlanFirstMove,
  applyPlanningReview,
  validPlanningReview,
} from "../domain/day-planning.ts";
import { reconcileRunningCountdown } from "../domain/sessions.ts";
import {
  createMobileRepository,
  localWorkspaceKey,
} from "../local/repository.ts";
import {
  loadGuestDailyPlans,
  saveGuestDailyPlan,
} from "../local/daily-plans.ts";
import { getFirstMoveApiBaseUrl } from "../config.ts";
import { getSupabaseClient } from "../supabase/client.ts";
import { revenueCatSubscription } from "../subscriptions/revenuecat-native.ts";
import type {
  PurchaseFlowOutcome,
  RevenueCatPresentationSnapshot,
  RestoreFlowOutcome,
  SubscriptionState,
} from "../subscriptions/revenuecat.ts";
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
  subscription: SubscriptionState;
  aiAccess: MobileAiAccessState;
  localWorkspace: AppState;
  dailyPlans: DailyPlanRecord[];
  localWorkspaceStatus: LocalWorkspaceStatus;
  localWorkspaceMessage?: string;
  workspaceEditable: boolean;
  continueAsGuest(): void;
  openSignIn(): void;
  sendMagicLink(email: string): Promise<void>;
  signOut(): Promise<void>;
  retryAuthRestore(): Promise<void>;
  refreshCloud(): Promise<void>;
  refreshAiAccess(): Promise<void>;
  organizeDay(brainDump: string): Promise<DayPlanRequestResult>;
  verifyToothbrush(image: Blob): Promise<ToothbrushRequestResult>;
  confirmDailyPlan(
    dateKey: string,
    items: PlanningReviewItem[],
  ): Promise<AppState | undefined>;
  presentProPaywall(): Promise<PurchaseFlowOutcome>;
  restorePurchases(): Promise<RestoreFlowOutcome>;
  updateLocalWorkspace(
    recipe: (current: AppState) => AppState,
  ): Promise<AppState | undefined>;
  buyCatItem(itemId: CatItemId, localDate: string): Promise<CatEconomyActionOutcome>;
  feedCatFood(itemId: CatItemId, localDate: string): Promise<CatEconomyActionOutcome>;
}

export type CatEconomyActionOutcome =
  | CatPurchaseOutcome
  | "used"
  | "empty"
  | "queued"
  | "queued-offline"
  | "queued-blocked"
  | "error";

export type AppSyncState =
  | { status: "local"; pendingCount: 0 }
  | MobileSyncSnapshot;

const AppContext = createContext<AppContextValue | undefined>(undefined);
const repository = createMobileRepository();
const syncQueue = createMobileSyncQueue(AsyncStorage);
const defaultSyncDependencies = defaultMobileSyncDependencies();
const guestWorkspaceKey = localWorkspaceKey({ kind: "guest" });

export function AppProvider({ children }: { children: ReactNode }) {
  const networkState = useNetworkState();
  const networkKnownOffline =
    networkState.isConnected === false ||
    networkState.isInternetReachable === false;
  const networkKnownOfflineRef = useRef(networkKnownOffline);
  const previousNetworkKnownOfflineRef = useRef(networkKnownOffline);
  const [auth, dispatch] = useReducer(reduceAuthState, initialAuthState);
  const [cloud, setCloud] = useState<CloudHydrationState>({ status: "idle" });
  const [sync, setSync] = useState<AppSyncState>({
    status: "local",
    pendingCount: 0,
  });
  const [subscriptionSnapshot, setSubscriptionSnapshot] =
    useState<RevenueCatPresentationSnapshot>(
      revenueCatSubscription.getPresentationSnapshot,
    );
  const [aiAccess, setAiAccess] = useState<MobileAiAccessState>({
    status: "guest",
  });
  const [localWorkspace, setLocalWorkspace] = useState<AppState>(createEmptyState);
  const [dailyPlanSnapshot, setDailyPlanSnapshot] = useState<{
    ownerKey?: string;
    plans: DailyPlanRecord[];
  }>({ plans: [] });
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
  const aiAccessRequestRef = useRef(0);
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
  const visibleDailyPlans = useMemo(
    () =>
      activeLocalOwnerKey && dailyPlanSnapshot.ownerKey === activeLocalOwnerKey
        ? dailyPlanSnapshot.plans
        : [],
    [activeLocalOwnerKey, dailyPlanSnapshot],
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
          queueSummary: summarizePendingMutations([]),
        };
  }, [auth, sync]);
  const visibleSubscription = useMemo<SubscriptionState>(
    () =>
      authenticatedUserId && subscriptionSnapshot.userId === authenticatedUserId
        ? subscriptionSnapshot.state
        : { status: "unavailable" },
    [authenticatedUserId, subscriptionSnapshot],
  );
  const visibleAiAccess = useMemo(
    () => aiAccessForUser(aiAccess, authenticatedUserId),
    [aiAccess, authenticatedUserId],
  );
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

  const refreshAiAccess = useCallback(async () => {
    const userId = authenticatedUserIdRef.current;
    if (!userId) {
      aiAccessRequestRef.current += 1;
      setAiAccess({ status: "guest" });
      return;
    }
    const requestId = aiAccessRequestRef.current + 1;
    aiAccessRequestRef.current = requestId;
    setAiAccess({ status: "loading", userId });
    try {
      const result = await loadMobileAiAccessStatus({
        apiBaseUrl: getFirstMoveApiBaseUrl(),
        auth: resolveClient().auth as MobileAiSessionSource,
        userId,
      });
      if (
        aiAccessRequestRef.current === requestId &&
        authenticatedUserIdRef.current === userId
      ) {
        setAiAccess(result);
      }
    } catch {
      if (
        aiAccessRequestRef.current === requestId &&
        authenticatedUserIdRef.current === userId
      ) {
        setAiAccess({ status: "unavailable", userId });
      }
    }
  }, [resolveClient]);

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
    aiAccessRequestRef.current += 1;
    syncRuntimeRef.current?.dispose();
    syncRuntimeRef.current = undefined;
    setCloud({ status: "idle" });
    setSync({ status: "local", pendingCount: 0 });
    setAiAccess({ status: "guest" });
  }, []);

  const applyGuestStartup = useCallback(
    (result: Extract<WorkspaceStartupResult, { mode: "guest" }>) => {
      if (activeLocalOwnerKeyRef.current !== guestWorkspaceKey) return;
      setLocalWorkspace(result.state);
      void loadGuestDailyPlans(AsyncStorage).then((plans) => {
        if (activeLocalOwnerKeyRef.current === guestWorkspaceKey) {
          setDailyPlanSnapshot({ ownerKey: guestWorkspaceKey, plans });
        }
      });
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
    void refreshAiAccess();
  }, [authenticatedUserId, refreshAiAccess]);

  useEffect(
    () => revenueCatSubscription.subscribe(setSubscriptionSnapshot),
    [],
  );

  useEffect(() => {
    void revenueCatSubscription.updateIdentity(authenticatedUserId);
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
    const wasOffline = previousNetworkKnownOfflineRef.current;
    networkKnownOfflineRef.current = networkKnownOffline;
    previousNetworkKnownOfflineRef.current = networkKnownOffline;
    if (wasOffline && !networkKnownOffline) {
      void syncRuntimeRef.current?.retry();
    }
  }, [networkKnownOffline]);

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
        void revenueCatSubscription.refresh();
        void refreshAiAccess();
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
  }, [accountBootstrapEnabled, refreshAiAccess, resolveClient]);

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
      online: () => !networkKnownOfflineRef.current,
      async applyCanonical(workspace, hydratedAt) {
        await repository.saveCloudWorkspace(userId, workspace, hydratedAt);
        if (!isCurrent()) return;
        await repository.saveLocalWorkspace(
          { kind: "account", userId },
          workspace.state,
        );
        if (!isCurrent()) return;
        setLocalWorkspace(workspace.state);
        setDailyPlanSnapshot({ ownerKey, plans: workspace.dailyPlans });
        setLoadedLocalOwnerKey(ownerKey);
        setLocalWorkspaceStatus("ready");
        setLocalWorkspaceMessage(undefined);
      },
      applyWorkingState(state, dailyPlans) {
        if (!isCurrent()) return;
        setLocalWorkspace(state);
        if (dailyPlans) setDailyPlanSnapshot({ ownerKey, plans: dailyPlans });
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

  const organizeDay = useCallback(
    async (brainDump: string): Promise<DayPlanRequestResult> => {
      if (auth.status !== "authenticated") {
        return {
          outcome: "failure",
          kind: "sign-in-required",
          message: "Sign in to use live AI planning. Manual planning remains available.",
        };
      }
      let result: DayPlanRequestResult;
      try {
        result = await requestMobileDayPlan(brainDump, {
          apiBaseUrl: getFirstMoveApiBaseUrl(),
          auth: resolveClient().auth as MobileAiSessionSource,
          userId: auth.user.id,
        });
      } catch {
        result = {
          outcome: "failure",
          kind: "service-unavailable",
          message: "AI planning is temporarily unavailable. Manual planning remains available.",
        };
      }
      if (result.outcome === "failure" && result.kind === "sign-in-required") {
        await restore();
      } else {
        void refreshAiAccess();
      }
      return result;
    },
    [auth, refreshAiAccess, resolveClient, restore],
  );

  const verifyToothbrush = useCallback(
    async (image: Blob): Promise<ToothbrushRequestResult> => {
      if (auth.status !== "authenticated") {
        return {
          outcome: "failure",
          kind: "sign-in-required",
          message: "Sign in to use live AI verification, or skip without a reward.",
        };
      }
      let result: ToothbrushRequestResult;
      try {
        result = await requestMobileToothbrushVerification(image, {
          apiBaseUrl: getFirstMoveApiBaseUrl(),
          auth: resolveClient().auth as MobileAiSessionSource,
          userId: auth.user.id,
        });
      } catch {
        result = {
          outcome: "failure",
          kind: "service-unavailable",
          message: "AI verification is temporarily unavailable. You can skip without a reward.",
        };
      }
      if (result.outcome === "failure" && result.kind === "sign-in-required") {
        await restore();
      } else {
        void refreshAiAccess();
      }
      return result;
    },
    [auth, refreshAiAccess, resolveClient, restore],
  );

  const confirmDailyPlan = useCallback(
    async (
      dateKey: string,
      items: PlanningReviewItem[],
    ): Promise<AppState | undefined> => {
      if (!validPlanningReview(items) || !localOwner || !activeLocalOwnerKey) {
        return undefined;
      }
      const ownerKey = activeLocalOwnerKey;
      const plan: DailyPlanRecord = { dateKey, items };
      const hasExistingPlan = visibleDailyPlans.some(
        (candidate) => candidate.dateKey === dateKey,
      );
      const applyReview = (state: AppState) =>
        hasExistingPlan
          ? applyConfirmedPlanFirstMove(state, items)
          : applyPlanningReview(state, items);
      try {
        if (localOwner.kind === "guest") {
          const next = await repository.updateLocalWorkspace(localOwner, applyReview);
          const plans = await saveGuestDailyPlan(AsyncStorage, plan);
          if (activeLocalOwnerKeyRef.current === ownerKey) {
            setLocalWorkspace(next);
            setLoadedLocalOwnerKey(ownerKey);
            setDailyPlanSnapshot({ ownerKey, plans });
          }
          return next;
        }
        const result = await syncRuntimeRef.current?.saveDailyPlan(
          plan,
          applyReview,
        );
        if (!result) return undefined;
        if (activeLocalOwnerKeyRef.current === ownerKey) {
          setLocalWorkspace(result.state);
          setLoadedLocalOwnerKey(ownerKey);
          setDailyPlanSnapshot({ ownerKey, plans: result.dailyPlans });
        }
        return result.state;
      } catch {
        return undefined;
      }
    },
    [activeLocalOwnerKey, localOwner, visibleDailyPlans],
  );

  const presentProPaywall = useCallback(
    () => revenueCatSubscription.presentProPaywall(),
    [],
  );

  const restorePurchases = useCallback(
    () => revenueCatSubscription.restorePurchases(),
    [],
  );

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

  const buyCatItem = useCallback(
    async (itemId: CatItemId, localDate: string): Promise<CatEconomyActionOutcome> => {
      const availability = purchaseAvailability(visibleLocalWorkspace, itemId);
      if (availability !== "available") return availability;
      if (!localOwner || !activeLocalOwnerKey) return "error";
      const ownerKey = activeLocalOwnerKey;
      try {
        if (localOwner.kind === "guest") {
          let outcome: CatPurchaseOutcome = "invalid";
          const next = await repository.updateLocalWorkspace(localOwner, (state) => {
            const result = purchaseGuestCatItem(state, itemId);
            outcome = result.outcome;
            return result.state;
          });
          if (activeLocalOwnerKeyRef.current === ownerKey) {
            setLocalWorkspace(next);
            setLoadedLocalOwnerKey(ownerKey);
          }
          return outcome;
        }
        const result = await syncRuntimeRef.current?.purchaseInventoryItem(
          itemId,
          localDate,
        );
        if (!result) return "error";
        return authenticatedCatOutcome(result, "purchased");
      } catch {
        return "error";
      }
    },
    [activeLocalOwnerKey, localOwner, visibleLocalWorkspace],
  );

  const feedCatFood = useCallback(
    async (itemId: CatItemId, localDate: string): Promise<CatEconomyActionOutcome> => {
      const item = catItem(itemId);
      if (!item || item.kind !== "food") return "invalid";
      if (inventoryQuantity(visibleLocalWorkspace, itemId) < 1) return "empty";
      if (!localOwner || !activeLocalOwnerKey) return "error";
      const ownerKey = activeLocalOwnerKey;
      try {
        if (localOwner.kind === "guest") {
          let outcome: "used" | "empty" | "invalid" = "invalid";
          const next = await repository.updateLocalWorkspace(localOwner, (state) => {
            const result = consumeGuestCatFood(state, itemId);
            outcome = result.outcome;
            return result.state;
          });
          if (activeLocalOwnerKeyRef.current === ownerKey) {
            setLocalWorkspace(next);
            setLoadedLocalOwnerKey(ownerKey);
          }
          return outcome;
        }
        const result = await syncRuntimeRef.current?.consumeInventoryItem(
          itemId,
          localDate,
        );
        if (!result) return "error";
        return authenticatedCatOutcome(result, "used");
      } catch {
        return "error";
      }
    },
    [activeLocalOwnerKey, localOwner, visibleLocalWorkspace],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      auth,
      subscription: visibleSubscription,
      aiAccess: visibleAiAccess,
      cloud: visibleCloud,
      sync: visibleSync,
      localWorkspace: visibleLocalWorkspace,
      dailyPlans: visibleDailyPlans,
      localWorkspaceStatus: visibleLocalWorkspaceStatus,
      localWorkspaceMessage: visibleLocalWorkspaceMessage,
      workspaceEditable,
      continueAsGuest,
      openSignIn,
      sendMagicLink,
      signOut,
      retryAuthRestore: restore,
      refreshCloud,
      refreshAiAccess,
      organizeDay,
      verifyToothbrush,
      confirmDailyPlan,
      presentProPaywall,
      restorePurchases,
      updateLocalWorkspace,
      buyCatItem,
      feedCatFood,
    }),
    [
      auth,
      visibleSubscription,
      visibleAiAccess,
      visibleCloud,
      visibleSync,
      visibleLocalWorkspace,
      visibleDailyPlans,
      visibleLocalWorkspaceStatus,
      visibleLocalWorkspaceMessage,
      workspaceEditable,
      continueAsGuest,
      openSignIn,
      sendMagicLink,
      signOut,
      restore,
      refreshCloud,
      refreshAiAccess,
      organizeDay,
      verifyToothbrush,
      confirmDailyPlan,
      presentProPaywall,
      restorePurchases,
      updateLocalWorkspace,
      buyCatItem,
      feedCatFood,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;

}

export function useFirstMoveApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error("useFirstMoveApp must be used inside AppProvider.");
  return context;
}

function authenticatedCatOutcome(
  result: AuthenticatedCatEconomyResult,
  appliedOutcome: "purchased" | "used",
): CatEconomyActionOutcome {
  if (result.outcome === "applied") return appliedOutcome;
  if (result.outcome !== "queued") return result.outcome;
  if (result.queueReason === "offline") return "queued-offline";
  if (result.queueReason === "blocked-by-earlier") return "queued-blocked";
  return "queued";
}
