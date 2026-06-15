"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { LogOut, ChevronLeft } from "lucide-react";
import { Wordmark } from "@/components/brand/wordmark";
import { supabase } from "@/lib/supabase";

/** Control-room chrome for every organizer screen: wordmark + "Organizer" tag,
 * sign-out, and an optional back link. Wider than the attendee surfaces
 * (max-w-2xl) — it's a laptop-first console that still works on a phone. */
export function OrgShell({
  children,
  back,
}: {
  children: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 pb-20 pt-7">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wordmark size={22} />
          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            Organizer
          </span>
        </div>
        <button
          type="button"
          onClick={() => supabase.auth.signOut()}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden /> Sign out
        </button>
      </div>

      {back && (
        <Link
          href={back.href}
          className="mt-6 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden /> {back.label}
        </Link>
      )}

      <div className="mt-5">{children}</div>
    </div>
  );
}
