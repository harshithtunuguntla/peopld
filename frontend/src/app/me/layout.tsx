import type { ReactNode } from "react";
import { ThemeProvider } from "@/lib/theme/theme-provider";

/**
 * Personal (cross-event) theme boundary — e.g. /me/connections. Like every
 * non-landing surface it is theme-aware: light by default, dark optional
 * (DESIGN_SYSTEM §1.5).
 */
export default function MeLayout({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider defaultPref="light" className="min-h-dvh bg-background text-foreground">
      {children}
    </ThemeProvider>
  );
}
