import { type NextRequest, NextResponse } from "next/server";

import { buildAuthResultUrl, exchangeCallbackCode } from "@/lib/auth-flow";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (request.nextUrl.searchParams.get("error") || !code) {
    return NextResponse.redirect(buildAuthResultUrl(request.url, "invalid"));
  }

  const supabase = await createClient();
  const result = await exchangeCallbackCode(code, supabase.auth);
  return NextResponse.redirect(buildAuthResultUrl(request.url, result));
}
