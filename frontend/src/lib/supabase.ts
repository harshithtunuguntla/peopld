"use client";

import { createBrowserClient } from "@supabase/ssr";

// Cookie-based browser client (@supabase/ssr) so the middleware and server
// route handlers can read the same session.
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
