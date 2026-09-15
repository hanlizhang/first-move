import assert from "node:assert/strict";
import test from "node:test";

import {
  RevenueCatSubscriptionController,
  resolveRevenueCatApiKey,
  type RevenueCatCustomerInfo,
  type RevenueCatCustomerInfoListener,
  type RevenueCatPaywallResult,
  type RevenueCatSdk,
} from "./revenuecat.ts";

const USER_A = "10000000-0000-4000-8000-000000000001";
const USER_B = "20000000-0000-4000-8000-000000000002";

function customerInfo(pro: boolean): RevenueCatCustomerInfo {
  return {
    entitlements: {
      active: pro ? { pro: { isActive: true } } : {},
    },
  };
}

function mockRevenueCat(initialInfo = customerInfo(false)) {
  let configured = false;
  let currentAppUserId = "anonymous-revenuecat-user";
  let currentInfo = initialInfo;
  let listener: RevenueCatCustomerInfoListener | undefined;
  const configureCalls: { apiKey: string; appUserID: string }[] = [];
  const logInCalls: string[] = [];
  let getCustomerInfoCalls = 0;
  let restorePurchasesCalls = 0;
  let presentPaywallCalls = 0;
  let paywallResult: RevenueCatPaywallResult = "cancelled";
  let paywallError = false;
  let restoreError = false;

  const sdk: RevenueCatSdk = {
    async isConfigured() {
      return configured;
    },
    configure(configuration) {
      configureCalls.push(configuration);
      configured = true;
      currentAppUserId = configuration.appUserID;
    },
    async getAppUserID() {
      return currentAppUserId;
    },
    async logIn(appUserID) {
      logInCalls.push(appUserID);
      currentAppUserId = appUserID;
      return { customerInfo: currentInfo };
    },
    async getCustomerInfo() {
      getCustomerInfoCalls += 1;
      return currentInfo;
    },
    async restorePurchases() {
      restorePurchasesCalls += 1;
      if (restoreError) throw new Error("mock restore failure");
      return currentInfo;
    },
    addCustomerInfoUpdateListener(nextListener) {
      listener = nextListener;
    },
  };

  return {
    sdk,
    paywallUi: {
      async presentCurrentOfferingPaywall() {
        presentPaywallCalls += 1;
        if (paywallError) throw new Error("mock paywall failure");
        return paywallResult;
      },
    },
    configureCalls,
    logInCalls,
    get getCustomerInfoCalls() {
      return getCustomerInfoCalls;
    },
    get restorePurchasesCalls() {
      return restorePurchasesCalls;
    },
    get presentPaywallCalls() {
      return presentPaywallCalls;
    },
    setCustomerInfo(nextInfo: RevenueCatCustomerInfo) {
      currentInfo = nextInfo;
    },
    setPaywallResult(nextResult: RevenueCatPaywallResult) {
      paywallResult = nextResult;
    },
    failPaywall() {
      paywallError = true;
    },
    failRestore() {
      restoreError = true;
    },
    emitCustomerInfo(nextInfo: RevenueCatCustomerInfo) {
      listener?.(nextInfo);
    },
  };
}

function controller(
  mock: ReturnType<typeof mockRevenueCat>,
  apiKey = "test_public_sdk_key",
) {
  return new RevenueCatSubscriptionController({
    sdk: mock.sdk,
    paywallUi: mock.paywallUi,
    environment: { EXPO_PUBLIC_REVENUECAT_TEST_API_KEY: apiKey },
    platform: "ios",
    isDevelopment: true,
  });
}

test("Guest Mode does not configure RevenueCat", async () => {
  const mock = mockRevenueCat();
  const subscriptions = controller(mock);

  await subscriptions.updateIdentity(undefined);

  assert.equal(subscriptions.getSnapshot().status, "unavailable");
  assert.deepEqual(mock.configureCalls, []);
  assert.deepEqual(mock.logInCalls, []);
  assert.equal(mock.getCustomerInfoCalls, 0);
});

