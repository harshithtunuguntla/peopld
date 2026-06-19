import type { Metadata, Viewport } from "next";
import { Inter, Fraunces, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  style: ["normal", "italic"],
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Peopld — The relationship engine for live events.",
  description:
    "AI-curated tables, personalized icebreakers, and one-button rounds. Run networking events people actually remember.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

// Runs before first paint: read the saved theme preference and set `.dark` on
// <html> so a dark-mode user never sees a light flash on reload. The app
// ThemeProvider keeps this in sync afterwards. Marketing landing uses fixed
// colors (no semantic tokens), so `.dark` on <html> never affects it.
const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem('peopld-theme-pref');var m=window.matchMedia('(prefers-color-scheme: dark)').matches;if(p==='dark'||(p==='system'&&m)){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
