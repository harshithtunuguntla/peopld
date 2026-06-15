import type { ReactNode } from "react";
import { ThemeProvider } from "@/lib/theme/theme-provider";

/**
 * Deep-link join theme boundary. `/join?code=` is the landing target for a
 * scanned/shared QR; like every non-landing surface it is theme-aware: light by
 * default, dark optional (DESIGN_SYSTEM §1.5).
 */
export default function JoinLayout({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider defaultPref="light" className="min-h-dvh bg-background text-foreground">
      {children}
    </ThemeProvider>
  );
}
