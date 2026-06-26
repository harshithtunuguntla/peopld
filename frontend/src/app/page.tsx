import {
  LandingNav,
  Hero,
  ProblemSection,
  HowItWorks,
  ScenesGallery,
  FinalCta,
  SiteFooter,
} from "@/components/landing";

/**
 * Peopld marketing landing (light mode, dark ScenesGallery island). Composed
 * from modular section components; all copy/data lives in
 * src/lib/content/landing.ts. See docs/design/DESIGN_SYSTEM.md.
 */
export default function Home() {
  return (
    <main className="min-h-screen bg-paper text-ink">
      <LandingNav />
      {/* Hero's own top padding clears the fixed nav — no extra wrapper padding. */}
      <Hero />
      <ProblemSection />
      <HowItWorks />
      <ScenesGallery />
      <FinalCta />
      <SiteFooter />
    </main>
  );
}
