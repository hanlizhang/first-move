import { Platform } from "react-native";
import Purchases, { type CustomerInfo } from "react-native-purchases";
import RevenueCatUI, { PAYWALL_RESULT } from "react-native-purchases-ui";

import {
  RevenueCatSubscriptionController,
  type RevenueCatCustomerInfo,
  type RevenueCatCustomerInfoListener,
  type RevenueCatPaywallResult,
  type RevenueCatPlatform,
  type RevenueCatSdk,
} from "./revenuecat.ts";

const sdk: RevenueCatSdk = {
  isConfigured: () => Purchases.isConfigured(),
  configure: (configuration) => Purchases.configure(configuration),
  getAppUserID: () => Purchases.getAppUserID(),
  logIn: async (appUserID) => {
    const result = await Purchases.logIn(appUserID);
    return { customerInfo: asCustomerInfo(result.customerInfo) };
  },
  getCustomerInfo: async () => asCustomerInfo(await Purchases.getCustomerInfo()),
  restorePurchases: async () =>
    asCustomerInfo(await Purchases.restorePurchases()),
  addCustomerInfoUpdateListener: (listener) => {
    Purchases.addCustomerInfoUpdateListener(asNativeListener(listener));
  },
};

export const revenueCatSubscription = new RevenueCatSubscriptionController({
  sdk,
  paywallUi: {
    async presentCurrentOfferingPaywall() {
      const result = await RevenueCatUI.presentPaywall({
        displayCloseButton: true,
      });
      return asPaywallResult(result);
    },
  },
  environment: {
    EXPO_PUBLIC_REVENUECAT_TEST_API_KEY:
      process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY,
    EXPO_PUBLIC_REVENUECAT_IOS_API_KEY:
      process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
    EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY:
      process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
  },
  platform: revenueCatPlatform(Platform.OS),
  isDevelopment: __DEV__,
});

function revenueCatPlatform(platform: string): RevenueCatPlatform {
  if (platform === "ios" || platform === "android") return platform;
  return "other";
}

function asNativeListener(
  listener: RevenueCatCustomerInfoListener,
): (customerInfo: CustomerInfo) => void {
  return (customerInfo) => listener(asCustomerInfo(customerInfo));
}

function asCustomerInfo(customerInfo: CustomerInfo): RevenueCatCustomerInfo {
  return customerInfo;
}

function asPaywallResult(result: PAYWALL_RESULT): RevenueCatPaywallResult {
  switch (result) {
    case PAYWALL_RESULT.NOT_PRESENTED:
      return "not-presented";
    case PAYWALL_RESULT.ERROR:
      return "error";
    case PAYWALL_RESULT.CANCELLED:
      return "cancelled";
    case PAYWALL_RESULT.PURCHASED:
      return "purchased";
    case PAYWALL_RESULT.RESTORED:
      return "restored";
  }
}
