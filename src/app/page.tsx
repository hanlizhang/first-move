import FirstMoveApp from "./first-move-app";
import { restoredEmail } from "@/lib/auth-flow";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const initialEmail = await restoredEmail(supabase.auth);
  return <FirstMoveApp initialEmail={initialEmail} />;
}
