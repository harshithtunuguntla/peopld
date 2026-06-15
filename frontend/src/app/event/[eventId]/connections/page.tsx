"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { Loader2, Heart, MessageCircle, Linkedin, Sparkles, Users, StickyNote, Check } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";
import { LiveShell } from "@/components/live/live-screens";
import { Avatar } from "@/components/brand/avatar";
import { cn } from "@/lib/utils";

interface Connection {
  attendee_id: string;
  name: string;
  role: string;
  looking_for: string | null;
  whatsapp_number: string | null;
  linkedin_url: string | null;
  avatar_url: string | null;
  interests: string[];
  shared_interests: string[];
  note: string | null;
  round_number: number;
  table_number: number;
  liked: boolean;
  mutual: boolean;
}
interface ConnectionsResp {
  total_people_met: number;
  rounds_count: number;
  matches_count: number;
  connections: Connection[];
}

/** Grouped per person (you may share more than one round with someone). */
interface Person {
  attendee_id: string;
  name: string;
  role: string;
  looking_for: string | null;
  whatsapp_number: string | null;
  linkedin_url: string | null;
  avatar_url: string | null;
  interests: string[];
  shared_interests: string[];
  note: string | null;
  rounds: number[];
  liked: boolean;
  mutual: boolean;
}

function groupByPerson(rows: Connection[]): Person[] {
  const map = new Map<string, Person>();
  for (const c of rows) {
    const p = map.get(c.attendee_id);
    if (p) {
      if (!p.rounds.includes(c.round_number)) p.rounds.push(c.round_number);
      p.liked = p.liked || c.liked;
      p.mutual = p.mutual || c.mutual;
    } else {
      map.set(c.attendee_id, {
        attendee_id: c.attendee_id,
        name: c.name,
        role: c.role,
        looking_for: c.looking_for,
        whatsapp_number: c.whatsapp_number,
        linkedin_url: c.linkedin_url,
        avatar_url: c.avatar_url,
        interests: c.interests ?? [],
        shared_interests: c.shared_interests ?? [],
        note: c.note,
        rounds: [c.round_number],
        liked: c.liked,
        mutual: c.mutual,
      });
    }
  }
  // Matches first, then alphabetical.
  return [...map.values()].sort(
    (a, b) => Number(b.mutual) - Number(a.mutual) || a.name.localeCompare(b.name),
  );
}

export default function ConnectionsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [data, setData] = useState<ConnectionsResp | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setAuthChecked(true);
    });
  }, []);

  useEffect(() => {
    if (authChecked && !user) router.replace(`/event/${eventId}/register`);
  }, [authChecked, user, eventId, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const me = await apiFetch<{ id: string }>(`/events/${eventId}/attendees/me`);
        const conns = await apiFetch<ConnectionsResp>(
          `/events/${eventId}/attendees/${me.id}/connections`,
        );
        if (!cancelled) setData(conns);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Couldn't load your connections";
        if (/not registered/i.test(msg)) router.replace(`/event/${eventId}/register`);
        else setError(msg);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, eventId, router]);

  const people = useMemo(() => (data ? groupByPerson(data.connections) : []), [data]);

  if (!authChecked || !user) {
    return (
      <LiveShell>
        <Centered label="Loading…" />
      </LiveShell>
    );
  }

  return (
    <LiveShell eventId={eventId} right={<Link href="/home" className="text-xs text-muted-foreground transition-colors hover:text-foreground">Home</Link>}>
      <header>
        <p className="text-[11px] uppercase tracking-[0.3em] text-accent">Your rolodex</p>
        <h1 className="mt-2 font-display text-3xl leading-tight tracking-[-0.02em] text-foreground">
          People you met
        </h1>
      </header>

      {error && (
        <p role="alert" className="mt-6 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {error}
        </p>
      )}

      {!data && !error && (
        <div className="mt-8 space-y-3">
          <div className="h-20 animate-pulse rounded-2xl border border-border bg-card/40" />
          <div className="h-20 animate-pulse rounded-2xl border border-border bg-card/40" />
        </div>
      )}

      {data && (
        <>
          <div className="mt-6 grid grid-cols-3 gap-2.5">
            <Stat icon={<Users className="h-4 w-4" />} value={data.total_people_met} label="met" />
            <Stat icon={<Sparkles className="h-4 w-4" />} value={data.rounds_count} label="rounds" />
            <Stat icon={<Heart className="h-4 w-4" />} value={data.matches_count} label="matches" highlight={data.matches_count > 0} />
          </div>

          {people.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="mt-7 space-y-3">
              {people.map((p) => (
                <PersonCard key={p.attendee_id} person={p} eventId={eventId} />
              ))}
            </ul>
          )}
        </>
      )}
    </LiveShell>
  );
}

