import type { ReactNode } from "react";
import { ThemeProvider } from "@/lib/theme/theme-provider";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider defaultPref="light" className="min-h-dvh bg-background text-foreground">
      {children}
    </ThemeProvider>
  );
}
