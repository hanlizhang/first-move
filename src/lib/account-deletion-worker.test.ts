import assert from "node:assert/strict";
import test from "node:test";

import {
  AccountDeletionStepError,
  accountDeletionRetryDelaySeconds,
  deleteSupabaseAuthUser,
  requestRevenueCatCustomerDeletion,
  runAccountDeletionWorker,
  type AccountDeletionClaim,
  type AccountDeletionFailureCategory,
  type AccountDeletionWorkerDependencies,
  type AccountDeletionWorkerRepository,
} from "./account-deletion-worker.ts";

const REQUEST_ID = "10000000-0000-4000-8000-000000000001";
const USER_ID = "20000000-0000-4000-8000-000000000002";
const LEASE_TOKEN = "30000000-0000-4000-8000-000000000003";
const SECRET_ENVIRONMENT = { REVENUECAT_SECRET_API_KEY: "server-secret" };

test("an empty queue is idle and invokes no destructive dependency", async () => {
  const harness = createHarness({ claim: null });
  assert.deepEqual(await runAccountDeletionWorker(harness.dependencies), {
    outcome: "idle",
  });
  assert.deepEqual(harness.events, ["claim"]);
});

test("concurrent worker invocation cannot process one claim twice", async () => {
  let available = true;
  const harness = createHarness({
    claim: async (leaseToken) => {
      if (!available) return null;
      available = false;
      await Promise.resolve();
      return deletionClaim({ leaseToken });
    },
  });
  const results = await Promise.all([
    runAccountDeletionWorker(harness.dependencies),
    runAccountDeletionWorker(harness.dependencies),
  ]);
  assert.deepEqual(
    results.map((result) => result.outcome).sort(),
    ["completed", "idle"],
  );
  assert.equal(
    harness.events.filter((event) => event === `revenuecat:${USER_ID}`)
      .length,
    1,
  );
});

test("a satisfied RevenueCat DELETE proceeds through Storage and Auth", async () => {
  const harness = createHarness();
  assert.deepEqual(await runAccountDeletionWorker(harness.dependencies), {
    outcome: "completed",
  });
  assert.deepEqual(harness.events, [
    "claim",
    `revenuecat:${USER_ID}`,
    "record_revenuecat_satisfied",
    `storage:${USER_ID}`,
    `auth:${USER_ID}`,
    "complete",
  ]);
});

test("a verified target user is passed only to the atomic claim", async () => {
  const harness = createHarness();
  harness.dependencies.targetUserId = USER_ID;
  await runAccountDeletionWorker(harness.dependencies);
  assert.equal(harness.claimedUserId, USER_ID);
});

test("already-missing Auth identity is idempotent completion", async () => {
  const harness = createHarness({
    claim: deletionClaim({ revenuecatStatus: "deletion_satisfied" }),
    auth: "already_missing",
  });
  assert.deepEqual(await runAccountDeletionWorker(harness.dependencies), {
    outcome: "completed",
  });
  assert.equal(harness.authCalls, 1);
  assert.equal(harness.completedCalls, 1);
});

test("recorded RevenueCat satisfaction resumes without another provider call", async () => {
  const harness = createHarness({
    claim: deletionClaim({ revenuecatStatus: "deletion_satisfied" }),
  });
  assert.equal(
    (await runAccountDeletionWorker(harness.dependencies)).outcome,
    "completed",
  );
  assert.equal(harness.revenueCatCalls, 0);
  assert.equal(harness.storageCalls, 1);
  assert.equal(harness.authCalls, 1);
});

test("recorded Supabase deletion completes without repeating external work", async () => {
  const harness = createHarness({
    claim: deletionClaim({
      revenuecatStatus: "deletion_satisfied",
      supabaseStatus: "deleted",
    }),
  });
  assert.equal(
    (await runAccountDeletionWorker(harness.dependencies)).outcome,
    "completed",
  );
  assert.equal(harness.revenueCatCalls, 0);
  assert.equal(harness.storageCalls, 0);
  assert.equal(harness.authCalls, 0);
});

test("RevenueCat permission and transient failures use bounded categories", async () => {
  for (const [error, expected] of [
    [
      new AccountDeletionStepError("revenuecat_permission"),
      "revenuecat_permission",
    ],
    [new Error("network response with private@example.test"), "revenuecat_transient"],
  ] as const) {
    const harness = createHarness({ revenueCat: error });
    assert.deepEqual(await runAccountDeletionWorker(harness.dependencies), {
      outcome: "retry_scheduled",
      category: expected,
    });
    assert.equal(harness.retries[0]?.category, expected);
    assert.equal(JSON.stringify(harness.retries).includes("private@example"), false);
    assert.equal(harness.storageCalls, 0);
    assert.equal(harness.authCalls, 0);
  }
});