test("the authenticated Supabase UUID is the RevenueCat App User ID", async () => {
  const mock = mockRevenueCat();
  const subscriptions = controller(mock);

  await subscriptions.updateIdentity(USER_A);
  await subscriptions.updateIdentity(USER_A);

  assert.deepEqual(mock.configureCalls, [
    { apiKey: "test_public_sdk_key", appUserID: USER_A },
  ]);
  assert.deepEqual(mock.logInCalls, []);
});

test("email is never accepted as a RevenueCat App User ID", async () => {
  const mock = mockRevenueCat();
  const subscriptions = controller(mock);

  await subscriptions.updateIdentity("person@example.test");

  assert.equal(subscriptions.getSnapshot().status, "error");
  assert.deepEqual(mock.configureCalls, []);
  assert.deepEqual(mock.logInCalls, []);
});

test("only the active pro entitlement produces Pro state", async () => {
  const proMock = mockRevenueCat(customerInfo(true));
  const proSubscriptions = controller(proMock);
  await proSubscriptions.updateIdentity(USER_A);
  assert.equal(proSubscriptions.getSnapshot().status, "pro");

  const freeMock = mockRevenueCat(customerInfo(false));
  const freeSubscriptions = controller(freeMock);
  await freeSubscriptions.updateIdentity(USER_A);
  assert.equal(freeSubscriptions.getSnapshot().status, "free");

  freeMock.emitCustomerInfo({
    entitlements: { active: { pro: { isActive: false } } },
  });
  assert.equal(freeSubscriptions.getSnapshot().status, "free");

  freeMock.emitCustomerInfo(customerInfo(true));
  assert.equal(freeSubscriptions.getSnapshot().status, "pro");
  freeMock.emitCustomerInfo(customerInfo(false));
  assert.equal(freeSubscriptions.getSnapshot().status, "free");
});

test("sign-out or Guest Mode immediately clears app-visible Pro state", async () => {
  const mock = mockRevenueCat(customerInfo(true));
  const subscriptions = controller(mock);
  await subscriptions.updateIdentity(USER_A);
  assert.equal(subscriptions.getSnapshot().status, "pro");

  await subscriptions.updateIdentity(undefined);
  assert.equal(subscriptions.getSnapshot().status, "unavailable");
  assert.deepEqual(mock.logInCalls, []);

  mock.emitCustomerInfo(customerInfo(true));
  assert.equal(subscriptions.getSnapshot().status, "unavailable");
});

test("account A to account B clears A before identifying and reading B", async () => {
  const mock = mockRevenueCat(customerInfo(true));
  const subscriptions = controller(mock);
  await subscriptions.updateIdentity(USER_A);
  assert.equal(subscriptions.getSnapshot().status, "pro");

  mock.setCustomerInfo(customerInfo(false));
  const switching = subscriptions.updateIdentity(USER_B);
  assert.equal(subscriptions.getSnapshot().status, "loading");
  assert.deepEqual(subscriptions.getPresentationSnapshot(), {
    userId: USER_B,
    state: { status: "loading" },
  });
  mock.emitCustomerInfo(customerInfo(true));
  assert.equal(subscriptions.getSnapshot().status, "loading");

  await switching;
  assert.deepEqual(mock.logInCalls, [USER_B]);
  assert.equal(subscriptions.getSnapshot().status, "free");
});

test("missing RevenueCat API key fails safely without native calls", async () => {
  const mock = mockRevenueCat(customerInfo(true));
  const subscriptions = controller(mock, "   ");

  await subscriptions.updateIdentity(USER_A);

  assert.equal(subscriptions.getSnapshot().status, "unavailable");
  assert.deepEqual(mock.configureCalls, []);
  assert.equal(mock.getCustomerInfoCalls, 0);
});

