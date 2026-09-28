import { handleAccountDeletionInitiation } from "@/lib/account-deletion";
import { runConfiguredAccountDeletionWorker } from "@/lib/account-deletion-worker";

export async function POST(request: Request): Promise<Response> {
  return handleAccountDeletionInitiation(request, {
    environment: process.env,
    attemptWorker: async (userId, environment) => {
      await runConfiguredAccountDeletionWorker(environment, {
        targetUserId: userId,
      });
    },
  });
}
