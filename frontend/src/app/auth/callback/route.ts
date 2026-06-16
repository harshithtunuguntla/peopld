import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase-server";

// OAuth (Google) redirect target: exchanges the auth code for a session
// cookie, then continues to wherever the user was headed.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  let next = searchParams.get("next") ?? "/";
  // Only allow same-origin relative paths — never an absolute/protocol-relative
  // URL someone smuggled into the link (open-redirect guard).
  if (!next.startsWith("/") || next.startsWith("//")) {
    next = "/";
  }

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}${next}?auth_error=1`);
}
