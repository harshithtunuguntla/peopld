import type { ReactNode } from "react";
import { ThemeProvider } from "@/lib/theme/theme-provider";

/**
 * Attendee app theme boundary. Every screen under /event/* is theme-aware —
 * **light by default**, with an optional dark toggle (DESIGN_SYSTEM §1.5: the
 * landing is locked light; every other surface reads the centralized theme). The
 * ThemeProvider flips the semantic tokens for the whole subtree, so token-driven
 * components adapt with zero per-page color overrides.
 */
export default function EventAppLayout({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider defaultPref="light" className="min-h-dvh bg-background text-foreground">
      {children}
    </ThemeProvider>
  );
}
