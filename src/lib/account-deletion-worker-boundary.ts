import { timingSafeEqual } from "node:crypto";

import {
  runConfiguredAccountDeletionWorker,
  type AccountDeletionWorkerResult,
} from "./account-deletion-worker.ts";

type Environment = Record<string, string | undefined>;

interface WorkerBoundaryDependencies {
  environment: Environment;
  runWorker?: (environment: Environment) => Promise<AccountDeletionWorkerResult>;
}

export async function handleAccountDeletionWorkerInvocation(
  request: Request,
  dependencies: WorkerBoundaryDependencies,
): Promise<Response> {
  const configuredSecret =
    dependencies.environment.CRON_SECRET?.trim() ||
    dependencies.environment.ACCOUNT_DELETION_WORKER_SECRET?.trim();
  const presentedSecret = bearerAccessToken(
    request.headers.get("authorization"),
  );
  if (
    !configuredSecret ||
    !presentedSecret ||
    !secretsMatch(configuredSecret, presentedSecret)
  ) {
    return workerResponse("denied", 401);
  }

  try {
    const result = await (
      dependencies.runWorker ?? runConfiguredAccountDeletionWorker
    )(dependencies.environment);
    if (result.outcome === "repository_unavailable") {
      return workerResponse("unavailable", 503);
    }
    return workerResponse(
      result.outcome === "idle" ? "idle" : "attempted",
      200,
    );
  } catch {
    return workerResponse("unavailable", 503);
  }
}

function bearerAccessToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer ([^\s]+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

function secretsMatch(expected: string, actual: string): boolean {
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  return (
    expectedBytes.length === actualBytes.length &&
    timingSafeEqual(expectedBytes, actualBytes)
  );
}

function workerResponse(status: string, httpStatus: number): Response {
  return Response.json(
    { status },
    { status: httpStatus, headers: { "Cache-Control": "no-store" } },
  );
}
