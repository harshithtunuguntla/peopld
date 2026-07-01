"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { Loader2, ChevronLeft, Users, CalendarDays, Heart, Bookmark, UserCheck } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";
import { AccountMenu } from "@/components/attendee/account-menu";
import { Wordmark } from "@/components/brand/wordmark";
import { AuroraBackground } from "@/components/brand/aurora-background";
import { PersonCard, type Person } from "@/components/connections/person-card";
import { SearchBox } from "@/components/connections/search-box";
import { tokenize } from "@/lib/connections/search";
import { SelectMenu } from "@/components/ui/select-menu";
import { Pagination } from "@/components/ui/pagination";
import { useDebouncedValue } from "@/lib/use-debounced";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 12; // connection cards per page

type RelFilter = "all" | "met" | "matches" | "liked" | "saved";

/** One deduped card as the API returns it (person fields + which event). */
interface ApiCard {
  attendee_id: string;
  name: string;
  role: string;
  company: string | null;
  looking_for: string | null;
  linkedin_url: string | null;
  website_url: string | null;
  avatar_url: string | null;
  interests: string[];
  shared_interests: string[];
  note: string | null;
  rounds: number[];
  met: boolean;
  wanted: boolean;
  wants_me: boolean;
  liked: boolean;
  mutual: boolean;
  saved: boolean;
  event_id: string;
  event_name: string;
  event_date: string; // YYYY-MM-DD
}
interface EventRef {
  id: string;
  name: string;
  date: string;
}
interface MyConnectionsPage {
  total_people_met: number;
  events_count: number;
  matches_count: number;
  rel_counts: Record<RelFilter, number>;
  events: EventRef[];
  page: number;
  limit: number;
  total: number;
  total_pages: number;
  connections: ApiCard[];
}

/** "2026-07-01" -> "1 Jul". */
function shortDate(d: string): string {
  const parsed = new Date(`${d}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? d
    : parsed.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** API card → the PersonCard's Person shape (+ which event it came from). */
function toPerson(c: ApiCard): Person {
  return {
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
    rounds: c.rounds ?? [],
    met: c.met,
    wanted: c.wanted,
    wants_me: c.wants_me,
    liked: c.liked,
    mutual: c.mutual,
    saved: c.saved,
    eventLabel: `${c.event_name} · ${shortDate(c.event_date)}`,
  };
}

export default function MyConnectionsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [data, setData] = useState<MyConnectionsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters: search by name/role/company, narrow to one event, and a relationship
  // tab (everyone / met / matches / liked / saved). All applied SERVER-SIDE now so
  // pagination stays consistent and the payload stays small.
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query.trim(), 300);
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [relFilter, setRelFilter] = useState<RelFilter>("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setAuthChecked(true);
    });
  }, []);

  useEffect(() => {
    if (authChecked && !user) router.replace("/home");
  }, [authChecked, user, router]);

  // Any filter/search change → back to page 1.
  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, eventFilter, relFilter]);

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (debouncedQuery) params.set("q", debouncedQuery);
    if (eventFilter !== "all") params.set("event", eventFilter);
    if (relFilter !== "all") params.set("rel", relFilter);
    apiFetch<MyConnectionsPage>(`/me/connections?${params}`, { signal: controller.signal })
      .then((next) => {
        if (controller.signal.aborted) return;
        setData(next);
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Couldn't load your connections");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [user, page, debouncedQuery, eventFilter, relFilter]);

  const terms = useMemo(() => tokenize(debouncedQuery), [debouncedQuery]);
  const profileEventId = data?.events[0]?.id ?? null;
  const hasAny = (data?.rel_counts.all ?? 0) > 0;

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
              editProfileHref={profileEventId ? `/event/${profileEventId}/profile` : "/me/profile"}
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

            {!hasAny ? (
              <EmptyState />
            ) : (
              <>
                {/* Search + filters — find anyone fast, or narrow to one event. */}
                <div className="mt-7 flex flex-col gap-3">
                  <SearchBox
                    value={query}
                    onChange={setQuery}
                    placeholder="Search name, role, interest, note…"
                    ariaLabel="Search connections"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <RelTabs filter={relFilter} onChange={setRelFilter} counts={data.rel_counts} />
                    {data.events.length > 1 && (
                      <SelectMenu
                        value={eventFilter}
                        onChange={setEventFilter}
                        ariaLabel="Filter by event"
                        options={[
                          { value: "all", label: "All events" },
                          ...data.events.map((ev) => ({ value: ev.id, label: ev.name })),
                        ]}
                      />
                    )}
                  </div>
                </div>

                {data.total === 0 ? (
                  <p className="mt-10 text-center text-sm text-muted-foreground">No one matches those filters.</p>
                ) : (
                  <>
                    {/* Masonry (CSS columns) — cards have very different heights (links,
                        notes, interest chips), so a grid would stretch every card in a row
                        to the tallest and leave dead space. Columns pack them tightly. */}
                    <ul className={cn("mt-5 columns-1 gap-x-3 transition-opacity sm:columns-2 [&>li]:mb-3 [&>li]:break-inside-avoid", loading && "opacity-60")}>
                      {data.connections.map((c) => (
                        <PersonCard key={`${c.event_id}-${c.attendee_id}`} person={toPerson(c)} eventId={c.event_id} highlight={terms} />
                      ))}
                    </ul>
                    <Pagination
                      className="mt-8"
                      page={data.page}
                      totalPages={data.total_pages}
                      onChange={(p) => {
                        setPage(p);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      summary={`Showing ${(data.page - 1) * data.limit + 1}–${Math.min(data.page * data.limit, data.total)} of ${data.total}`}
                    />
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Everyone / Met / Matches / Liked / Saved chip filter for the cross-event
 *  rolodex. A chip only shows when it would match someone (no dead filters). */
function RelTabs({
  filter,
  onChange,
  counts,
}: {
  filter: RelFilter;
  onChange: (f: RelFilter) => void;
  counts: Record<RelFilter, number>;
}) {
  const items: { key: RelFilter; label: string; icon: React.ReactNode }[] = [
    { key: "all", label: "Everyone", icon: <Users className="h-3.5 w-3.5" aria-hidden /> },
    { key: "met", label: "Met", icon: <UserCheck className="h-3.5 w-3.5" aria-hidden /> },
    { key: "matches", label: "Matches", icon: <Heart className="h-3.5 w-3.5 fill-current" aria-hidden /> },
    { key: "liked", label: "Liked", icon: <Heart className="h-3.5 w-3.5" aria-hidden /> },
    { key: "saved", label: "Saved", icon: <Bookmark className="h-3.5 w-3.5" aria-hidden /> },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {items
        .filter((it) => it.key === "all" || (counts[it.key] ?? 0) > 0)
        .map((it) => {
          const active = filter === it.key;
          return (
            <button
              key={it.key}
              type="button"
              onClick={() => onChange(it.key)}
              aria-pressed={active}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
                active
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground",
              )}
            >
              {it.icon}
              {it.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-[11px] tabular-nums",
                  active ? "bg-accent-foreground/20 text-accent-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {counts[it.key] ?? 0}
              </span>
            </button>
          );
        })}
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
