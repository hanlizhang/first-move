import { MOBILE_AUTH_CALLBACK_URL } from "../config.ts";

export interface MagicLinkAuth {
  signInWithOtp(input: {
    email: string;
    options: { emailRedirectTo: string };
  }): Promise<{ error: unknown | null }>;
}

export interface AuthActionResult {
  ok: boolean;
  message: string;
}

export async function requestMagicLink(
  auth: MagicLinkAuth,
  email: string,
): Promise<AuthActionResult> {
  const normalizedEmail = email.trim();
  if (!isEmail(normalizedEmail)) {
    return { ok: false, message: "Enter a valid email address." };
  }
  try {
    const { error } = await auth.signInWithOtp({
      email: normalizedEmail,
      options: { emailRedirectTo: MOBILE_AUTH_CALLBACK_URL },
    });
    return error
      ? { ok: false, message: "We could not send the link. Please try again." }
      : { ok: true, message: "Check your email for your secure sign-in link." };
  } catch {
    return {
      ok: false,
      message: "Sync across devices is unavailable right now. Guest Mode still works.",
    };
  }
}

function isEmail(value: string): boolean {
  return value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
