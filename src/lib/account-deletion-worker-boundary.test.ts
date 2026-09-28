import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { handleAccountDeletionWorkerInvocation } from "./account-deletion-worker-boundary.ts";

const SECRET = "local-worker-secret-with-enough-entropy";
const vercelConfiguration = JSON.parse(
  readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"),
) as { crons?: { path?: string; schedule?: string }[] };

test("production declares one plan-compatible daily retry invocation", () => {
  assert.deepEqual(vercelConfiguration.crons, [
    {
      path: "/api/internal/account-deletion-worker",
      schedule: "0 3 * * *",
    },
  ]);
});

test("the retry boundary is disabled without its server secret", async () => {
  let calls = 0;
  const response = await handleAccountDeletionWorkerInvocation(
    workerRequest(`Bearer ${SECRET}`),
    {
      environment: {},
      runWorker: async () => {
        calls += 1;
        return { outcome: "idle" };
      },
    },
  );
  assert.equal(response.status, 401);
  assert.equal(calls, 0);
});

test("missing or incorrect bearer secrets cannot run deletion work", async () => {
  for (const authorization of [undefined, "Bearer wrong-secret", "Basic secret"]) {
    let calls = 0;
    const response = await handleAccountDeletionWorkerInvocation(
      workerRequest(authorization),
      {
        environment: { ACCOUNT_DELETION_WORKER_SECRET: SECRET },
        runWorker: async () => {
          calls += 1;
          return { outcome: "idle" };
        },
      },
    );
    assert.equal(response.status, 401);
    assert.equal(calls, 0);
  }
});

test("an authorized invocation makes exactly one bounded queue attempt", async () => {
  let calls = 0;
  const response = await handleAccountDeletionWorkerInvocation(
    workerRequest(`Bearer ${SECRET}`, { forgedUserId: "someone-else" }),
    {
      environment: { ACCOUNT_DELETION_WORKER_SECRET: SECRET },
      runWorker: async () => {
        calls += 1;
        return { outcome: "completed" };
      },
    },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "attempted" });
  assert.equal(calls, 1);
});

test("Vercel CRON_SECRET authorizes the same single target-free attempt", async () => {
  let calls = 0;
  const response = await handleAccountDeletionWorkerInvocation(
    workerRequest(`Bearer ${SECRET}`),
    {
      environment: {
        CRON_SECRET: SECRET,
        ACCOUNT_DELETION_WORKER_SECRET: "legacy-secret-is-not-used",
      },
      runWorker: async () => {
        calls += 1;
        return { outcome: "idle" };
      },
    },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "idle" });
  assert.equal(calls, 1);
});

test("worker failures return only a privacy-safe unavailable status", async () => {
  for (const failure of ["throw", "repository"] as const) {
    const response = await handleAccountDeletionWorkerInvocation(
      workerRequest(`Bearer ${SECRET}`),
      {
        environment: { ACCOUNT_DELETION_WORKER_SECRET: SECRET },
        runWorker: async () => {
          if (failure === "throw") {
            throw new Error("private@example.test token=secret");
          }
          return { outcome: "repository_unavailable" };
        },
      },
    );
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.deepEqual(body, { status: "unavailable" });
    assert.doesNotMatch(JSON.stringify(body), /private|token|secret/i);
  }
});

function workerRequest(
  authorization?: string,
  body: Record<string, unknown> = {},
): Request {
  return new Request("https://firstmove.test/api/internal/account-deletion-worker", {
    method: "POST",
    headers: authorization ? { Authorization: authorization } : undefined,
    body: JSON.stringify(body),
  });
}
