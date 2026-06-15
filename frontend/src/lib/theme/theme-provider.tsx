"use client";

/**
 * Peopld app theme system — light default, optional dark, centralized switch.
 *
 * Wraps an app-surface subtree and toggles the `dark` class on its own wrapper, so
 * the shadcn semantic tokens (`:root` = light, `.dark` = dark in globals.css) flip
 * for everything inside. Screens never hardcode light/dark colors — they read tokens
 * (bg-background, text-foreground, bg-card, border-border, bg-accent, …).
 *
 * The marketing landing is NOT wrapped in this — it is locked light at `:root`
 * (DESIGN_SYSTEM §1.5). Every other surface mounts a ThemeProvider in its segment
 * layout. Preference persists in localStorage and may follow the OS ("system").
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark";
export type ThemePref = "light" | "dark" | "system";

type ThemeContextValue = {
  /** The theme actually applied right now. */
  theme: Theme;
  /** The user's stored preference (may be "system"). */
  pref: ThemePref;
  setPref: (p: ThemePref) => void;
  toggle: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = "peopld-theme-pref";

function systemTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({
  children,
  defaultPref = "light",
  className,
}: {
  children: ReactNode;
  defaultPref?: ThemePref;
  /** Extra classes for the wrapper (e.g. min-height/background utilities). */
  className?: string;
}) {
  const [pref, setPrefState] = useState<ThemePref>(defaultPref);
  const [theme, setTheme] = useState<Theme>(defaultPref === "dark" ? "dark" : "light");

  // Hydrate from storage on mount.
  useEffect(() => {
    let initial = defaultPref;
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as ThemePref | null;
      if (saved === "light" || saved === "dark" || saved === "system") initial = saved;
    } catch {
      /* localStorage may be unavailable (private mode) — fall back to default. */
    }
    setPrefState(initial);
    setTheme(initial === "system" ? systemTheme() : initial);
  }, [defaultPref]);

  // Track OS changes while preference is "system".
  useEffect(() => {
    if (pref !== "system" || typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setTheme(mq.matches ? "dark" : "light");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [pref]);

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p);
    setTheme(p === "system" ? systemTheme() : p);
    try {
      localStorage.setItem(STORAGE_KEY, p);
    } catch {
      /* ignore persistence failures */
    }
  }, []);

  const toggle = useCallback(() => {
    setPref(theme === "dark" ? "light" : "dark");
  }, [theme, setPref]);

  return (
    <ThemeContext.Provider value={{ theme, pref, setPref, toggle }}>
      <div
        className={`theme-transition ${theme === "dark" ? "dark " : ""}${className ?? ""}`}
        suppressHydrationWarning
      >
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