test("Guest cannot launch the paywall or restore purchases", async () => {
  const mock = mockRevenueCat();
  const subscriptions = controller(mock);

  await subscriptions.updateIdentity(undefined);

  assert.equal(await subscriptions.presentProPaywall(), "unavailable");
  assert.equal(await subscriptions.restorePurchases(), "unavailable");
  assert.equal(mock.presentPaywallCalls, 0);
  assert.equal(mock.restorePurchasesCalls, 0);
});

test("an authenticated Free user can launch the current Offering paywall", async () => {
  const mock = mockRevenueCat();
  const subscriptions = controller(mock);
  await subscriptions.updateIdentity(USER_A);
  const readsBeforePaywall = mock.getCustomerInfoCalls;

  const outcome = await subscriptions.presentProPaywall();

  assert.equal(mock.presentPaywallCalls, 1);
  assert.equal(outcome, "cancelled");
  assert.equal(subscriptions.getSnapshot().status, "free");
  assert.equal(mock.getCustomerInfoCalls, readsBeforePaywall + 1);
});

test("a paywall purchase with active pro updates the plan immediately", async () => {
  const mock = mockRevenueCat();
  const subscriptions = controller(mock);
  await subscriptions.updateIdentity(USER_A);
  mock.setCustomerInfo(customerInfo(true));
  mock.setPaywallResult("purchased");

  assert.equal(await subscriptions.presentProPaywall(), "pro");
  assert.equal(subscriptions.getSnapshot().status, "pro");
});

test("paywall dismissal stays Free and is not reported as an error", async () => {
  const mock = mockRevenueCat();
  const subscriptions = controller(mock);
  await subscriptions.updateIdentity(USER_A);
  mock.setPaywallResult("cancelled");

  assert.equal(await subscriptions.presentProPaywall(), "cancelled");
  assert.equal(subscriptions.getSnapshot().status, "free");
});

test("restore with active pro updates the plan immediately", async () => {
  const mock = mockRevenueCat();
  const subscriptions = controller(mock);
  await subscriptions.updateIdentity(USER_A);
  mock.setCustomerInfo(customerInfo(true));
  const readsBeforeRestore = mock.getCustomerInfoCalls;

  assert.equal(await subscriptions.restorePurchases(), "pro");
  assert.equal(mock.restorePurchasesCalls, 1);
  assert.equal(mock.getCustomerInfoCalls, readsBeforeRestore + 1);
  assert.equal(subscriptions.getSnapshot().status, "pro");
});

test("restore without an active entitlement remains Free", async () => {
  const mock = mockRevenueCat();
  const subscriptions = controller(mock);
  await subscriptions.updateIdentity(USER_A);

  assert.equal(await subscriptions.restorePurchases(), "free");
  assert.equal(subscriptions.getSnapshot().status, "free");
});

test("purchase and restore errors preserve the last verified Settings plan", async () => {
  const paywallMock = mockRevenueCat();
  const paywallSubscriptions = controller(paywallMock);
  await paywallSubscriptions.updateIdentity(USER_A);
  paywallMock.failPaywall();

  assert.equal(await paywallSubscriptions.presentProPaywall(), "error");
  assert.equal(paywallSubscriptions.getSnapshot().status, "free");

  const restoreMock = mockRevenueCat();
  const restoreSubscriptions = controller(restoreMock);
  await restoreSubscriptions.updateIdentity(USER_A);
  restoreMock.failRestore();

  assert.equal(await restoreSubscriptions.restorePurchases(), "error");
  assert.equal(restoreSubscriptions.getSnapshot().status, "free");
});

test("release builds never fall back to the Test Store key", () => {
  assert.equal(
    resolveRevenueCatApiKey(
      { EXPO_PUBLIC_REVENUECAT_TEST_API_KEY: "test_public_sdk_key" },
      "ios",
      false,
    ),
    undefined,
  );
  assert.equal(
    resolveRevenueCatApiKey(
      {
        EXPO_PUBLIC_REVENUECAT_TEST_API_KEY: "test_public_sdk_key",
        EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: "ios_public_sdk_key",
      },
      "ios",
      false,
    ),
    "ios_public_sdk_key",
  );
});
