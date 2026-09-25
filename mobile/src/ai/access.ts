export type AiAccessStatus =
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

export type MobileAiAccessState =
  | { status: "guest" }
  | { status: "loading"; userId: string }
  | { status: "sign-in-required"; userId: string }
  | { status: "unavailable"; userId: string }
  | { status: "ready"; userId: string; access: AiAccessStatus };

export interface MobileAiAccessPresentation {
  heading: string;
  summary: string;
  allowances: string[];
  tone: "default" | "success";
}

export function parseAiAccessStatus(value: unknown): AiAccessStatus | undefined {
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
  if (
    value.plan !== "pro" ||
    value.accessBasis !== "pro" ||
    !isRecord(value.remainingFeatureActionsToday)
  ) {
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

export function aiAccessForUser(
  state: MobileAiAccessState,
  userId?: string,
): MobileAiAccessState {
  if (!userId) return { status: "guest" };
  return "userId" in state && state.userId === userId
    ? state
    : { status: "loading", userId };
}

export function mobileAiAccessPresentation(
  state: MobileAiAccessState,
): MobileAiAccessPresentation {
  if (state.status === "guest") {
    return {
      heading: "Sign in for live AI",
      summary: "Live AI requires an account. Manual planning and local First Moves remain available.",
      allowances: [],
      tone: "default",
    };
  }
  if (state.status === "loading") {
    return {
      heading: "Checking AI access…",
      summary: "Checking this account with the First Move server.",
      allowances: [],
      tone: "default",
    };
  }
  if (state.status === "sign-in-required") {
    return {
      heading: "Sign in again for live AI",
      summary: "The current secure session is missing or expired. Manual and local paths still work.",
      allowances: [],
      tone: "default",
    };
  }
  if (state.status === "unavailable") {
    return {
      heading: "AI access unavailable",
      summary: "Live AI is temporarily unavailable. Manual and local paths still work.",
      allowances: [],
      tone: "default",
    };
  }
  if (state.access.accessBasis === "introductory") {
    return {
      heading: "First Move AI · Free",
      summary: `${state.access.remainingIntroductoryTotal} of 5 AI actions remaining`,
      allowances: ["This lifetime introductory allowance is shared across AI features."],
      tone: "default",
    };
  }
  const remaining = state.access.remainingFeatureActionsToday;
  return {
    heading: "First Move AI · Pro",
    summary: "Daily allowances are checked and enforced by the server.",
    allowances: [
      `Plan my day: ${remaining.daily_plan} of 1 remaining today`,
      `Toothbrush verification: ${remaining.toothbrush_verification} of 3 remaining today`,
    ],
    tone: "success",
  };
}

export function featureRemaining(
  state: MobileAiAccessState,
  feature: "daily_plan" | "toothbrush_verification",
): number | undefined {
  if (state.status !== "ready") return undefined;
  return state.access.accessBasis === "introductory"
    ? state.access.remainingIntroductoryTotal
    : state.access.remainingFeatureActionsToday[feature];
}

function isCount(value: unknown, limit: number): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= limit;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
