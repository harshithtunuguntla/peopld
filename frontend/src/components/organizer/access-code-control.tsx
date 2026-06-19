"use client";

import { useEffect, useState } from "react";
import { Loader2, KeyRound, Copy, Check } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";

/**
 * Per-event access code: view + copy. This is the code attendees use on the hub's
 * "Join via access code" / QR.
 *
 * The code is set ONCE — at event creation, or via a one-time "Generate" here if
 * the event was created open. After that it's permanent: it can't be regenerated
 * or removed, because attendees may already have it on a card / QR and rotating
 * it would silently lock them out. The backend enforces this (409 on any change);
 * the UI simply stops offering the actions once a code exists.
 *
 * Shared by the dashboard event card and the event Settings page.
 */
export function AccessCodeControl({ eventId, initialHasCode }: { eventId: string; initialHasCode: boolean }) {
  const [code, setCode] = useState<string | null | undefined>(initialHasCode ? undefined : null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!initialHasCode) return;
    apiFetch<{ code: string | null }>(`/events/${eventId}/access-code`)
      .then((r) => setCode(r.code))
      .catch(() => setCode(null));
  }, [eventId, initialHasCode]);

  async function generate() {
    setBusy(true);
    try {
      const r = await apiFetch<{ code: string | null }>(`/events/${eventId}/access-code/regenerate`, { method: "POST" });
      setCode(r.code);
    } catch {
      /* leave the current value; the organizer can retry */
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — value is still visible */
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background/40 px-3 py-2">
      <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      {code === undefined ? (
        <span className="text-sm text-muted-foreground">Loading code…</span>
      ) : code ? (
        <>
          <button
            type="button"
            onClick={copy}
            title="Copy code — it's permanent once set"
            className="inline-flex items-center gap-1.5 font-display text-lg tracking-[0.2em] text-foreground transition-colors hover:text-accent"
          >
            {code}
            {copied ? <Check className="ml-auto h-3.5 w-3.5 text-success" aria-hidden /> : <Copy className="ml-auto h-3.5 w-3.5 text-muted-foreground" aria-hidden />}
          </button>
        </>
      ) : (
        <>
          <span className="text-sm text-muted-foreground">No code — open event</span>
          <Button variant="outline" size="sm" onClick={generate} disabled={busy} className="ml-auto gap-1.5">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
            Generate code
          </Button>
        </>
      )}
    </div>
  );
}
