import assert from "node:assert/strict";
import test from "node:test";

import { MOBILE_AUTH_CALLBACK_URL, validateMobilePublicConfig } from "./config.ts";

test("accepts only public Expo Supabase configuration and fixes the development callback", () => {
  assert.deepEqual(
    validateMobilePublicConfig({
      EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co/",
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    }),
    {
      supabaseUrl: "https://example.supabase.co",
      supabasePublishableKey: "sb_publishable_test",
      authCallbackUrl: "firstmove://auth/callback",
    },
  );
  assert.equal(MOBILE_AUTH_CALLBACK_URL, "firstmove://auth/callback");
});

test("rejects missing or malformed public configuration without exposing values", () => {
  assert.throws(
    () => validateMobilePublicConfig({ EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test" }),
    /URL is not configured/,
  );
  assert.throws(
    () => validateMobilePublicConfig({ EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co" }),
    /publishable key is not configured/,
  );
  assert.throws(
    () =>
      validateMobilePublicConfig({
        EXPO_PUBLIC_SUPABASE_URL: "not-a-url",
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "secret-looking-value",
      }),
    (error) => {
      assert.doesNotMatch(String(error), /secret-looking-value/);
      return true;
    },
  );
});
