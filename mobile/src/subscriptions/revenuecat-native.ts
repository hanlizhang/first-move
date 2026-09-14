import { Platform } from "react-native";
import Purchases, { type CustomerInfo } from "react-native-purchases";

import {
  RevenueCatSubscriptionController,
  type RevenueCatCustomerInfo,
  type RevenueCatCustomerInfoListener,
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
  addCustomerInfoUpdateListener: (listener) => {
    Purchases.addCustomerInfoUpdateListener(asNativeListener(listener));
  },
};

export const revenueCatSubscription = new RevenueCatSubscriptionController({
  sdk,
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
