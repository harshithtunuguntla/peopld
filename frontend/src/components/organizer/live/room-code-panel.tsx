"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw, KeyRound, Copy, Check, X, DoorOpen } from "lucide-react";

import { apiFetch } from "@/lib/api";
import { Card } from "@/components/organizer/console-ui";
import { Button } from "@/components/ui/button";

// --- Room check-in code (Phase 2) ---
// The ONLY place the room code is ever shown. Self-contained: owner-gated GET on
// mount, then open / regenerate / close. The value lives only on this organizer
// screen — it is never put in a link or QR, so pre-registered guests can only
// check themselves in once they're physically in the room reading it.
export function RoomCodePanel({ eventId }: { eventId: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ code: string | null }>(`/events/${eventId}/room-code`)
      .then((r) => !cancelled && setCode(r.code))
      .catch(() => {})
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  async function run(method: "POST" | "DELETE", path: string) {
    setBusy(true);
    setErr(null);
    try {
      const r = await apiFetch<{ code: string | null }>(path, { method });
      setCode(r.code);
      setCopied(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong — try again");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the code is on screen to read aloud anyway */
    }
  }

  if (!loaded) {
    return <div className="mb-6 h-24 skeleton rounded-2xl border border-border" />;
  }

  return (
    <Card className="mb-6 p-5 sm:p-6">
      {code ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.22em] text-accent">
              <KeyRound className="h-3.5 w-3.5" aria-hidden /> Room check-in code
            </div>
            <div className="mt-2 font-mono text-4xl font-semibold tracking-[0.3em] text-foreground sm:text-5xl">
              {code}
            </div>
            <p className="mt-2 max-w-sm text-xs text-muted-foreground">
              Read it out or project it. Pre-registered guests type it to check themselves in. Don&apos;t share it before doors open.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button variant="accent" size="lg" onClick={copy} disabled={busy} className="min-w-[7rem]">
              {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button variant="outline" size="lg" onClick={() => run("POST", `/events/${eventId}/room-code/regenerate`)} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
              New code
            </Button>
            <Button variant="outline" size="lg" onClick={() => run("DELETE", `/events/${eventId}/room-code`)} disabled={busy}>
              <X className="h-4 w-4" aria-hidden /> Close
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <DoorOpen className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">Open self-service check-in</p>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                Generates a room code. Pre-registered guests type it to mark themselves arrived — no door queue.
              </p>
            </div>
          </div>
          <Button
            variant="accent"
            size="lg"
            onClick={() => run("POST", `/events/${eventId}/room-code/regenerate`)}
            disabled={busy}
            className="shrink-0"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <KeyRound className="h-4 w-4" aria-hidden />}
            {busy ? "Opening…" : "Open check-in"}
          </Button>
        </div>
      )}
      {err && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {err}
        </p>
      )}
    </Card>
  );
}
