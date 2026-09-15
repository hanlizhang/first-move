export const REVENUECAT_PRO_ENTITLEMENT_ID = "pro" as const;

export type SubscriptionStatus =
  | "unavailable"
  | "loading"
  | "free"
  | "pro"
  | "error";

export interface SubscriptionState {
  status: SubscriptionStatus;
}

export interface RevenueCatPresentationSnapshot {
  userId?: string;
  state: SubscriptionState;
}

export interface RevenueCatPublicEnvironment {
  EXPO_PUBLIC_REVENUECAT_TEST_API_KEY?: string;
  EXPO_PUBLIC_REVENUECAT_IOS_API_KEY?: string;
  EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY?: string;
}

export type RevenueCatPlatform = "ios" | "android" | "other";

export interface RevenueCatCustomerInfo {
  entitlements: {
    active: Record<string, { isActive: boolean } | undefined>;
  };
}

export type RevenueCatCustomerInfoListener = (
  customerInfo: RevenueCatCustomerInfo,
) => void;

export interface RevenueCatSdk {
  isConfigured(): Promise<boolean>;
  configure(configuration: { apiKey: string; appUserID: string }): void;
  getAppUserID(): Promise<string>;
  logIn(appUserID: string): Promise<{ customerInfo: RevenueCatCustomerInfo }>;
  getCustomerInfo(): Promise<RevenueCatCustomerInfo>;
  restorePurchases(): Promise<RevenueCatCustomerInfo>;
  addCustomerInfoUpdateListener(
    listener: RevenueCatCustomerInfoListener,
  ): void;
}

export type RevenueCatPaywallResult =
  | "not-presented"
  | "error"
  | "cancelled"
  | "purchased"
  | "restored";

export interface RevenueCatPaywallUi {
  presentCurrentOfferingPaywall(): Promise<RevenueCatPaywallResult>;
}

export type PurchaseFlowOutcome =
  | "unavailable"
  | "already-pro"
  | "cancelled"
  | "free"
  | "pro"
  | "error";

export type RestoreFlowOutcome = "unavailable" | "free" | "pro" | "error";

export interface RevenueCatControllerOptions {
  sdk: RevenueCatSdk;
  paywallUi: RevenueCatPaywallUi;
  environment: RevenueCatPublicEnvironment;
  platform: RevenueCatPlatform;
  isDevelopment: boolean;
}

const UNAVAILABLE_STATE: SubscriptionState = { status: "unavailable" };
const LOADING_STATE: SubscriptionState = { status: "loading" };
const ERROR_STATE: SubscriptionState = { status: "error" };

export function resolveRevenueCatApiKey(
  environment: RevenueCatPublicEnvironment,
  platform: RevenueCatPlatform,
  isDevelopment: boolean,
): string | undefined {
  if (platform !== "ios" && platform !== "android") return undefined;

  // Development uses only the Test Store key. Release builds deliberately ignore
  // it so they can never silently connect to Test Store.
  const candidate = isDevelopment
    ? environment.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY
    : platform === "ios"
      ? environment.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY
      : environment.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;

  return candidate?.trim() || undefined;
}

export function subscriptionStateFromCustomerInfo(
  customerInfo: RevenueCatCustomerInfo,
): SubscriptionState {
  return customerInfo.entitlements.active[REVENUECAT_PRO_ENTITLEMENT_ID]
    ?.isActive === true
    ? { status: "pro" }
    : { status: "free" };
}

export class RevenueCatSubscriptionController {
  private readonly sdk: RevenueCatSdk;
  private readonly paywallUi: RevenueCatPaywallUi;
  private readonly apiKey?: string;
  private state: SubscriptionState = UNAVAILABLE_STATE;
  private presentationSnapshot: RevenueCatPresentationSnapshot = {
    state: UNAVAILABLE_STATE,
  };
  private targetUserId?: string;
  private identifiedUserId?: string;
  private generation = 0;
  private configurationAttempted = false;
  private listenerAdded = false;
  private operation = Promise.resolve();
  private readonly subscribers = new Set<
    (snapshot: RevenueCatPresentationSnapshot) => void
  >();

  constructor(options: RevenueCatControllerOptions) {
    this.sdk = options.sdk;
    this.paywallUi = options.paywallUi;
    this.apiKey = resolveRevenueCatApiKey(
      options.environment,
      options.platform,
      options.isDevelopment,
    );
  }

  getSnapshot = (): SubscriptionState => this.state;

  getPresentationSnapshot = (): RevenueCatPresentationSnapshot =>
    this.presentationSnapshot;

  subscribe = (
    subscriber: (snapshot: RevenueCatPresentationSnapshot) => void,
  ): (() => void) => {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  };

  updateIdentity(userId: string | undefined): Promise<void> {
    const generation = ++this.generation;
    this.targetUserId = userId;
    this.identifiedUserId = undefined;

    if (!userId) {
      this.publish(UNAVAILABLE_STATE);
      return Promise.resolve();
    }
    if (!isSupabaseUuid(userId)) {
      this.publish(ERROR_STATE);
      return Promise.resolve();
    }
    if (!this.apiKey) {
      this.publish(UNAVAILABLE_STATE);
      return Promise.resolve();
    }

    this.publish(LOADING_STATE);
    return this.enqueue(() => this.identifyAndRefresh(userId, generation));
  }

  refresh(): Promise<void> {
    const userId = this.targetUserId;
    const generation = this.generation;
    if (!userId || this.identifiedUserId !== userId) return Promise.resolve();

    return this.enqueue(async () => {
      try {
        const customerInfo = await this.sdk.getCustomerInfo();
        this.applyCustomerInfo(customerInfo, userId, generation);
      } catch {
        this.applyError(userId, generation);
      }
    });
  }

