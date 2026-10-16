import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const mobileRoot = fileURLToPath(new URL("../", import.meta.url));
const environment = { ...process.env, EXPO_NO_DOTENV: "1", EXPO_OFFLINE: "1" };
const expo = fileURLToPath(new URL("../node_modules/expo/bin/cli", import.meta.url));

for (const type of ["public", "introspect"]) {
  const config = JSON.parse(execFileSync(process.execPath, [expo, "config", "--type", type, "--json"], {
    cwd: mobileRoot,
    env: environment,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  }));
  assert.equal(config.name, "First Move: Start Small");
  assert.equal(config.scheme, "firstmove");
  assert.equal(config.version, "1.0.0");
  assert.equal(config.ios.bundleIdentifier, "app.firstmove.mobile");
  assert.equal(config.ios.buildNumber, "2");
  assert.equal(config.ios.supportsTablet, false);
  assert.equal(config.ios.icon, "./assets/images/icon.png");
  assert.doesNotMatch(JSON.stringify(config), /revenuecat|react-native-purchases|expo-image-picker|expo-image-manipulator|NSCameraUsageDescription|NSPhotoLibrary|NSMicrophoneUsageDescription|NSUserTrackingUsageDescription/i);
  if (type === "introspect") {
    const ios = config._internal.modResults.ios;
    assert.equal(ios.infoPlist.CFBundleVersion, "2");
    assert.equal(ios.infoPlist.CFBundleShortVersionString, "1.0.0");
    assert.ok(ios.infoPlist.CFBundleURLTypes.some((entry) => entry.CFBundleURLSchemes.includes("firstmove")));
    assert.doesNotMatch(JSON.stringify(ios.entitlements), /payments|purchase|storekit/i);
  }
  console.log(`Expo ${type}: paid iPhone 1.0.0 (2) identity and permission checks passed.`);
}
