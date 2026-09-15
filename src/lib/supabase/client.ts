import { createBrowserClient } from "@supabase/ssr";

import { getSupabasePublicConfig } from "./config.ts";

let browserClient: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  if (browserClient) return browserClient;
  const { url, publishableKey } = getSupabasePublicConfig();
  browserClient = createBrowserClient(url, publishableKey);
  return browserClient;
}

export async function currentSupabaseAccessToken(): Promise<string | undefined> {
  try {
    const { data, error } = await createClient().auth.getSession();
    return error ? undefined : data.session?.access_token;
  } catch {
    return undefined;
  }
}
