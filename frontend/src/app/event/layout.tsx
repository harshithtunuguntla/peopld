import type { ReactNode } from "react";

/**
 * Attendee app theme boundary. Every screen under /event/* renders in the **dark**
 * theme by default (DESIGN_SYSTEM §1.5 — the landing is locked light; all other
 * surfaces are dark). The `dark` class flips the semantic tokens for the whole
 * subtree, so token-driven components adapt with zero per-page color overrides.
 */
export default function EventAppLayout({ children }: { children: ReactNode }) {
  return <div className="dark min-h-dvh bg-background text-foreground">{children}</div>;
}