  presentProPaywall(): Promise<PurchaseFlowOutcome> {
    const userId = this.targetUserId;
    const generation = this.generation;
    if (!this.canRunAuthenticatedAction(userId)) {
      return Promise.resolve("unavailable");
    }
    if (this.state.status === "pro") return Promise.resolve("already-pro");

    return this.enqueue(async () => {
      if (!this.isIdentifiedCurrent(userId, generation)) return "unavailable";

      let result: RevenueCatPaywallResult;
      try {
        // The native adapter intentionally omits an Offering so RevenueCatUI uses
        // the dashboard-configured current/default Offering and its localized prices.
        result = await this.paywallUi.presentCurrentOfferingPaywall();
      } catch {
        await this.refreshAfterAction(userId, generation);
        return "error";
      }

      // RevenueCatUI can close after purchase, restore, dismissal, or an error.
      // Always reconcile against CustomerInfo before reporting the resulting plan.
      await this.refreshAfterAction(userId, generation);
      if (!this.isIdentifiedCurrent(userId, generation)) return "unavailable";

      if (result === "cancelled" || result === "not-presented") {
        return "cancelled";
      }
      if (result === "error") return "error";
      return this.state.status === "pro" ? "pro" : "free";
    });
  }

  restorePurchases(): Promise<RestoreFlowOutcome> {
    const userId = this.targetUserId;
    const generation = this.generation;
    if (!this.canRunAuthenticatedAction(userId)) {
      return Promise.resolve("unavailable");
    }

    return this.enqueue(async () => {
      if (!this.isIdentifiedCurrent(userId, generation)) return "unavailable";

      try {
        const customerInfo = await this.sdk.restorePurchases();
        this.applyCustomerInfo(customerInfo, userId, generation);
      } catch {
        await this.refreshAfterAction(userId, generation);
        return "error";
      }

      await this.refreshAfterAction(userId, generation);
      if (!this.isIdentifiedCurrent(userId, generation)) return "unavailable";
      return this.state.status === "pro" ? "pro" : "free";
    });
  }

  private async identifyAndRefresh(
    userId: string,
    generation: number,
  ): Promise<void> {
    if (!this.isCurrent(userId, generation)) return;

    try {
      const alreadyConfigured = await this.sdk.isConfigured();
      if (!this.isCurrent(userId, generation)) return;

      let customerInfo: RevenueCatCustomerInfo;
      if (!alreadyConfigured) {
        if (this.configurationAttempted) {
          this.applyError(userId, generation);
          return;
        }
        this.configurationAttempted = true;
        this.sdk.configure({ apiKey: this.apiKey!, appUserID: userId });
        this.identifiedUserId = userId;
        this.addCustomerInfoListener();
        customerInfo = await this.sdk.getCustomerInfo();
      } else {
        this.addCustomerInfoListener();
        const currentAppUserId = await this.sdk.getAppUserID();
        if (!this.isCurrent(userId, generation)) return;
        if (currentAppUserId === userId) {
          this.identifiedUserId = userId;
          customerInfo = await this.sdk.getCustomerInfo();
        } else {
          const result = await this.sdk.logIn(userId);
          if (!this.isCurrent(userId, generation)) return;
          this.identifiedUserId = userId;
          customerInfo = result.customerInfo;
        }
      }

      this.applyCustomerInfo(customerInfo, userId, generation);
    } catch {
      this.applyError(userId, generation);
    }
  }

  private addCustomerInfoListener(): void {
    if (this.listenerAdded) return;
    this.sdk.addCustomerInfoUpdateListener((customerInfo) => {
      const userId = this.targetUserId;
      if (!userId || this.identifiedUserId !== userId) return;
      this.publish(subscriptionStateFromCustomerInfo(customerInfo));
    });
    this.listenerAdded = true;
  }

  private applyCustomerInfo(
    customerInfo: RevenueCatCustomerInfo,
    userId: string,
    generation: number,
  ): void {
    if (!this.isCurrent(userId, generation)) return;
    this.identifiedUserId = userId;
    this.publish(subscriptionStateFromCustomerInfo(customerInfo));
  }

  private applyError(userId: string, generation: number): void {
    if (!this.isCurrent(userId, generation)) return;
    this.identifiedUserId = undefined;
    this.publish(ERROR_STATE);
  }

  private async refreshAfterAction(
    userId: string,
    generation: number,
  ): Promise<void> {
    if (!this.isIdentifiedCurrent(userId, generation)) return;
    try {
      const customerInfo = await this.sdk.getCustomerInfo();
      this.applyCustomerInfo(customerInfo, userId, generation);
    } catch {
      // An action-specific refresh failure must not erase the last verified plan.
    }
  }

  private canRunAuthenticatedAction(
    userId: string | undefined,
  ): userId is string {
    return Boolean(
      userId &&
        this.identifiedUserId === userId &&
        (this.state.status === "free" || this.state.status === "pro"),
    );
  }

  private isIdentifiedCurrent(userId: string, generation: number): boolean {
    return (
      this.isCurrent(userId, generation) && this.identifiedUserId === userId
    );
  }

  private isCurrent(userId: string, generation: number): boolean {
    return this.targetUserId === userId && this.generation === generation;
  }

  private publish(state: SubscriptionState): void {
    this.state = state;
    this.presentationSnapshot = { userId: this.targetUserId, state };
    for (const subscriber of this.subscribers) {
      subscriber(this.presentationSnapshot);
    }
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const next = this.operation.then(work, work);
    this.operation = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}

function isSupabaseUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}
