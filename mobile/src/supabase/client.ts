import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getMobilePublicConfig } from "../config.ts";
import { secureSessionStorage } from "../auth/secure-session-storage.ts";

let client: SupabaseClient | undefined;

export function getSupabaseClient(): SupabaseClient {
  if (client) return client;
  const config = getMobilePublicConfig();
  client = createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: {
      storage: secureSessionStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: "pkce",
    },
    global: {
      headers: { "X-Client-Info": "first-move-mobile-m1e" },
    },
  });
  return client;
}
