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
  useRef,
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

  // Apply the resolved theme to <html>, the single source of truth the inline
  // pre-paint script (see app/layout.tsx) also writes to. Keeping the class on
  // <html> — not this wrapper — means the script can set it before first paint, so
  // there is no light→dark flash on reload.
  const apply = useCallback((t: Theme) => {
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", t === "dark");
    }
  }, []);

  // Hydrate from storage on mount and apply the RESOLVED theme directly (matches
  // what the inline script already painted, so this is a no-op visually — never a
  // flip). We apply explicitly on every change instead of via a [theme] effect, so
  // the stale initial value can never momentarily clobber the script's class.
  useEffect(() => {
    let initial = defaultPref;
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as ThemePref | null;
      if (saved === "light" || saved === "dark" || saved === "system") initial = saved;
    } catch {
      /* localStorage may be unavailable (private mode) — fall back to default. */
    }
    const t = initial === "system" ? systemTheme() : initial;
    setPrefState(initial);
    setTheme(t);
    apply(t);
  }, [defaultPref, apply]);

  // Track OS changes while preference is "system".
  useEffect(() => {
    if (pref !== "system" || typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      setTheme(mq.matches ? "dark" : "light");
      apply(mq.matches ? "dark" : "light");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [pref, apply]);

  const setPref = useCallback(
    (p: ThemePref) => {
      const t = p === "system" ? systemTheme() : p;
      setPrefState(p);
      setTheme(t);
      apply(t);
      try {
        localStorage.setItem(STORAGE_KEY, p);
      } catch {
        /* ignore persistence failures */
      }
    },
    [apply],
  );

  const toggle = useCallback(() => {
    setPref(theme === "dark" ? "light" : "dark");
  }, [theme, setPref]);

  return (
    <ThemeContext.Provider value={{ theme, pref, setPref, toggle }}>
      <div className={`theme-transition ${className ?? ""}`} suppressHydrationWarning>
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
