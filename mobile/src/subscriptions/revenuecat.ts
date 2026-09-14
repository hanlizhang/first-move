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
  addCustomerInfoUpdateListener(
    listener: RevenueCatCustomerInfoListener,
  ): void;
}

export interface RevenueCatControllerOptions {
  sdk: RevenueCatSdk;
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

  private enqueue(work: () => Promise<void>): Promise<void> {
    const next = this.operation.then(work, work);
    this.operation = next.catch(() => undefined);
    return next;
  }
}

function isSupabaseUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}
