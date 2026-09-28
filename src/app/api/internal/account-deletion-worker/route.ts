import { handleAccountDeletionWorkerInvocation } from "@/lib/account-deletion-worker-boundary";

export async function POST(request: Request): Promise<Response> {
  return handleAccountDeletionWorkerInvocation(request, {
    environment: process.env,
  });
}
