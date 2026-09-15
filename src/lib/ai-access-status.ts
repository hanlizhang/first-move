export type AiAccessStatusDto =
  | {
      plan: "free";
      accessBasis: "introductory";
      remainingIntroductoryTotal: number;
    }
  | {
      plan: "pro";
      accessBasis: "pro";
      remainingFeatureActionsToday: {
        daily_plan: number;
        toothbrush_verification: number;
        make_smaller: number;
      };
    };

export type WebAiAccessState =
  | { kind: "guest" }
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "ready"; status: AiAccessStatusDto };

export interface WebAiAccessPresentation {
  heading: string;
  summary: string;
  allowances: string[];
  tone: "default" | "success";
}

export async function loadWebAiAccessStatus(
  accessToken: string | undefined,
  request: typeof fetch = fetch,
): Promise<WebAiAccessState> {
  if (!accessToken) return { kind: "guest" };
  try {
    const response = await request("/api/ai-access/status", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.status === 401) return { kind: "guest" };
    if (!response.ok) return { kind: "unavailable" };
    const status = parseAiAccessStatus(await response.json());
    return status ? { kind: "ready", status } : { kind: "unavailable" };
  } catch {
    return { kind: "unavailable" };
  }
}

export function webAiAccessPresentation(
  state: WebAiAccessState,
): WebAiAccessPresentation {
  if (state.kind === "guest") {
    return {
      heading: "Live AI unavailable until sign-in",
      summary: "Sign in to use live AI. Manual and local options remain available.",
      allowances: [],
      tone: "default",
    };
  }
  if (state.kind === "loading") {
    return {
      heading: "Current plan: Checking…",
      summary: "Checking trusted AI access for this account.",
      allowances: [],
      tone: "default",
    };
  }
  if (state.kind === "unavailable") {
    return {
      heading: "Current plan: Unavailable",
      summary: "AI access is temporarily unavailable. Manual and local options still work.",
      allowances: [],
      tone: "default",
    };
  }
  if (state.status.accessBasis === "introductory") {
    return {
      heading: "Current plan: Free",
      summary: `${state.status.remainingIntroductoryTotal} of 5 AI actions remaining`,
      allowances: ["This lifetime introductory allowance is shared across AI features."],
      tone: "default",
    };
  }
  const remaining = state.status.remainingFeatureActionsToday;
  return {
    heading: "Current plan: Pro",
    summary: "Your Pro entitlement is active for this account.",
    allowances: [
      `Plan my day: ${remaining.daily_plan} of 1 remaining today`,
      `Toothbrush verification: ${remaining.toothbrush_verification} of 3 remaining today`,
      `Make this smaller: ${remaining.make_smaller} of 5 remaining today`,
    ],
    tone: "success",
  };
}

function parseAiAccessStatus(value: unknown): AiAccessStatusDto | undefined {
  if (!isRecord(value)) return undefined;
  if (value.accessBasis === "introductory") {
    return value.plan === "free" && isCount(value.remainingIntroductoryTotal, 5)
      ? {
          plan: "free",
          accessBasis: "introductory",
          remainingIntroductoryTotal: value.remainingIntroductoryTotal,
        }
      : undefined;
  }
  if (value.plan !== "pro" || value.accessBasis !== "pro" || !isRecord(value.remainingFeatureActionsToday)) {
    return undefined;
  }
  const remaining = value.remainingFeatureActionsToday;
  if (
    !isCount(remaining.daily_plan, 1) ||
    !isCount(remaining.toothbrush_verification, 3) ||
    !isCount(remaining.make_smaller, 5)
  ) {
    return undefined;
  }
  return {
    plan: "pro",
    accessBasis: "pro",
    remainingFeatureActionsToday: {
      daily_plan: remaining.daily_plan,
      toothbrush_verification: remaining.toothbrush_verification,
      make_smaller: remaining.make_smaller,
    },
  };
}

function isCount(value: unknown, limit: number): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= limit;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
