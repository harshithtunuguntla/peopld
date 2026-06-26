import { Logo } from "@/components/brand/logo";
import { FOOTER_LINKS } from "@/lib/content/landing";

export function SiteFooter() {
  return (
    <footer className="border-t border-ink/10 py-12">
      <div className="mx-auto flex max-w-[1320px] flex-col items-start justify-between gap-6 px-6 sm:flex-row sm:items-center sm:gap-4 sm:px-8">
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <div className="flex items-center gap-2">
            <Logo />
            <span className="font-display text-xl">Peopld</span>
          </div>
          <span className="text-sm text-ink/45">
            &copy; 2026 &middot; The relationship engine for live events
          </span>
        </div>
        <nav aria-label="Footer" className="flex gap-5 text-sm text-ink/55">
          {FOOTER_LINKS.map((l) => (
            <a
              key={l.label}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className="transition hover:text-ink"
            >
              {l.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
