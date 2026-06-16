import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";
import { COLORS } from "./src/lib/design/colors";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: { "2xl": "1320px" },
    },
    extend: {
      screens: {
        // mobile-first: base is 375px, scale up
        xs: "375px",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-fraunces)", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        // Semantic tokens (shadcn / Radix layer) — driven by CSS variables.
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },

        // Extended app neutrals (richer ramp for console surfaces — see
        // docs/design/UI_IMPORT_HANDOFF.md §6). Driven by CSS variables.
        "surface-2": "hsl(var(--surface-2))",
        elevated: "hsl(var(--elevated))",
        "foreground-subtle": "hsl(var(--foreground-subtle))",
        "line-strong": "hsl(var(--line-strong))",
        panel: { DEFAULT: "hsl(var(--panel))", foreground: "hsl(var(--panel-foreground))" },

        // Theme-aware status colors (readable in both modes — see globals.css).
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        info: "hsl(var(--info))",

        // Peopld brand — derived from the single source (src/lib/design/colors.ts).
        paper: COLORS.paper,
        paper2: COLORS.paper2,
        ink: {
          DEFAULT: COLORS.ink,
          950: COLORS.ink950,
          900: COLORS.ink900,
          800: COLORS.ink800,
          700: COLORS.ink700,
          600: COLORS.ink600,
        },
        ink2: COLORS.ink2,
        cream: COLORS.cream,
        coral: COLORS.coral,
        ember: COLORS.ember,
        lime: COLORS.lime,
        plasma: COLORS.plasma,
        chlorine: COLORS.chlorine,
        leaf: COLORS.leaf,
        gold: COLORS.gold,
        ice: COLORS.ice,
        rose: COLORS.rose,
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
        "spin-slow": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        marquee: "marquee 40s linear infinite",
        "pulse-soft": "pulse-soft 2.2s ease-in-out infinite",
        "spin-slow": "spin-slow 20s linear infinite",
        shimmer: "shimmer 3s linear infinite",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
