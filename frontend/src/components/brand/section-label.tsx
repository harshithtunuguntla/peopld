import { cn } from "@/lib/utils";

type SectionLabelProps = {
  children: React.ReactNode;
  /** Color/override classes, e.g. "text-coral" or "text-plasma". */
  className?: string;
};

/** The uppercase, wide-tracked eyebrow above section headings (e.g. "/ The problem"). */
export function SectionLabel({ children, className }: SectionLabelProps) {
  return (
    <div className={cn("text-[11px] uppercase tracking-[0.3em] text-coral", className)}>{children}</div>
  );
}
