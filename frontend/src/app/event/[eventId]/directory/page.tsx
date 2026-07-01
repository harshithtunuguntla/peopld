"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Mic,
  Sparkles,
  UserPlus,
  UserCheck,
  Users,
} from "lucide-react";

import { supabase } from "@/lib/supabase";
import { apiFetch, ApiError } from "@/lib/api";
import { AccountMenu } from "@/components/attendee/account-menu";
import { AuroraBackground } from "@/components/brand/aurora-background";
import { Wordmark } from "@/components/brand/wordmark";
import { Avatar } from "@/components/brand/avatar";
import { SearchBox, Highlight } from "@/components/connections/search-box";
import { ContactActions } from "@/components/connections/contact-actions";
import { searchItems, tokenize, type FieldSpec } from "@/lib/connections/search";
import { cn } from "@/lib/utils";

type Tag = "attendee" | "speaker" | "host";

interface DirectoryEntry {
  attendee_id: string;
  name: string;
  role: string;
  company: string | null;
  description: string | null;
  looking_for: string | null;
  linkedin_url: string | null;
  website_url: string | null;
  instagram: string | null;
  twitter: string | null;
  email: string | null;
  phone: string | null; // present only when the owner made it visible
  phone_dial_code: string | null;
  interests: string[];
  shared_interests: string[];
  avatar_url: string | null;
  tag: Tag;
  wanted_by_me: boolean;
}

interface DirectoryResp {
  count: number;
  speakers: number;
  my_intents_used: number;
  my_intents_cap: number;
  attendees: DirectoryEntry[];
}

type FilterKey = "all" | "speakers" | "shared";

/** Searchable fields for the guest list (generic engine, see lib/connections/search). */
const DIRECTORY_FIELDS: FieldSpec<DirectoryEntry>[] = [
  { get: (p) => p.name, weight: 5 },
  { get: (p) => p.role, weight: 4 },
  { get: (p) => p.company, weight: 3 },
  { get: (p) => p.looking_for, weight: 2 },
  { get: (p) => p.interests, weight: 2 },
  { get: (p) => p.description, weight: 1 }, // the free-text bio
];

/** Pre-event "who's coming" — browse everyone registered, and pick who you most
 * want to meet (Phase 3a). Picks are private; we seat you with mutual picks. */
