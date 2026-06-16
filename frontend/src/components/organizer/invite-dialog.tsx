"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

/**
 * Day-of-event invite: a big scannable QR that just opens the join page, plus the
 * access code shown large so the organizer can read it aloud. The QR deliberately
 * does NOT carry the code — joining always requires typing the code handed out in
 * the room (PRODUCT.md: access-code is the only door in), so a shared screenshot
 * can't let anyone in. Rendered locally (no network image) for flaky venue wifi.
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
  const [code, setCode] = useState<string | null>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let joinCode: string | null = null;
      try {
        const res = await apiFetch<{ code: string | null }>(`/events/${eventId}/access-code`);
        joinCode = res.code;
      } catch {
        /* code unavailable — the QR still opens the join page */
      }
      if (cancelled) return;
      setCode(joinCode);
      // The QR opens the join page only — never the code itself.
      const u = `${window.location.origin}/join`;
      setUrl(u);
      QRCode.toDataURL(u, { width: 512, margin: 1, color: { dark: "#0A0A12", light: "#FFFFFF" } })
        .then((d) => !cancelled && setDataUrl(d))
        .catch(() => !cancelled && setDataUrl(null));
    })();
    return () => {
      cancelled = true;
    };
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

        <p className="text-[11px] uppercase tracking-[0.3em] text-accent">Read this out</p>
        {eventName && <h2 className="mt-1.5 truncate font-display text-xl text-foreground">{eventName}</h2>}

        {code ? (
          <div className="mx-auto mt-4 w-fit rounded-2xl border border-border bg-background/50 px-6 py-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Access code</p>
            <p className="font-display text-4xl tracking-[0.3em] text-foreground">{code}</p>
          </div>
        ) : (
          <p className="mx-auto mt-4 max-w-[18rem] rounded-xl border border-warning/30 bg-warning/10 px-4 py-2.5 text-sm text-foreground/80">
            This event has no access code yet. Generate one on the dashboard so guests can join.
          </p>
        )}

        <div className="mx-auto mt-5 w-fit rounded-2xl bg-white p-3">
          {dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={dataUrl} alt="QR code that opens the join page" width={224} height={224} className="h-56 w-56" />
          ) : (
            <div className="h-56 w-56 animate-pulse rounded-lg bg-muted" />
          )}
        </div>

        <p className="mt-4 text-sm text-muted-foreground">
          Scan to open the join page, then type the code above. The QR never carries the code.
        </p>
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
