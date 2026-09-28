import { handleAccountDeletionWorkerInvocation } from "@/lib/account-deletion-worker-boundary";

async function invokeWorker(request: Request): Promise<Response> {
  return handleAccountDeletionWorkerInvocation(request, {
    environment: process.env,
  });
}

// Vercel Cron invokes production routes with GET and sends CRON_SECRET as a
// Bearer token. The boundary remains target-free and processes at most one
// durable outbox claim per invocation.
export const GET = invokeWorker;
export const POST = invokeWorker;