test("owned Storage objects block Auth deletion for operator-visible retry", async () => {
  const harness = createHarness({
    claim: deletionClaim({ revenuecatStatus: "deletion_satisfied" }),
    hasOwnedStorageObjects: true,
  });
  assert.deepEqual(await runAccountDeletionWorker(harness.dependencies), {
    outcome: "retry_scheduled",
    category: "supabase_storage",
  });
  assert.equal(harness.authCalls, 0);
  assert.equal(harness.completedCalls, 0);
});

test("Storage preflight failure never reaches Auth deletion", async () => {
  const harness = createHarness({
    claim: deletionClaim({ revenuecatStatus: "deletion_satisfied" }),
    storageError: new Error("storage unavailable"),
  });
  assert.deepEqual(await runAccountDeletionWorker(harness.dependencies), {
    outcome: "retry_scheduled",
    category: "supabase_transient",
  });
  assert.equal(harness.authCalls, 0);
});

test("Supabase Auth failure preserves RevenueCat progress for retry", async () => {
  const harness = createHarness({
    claim: deletionClaim({ revenuecatStatus: "deletion_satisfied" }),
    auth: new Error("temporary Auth failure"),
  });
  assert.deepEqual(await runAccountDeletionWorker(harness.dependencies), {
    outcome: "retry_scheduled",
    category: "supabase_transient",
  });
  assert.equal(harness.retries[0]?.category, "supabase_transient");
  assert.equal(harness.completedCalls, 0);
});

test("a stale lease cannot record progress, retry, or completion", async () => {
  for (const scenario of [
    { satisfiedRecorded: false },
    {
      claim: deletionClaim({ revenuecatStatus: "deletion_satisfied" }),
      completed: false,
    },
  ]) {
    const harness = createHarness(scenario);
    assert.equal(
      (await runAccountDeletionWorker(harness.dependencies)).outcome,
      "lease_lost",
    );
  }

  const retryHarness = createHarness({
    revenueCat: new Error("temporary"),
    retryRecorded: false,
  });
  assert.equal(
    (await runAccountDeletionWorker(retryHarness.dependencies)).outcome,
    "lease_lost",
  );
});

test("retry backoff grows exponentially and is capped at six hours", () => {
  assert.equal(accountDeletionRetryDelaySeconds("revenuecat_transient", 0), 30);
  assert.equal(accountDeletionRetryDelaySeconds("revenuecat_transient", 3), 240);
  assert.equal(accountDeletionRetryDelaySeconds("revenuecat_permission", 0), 900);
  assert.equal(accountDeletionRetryDelaySeconds("supabase_storage", 99), 21_600);
});

test("RevenueCat 200 and 404 both satisfy the step without GET or body reads", async () => {
  for (const status of [200, 404] as const) {
    let bodyReads = 0;
    const result = await requestRevenueCatCustomerDeletion(
      USER_ID,
      SECRET_ENVIRONMENT,
      async (input, init) => {
        assert.equal(
          input,
          `https://api.revenuecat.com/v1/subscribers/${USER_ID}`,
        );
        assert.equal(init?.method, "DELETE");
        assert.equal(init?.body, undefined);
        assert.equal(
          new Headers(init?.headers).get("authorization"),
          "Bearer server-secret",
        );
        return {
          status,
          json: async () => {
            bodyReads += 1;
            return { forbidden: "provider payload" };
          },
        } as Response;
      },
    );
    assert.equal(result, "deletion_satisfied");
    assert.equal(bodyReads, 0);
  }
});

test("RevenueCat client separates permission from network and 5xx failures", async () => {
  for (const status of [401, 403]) {
    await assert.rejects(
      requestRevenueCatCustomerDeletion(
        USER_ID,
        SECRET_ENVIRONMENT,
        async () => new Response(null, { status }),
      ),
      (error: unknown) =>
        error instanceof AccountDeletionStepError &&
        error.category === "revenuecat_permission",
    );
  }
  await assert.rejects(
    requestRevenueCatCustomerDeletion(
      USER_ID,
      SECRET_ENVIRONMENT,
      async () => new Response(null, { status: 503 }),
    ),
    (error: unknown) =>
      error instanceof AccountDeletionStepError &&
      error.category === "revenuecat_transient",
  );
  await assert.rejects(
    requestRevenueCatCustomerDeletion(
      USER_ID,
      SECRET_ENVIRONMENT,
      async () => {
        throw new Error("network token=secret");
      },
    ),
    (error: unknown) =>
      error instanceof AccountDeletionStepError &&
      error.category === "revenuecat_transient" &&
      !error.message.includes("secret"),
  );
});

