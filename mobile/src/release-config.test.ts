import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = JSON.parse(
  readFileSync(new URL("../app.json", import.meta.url), "utf8"),
);
const eas = JSON.parse(
  readFileSync(new URL("../eas.json", import.meta.url), "utf8"),
);

test("the first public iOS identity keeps the established application identifiers", () => {
  assert.equal(app.expo.name, "First Move: Start Small");
  assert.equal(app.expo.slug, "first-move-mobile");
  assert.equal(app.expo.scheme, "firstmove");
  assert.equal(app.expo.ios.bundleIdentifier, "app.firstmove.mobile");
  assert.equal(app.expo.android.package, "app.firstmove.mobile");
  assert.equal(app.expo.version, "1.0.0");
  assert.equal(app.expo.ios.buildNumber, "1");
});

test("the first public iOS release is iPhone-only", () => {
  assert.equal(app.expo.ios.supportsTablet, false);
});

test("iOS store builds use the production EAS environment without embedded values", () => {
  assert.equal(eas.cli.appVersionSource, "local");
  assert.deepEqual(eas.build.production, {
    distribution: "store",
    environment: "production",
    ios: { simulator: false },
  });
  assert.equal(eas.build.production.env, undefined);
  assert.deepEqual(eas.submit.production, {});
  assert.doesNotMatch(
    JSON.stringify(eas),
    /EXPO_PUBLIC_REVENUECAT_TEST_API_KEY|OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|REVENUECAT_SECRET_API_KEY|CRON_SECRET|ACCOUNT_DELETION_WORKER_SECRET|ACCOUNT_DELETION_INITIATION_ENABLED/,
  );
});

test("the development simulator profile remains unchanged", () => {
  assert.deepEqual(eas.build["development-simulator"], {
    developmentClient: true,
    distribution: "internal",
    ios: { simulator: true },
  });
});
