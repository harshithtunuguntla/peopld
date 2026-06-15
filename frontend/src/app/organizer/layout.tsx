import type { ReactNode } from "react";
import { ThemeProvider } from "@/lib/theme/theme-provider";

/**
 * Organizer console theme boundary. Theme-aware like every non-landing surface:
 * **light by default**, with an optional dark toggle (DESIGN_SYSTEM §1.5). The
 * ThemeProvider flips the semantic tokens for the whole console subtree.
 */
export default function OrganizerAppLayout({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider defaultPref="light" className="min-h-dvh bg-background text-foreground">
      {children}
    </ThemeProvider>
  );
}