export default function DirectoryPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [data, setData] = useState<DirectoryResp | null>(null);
  const [eventName, setEventName] = useState("");
  const [eventEnded, setEventEnded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Picks ("I want to meet") — lifted here so the counter + cap apply across cards.
  const [wantedIds, setWantedIds] = useState<Set<string>>(new Set());
  const [cap, setCap] = useState(0);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [pickMsg, setPickMsg] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");

  // The viewer's own name prefills the WhatsApp intro on each card.
  const viewerName =
    (user?.user_metadata?.full_name as string) || (user?.user_metadata?.name as string) || "";

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
    apiFetch<{ name: string; status?: string }>(`/events/${eventId}`)
      .then((e) => {
        if (cancelled) return;
        setEventName(e.name);
        setEventEnded(e.status === "ended");
      })
      .catch(() => {});
    apiFetch<DirectoryResp>(`/events/${eventId}/directory`)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setWantedIds(new Set(d.attendees.filter((p) => p.wanted_by_me).map((p) => p.attendee_id)));
        setCap(d.my_intents_cap);
      })
      .catch((e) => {
        if (cancelled) return;
        // Not registered → you can't see the guest list; send them to register.
        if (e instanceof ApiError && (e.status === 403 || e.status === 401)) {
          router.replace(`/event/${eventId}/register`);
          return;
        }
        setError(e instanceof Error ? e.message : "Couldn't load the guest list");
      });
    return () => {
      cancelled = true;
    };
  }, [user, eventId, router]);

  const used = wantedIds.size;
  const picksEnabled = cap > 0; // false for organizers previewing the list
  const capReached = picksEnabled && used >= cap;

  const toggleIntent = useCallback(
    async (person: DirectoryEntry) => {
      const id = person.attendee_id;
      if (pending.has(id)) return;
      const wasWanted = wantedIds.has(id);
      if (!wasWanted && capReached) {
        setPickMsg(`You can pick up to ${cap} people. Remove one to add another.`);
        return;
      }
      setPickMsg(null);
      // optimistic
      setWantedIds((prev) => {
        const next = new Set(prev);
        if (wasWanted) next.delete(id);
        else next.add(id);
        return next;
      });
      setPending((prev) => new Set(prev).add(id));
      try {
        if (wasWanted) {
          await apiFetch(`/events/${eventId}/intents/${id}`, { method: "DELETE" });
        } else {
          await apiFetch(`/events/${eventId}/intents`, {
            method: "POST",
            body: JSON.stringify({ target_attendee_id: id }),
          });
        }
      } catch (e) {
        // revert on failure
        setWantedIds((prev) => {
          const next = new Set(prev);
          if (wasWanted) next.add(id);
          else next.delete(id);
          return next;
        });
        setPickMsg(e instanceof ApiError ? e.message : "Couldn't save your pick — try again");
      } finally {
        setPending((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [eventId, wantedIds, pending, capReached, cap],
  );

  const terms = useMemo(() => tokenize(q), [q]);
  const visible = useMemo(() => {
    if (!data) return [];
    const byFilter = data.attendees.filter((p) => {
      if (filter === "speakers" && p.tag !== "speaker") return false;
      if (filter === "shared" && p.shared_interests.length === 0) return false;
      return true;
    });
    return searchItems(byFilter, q, DIRECTORY_FIELDS);
  }, [data, q, filter]);

  const sharedCount = useMemo(
    () => (data ? data.attendees.filter((p) => p.shared_interests.length > 0).length : 0),
    [data],
  );

  const filters: { key: FilterKey; label: string; n?: number }[] = [
    { key: "all", label: "Everyone", n: data?.count },
    { key: "speakers", label: "Speakers", n: data?.speakers },
    { key: "shared", label: "Shared interests", n: sharedCount },
  ];

  return (
    <div className="relative min-h-dvh overflow-hidden bg-background text-foreground">
      <AuroraBackground intensity={0.35} />
      <div className="pointer-events-none absolute inset-0 grid-paper-light opacity-[0.12]" aria-hidden />

      <div className="relative z-10 mx-auto w-full max-w-5xl px-5 pb-16 pt-7">
        <div className="flex items-center justify-between">
          <Wordmark size={24} />
          <div className="flex items-center gap-3">
            <Link
              href={`/event/${eventId}/live`}
              className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Event
            </Link>
            <AccountMenu
              user={user}
              editProfileHref={`/event/${eventId}/profile`}
              connectionsHref="/me/connections"
            />
          </div>
        </div>

        <header className="mt-8">
          <p className="text-[11px] uppercase tracking-[0.3em] text-accent">Who&apos;s coming</p>
          <h1 className="mt-2 text-balance font-display text-3xl leading-tight tracking-[-0.02em] text-foreground sm:text-4xl">
            {eventName || "The guest list"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data
              ? eventEnded
                ? `${data.count} ${data.count === 1 ? "person" : "people"} were in the room. Browse everyone and reach out.`
                : picksEnabled
                  ? `${data.count} ${data.count === 1 ? "person" : "people"} registered so far. Pick who you most want to meet — we'll try to seat you together.`
                  : `${data.count} ${data.count === 1 ? "person" : "people"} registered so far. Browse who's coming.`
              : "Loading the room…"}
          </p>
        </header>

        {/* Picks counter — your private shortlist of people to meet */}
        {data && cap > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium",
                capReached
                  ? "border-accent/40 bg-accent/15 text-accent"
                  : "border-border bg-card text-muted-foreground",
              )}
            >
              <UserCheck className="h-3.5 w-3.5" aria-hidden />
              {used} of {cap} meeting {cap === 1 ? "pick" : "picks"} used
            </span>
            {pickMsg && (
              <span role="status" className="text-xs text-accent">
                {pickMsg}
              </span>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="mt-6 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
            {error}
          </p>
        )}

        {/* Search + filters */}
        {data && data.count > 0 && (
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <SearchBox
              value={q}
              onChange={setQ}
              placeholder="Search name, role, interest, bio…"
              ariaLabel="Search the guest list"
              className="w-full sm:max-w-xs"
            />
            <div className="flex gap-2 overflow-x-auto scrollbar-hide">
              {filters.map((f) => {
                const active = f.key === filter;
                return (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    aria-pressed={active}
                    className={cn(
                      "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors",
                      active
                        ? "border-transparent bg-accent text-accent-foreground"
                        : "border-border bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {f.label}
                    {typeof f.n === "number" && (
                      <span className={cn("text-xs", active ? "opacity-80" : "text-muted-foreground")}>{f.n}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Loading skeletons */}
        {!data && !error && (
          <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-44 skeleton rounded-2xl border border-border" />
            ))}
          </div>
        )}

        {/* Empty states */}
        {data && data.count === 0 && (
          <div className="mt-10 rounded-2xl border border-dashed border-border bg-card/40 px-6 py-12 text-center">
            <Users className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="mt-3 font-display text-xl text-foreground">No one&apos;s on the list yet</p>
            <p className="mt-1 text-sm text-muted-foreground">You&apos;re early — check back as people register.</p>
          </div>
        )}

        {data && data.count > 0 && visible.length === 0 && (
          <p className="mt-10 text-center text-sm text-muted-foreground">No one matches that.</p>
        )}

        {/* Cards */}
        {visible.length > 0 && (
          <ul className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((p, i) => (
              <DirectoryCard
                key={p.attendee_id}
                person={p}
                index={i}
                picksEnabled={picksEnabled}
                wanted={wantedIds.has(p.attendee_id)}
                pending={pending.has(p.attendee_id)}
                capReached={capReached}
                onToggle={() => toggleIntent(p)}
                highlight={terms}
                viewerName={viewerName}
                eventName={eventName}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const TAG_CHIP: Record<Exclude<Tag, "attendee">, { label: string; cls: string }> = {
  speaker: { label: "Speaker", cls: "bg-gold/20 text-foreground" },
  host: { label: "Host", cls: "bg-plasma/20 text-foreground" },
};

function DirectoryCard({
  person,
  index,
  picksEnabled,
  wanted,
  pending,
  capReached,
  onToggle,
  highlight = [],
  viewerName,
  eventName,
}: {
  person: DirectoryEntry;
  index: number;
  picksEnabled: boolean;
  wanted: boolean;
  pending: boolean;
  capReached: boolean;
  onToggle: () => void;
  highlight?: string[];
  viewerName?: string;
  eventName?: string;
}) {
  const roleLine = [person.role, person.company].filter(Boolean).join(" · ");
  const sharedSet = new Set(person.shared_interests.map((s) => s.toLowerCase()));
  const otherInterests = person.interests.filter((t) => !sharedSet.has(t.toLowerCase())).slice(0, 4);
  const tagChip = person.tag !== "attendee" ? TAG_CHIP[person.tag] : null;
  // Speakers/hosts aren't seated in the rotation, so they can't be picked; and
  // only registered attendees (picksEnabled) see the control at all.
  const pickable = picksEnabled && person.tag === "attendee";
  // Disable "add" only when the cap is full; you can always remove an existing pick.
  const addDisabled = !wanted && capReached;

  return (
    <motion.li
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.03, 0.3) }}
      className={cn(
        "flex flex-col rounded-2xl border p-4 transition-colors",
        wanted
          ? "border-accent/50 bg-accent/[0.08]"
          : person.shared_interests.length > 0
            ? "border-accent/30 bg-accent/[0.05]"
            : "border-border bg-card/60",
      )}
    >
      <div className="flex items-start gap-3">
        <Avatar name={person.name} seed={person.attendee_id} src={person.avatar_url} size={48} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-display text-lg leading-tight text-foreground">
              <Highlight text={person.name} terms={highlight} />
            </span>
            {tagChip && (
              <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", tagChip.cls)}>
                {person.tag === "speaker" && <Mic className="h-2.5 w-2.5" aria-hidden />}
                {tagChip.label}
              </span>
            )}
          </div>
          {roleLine && (
            <p className="truncate text-xs text-muted-foreground">
              <Highlight text={roleLine} terms={highlight} />
            </p>
          )}
        </div>
      </div>

      {person.description && (
        <p className="mt-3 line-clamp-2 text-sm leading-snug text-muted-foreground">
          <Highlight text={person.description} terms={highlight} />
        </p>
      )}

      {person.looking_for && (
        <p className="mt-2 line-clamp-1 text-xs text-muted-foreground">
          <span className="text-muted-foreground/70">Looking for:</span>{" "}
          <Highlight text={person.looking_for} terms={highlight} />
        </p>
      )}

      {(person.shared_interests.length > 0 || otherInterests.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {person.shared_interests.map((tag) => (
            <span key={`s-${tag}`} className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-0.5 text-[11px] font-medium text-accent">
              <Sparkles className="h-2.5 w-2.5" aria-hidden /> <Highlight text={tag} terms={highlight} />
            </span>
          ))}
          {otherInterests.map((tag) => (
            <span key={`o-${tag}`} className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-muted-foreground">
              <Highlight text={tag} terms={highlight} />
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto flex flex-col gap-2 pt-3">
        {pickable && (
          <button
            type="button"
            onClick={onToggle}
            disabled={pending || addDisabled}
            aria-pressed={wanted}
            aria-label={wanted ? `Remove ${person.name} from your picks` : `Pick ${person.name} to meet`}
            title={addDisabled ? "You've used all your picks" : undefined}
            className={cn(
              "inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-full border text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              wanted
                ? "border-accent/50 bg-accent/15 text-accent hover:bg-accent/20"
                : "border-border bg-background/40 text-foreground hover:bg-muted",
            )}
          >
            {wanted ? (
              <>
                <UserCheck className="h-4 w-4" aria-hidden /> Want to meet
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4" aria-hidden /> Want to meet
              </>
            )}
          </button>
        )}

        {/* Lean contact glyphs — identical to the rolodex card. Neutral "from {event}"
            WhatsApp intro (the directory spans both before and after the event, so
            "we met at" wouldn't always be true). Phone only shows if the person
            opted in; IG / X / email / links show whenever shared. */}
        <ContactActions
          person={person}
          eventName={eventName}
          waMessage={
            viewerName
              ? `Hi, I'm ${viewerName} from ${eventName ?? "the event"} 👋`
              : `Hi — reaching out from ${eventName ?? "the event"} 👋`
          }
        />
      </div>
    </motion.li>
  );
}
