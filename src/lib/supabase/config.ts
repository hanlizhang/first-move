export interface SupabasePublicConfig {
  url: string;
  publishableKey: string;
}

export function validateSupabasePublicConfig(
  url: string | undefined,
  publishableKey: string | undefined,
): SupabasePublicConfig {
  if (!url) {
    throw new Error("Supabase URL is not configured.");
  }
  if (!publishableKey) {
    throw new Error("Supabase publishable key is not configured.");
  }
  if (!URL.canParse(url)) {
    throw new Error("Supabase authentication is not configured.");
  }

  return { url, publishableKey };
}

export function getSupabasePublicConfig(): SupabasePublicConfig {
  return validateSupabasePublicConfig(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
