import type { ReactNode } from "react";

/**
 * Attendee home theme boundary. The personal dashboard lives outside /event/*
 * (it's cross-event), so it needs its own dark-theme wrapper — same contract as
 * the event app layout (DESIGN_SYSTEM §1.5: landing locked light, every other
 * surface dark). The `dark` class flips the semantic tokens for the subtree.
 */
export default function HomeLayout({ children }: { children: ReactNode }) {
  return <div className="dark min-h-dvh bg-background text-foreground">{children}</div>;
}
