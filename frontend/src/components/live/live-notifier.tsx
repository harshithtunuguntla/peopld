"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Hourglass, PartyPopper, Clock, Megaphone, X, ArrowRight } from "lucide-react";

import { useLiveNotifications, type LiveNotice } from "@/lib/live/use-live-notifications";
import { cn } from "@/lib/utils";

/**
 * Mounts the app-wide live notifier for an in-event page subtree and renders any
 * pending notices as toasts. Suppressed on the /live page (it shows the change
 * itself), but the underlying hook keeps watching so the baseline stays current.
 */
export function LiveNotifier({ eventId }: { eventId: string }) {
  const pathname = usePathname();
  // Suppress on /live (it shows the change itself) and /recap (post-event, so a
  // round/wrap toast there is just noise). The hook still tracks the baseline.
  const suppress =
    (pathname?.endsWith(`/event/${eventId}/live`) ||
      pathname?.endsWith(`/event/${eventId}/recap`)) ??
    false;
  const { notices, dismiss } = useLiveNotifications(eventId, suppress);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted || notices.length === 0) return null;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-3 bottom-3 z-[100] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:items-end"
      role="region"
      aria-label="Live event updates"
    >
      {notices.map((n) => (
        <Toast key={n.id} notice={n} onDismiss={() => dismiss(n.id)} />
      ))}
    </div>,
    document.body,
  );
}

const ICONS = {
  round_started: Bell,
  round_ended: Hourglass,
  event_ended: PartyPopper,
  ending_soon: Clock,
  announcement: Megaphone,
} as const;

function Toast({ notice, onDismiss }: { notice: LiveNotice; onDismiss: () => void }) {
  const router = useRouter();
  const [shown, setShown] = useState(false);
  const Icon = ICONS[notice.kind];

  // Slide/fade in on mount; auto-dismiss the non-sticky ones.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (!notice.sticky) timer = setTimeout(onDismiss, 7000);
    return () => {
      cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
    };
  }, [notice.sticky, onDismiss]);

  function go() {
    if (notice.cta) router.push(notice.cta.href);
    onDismiss();
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-auto w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-card/95 p-3.5 shadow-2xl backdrop-blur-xl transition-all duration-300 sm:w-80",
        shown ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
          <Icon className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{notice.title}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{notice.body}</p>
          {notice.cta && (
            <button
              type="button"
              onClick={go}
              className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-accent transition-opacity hover:opacity-80"
            >
              {notice.cta.label} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
