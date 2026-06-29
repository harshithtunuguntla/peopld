"use client";

import { useRef, useState } from "react";
import { Share2, Download, Loader2, Check } from "lucide-react";

import { StoryCard, type StoryCardData } from "@/components/recap/story-card";
import { shareStoryCard } from "@/lib/share-image";
import { cn } from "@/lib/utils";

/**
 * Post-event "share your night" block: a live preview of the story card plus a
 * one-tap Share (native sheet, image as a file) with a Download fallback. The
 * card itself is brand-fixed (always the dark Peopld look) so it reads well
 * wherever it lands — feed, status, DM.
 */
export function ShareRecap({ data }: { data: StoryCardData }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function share(forceDownload = false) {
    if (busy || !cardRef.current) return;
    setBusy(true);
    setError(null);
    try {
      const result = await shareStoryCard(cardRef.current, {
        fileName: `peopld-${(data.eventName || "event").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`,
        title: `My night at ${data.eventName || "the event"}`,
        text: `I met ${data.peopleMet} new ${data.peopleMet === 1 ? "person" : "people"} at ${data.eventName || "the event"} 🎉`,
        forceDownload,
      });
      if (result !== "cancelled") {
        setDone(true);
        setTimeout(() => setDone(false), 2600);
      }
    } catch {
      setError("Couldn't create the image — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto mt-9 max-w-md">
      <div className="text-center">
        <h2 className="font-display text-xl text-foreground">Share your night</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          One tap to post your recap — bring someone to the next one.
        </p>
      </div>

      {/* Live preview of exactly what gets shared. */}
      <div className="mt-5 rounded-[32px] border border-border bg-card/40 p-3 shadow-sm">
        <StoryCard ref={cardRef} data={data} />
      </div>

      <div className="mt-4 flex gap-2.5">
        <button
          type="button"
          onClick={() => share(false)}
          disabled={busy}
          className={cn(
            "inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full text-sm font-semibold transition-colors disabled:opacity-70",
            done
              ? "bg-success/15 text-success"
              : "bg-accent text-accent-foreground hover:opacity-90 glow-ember",
          )}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : done ? (
            <Check className="h-4 w-4" aria-hidden />
          ) : (
            <Share2 className="h-4 w-4" aria-hidden />
          )}
          {busy ? "Preparing…" : done ? "Shared" : "Share my recap"}
        </button>
        <button
          type="button"
          onClick={() => share(true)}
          disabled={busy}
          aria-label="Download recap image"
          title="Download image"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground disabled:opacity-70"
        >
          <Download className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {error && <p className="mt-2 text-center text-xs text-destructive">{error}</p>}
    </section>
  );
}
