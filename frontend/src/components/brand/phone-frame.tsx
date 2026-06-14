import type { ReactNode } from "react";
import { Wifi, BatteryFull, Signal } from "lucide-react";

/** A device mockup used ONLY for marketing previews (landing ScenesGallery).
 * Never wrap a real shipped attendee route in this. See DESIGN_SYSTEM §4. */
export function PhoneFrame({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`relative h-[700px] w-[340px] max-w-full rounded-[3.2rem] bg-gradient-to-b from-zinc-700 to-zinc-950 p-3 shadow-2xl ring-1 ring-white/5 sm:h-[800px] sm:w-[380px] ${className}`}
    >
      <div className="relative h-full w-full overflow-hidden rounded-[2.6rem] bg-ink-950">
        <div className="relative flex h-7 items-center justify-between px-7 text-[11px] font-medium text-cream/90">
          <span>9:41</span>
          <div className="absolute left-1/2 top-2 h-5 w-24 -translate-x-1/2 rounded-full bg-black" aria-hidden />
          <div className="flex items-center gap-1" aria-hidden>
            <Signal className="h-3 w-3" />
            <Wifi className="h-3 w-3" />
            <BatteryFull className="h-3.5 w-3.5" />
          </div>
        </div>
        <div className="h-[calc(100%-28px)] overflow-y-auto scrollbar-hide">{children}</div>
      </div>
    </div>
  );
}
