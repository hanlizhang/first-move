export interface MagicLinkAuth {
  signInWithOtp(input: {
    email: string;
    options: { emailRedirectTo: string };
  }): Promise<{ error: { message: string } | null }>;
}

export interface SignOutAuth {
  signOut(): Promise<{ error: { message: string } | null }>;
}

export interface GetUserAuth {
  getUser(): Promise<{
    data: { user: { email?: string } | null };
    error: { message: string } | null;
  }>;
}

export interface CodeExchangeAuth {
  exchangeCodeForSession(code: string): Promise<{ error: { message: string } | null }>;
}

export interface AuthActionResult {
  ok: boolean;
  message: string;
}

export const AUTH_UNAVAILABLE_MESSAGE =
  "Sync across devices is unavailable right now. Guest Mode still works.";

export function buildAuthCallbackUrl(origin: string): string {
  const url = new URL(origin);
  url.pathname = "/auth/callback";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function buildAuthResultUrl(
  requestUrl: string,
  result: "success" | "invalid",
): string {
  const url = new URL("/", requestUrl);
  url.searchParams.set("auth", result === "success" ? "success" : "error");
  return url.toString();
}

export async function requestMagicLink(
  auth: MagicLinkAuth,
  email: string,
  origin: string,
): Promise<AuthActionResult> {
  const normalizedEmail = email.trim();
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    return { ok: false, message: "Enter a valid email address." };
  }

  const { error } = await auth.signInWithOtp({
    email: normalizedEmail,
    options: { emailRedirectTo: buildAuthCallbackUrl(origin) },
  });
  return error
    ? { ok: false, message: "We could not send the link. Please try again." }
    : { ok: true, message: "Check your email for your secure sign-in link." };
}

export async function runMagicLinkSubmission(
  submit: () => Promise<AuthActionResult>,
  setLoading: (loading: boolean) => void,
): Promise<AuthActionResult> {
  setLoading(true);
  try {
    return await submit();
  } catch {
    return {
      ok: false,
      message: AUTH_UNAVAILABLE_MESSAGE,
    };
  } finally {
    setLoading(false);
  }
}

export async function signOut(auth: SignOutAuth): Promise<{ ok: boolean; message: string }> {
  const { error } = await auth.signOut();
  return error
    ? { ok: false, message: "We could not sign you out. Please try again." }
    : { ok: true, message: "Signed out. Your local data is still on this device." };
}

export async function restoredEmail(auth: GetUserAuth): Promise<string | null> {
  const { data, error } = await auth.getUser();
  return error ? null : data.user?.email ?? null;
}

export async function exchangeCallbackCode(
  code: string | null,
  auth: CodeExchangeAuth,
): Promise<"success" | "invalid"> {
  if (!code) return "invalid";
  const { error } = await auth.exchangeCodeForSession(code);
  return error ? "invalid" : "success";
}
