"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Loader2, LogOut, UserRound, Users } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type ActiveItem = "profile" | "connections";

export function EventProfileNav({
  eventId,
  active,
}: {
  eventId: string;
  active: ActiveItem;
}) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    await supabase.auth.signOut();
    router.replace("/home");
  }

  return (
    <nav aria-label="Profile" className="mb-7 flex flex-wrap gap-2">
      <NavItem href={`/event/${eventId}/profile`} active={active === "profile"} icon={<UserRound className="h-4 w-4" aria-hidden />}>
        Edit profile
      </NavItem>
      <NavItem href={`/event/${eventId}/connections`} active={active === "connections"} icon={<Users className="h-4 w-4" aria-hidden />}>
        My connections
      </NavItem>
      <button
        type="button"
        onClick={signOut}
        disabled={signingOut}
        className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-full border border-border bg-card/50 px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60 sm:flex-none"
      >
        {signingOut ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <LogOut className="h-4 w-4" aria-hidden />}
        Sign out
      </button>
    </nav>
  );
}

function NavItem({
  href,
  active,
  icon,
  children,
}: {
  href: string;
  active: boolean;
  icon: ReactNode;
  children: ReactNode;
}) {
  const className = cn(
    "inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors sm:flex-none",
    active
      ? "pointer-events-none border-accent/40 bg-accent/10 text-accent"
      : "border-border bg-card/50 text-muted-foreground hover:text-foreground",
  );

  if (active) {
    return (
      <span aria-current="page" className={className}>
        {icon}
        {children}
      </span>
    );
  }

  return (
    <Link href={href} className={className}>
      {icon}
      {children}
    </Link>
  );
}
