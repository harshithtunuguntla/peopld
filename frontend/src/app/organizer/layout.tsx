import type { ReactNode } from "react";

/**
 * Organizer app theme boundary — dark by default, same rule as the attendee app
 * (DESIGN_SYSTEM §1.5). Keeps the control-room surfaces consistent; token-driven
 * components inherit the theme without per-page colors.
 */
export default function OrganizerAppLayout({ children }: { children: ReactNode }) {
  return <div className="dark min-h-dvh bg-background text-foreground">{children}</div>;
}
