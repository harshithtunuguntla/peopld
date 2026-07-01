"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAdminContext } from "@/lib/admin/use-admin-context";

/**
 * Auth + ROLE gate for organizer surfaces.
 *
 * Resolves role from the DB-backed /me/context endpoint, not from the JWT
 * app_metadata alone, so membership removals take effect immediately.
 *
 *   - signed out                     → /organizer/login
 *   - signed in, no admin/org role   → /home  (attendee who pasted a console URL)
 *   - signed in with org or admin    → render
 *
 * Returns { user, checked, isOrganizer } for backward compatibility with
 * existing organizer pages. Use useAdminContext() directly for the full
 * role breakdown (isPlatformAdmin, memberships, canManageTeam, etc.).
 */
export function useOrganizer() {
  const router = useRouter();
  const { user, context, checked, isPlatformAdmin, memberships } = useAdminContext();

  const isOrganizer = isPlatformAdmin || memberships.length > 0;

  useEffect(() => {
    if (!checked) return;
    if (!user) router.replace("/organizer/login");
    else if (!isOrganizer) router.replace("/home");
  }, [checked, user, isOrganizer, router]);

  return {
    user: isOrganizer ? user : null,
    checked,
    isOrganizer,
    isPlatformAdmin,
    memberships,
    context,
  };
}
