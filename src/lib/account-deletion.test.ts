import assert from "node:assert/strict";
import test from "node:test";

import {
  ACCOUNT_DELETION_CONFIRMATION,
  ACCOUNT_DELETION_RELEASE_VALUE,
  deletionIdentityFromVerifiedClaims,
  handleAccountDeletionInitiation,
  hasRecentInteractiveAuthentication,
} from "./account-deletion.ts";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const FORGED_USER_ID = "20000000-0000-4000-8000-000000000002";
const NOW_SECONDS = 1_800_000_000;
const ENABLED_ENVIRONMENT = {
  ACCOUNT_DELETION_INITIATION_ENABLED: ACCOUNT_DELETION_RELEASE_VALUE,
};

test("the deletion route fails closed while its release gate is disabled", async () => {
  let verificationCalls = 0;
  let initiationCalls = 0;
  const response = await handleAccountDeletionInitiation(deletionRequest(), {
    environment: {},
    verifyBearer: async () => {
      verificationCalls += 1;
      return recentIdentity();
    },
    initiate: async () => {
      initiationCalls += 1;
      return "initiated";
    },
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: "unavailable" });
  assert.equal(verificationCalls, 0);
  assert.equal(initiationCalls, 0);
});

test("missing and malformed bearer authentication are denied", async () => {
  for (const authorization of [null, "Basic secret", "Bearer", "Bearer two tokens"]) {
    let verificationCalls = 0;
    const response = await handleAccountDeletionInitiation(
      deletionRequest(authorization),
      {
        environment: ENABLED_ENVIRONMENT,
        verifyBearer: async () => {
          verificationCalls += 1;
          return recentIdentity();
        },
      },
    );
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { status: "denied" });
    assert.equal(verificationCalls, 0);
  }
});

test("an invalid or anonymous verified identity is denied", async () => {
  const response = await handleAccountDeletionInitiation(deletionRequest(), {
    environment: ENABLED_ENVIRONMENT,
    verifyBearer: async () => null,
  });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { status: "denied" });
});

test("verified claims must match the current non-anonymous Supabase user", () => {
  const user = { id: USER_ID, is_anonymous: false };
  const claims = {
    sub: USER_ID,
    role: "authenticated",
    is_anonymous: false,
    amr: [{ method: "magiclink", timestamp: NOW_SECONDS }],
  };
  assert.deepEqual(deletionIdentityFromVerifiedClaims(user, claims), {
    userId: USER_ID,
    amr: claims.amr,
  });
  assert.equal(
    deletionIdentityFromVerifiedClaims(user, {
      ...claims,
      sub: FORGED_USER_ID,
    }),
    null,
  );
  assert.equal(
    deletionIdentityFromVerifiedClaims(
      { ...user, is_anonymous: true },
      claims,
    ),
    null,
  );
  assert.equal(
    deletionIdentityFromVerifiedClaims(user, {
      ...claims,
      role: "service_role",
    }),
    null,
  );
});

test("the verified bearer UUID is the only deletion target", async () => {
  let initiatedUser = "";
  const response = await handleAccountDeletionInitiation(
    deletionRequest("Bearer verified-token", {
      confirmation: ACCOUNT_DELETION_CONFIRMATION,
      userId: FORGED_USER_ID,
    }, { "X-User-Id": FORGED_USER_ID }),
    {
      environment: ENABLED_ENVIRONMENT,
      now: () => new Date(NOW_SECONDS * 1_000),
      verifyBearer: async (token) => {
        assert.equal(token, "verified-token");
        return recentIdentity();
      },
      initiate: async (userId) => {
        initiatedUser = userId;
        return "initiated";
      },
    },
  );
  assert.equal(response.status, 202);
  assert.equal(initiatedUser, USER_ID);
  assert.deepEqual(await response.json(), { status: "in_progress" });
});

test("magic-link, OTP, and initial email signup AMR timestamps count as interactive", () => {
  for (const method of ["magiclink", "otp", "email/signup"]) {
    assert.equal(
      hasRecentInteractiveAuthentication(
        [{ method, timestamp: NOW_SECONDS - 300 }],
        NOW_SECONDS,
      ),
      true,
    );
  }
});

test("expired interactive authentication is rejected", async () => {
  let initiationCalls = 0;
  const response = await handleAccountDeletionInitiation(deletionRequest(), {
    environment: ENABLED_ENVIRONMENT,
    now: () => new Date(NOW_SECONDS * 1_000),
    verifyBearer: async () => ({
      userId: USER_ID,
      amr: [{ method: "magiclink", timestamp: NOW_SECONDS - 301 }],
    }),
    initiate: async () => {
      initiationCalls += 1;
      return "initiated";
    },
  });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    status: "reauthentication_required",
  });
  assert.equal(initiationCalls, 0);
});

