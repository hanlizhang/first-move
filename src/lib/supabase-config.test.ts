import assert from "node:assert/strict";
import test from "node:test";

import { validateSupabasePublicConfig } from "./supabase/config.ts";

test("accepts explicitly configured Supabase public values", () => {
  assert.deepEqual(
    validateSupabasePublicConfig("https://example.supabase.co", "sb_publishable_test"),
    {
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable_test",
    },
  );
});

test("rejects a missing Supabase URL", () => {
  assert.throws(
    () => validateSupabasePublicConfig(undefined, "sb_publishable_test"),
    /URL is not configured/,
  );
});

test("rejects a missing Supabase publishable key", () => {
  assert.throws(
    () => validateSupabasePublicConfig("https://example.supabase.co", undefined),
    /publishable key is not configured/,
  );
});
