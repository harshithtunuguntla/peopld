import type { ReactNode } from "react";
import { ThemeProvider } from "@/lib/theme/theme-provider";

/**
 * Attendee sign-in / sign-up boundary. Theme-aware like every non-landing surface
 * (light default, dark optional — DESIGN_SYSTEM §1.5). The left brand panel is a
 * deliberate dark "island" regardless of theme (sanctioned per §2); the right form
 * column flips with the toggle.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider defaultPref="light" className="min-h-dvh bg-background text-foreground">
      {children}
    </ThemeProvider>
  );
}
