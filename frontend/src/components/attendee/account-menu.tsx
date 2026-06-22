"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { Loader2, LogOut, UserRound, Users } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type AccountMenuProps = {
  editProfileHref?: string | null;
  connectionsHref: string;
  user?: User | null;
  disabledEditLabel?: string;
  buttonSize?: "sm" | "md";
};

export function AccountMenu({
  editProfileHref,
  connectionsHref,
  user: userProp,
  disabledEditLabel = "Join an event to edit your profile",
  buttonSize = "md",
}: AccountMenuProps) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [loadedUser, setLoadedUser] = useState<User | null>(userProp ?? null);

  useEffect(() => {
    if (userProp !== undefined) {
      setLoadedUser(userProp);
      return;
    }
    supabase.auth.getUser().then(({ data }) => setLoadedUser(data.user));
  }, [userProp]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const name = displayName(loadedUser);
  const email = loadedUser?.email ?? "";
  const initial = (name || email || "P").trim().charAt(0).toUpperCase();

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    await supabase.auth.signOut();
    setOpen(false);
    router.replace("/home");
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="Open profile menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "inline-flex items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          buttonSize === "sm" ? "h-8 w-8 text-xs" : "h-9 w-9 text-sm",
        )}
      >
        <span className="flex h-full w-full items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
          {initial}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-[min(84vw,320px)] overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl"
        >
          <div className="bg-secondary/80 px-5 py-5 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent text-2xl font-semibold text-accent-foreground">
              {initial}
            </div>
            <p className="mt-3 truncate text-sm font-semibold text-foreground">{name || "Peopld profile"}</p>
            {email && <p className="mt-0.5 truncate text-xs text-muted-foreground">{email}</p>}
          </div>

          <div className="p-2">
            {editProfileHref ? (
              <MenuLink href={editProfileHref} icon={<UserRound className="h-4 w-4" aria-hidden />} onClick={() => setOpen(false)}>
                Edit profile
              </MenuLink>
            ) : (
              <div className="flex items-start gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground opacity-60">
                <UserRound className="h-4 w-4" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-foreground">Edit profile</span>
                  <span className="mt-0.5 block text-xs">{disabledEditLabel}</span>
                </span>
              </div>
            )}
            <MenuLink href={connectionsHref} icon={<Users className="h-4 w-4" aria-hidden />} onClick={() => setOpen(false)}>
              My connections
            </MenuLink>
            <button
              type="button"
              role="menuitem"
              onClick={signOut}
              disabled={signingOut}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-muted disabled:opacity-60"
            >
              {signingOut ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <LogOut className="h-4 w-4" aria-hidden />}
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  icon,
  children,
  onClick,
}: {
  href: string;
  icon: ReactNode;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-muted"
    >
      {icon}
      {children}
    </Link>
  );
}

function displayName(user: User | null): string {
  const meta = user?.user_metadata ?? {};
  const full = (meta.full_name || meta.name) as string | undefined;
  return full?.trim() || user?.email?.split("@")[0] || "";
}