function Stat({ icon, value, label, highlight }: { icon: React.ReactNode; value: number; label: string; highlight?: boolean }) {
  return (
    <div className={cn("rounded-2xl border p-3 text-center", highlight ? "border-coral/40 bg-coral/10" : "border-border bg-card/50")}>
      <div className={cn("mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-full", highlight ? "text-coral" : "text-muted-foreground")}>
        {icon}
      </div>
      <div className="font-display text-2xl leading-none text-foreground">{value}</div>
      <div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function PersonCard({ person, eventId }: { person: Person; eventId: string }) {
  const wa = person.whatsapp_number ? `https://wa.me/${person.whatsapp_number.replace(/[^\d]/g, "")}` : null;
  const sharedSet = new Set(person.shared_interests.map((s) => s.toLowerCase()));
  const otherInterests = person.interests.filter((t) => !sharedSet.has(t.toLowerCase()));
  const rounds = [...person.rounds].sort((a, b) => a - b);
  return (
    <li className={cn("rounded-2xl border p-4", person.mutual ? "border-coral/40 bg-coral/[0.07]" : "border-border bg-card/50")}>
      <div className="flex items-start gap-3">
        <Avatar name={person.name} seed={person.attendee_id} src={person.avatar_url} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium text-foreground">{person.name}</p>
            {person.mutual ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-coral/20 px-2 py-0.5 text-[10px] font-medium text-coral">
                <Heart className="h-2.5 w-2.5 fill-current" aria-hidden /> Match
              </span>
            ) : person.liked ? (
              <Heart className="h-3.5 w-3.5 shrink-0 fill-coral text-coral" aria-label="You liked them" />
            ) : null}
          </div>
          <p className="truncate text-sm text-muted-foreground">{person.role}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Met in {rounds.length > 1 ? "rounds" : "round"} {rounds.join(", ")}
          </p>
        </div>
      </div>

      {person.looking_for && (
        <p className="mt-3 text-xs text-muted-foreground">
          <span className="text-muted-foreground/70">Looking for:</span> {person.looking_for}
        </p>
      )}

      {(person.shared_interests.length > 0 || otherInterests.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {person.shared_interests.map((tag) => (
            <span key={`s-${tag}`} className="rounded-full bg-accent/15 px-2.5 py-0.5 text-[11px] font-medium text-accent">
              {tag}
            </span>
          ))}
          {otherInterests.map((tag) => (
            <span key={`o-${tag}`} className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-muted-foreground">
              {tag}
            </span>
          ))}
        </div>
      )}

      {(wa || person.linkedin_url) && (
        <div className="mt-3 flex gap-2">
          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-background/40 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp
            </a>
          )}
          {person.linkedin_url && (
            <a
              href={person.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-background/40 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Linkedin className="h-4 w-4" aria-hidden /> LinkedIn
            </a>
          )}
        </div>
      )}

      <NoteEditor eventId={eventId} targetId={person.attendee_id} initial={person.note} />
    </li>
  );
}

/** Inline private note — collapsed to a prompt until tapped, saves on demand. */
function NoteEditor({ eventId, targetId, initial }: { eventId: string; targetId: string; initial: string | null }) {
  const [open, setOpen] = useState(Boolean(initial));
  const [note, setNote] = useState(initial ?? "");
  const [saved, setSaved] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <StickyNote className="h-3.5 w-3.5" aria-hidden /> Add a private note
      </button>
    );
  }

  async function save() {
    if (note.trim() === saved.trim()) return;
    setBusy(true);
    try {
      await apiFetch(`/events/${eventId}/notes/${targetId}`, {
        method: "PUT",
        body: JSON.stringify({ note: note.trim() }),
      });
      setSaved(note.trim());
    } catch {
      // keep the text so the user can retry; nothing destructive happened
    } finally {
      setBusy(false);
    }
  }

  const dirty = note.trim() !== saved.trim();
  return (
    <div className="mt-3">
      <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        <StickyNote className="h-3 w-3" aria-hidden /> Private note · only you see this
      </label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={save}
        rows={2}
        maxLength={500}
        placeholder="e.g. intro to Priya re: hiring"
        className="mt-1.5 w-full resize-none rounded-xl border border-input bg-secondary/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      />
      <div className="mt-1 flex h-4 items-center justify-end text-[11px] text-muted-foreground">
        {busy ? (
          <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Saving…</span>
        ) : dirty ? (
          <span>Tap outside to save</span>
        ) : saved ? (
          <span className="inline-flex items-center gap-1 text-chlorine"><Check className="h-3 w-3" aria-hidden /> Saved</span>
        ) : null}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mt-10 rounded-2xl border border-dashed border-border bg-card/40 px-6 py-10 text-center">
      <Users className="mx-auto h-7 w-7 text-muted-foreground" aria-hidden />
      <p className="mt-3 font-display text-lg text-foreground">No connections yet</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Once the rounds get going, everyone you sit with shows up here.
      </p>
    </div>
  );
}

function Centered({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-3 pt-16 text-sm text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
      {label}
    </div>
  );
}
