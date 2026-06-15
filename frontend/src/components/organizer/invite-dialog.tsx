"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy, X } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Day-of-event invite: a big scannable QR + a copyable register link, so the
 * organizer can get 40 phones onto the registration page in seconds. The QR is
 * rendered locally (no network image), so it works even on flaky venue wifi.
 */
export function InviteDialog({
  eventId,
  eventName,
  onClose,
}: {
  eventId: string;
  eventName?: string;
  onClose: () => void;
}) {
  const [url, setUrl] = useState("");
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const u = `${window.location.origin}/event/${eventId}/register`;
    setUrl(u);
    QRCode.toDataURL(u, { width: 512, margin: 1, color: { dark: "#0A0A12", light: "#FFFFFF" } })
      .then(setDataUrl)
      .catch(() => setDataUrl(null));
  }, [eventId]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the link is still visible to copy by hand */
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Invite attendees"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm rounded-3xl border border-border bg-card p-6 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>

        <p className="text-[11px] uppercase tracking-[0.3em] text-accent">Scan to join</p>
        {eventName && <h2 className="mt-1.5 truncate font-display text-xl text-foreground">{eventName}</h2>}

        <div className="mx-auto mt-5 w-fit rounded-2xl bg-white p-3">
          {dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={dataUrl} alt="QR code to register" width={224} height={224} className="h-56 w-56" />
          ) : (
            <div className="h-56 w-56 animate-pulse rounded-lg bg-muted" />
          )}
        </div>

        <p className="mt-4 text-sm text-muted-foreground">Point a camera here, or share the link:</p>
        <div className="mt-2 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-xl border border-border bg-background/50 px-3 py-2.5 text-left text-xs text-foreground">
            {url}
          </code>
          <Button variant={copied ? "secondary" : "accent"} size="default" onClick={copy} className="shrink-0">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>
    </div>
  );
}
