"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";

export interface OrgMembership {
  organization_id: string;
  organization_name: string;
  role: "super_organizer" | "organizer";
}

export interface AdminContext {
  user_id: string;
  email: string | null;
  platform_role: "super_admin" | null;
  memberships: OrgMembership[];
  default_admin_url: string | null;
}

export type AdminRole = "super_admin" | "super_organizer" | "organizer" | null;

// Module-level cache — shared across all hook instances for the life of the SPA
// so navigating between console pages never re-shows the loading gate.
let cachedUser: User | null = null;
let cachedContext: AdminContext | null = null;
let cacheResolved = false;

export function useAdminContext() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(cachedUser);
  const [context, setContext] = useState<AdminContext | null>(cachedContext);
  const [checked, setChecked] = useState(cacheResolved);

  useEffect(() => {
    let active = true;

    async function resolve() {
      const { data } = await supabase.auth.getUser();
      if (!active) return;

      const authUser = data.user ?? null;
      cachedUser = authUser;

      if (!authUser) {
        cachedContext = null;
        cachedUser = null;
        cacheResolved = true;
        setUser(null);
        setContext(null);
        setChecked(true);
        return;
      }

      try {
        const ctx = await apiFetch<AdminContext>("/me/context");
        if (!active) return;
        cachedContext = ctx;
        setContext(ctx);
      } catch {
        // Network error or 401 — treat as no admin role
        if (!active) return;
        cachedContext = null;
        setContext(null);
      }

      cacheResolved = true;
      setUser(authUser);
      setChecked(true);
    }

    resolve();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => {
      // Invalidate cache on sign-out so the next sign-in re-fetches context.
      if (!session) {
        cachedUser = null;
        cachedContext = null;
        cacheResolved = false;
      }
      cachedUser = session?.user ?? null;
      setUser(session?.user ?? null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const isPlatformAdmin = context?.platform_role === "super_admin";
  const memberships = context?.memberships ?? [];
  const activeOrganization = memberships[0] ?? null;

  const roleLabel: string | null = isPlatformAdmin
    ? "Platform Admin"
    : activeOrganization?.role === "super_organizer"
    ? "Super Organizer"
    : activeOrganization?.role === "organizer"
    ? "Organizer"
    : null;

  const canManageTeam =
    isPlatformAdmin ||
    memberships.some((m) => m.role === "super_organizer");

  return {
    user,
    context,
    checked,
    isPlatformAdmin,
    memberships,
    activeOrganization,
    roleLabel,
    canManageTeam,
  };
}

/** Post-login routing: redirect based on admin context. */
export function useAdminRedirect(
  checked: boolean,
  user: User | null,
  context: AdminContext | null,
  {
    loginPath = "/organizer/login",
    homePath = "/home",
  }: { loginPath?: string; homePath?: string } = {}
) {
  const router = useRouter();

  useEffect(() => {
    if (!checked) return;
    if (!user) {
      router.replace(loginPath);
      return;
    }
    if (context?.platform_role === "super_admin") {
      router.replace("/admin");
    } else if (context && context.memberships.length > 0) {
      router.replace("/organizer/dashboard");
    } else {
      router.replace(homePath);
    }
  }, [checked, user, context, router, loginPath, homePath]);
}