test("Supabase Auth adapter hard-deletes only the supplied trusted UUID", async () => {
  const calls: Array<[string, boolean]> = [];
  assert.equal(
    await deleteSupabaseAuthUser(USER_ID, {
      deleteUser: async (userId, shouldSoftDelete) => {
        calls.push([userId, shouldSoftDelete]);
        return { error: null };
      },
    }),
    "deleted",
  );
  assert.deepEqual(calls, [[USER_ID, false]]);
});

test("Supabase Auth adapter treats not-found as success and other failures as transient", async () => {
  for (const error of [{ status: 404 }, { code: "user_not_found" }]) {
    assert.equal(
      await deleteSupabaseAuthUser(USER_ID, {
        deleteUser: async () => ({ error }),
      }),
      "already_missing",
    );
  }
  await assert.rejects(
    deleteSupabaseAuthUser(USER_ID, {
      deleteUser: async () => ({ error: { status: 503 } }),
    }),
    (error: unknown) =>
      error instanceof AccountDeletionStepError &&
      error.category === "supabase_transient",
  );
});

function deletionClaim(
  overrides: Partial<AccountDeletionClaim> = {},
): AccountDeletionClaim {
  return {
    requestId: REQUEST_ID,
    userId: USER_ID,
    revenuecatStatus: "pending",
    supabaseStatus: "pending",
    retryCount: 0,
    leaseToken: LEASE_TOKEN,
    ...overrides,
  };
}

function createHarness(
  options: {
    claim?:
      | AccountDeletionClaim
      | null
      | ((leaseToken: string) => Promise<AccountDeletionClaim | null>);
    revenueCat?: "deletion_satisfied" | Error;
    hasOwnedStorageObjects?: boolean;
    storageError?: Error;
    auth?: "deleted" | "already_missing" | Error;
    satisfiedRecorded?: boolean;
    retryRecorded?: boolean;
    completed?: boolean;
  } = {},
) {
  const events: string[] = [];
  const retries: Array<{
    category: AccountDeletionFailureCategory;
    retryAfterSeconds: number;
  }> = [];
  let claimedUserId: string | undefined;
  let revenueCatCalls = 0;
  let storageCalls = 0;
  let authCalls = 0;
  let completedCalls = 0;

  const repository: AccountDeletionWorkerRepository = {
    claim: async ({ leaseToken, userId }) => {
      events.push("claim");
      claimedUserId = userId;
      if (typeof options.claim === "function") {
        return options.claim(leaseToken);
      }
      if (options.claim === null) return null;
      return options.claim ?? deletionClaim({ leaseToken });
    },
    recordRevenueCatSatisfied: async () => {
      events.push("record_revenuecat_satisfied");
      return options.satisfiedRecorded ?? true;
    },
    retry: async (input) => {
      events.push(`retry:${input.category}`);
      retries.push({
        category: input.category,
        retryAfterSeconds: input.retryAfterSeconds,
      });
      return options.retryRecorded ?? true;
    },
    complete: async () => {
      events.push("complete");
      completedCalls += 1;
      return options.completed ?? true;
    },
  };

  const dependencies: AccountDeletionWorkerDependencies = {
    repository,
    revenueCat: {
      ensureCustomerDeleted: async (userId) => {
        events.push(`revenuecat:${userId}`);
        revenueCatCalls += 1;
        const result = options.revenueCat ?? "deletion_satisfied";
        if (result instanceof Error) throw result;
        return result;
      },
    },
    storage: {
      hasOwnedObjects: async (userId) => {
        events.push(`storage:${userId}`);
        storageCalls += 1;
        if (options.storageError) throw options.storageError;
        return options.hasOwnedStorageObjects ?? false;
      },
    },
    supabaseAuth: {
      deleteUser: async (userId) => {
        events.push(`auth:${userId}`);
        authCalls += 1;
        const result = options.auth ?? "deleted";
        if (result instanceof Error) throw result;
        return result;
      },
    },
    createLeaseToken: () => LEASE_TOKEN,
  };

  return {
    dependencies,
    events,
    retries,
    get claimedUserId() {
      return claimedUserId;
    },
    get revenueCatCalls() {
      return revenueCatCalls;
    },
    get storageCalls() {
      return storageCalls;
    },
    get authCalls() {
      return authCalls;
    },
    get completedCalls() {
      return completedCalls;
    },
  };
}