test("silent refresh and JWT issue time never count as reauthentication", () => {
  assert.equal(
    hasRecentInteractiveAuthentication(
      [
        { method: "magiclink", timestamp: NOW_SECONDS - 600 },
        { method: "token_refresh", timestamp: NOW_SECONDS },
      ],
      NOW_SECONDS,
    ),
    false,
  );
  assert.equal(
    hasRecentInteractiveAuthentication(
      [{ method: "token_refresh", timestamp: NOW_SECONDS }],
      NOW_SECONDS,
    ),
    false,
  );
  assert.equal(
    hasRecentInteractiveAuthentication(["magiclink"], NOW_SECONDS),
    false,
  );
});

test("future and malformed AMR timestamps fail closed", () => {
  assert.equal(
    hasRecentInteractiveAuthentication(
      [{ method: "magiclink", timestamp: NOW_SECONDS + 1 }],
      NOW_SECONDS,
    ),
    false,
  );
  assert.equal(
    hasRecentInteractiveAuthentication(
      [{ method: "magiclink", timestamp: String(NOW_SECONDS) }],
      NOW_SECONDS,
    ),
    false,
  );
});

test("explicit confirmation is exact and required", async () => {
  for (const body of [
    {},
    { confirmation: "delete my account" },
    { confirmation: ` ${ACCOUNT_DELETION_CONFIRMATION}` },
    { confirmation: `${ACCOUNT_DELETION_CONFIRMATION} ` },
  ]) {
    let initiationCalls = 0;
    const response = await handleAccountDeletionInitiation(
      deletionRequest("Bearer verified-token", body),
      {
        environment: ENABLED_ENVIRONMENT,
        now: () => new Date(NOW_SECONDS * 1_000),
        verifyBearer: async () => recentIdentity(),
        initiate: async () => {
          initiationCalls += 1;
          return "initiated";
        },
      },
    );
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      status: "confirmation_required",
    });
    assert.equal(initiationCalls, 0);
  }
});

test("initiated and repeated active requests return the same privacy-safe status", async () => {
  for (const outcome of ["initiated", "already_pending"] as const) {
    const response = await handleAccountDeletionInitiation(deletionRequest(), {
      environment: ENABLED_ENVIRONMENT,
      now: () => new Date(NOW_SECONDS * 1_000),
      verifyBearer: async () => recentIdentity(),
      initiate: async () => outcome,
    });
    assert.equal(response.status, 202);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { status: "in_progress" });
  }
});

test("concurrent initiation remains idempotent at the dependency boundary", async () => {
  const activeUsers = new Set<string>();
  const initiate = async (userId: string) => {
    await Promise.resolve();
    if (activeUsers.has(userId)) return "already_pending" as const;
    activeUsers.add(userId);
    return "initiated" as const;
  };
  const dependencies = {
    environment: ENABLED_ENVIRONMENT,
    now: () => new Date(NOW_SECONDS * 1_000),
    verifyBearer: async () => recentIdentity(),
    initiate,
  };
  const responses = await Promise.all([
    handleAccountDeletionInitiation(deletionRequest(), dependencies),
    handleAccountDeletionInitiation(deletionRequest(), dependencies),
  ]);
  assert.deepEqual(responses.map((response) => response.status), [202, 202]);
  assert.equal(activeUsers.size, 1);
});

test("a missing Auth user and recoverable service failure expose no identity", async () => {
  const missing = await handleAccountDeletionInitiation(deletionRequest(), {
    environment: ENABLED_ENVIRONMENT,
    now: () => new Date(NOW_SECONDS * 1_000),
    verifyBearer: async () => recentIdentity(),
    initiate: async () => "user_not_found",
  });
  assert.equal(missing.status, 401);
  assert.deepEqual(await missing.json(), { status: "denied" });

  const failed = await handleAccountDeletionInitiation(deletionRequest(), {
    environment: ENABLED_ENVIRONMENT,
    now: () => new Date(NOW_SECONDS * 1_000),
    verifyBearer: async () => recentIdentity(),
    initiate: async () => {
      throw new Error("database unavailable for private@example.test");
    },
  });
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), { status: "unavailable" });
});

function recentIdentity() {
  return {
    userId: USER_ID,
    amr: [{ method: "magiclink", timestamp: NOW_SECONDS - 60 }],
  };
}

function deletionRequest(
  authorization: string | null = "Bearer verified-token",
  body: unknown = { confirmation: ACCOUNT_DELETION_CONFIRMATION },
  headers: Record<string, string> = {},
): Request {
  return new Request("http://local/api/account-deletion/initiate", {
    method: "POST",
    headers: {
      ...(authorization ? { Authorization: authorization } : {}),
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
