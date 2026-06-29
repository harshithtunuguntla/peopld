"use client";

import { useState } from "react";
import { Megaphone, Send, Loader2, Check } from "lucide-react";

import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const MAX = 280;

/**
 * Organizer broadcast composer. Sends a one-line message to every attendee in the
 * room ("Pizza's here", "Move to the patio for round 3") — it persists and rings
 * the realtime doorbell, so phones surface it on their next /live (the in-app Live
 * Notifier shows the toast). Self-contained; owner-only endpoint. Mobile + laptop.
 */
export function AnnouncePanel({ eventId }: { eventId: string }) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sentTick, setSentTick] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = message.trim();

  async function send() {
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);
    try {
      await apiFetch(`/events/${eventId}/announcements`, {
        method: "POST",
        body: JSON.stringify({ message: trimmed }),
      });
      setMessage("");
      setSentTick(true);
      setTimeout(() => setSentTick(false), 2200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send — try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mb-5 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <Megaphone className="h-4 w-4" aria-hidden />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Announce to the room</p>
          <p className="text-xs text-muted-foreground">Pops up on everyone&apos;s phone who has the app open.</p>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, MAX))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          maxLength={MAX}
          placeholder="e.g. Pizza's here — grab a slice 🍕"
          aria-label="Announcement message"
          className="flex-1"
        />
        <Button variant="accent" onClick={send} disabled={!trimmed || sending} className="gap-1.5 sm:w-auto">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : sentTick ? <Check className="h-4 w-4" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
          {sentTick ? "Sent" : "Send"}
        </Button>
      </div>

      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-xs text-destructive">{error}</span>
        <span className="text-[11px] text-muted-foreground">{message.length}/{MAX}</span>
      </div>
    </div>
  );
}
