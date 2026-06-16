"use client";

import { useEffect, useState } from "react";
import { Loader2, KeyRound, Copy, Check, RefreshCw, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Per-event access code: view, copy, regenerate, or remove. The secret value is
 * fetched lazily (owner-only endpoint) the first time it's needed. This is the
 * code attendees use on the hub's "Join via access code" / QR. Shared by the
 * dashboard event card and the event Settings page.
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

  async function regenerate() {
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

  async function remove() {
    setBusy(true);
    try {
      await apiFetch(`/events/${eventId}/access-code`, { method: "DELETE" });
      setCode(null);
    } catch {
      /* no-op */
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
            title="Copy code"
            className="inline-flex items-center gap-1.5 font-display text-lg tracking-[0.2em] text-foreground transition-colors hover:text-accent"
          >
            {code}
            {copied ? <Check className="h-3.5 w-3.5 text-success" aria-hidden /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />}
          </button>
          <div className="ml-auto flex items-center gap-1">
            <CodeBtn label="Regenerate code" onClick={regenerate} busy={busy}>
              <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} aria-hidden />
            </CodeBtn>
            <CodeBtn label="Remove code (make open)" onClick={remove} busy={busy}>
              <X className="h-3.5 w-3.5" aria-hidden />
            </CodeBtn>
          </div>
        </>
      ) : (
        <>
          <span className="text-sm text-muted-foreground">No code — open event</span>
          <Button variant="outline" size="sm" onClick={regenerate} disabled={busy} className="ml-auto gap-1.5">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
            Generate code
          </Button>
        </>
      )}
    </div>
  );
}

function CodeBtn({ label, onClick, busy, children }: { label: string; onClick: () => void; busy: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
    >
      {children}
    </button>
  );
}
