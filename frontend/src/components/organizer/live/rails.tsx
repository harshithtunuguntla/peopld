"use client";

import { Armchair, Star } from "lucide-react";

import { Card } from "@/components/organizer/console-ui";
import { Avatar } from "@/components/brand/avatar";
import type { Attendee } from "./types";

// --- People who've arrived but aren't seated this round ---
// Gives the organizer a glanceable rail of who to walk over to a table. Speakers
// and hosts are guests (excluded from the rotation), so they are NOT stragglers —
// they're surfaced separately in <Guests/> so this list stays an honest chase-list.
export function NotSeated({ byId, seatedIds }: { byId: Map<string, Attendee>; seatedIds: Set<string> }) {
  const stragglers = [...byId.values()].filter(
    (a) => a.status === "arrived" && a.tag === "attendee" && !seatedIds.has(a.id),
  );
  if (stragglers.length === 0) return null;
  return (
    <Card className="p-4">
      <div className="mb-2.5 flex items-center gap-2 text-sm font-medium text-foreground">
        <Armchair className="h-4 w-4 text-warning" aria-hidden /> Not seated
        <span className="ml-auto rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
          {stragglers.length}
        </span>
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {stragglers.map((a) => (
          <li
            key={a.id}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 py-1 pl-1 pr-2.5"
          >
            <Avatar name={a.name} seed={a.id} src={a.avatar_url} size={20} />
            <span className="text-xs text-foreground">{a.name}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// --- VIP guests in the room but intentionally off the floor ---
// Speakers/hosts attend but aren't shuffled between tables. Showing them here
// (rather than letting them vanish) tells the organizer "your keynote is here —
// and yes, deliberately not seated", so the floor map's missing faces make sense.
export function Guests({ byId }: { byId: Map<string, Attendee> }) {
  const guests = [...byId.values()].filter(
    (a) => a.status === "arrived" && a.tag !== "attendee",
  );
  if (guests.length === 0) return null;
  return (
    <Card className="p-4">
      <div className="mb-2.5 flex items-center gap-2 text-sm font-medium text-foreground">
        <Star className="h-4 w-4 text-gold" aria-hidden /> Guests
        <span className="ml-auto rounded-full bg-gold/20 px-2 py-0.5 text-xs font-medium text-foreground">
          {guests.length}
        </span>
      </div>
      <p className="mb-2.5 text-xs text-muted-foreground">In the room — not seated in the rotation.</p>
      <ul className="flex flex-wrap gap-1.5">
        {guests.map((a) => (
          <li
            key={a.id}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 py-1 pl-1 pr-2.5"
          >
            <Avatar name={a.name} seed={a.id} src={a.avatar_url} size={20} />
            <span className="text-xs text-foreground">{a.name}</span>
            <span className="rounded-full bg-gold/20 px-1.5 text-[9px] font-semibold uppercase tracking-wide text-foreground">
              {a.tag}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
