export type CallbackResult =
  | { status: "success" }
  | { status: "invalid"; message: string };

export interface CallbackAuth {
  exchangeCodeForSession(code: string): Promise<{ error: unknown | null }>;
  setSession(tokens: {
    access_token: string;
    refresh_token: string;
  }): Promise<{ error: unknown | null }>;
}

export async function handleAuthCallback(
  callbackUrl: string | null,
  auth: CallbackAuth,
): Promise<CallbackResult> {
  if (!callbackUrl) return invalidCallback();

  let url: URL;
  try {
    url = new URL(callbackUrl);
  } catch {
    return invalidCallback();
  }
  if (url.protocol !== "firstmove:" || url.hostname !== "auth" || url.pathname !== "/callback") {
    return invalidCallback();
  }

  const parameters = callbackParameters(url);
  if (parameters.has("error") || parameters.has("error_code")) return invalidCallback();

  const code = parameters.get("code");
  if (code) {
    try {
      const { error } = await auth.exchangeCodeForSession(code);
      return error ? invalidCallback() : { status: "success" };
    } catch {
      return invalidCallback();
    }
  }

  const accessToken = parameters.get("access_token");
  const refreshToken = parameters.get("refresh_token");
  if (!accessToken || !refreshToken) return invalidCallback();
  try {
    const { error } = await auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    return error ? invalidCallback() : { status: "success" };
  } catch {
    return invalidCallback();
  }
}

function callbackParameters(url: URL): URLSearchParams {
  const parameters = new URLSearchParams(url.search);
  const fragment = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  for (const [key, value] of new URLSearchParams(fragment)) {
    if (!parameters.has(key)) parameters.set(key, value);
  }
  return parameters;
}

function invalidCallback(): CallbackResult {
  return {
    status: "invalid",
    message: "This sign-in link is invalid or expired. Request a new link from Settings.",
  };
}
