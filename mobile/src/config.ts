export const MOBILE_AUTH_CALLBACK_URL = "firstmove://auth/callback" as const;

export interface MobilePublicConfig {
  supabaseUrl: string;
  supabasePublishableKey: string;
  authCallbackUrl: typeof MOBILE_AUTH_CALLBACK_URL;
}

export interface MobilePublicEnvironment {
  EXPO_PUBLIC_SUPABASE_URL?: string;
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
}

export interface MobileAiPublicEnvironment {
  EXPO_PUBLIC_FIRST_MOVE_API_BASE_URL?: string;
}

export function validateMobilePublicConfig(
  environment: MobilePublicEnvironment,
): MobilePublicConfig {
  const supabaseUrl = environment.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const supabasePublishableKey = environment.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!supabaseUrl) throw new Error("Supabase URL is not configured.");
  if (!supabasePublishableKey) throw new Error("Supabase publishable key is not configured.");

  let parsed: URL;
  try {
    parsed = new URL(supabaseUrl);
  } catch {
    throw new Error("Supabase authentication is not configured.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Supabase authentication is not configured.");
  }

  return {
    supabaseUrl: parsed.toString().replace(/\/$/, ""),
    supabasePublishableKey,
    authCallbackUrl: MOBILE_AUTH_CALLBACK_URL,
  };
}

export function getMobilePublicConfig(): MobilePublicConfig {
  return validateMobilePublicConfig({
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}

export function validateFirstMoveApiBaseUrl(
  environment: MobileAiPublicEnvironment,
): string {
  const configured = environment.EXPO_PUBLIC_FIRST_MOVE_API_BASE_URL?.trim();
  if (!configured) throw new Error("First Move AI server is not configured.");
  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error("First Move AI server is not configured.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("First Move AI server is not configured.");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("First Move AI server is not configured.");
  }
  return parsed.toString().replace(/\/$/, "");
}

export function getFirstMoveApiBaseUrl(): string {
  return validateFirstMoveApiBaseUrl({
    EXPO_PUBLIC_FIRST_MOVE_API_BASE_URL:
      process.env.EXPO_PUBLIC_FIRST_MOVE_API_BASE_URL,
  });
}
