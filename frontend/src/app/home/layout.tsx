import type { ReactNode } from "react";
import { ThemeProvider } from "@/lib/theme/theme-provider";

/**
 * Attendee home theme boundary. The personal hub lives outside /event/* (it's
 * cross-event), so it carries its own theme wrapper — same contract as the event
 * app layout (DESIGN_SYSTEM §1.5): light by default, dark optional via toggle.
 */
export default function HomeLayout({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider defaultPref="light" className="min-h-dvh bg-background text-foreground">
      {children}
    </ThemeProvider>
  );
}
