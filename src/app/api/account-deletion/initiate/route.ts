import { handleAccountDeletionInitiation } from "@/lib/account-deletion";

export async function POST(request: Request): Promise<Response> {
  return handleAccountDeletionInitiation(request, {
    environment: process.env,
  });
}
