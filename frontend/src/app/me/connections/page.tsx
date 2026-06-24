"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { Loader2, ChevronLeft, Users, CalendarDays, Heart, Search, Bookmark } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";
import { AccountMenu } from "@/components/attendee/account-menu";
import { Wordmark } from "@/components/brand/wordmark";
import { AuroraBackground } from "@/components/brand/aurora-background";
import { PersonCard, type Person, type Connection } from "@/components/connections/person-card";
import { cn } from "@/lib/utils";

interface MyConnection extends Connection {
  event_id: string;
  event_name: string;
  event_date: string; // YYYY-MM-DD
}
interface MyConnectionsResp {
  total_people_met: number;
  events_count: number;
  matches_count: number;
  connections: MyConnection[];
}

/** "2026-07-01" -> "1 Jul". */
function shortDate(d: string): string {
  const parsed = new Date(`${d}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? d
    : parsed.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

interface CrossEventCard {
  person: Person;
  eventId: string;
  eventName: string;
  eventDate: string;
}

/** One card per (event, person) — the same person at two events shows twice,
 * each tagged with its event. */
function groupCrossEvent(rows: MyConnection[]): CrossEventCard[] {
  const map = new Map<string, CrossEventCard>();
  for (const c of rows) {
    const met = c.met ?? true;
    const key = `${c.event_id}::${c.attendee_id}`;
    const existing = map.get(key);
    if (existing) {
      if (met && !existing.person.rounds.includes(c.round_number)) existing.person.rounds.push(c.round_number);
      existing.person.met = existing.person.met || met;
      existing.person.wanted = existing.person.wanted || Boolean(c.wanted);
      existing.person.wants_me = existing.person.wants_me || Boolean(c.wants_me);
      existing.person.liked = existing.person.liked || c.liked;
      existing.person.mutual = existing.person.mutual || c.mutual;
      existing.person.saved = existing.person.saved || c.saved;
    } else {
      map.set(key, {
        eventId: c.event_id,
        eventName: c.event_name,
        eventDate: c.event_date,
        person: {
          attendee_id: c.attendee_id,
          name: c.name,
          role: c.role,
          company: c.company,
          looking_for: c.looking_for,
          linkedin_url: c.linkedin_url,
          website_url: c.website_url,
          avatar_url: c.avatar_url,
          interests: c.interests ?? [],
          shared_interests: c.shared_interests ?? [],
          note: c.note,
          rounds: met ? [c.round_number] : [],
          met,
          wanted: Boolean(c.wanted),
          wants_me: Boolean(c.wants_me),
          liked: c.liked,
          mutual: c.mutual,
          saved: c.saved,
          eventLabel: `${c.event_name} · ${shortDate(c.event_date)}`,
        },
      });
    }
  }
  // Matches first, then people you actually met, then everyone else; alpha within.
  return [...map.values()].sort(
    (a, b) =>
      Number(b.person.mutual) - Number(a.person.mutual) ||
      Number(b.person.met) - Number(a.person.met) ||
      a.person.name.localeCompare(b.person.name),
  );
}

export default function MyConnectionsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [data, setData] = useState<MyConnectionsResp | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setAuthChecked(true);
    });
  }, []);

  useEffect(() => {
    if (authChecked && !user) router.replace("/home");
  }, [authChecked, user, router]);

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    setError(null);
    apiFetch<MyConnectionsResp>("/me/connections", { signal: controller.signal })
      .then((nextData) => {
        if (controller.signal.aborted) return;
        setData(nextData);
        setError(null);
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Couldn't load your connections");
      });
    return () => controller.abort();
  }, [user]);

  const cards = useMemo(() => (data ? groupCrossEvent(data.connections) : []), [data]);
  const profileEventId = data?.connections[0]?.event_id ?? null;

  // Filters: search by name/role/company, narrow to one event, and a relationship
  // tab (everyone / people you actually met / saved). These were the gaps reported
  // after the pilot, when the rolodex was a long undifferentiated list.
  const [query, setQuery] = useState("");
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [relFilter, setRelFilter] = useState<"all" | "met" | "saved">("all");

  // The events represented in the rolodex, newest first — drives the event filter.
  const eventOptions = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; date: string }>();
    for (const c of cards) {
      if (!seen.has(c.eventId)) seen.set(c.eventId, { id: c.eventId, name: c.eventName, date: c.eventDate });
    }
    return [...seen.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [cards]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return cards.filter((c) => {
      if (eventFilter !== "all" && c.eventId !== eventFilter) return false;
      if (relFilter === "met" && !c.person.met) return false;
      if (relFilter === "saved" && !c.person.saved) return false;
      if (!needle) return true;
      const hay = `${c.person.name} ${c.person.role} ${c.person.company ?? ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [cards, query, eventFilter, relFilter]);

  return (
    <div className="relative min-h-dvh overflow-hidden bg-background text-foreground">
      <AuroraBackground intensity={0.35} />
      <div className="pointer-events-none absolute inset-0 grid-paper-light opacity-[0.12]" aria-hidden />

      <div className="relative z-10 mx-auto w-full max-w-3xl px-5 pb-16 pt-7">
        <div className="flex items-center justify-between">
          <Link
            href="/home"
            aria-label="Go to Peopld home"
            className="inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Wordmark size={24} />
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/home"
              className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Hub
            </Link>
            <AccountMenu
              user={user}
              editProfileHref={profileEventId ? `/event/${profileEventId}/profile` : null}
              connectionsHref="/me/connections"
            />
          </div>
        </div>

        <header className="mt-8">
          <p className="text-[11px] uppercase tracking-[0.3em] text-accent">Your rolodex</p>
          <h1 className="mt-2 font-display text-3xl leading-tight tracking-[-0.02em] text-foreground sm:text-4xl">
            My connections
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Everyone you&apos;ve met, across every event.</p>
        </header>

        {error && (
          <p role="alert" className="mt-6 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
            {error}
          </p>
        )}

        {!data && !error && (
          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="h-24 skeleton rounded-2xl border border-border" />
            <div className="h-24 skeleton rounded-2xl border border-border" />
          </div>
        )}

        {data && (
          <>
            <div className="mt-6 grid grid-cols-3 gap-2.5">
              <Stat icon={<Users className="h-4 w-4" />} value={data.total_people_met} label="met" />
              <Stat icon={<CalendarDays className="h-4 w-4" />} value={data.events_count} label="events" />
              <Stat icon={<Heart className="h-4 w-4" />} value={data.matches_count} label="matches" highlight={data.matches_count > 0} />
            </div>

            {cards.length === 0 ? (
              <EmptyState />
            ) : (
              <>
                {/* Search + filters — find anyone fast, or narrow to one event. */}
                <div className="mt-7 flex flex-col gap-3">
                  <div className="flex h-11 items-center gap-2 rounded-full border border-border bg-card px-3.5">
                    <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search by name, role, or company…"
                      aria-label="Search connections"
                      className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <RelTabs filter={relFilter} onChange={setRelFilter} savedCount={cards.filter((c) => c.person.saved).length} />
                    {eventOptions.length > 1 && (
                      <select
                        value={eventFilter}
                        onChange={(e) => setEventFilter(e.target.value)}
                        aria-label="Filter by event"
                        className="h-9 rounded-full border border-border bg-card px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="all">All events</option>
                        {eventOptions.map((ev) => (
                          <option key={ev.id} value={ev.id}>
                            {ev.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                {visible.length === 0 ? (
                  <p className="mt-10 text-center text-sm text-muted-foreground">No one matches those filters.</p>
                ) : (
                  // Masonry (CSS columns) — cards have very different heights (links,
                  // notes, interest chips), so a grid would stretch every card in a row
                  // to the tallest and leave dead space. Columns let each card size to
                  // its own content and pack tightly.
                  <ul className="mt-5 columns-1 gap-x-3 sm:columns-2 [&>li]:mb-3 [&>li]:break-inside-avoid">
                    {visible.map(({ person, eventId }) => (
                      <PersonCard key={`${eventId}-${person.attendee_id}`} person={person} eventId={eventId} />
                    ))}
                  </ul>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Everyone / Met / Saved segmented filter for the cross-event rolodex. */
function RelTabs({
  filter,
  onChange,
  savedCount,
}: {
  filter: "all" | "met" | "saved";
  onChange: (f: "all" | "met" | "saved") => void;
  savedCount: number;
}) {
  const tab = (key: "all" | "met" | "saved", label: React.ReactNode) => (
    <button
      type="button"
      onClick={() => onChange(key)}
      aria-pressed={filter === key}
      className={cn(
        "inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors",
        filter === key ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
  return (
    <div className="inline-flex items-center rounded-full border border-border bg-secondary p-1">
      {tab("all", "Everyone")}
      {tab("met", "Met")}
      {tab(
        "saved",
        <>
          <Bookmark className={cn("h-3.5 w-3.5", filter === "saved" && "fill-current")} aria-hidden />
          Saved{savedCount > 0 ? ` · ${savedCount}` : ""}
        </>,
      )}
    </div>
  );
}

function Stat({ icon, value, label, highlight }: { icon: React.ReactNode; value: number; label: string; highlight?: boolean }) {
  return (
    <div className={cn("rounded-2xl border p-3 text-center", highlight ? "border-accent/40 bg-accent/10" : "border-border bg-card/50")}>
      <div className={cn("mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-full", highlight ? "text-accent" : "text-muted-foreground")}>
        {icon}
      </div>
      <div className="font-display text-2xl leading-none text-foreground">{value}</div>
      <div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mt-10 rounded-2xl border border-dashed border-border bg-card/40 px-6 py-10 text-center">
      <Users className="mx-auto h-7 w-7 text-muted-foreground" aria-hidden />
      <p className="mt-3 font-display text-lg text-foreground">No connections yet</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Join an event and the people you sit with will collect here.
      </p>
    </div>
  );
}
