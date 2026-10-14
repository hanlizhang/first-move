import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const sourceRoot = new URL("./", import.meta.url);
const sources = readdirSync(sourceRoot, { recursive: true, encoding: "utf8" })
  .filter((name) => /\.tsx?$/.test(name) && !name.endsWith(".test.ts") && !name.startsWith("test-fixtures/"))
  .map((name) => ({ name, source: readFileSync(new URL(name, sourceRoot), "utf8") }));
const ui = sources.filter(({ name }) => name.endsWith(".tsx"));
const provider = sources.find(({ name }) => name === "app-state/app-provider.tsx")!.source;
const app = JSON.parse(readFileSync(new URL("../app.json", import.meta.url), "utf8"));
const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));

test("every Mobile UI file is free of paid tiers, recurring prices, AI controls, and photo capture", () => {
  for (const { name, source } of ui) {
    assert.doesNotMatch(source, /Upgrade to Pro|Restore purchases|First Move Pro|Manage Apple subscription|paywall|\bmonthly\b|\bannual\b|\bAI\b|aiAccess|quota|Verify photo|Take photo|Choose image|\$\d/i, name);
  }
});

test("Mobile cannot configure, identify, refresh, or present RevenueCat or StoreKit purchases", () => {
  for (const { name, source } of sources) {
    assert.doesNotMatch(source, /revenuecat|react-native-purchases|paywall|restorePurchases|SubscriptionState|entitlements|StoreKit|appStoreReceipt|validateReceipt/i, name);
  }
  assert.doesNotMatch(provider, /SubscriptionPanel|subscriptionSnapshot|presentProPaywall/);
  assert.match(provider, /workspaceStartup\.start\(restoreAccountAuth\)/);
  assert.match(provider, /client\.auth\.startAutoRefresh\(\)/);
  assert.match(provider, /syncRuntimeRef\.current\?\.refresh\(\)/);
});

test("the only Mobile First Move HTTP endpoint is account deletion, with no live AI or access requests", () => {
  const endpoints = new Set<string>();
  for (const { name, source } of sources) {
    assert.doesNotMatch(source, /openai|ai-access|organize-day|verify-toothbrush|make[_-]smaller|requestMobileDayPlan|requestMobileToothbrush|refreshAiAccess/i, name);
    for (const match of source.matchAll(/\/api\/[a-z\d/-]+/gi)) endpoints.add(match[0]);
    // Audit all direct network primitives, including any newly introduced source file.
    const syntax = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      if (ts.isIdentifier(node) && /^(fetch|XMLHttpRequest|WebSocket)$/.test(node.text)) {
        assert.equal(name, "account-deletion/account-deletion.ts", `New direct network path: ${name}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(syntax);
  }
  assert.deepEqual([...endpoints], ["/api/account-deletion/initiate"]);
});

test("the release dependency graph excludes purchase SDKs and AI-only photo modules", () => {
  for (const name of Object.keys(lock.packages)) {
    assert.doesNotMatch(name, /revenuecat|react-native-purchases|expo-image-picker|expo-image-manipulator|expo-image-loader/i);
  }
  for (const name of ["expo-file-system", "expo-image-picker", "expo-image-manipulator", "react-native-purchases", "react-native-purchases-ui"]) {
    assert.equal(lock.packages[""].dependencies[name], undefined);
  }
  for (const { name, source } of sources) {
    assert.doesNotMatch(source, /expo-image-picker|expo-image-manipulator|expo-file-system|requestCameraPermissions|requestMediaLibraryPermissions/, name);
  }
});

test("Expo declares no photo, camera, microphone, tracking, or purchase permission/plugin", () => {
  assert.doesNotMatch(JSON.stringify(app.expo), /image-picker|image-manipulator|NSCameraUsageDescription|NSPhotoLibrary|NSMicrophoneUsageDescription|NSUserTrackingUsageDescription|StoreKit|in-app-payments/i);
  assert.equal(app.expo.ios.supportsTablet, false);
  assert.equal(app.expo.ios.icon, "./assets/images/icon.png");
});

test("manual planning retains Guest and owner-scoped save paths and confirmed Focus handoff", () => {
  assert.match(provider, /localOwner\.kind === "guest"/);
  assert.match(provider, /saveGuestDailyPlan\(AsyncStorage, plan\)/);
  assert.match(provider, /syncRuntimeRef\.current\?\.saveDailyPlan\(/);
  assert.match(provider, /applyConfirmedPlanFirstMove\(state, items\)/);
  const planner = sources.find(({ name }) => name === "components/day-planner.tsx")!.source;
  assert.match(planner, /blankPlanningReviewItem\(\)/);
  assert.match(planner, /confirmDailyPlan\(dateKey, items\)/);
  assert.match(planner, /router\.push\("\/\(tabs\)\/focus"\)/);
});

test("public Mobile environment example requires no purchase or AI configuration", () => {
  const example = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  assert.deepEqual(example.trim().split("\n").map((line) => line.split("=")[0]), [
    "EXPO_PUBLIC_SUPABASE_URL",
    "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "EXPO_PUBLIC_FIRST_MOVE_API_BASE_URL",
  ]);
  assert.match(example, /https:\/\/firstmovestartsmall\.com/);
});
