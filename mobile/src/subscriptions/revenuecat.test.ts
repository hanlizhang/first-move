import assert from "node:assert/strict";
import test from "node:test";

import {
  RevenueCatSubscriptionController,
  resolveRevenueCatApiKey,
  type RevenueCatCustomerInfo,
  type RevenueCatCustomerInfoListener,
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
    addCustomerInfoUpdateListener(nextListener) {
      listener = nextListener;
    },
  };

  return {
    sdk,
    configureCalls,
    logInCalls,
    get getCustomerInfoCalls() {
      return getCustomerInfoCalls;
    },
    setCustomerInfo(nextInfo: RevenueCatCustomerInfo) {
      currentInfo = nextInfo;
    },
    emitCustomerInfo(nextInfo: RevenueCatCustomerInfo) {
      listener?.(nextInfo);
    },
  };
}

function controller(sdk: RevenueCatSdk, apiKey = "test_public_sdk_key") {
  return new RevenueCatSubscriptionController({
    sdk,
    environment: { EXPO_PUBLIC_REVENUECAT_TEST_API_KEY: apiKey },
    platform: "ios",
    isDevelopment: true,
  });
}

test("Guest Mode does not configure RevenueCat", async () => {
  const mock = mockRevenueCat();
  const subscriptions = controller(mock.sdk);

  await subscriptions.updateIdentity(undefined);

  assert.equal(subscriptions.getSnapshot().status, "unavailable");
  assert.deepEqual(mock.configureCalls, []);
  assert.deepEqual(mock.logInCalls, []);
  assert.equal(mock.getCustomerInfoCalls, 0);
});

test("the authenticated Supabase UUID is the RevenueCat App User ID", async () => {
  const mock = mockRevenueCat();
  const subscriptions = controller(mock.sdk);

  await subscriptions.updateIdentity(USER_A);
  await subscriptions.updateIdentity(USER_A);

  assert.deepEqual(mock.configureCalls, [
    { apiKey: "test_public_sdk_key", appUserID: USER_A },
  ]);
  assert.deepEqual(mock.logInCalls, []);
});

test("email is never accepted as a RevenueCat App User ID", async () => {
  const mock = mockRevenueCat();
  const subscriptions = controller(mock.sdk);

  await subscriptions.updateIdentity("person@example.test");

  assert.equal(subscriptions.getSnapshot().status, "error");
  assert.deepEqual(mock.configureCalls, []);
  assert.deepEqual(mock.logInCalls, []);
});

test("only the active pro entitlement produces Pro state", async () => {
  const proMock = mockRevenueCat(customerInfo(true));
  const proSubscriptions = controller(proMock.sdk);
  await proSubscriptions.updateIdentity(USER_A);
  assert.equal(proSubscriptions.getSnapshot().status, "pro");

  const freeMock = mockRevenueCat(customerInfo(false));
  const freeSubscriptions = controller(freeMock.sdk);
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
  const subscriptions = controller(mock.sdk);
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
  const subscriptions = controller(mock.sdk);
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
  const subscriptions = controller(mock.sdk, "   ");

  await subscriptions.updateIdentity(USER_A);

  assert.equal(subscriptions.getSnapshot().status, "unavailable");
  assert.deepEqual(mock.configureCalls, []);
  assert.equal(mock.getCustomerInfoCalls, 0);
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
