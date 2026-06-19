"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { motion } from "framer-motion";
import { Loader2, Users, Sparkles, Heart, HandHeart, ArrowRight, PartyPopper, UserCheck, Linkedin, Globe } from "lucide-react";

import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";
import { LiveShell } from "@/components/live/live-screens";
import { CountUp } from "@/components/brand/count-up";
import { groupByPerson, type Connection } from "@/components/connections/person-card";
import { Avatar } from "@/components/brand/avatar";
import { buttonVariants } from "@/components/ui/button";
import { COLORS } from "@/lib/design/colors";
import { inkOn } from "@/lib/design/rounds";
import { cn } from "@/lib/utils";

interface ConnectionsResp {
  total_people_met: number;
  rounds_count: number;
  matches_count: number;
  connections: Connection[];
}

interface IntentMatch {
  attendee_id: string;
  name: string;
  role: string;
  company: string | null;
  avatar_url: string | null;
  linkedin_url: string | null;
  website_url: string | null;
}

/** Post-event celebration: your night in numbers, then into the rolodex. */
export default function RecapPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params);
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [data, setData] = useState<ConnectionsResp | null>(null);
  const [matches, setMatches] = useState<IntentMatch[]>([]);
  const [eventName, setEventName] = useState<string>("");
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
        apiFetch<{ name: string }>(`/events/${eventId}`)
          .then((e) => !cancelled && setEventName(e.name))
          .catch(() => {});
        const me = await apiFetch<{ id: string }>(`/events/${eventId}/attendees/me`);
        const conns = await apiFetch<ConnectionsResp>(`/events/${eventId}/attendees/${me.id}/connections`);
        if (!cancelled) setData(conns);
        // Mutual meeting picks ("you both wanted to meet") — revealed only after
        // the event. A 409 (event not ended) or any error just means no section;
        // never block the recap on it.
        apiFetch<{ matches: IntentMatch[] }>(`/events/${eventId}/intents/matches`)
          .then((m) => !cancelled && setMatches(m.matches))
          .catch(() => {});
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Couldn't load your recap";
        if (/not registered/i.test(msg)) router.replace(`/event/${eventId}/register`);
        else setError(msg);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, eventId, router]);

  const people = useMemo(() => (data ? groupByPerson(data.connections) : []), [data]);
  const heartsGiven = useMemo(() => people.filter((p) => p.liked).length, [people]);
  // A few faces for the celebratory avatar stack.
  const faces = people.slice(0, 5);

  if (!authChecked || !user) {
    return (
      <LiveShell>
        <Centered label="Loading…" />
      </LiveShell>
    );
  }

  return (
    <LiveShell eventId={eventId} className="max-w-5xl">
      {/* Hero */}
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mx-auto max-w-2xl text-center"
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
          <PartyPopper className="h-7 w-7" aria-hidden />
        </div>
        <p className="mt-4 text-[11px] uppercase tracking-[0.3em] text-accent">That&apos;s a wrap</p>
        <h1 className="mt-2 text-balance font-display text-[clamp(28px,8vw,40px)] leading-[1.05] tracking-[-0.02em] text-foreground">
          Your night at {eventName || "the event"}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
          A quick wrap of who you met, who matched, and where to continue the conversations.
        </p>
        {data && people.length > 0 && (
          <div className="mt-4 flex items-center justify-center">
            <div className="flex -space-x-2">
              {faces.map((p) => (
                <Avatar key={p.attendee_id} name={p.name} seed={p.attendee_id} src={p.avatar_url} size={32} />
              ))}
            </div>
          </div>
        )}
      </motion.header>

      {error && (
        <p role="alert" className="mt-6 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {error}
        </p>
      )}

      {!data && !error && (
        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 skeleton rounded-3xl border border-border" />
          ))}
        </div>
      )}

      {data && (
        <>
          {/* The night in numbers */}
          <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <RecapStat icon={Users} value={data.total_people_met} label={data.total_people_met === 1 ? "person met" : "people met"} bg={COLORS.coral} delay={0.05} />
            <RecapStat icon={Sparkles} value={data.rounds_count} label={data.rounds_count === 1 ? "round" : "rounds"} bg={COLORS.ice} delay={0.1} />
            <RecapStat icon={HandHeart} value={heartsGiven} label="hearts sent" bg={COLORS.gold} delay={0.15} />
            <RecapStat icon={Heart} value={data.matches_count} label={data.matches_count === 1 ? "match" : "matches"} bg={COLORS.plasma} delay={0.2} highlight />
          </div>

          {/* Mutual meeting picks — "you both wanted to meet" (revealed post-event) */}
          {matches.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.24, duration: 0.4 }}
              className="mt-7 rounded-3xl border border-accent/30 bg-accent/[0.06] p-4 sm:p-5"
            >
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-accent" aria-hidden />
                <h2 className="font-display text-lg text-foreground">You both wanted to meet</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {matches.length} {matches.length === 1 ? "person" : "people"} picked each other before the event.
              </p>
              <ul className="mt-4 grid gap-2.5 lg:grid-cols-2">
                {matches.map((m) => (
                  <li key={m.attendee_id} className="flex items-center gap-3 rounded-2xl border border-border bg-card/50 p-3">
                    <Avatar name={m.name} seed={m.attendee_id} src={m.avatar_url} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">{m.name}</p>
                      <p className="truncate text-sm text-muted-foreground">{[m.role, m.company].filter(Boolean).join(" · ")}</p>
                    </div>
                    {m.linkedin_url && (
                      <a
                        href={m.linkedin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${m.name} on LinkedIn`}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-muted"
                      >
                        <Linkedin className="h-4 w-4" aria-hidden />
                      </a>
                    )}
                    {m.website_url && (
                      <a
                        href={m.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${m.name}'s website`}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-muted"
                      >
                        <Globe className="h-4 w-4" aria-hidden />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </motion.section>
          )}

          {/* CTA into the rolodex */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28, duration: 0.4 }}
            className="mx-auto mt-7 max-w-xl"
          >
            {people.length > 0 ? (
              <Link href={`/event/${eventId}/connections`} className={cn(buttonVariants({ variant: "accent", size: "lg" }), "glow-ember w-full gap-2")}>
                See who you met <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-card/40 px-6 py-8 text-center">
                <Users className="mx-auto h-7 w-7 text-muted-foreground" aria-hidden />
                <p className="mt-3 font-display text-lg text-foreground">No connections this time</p>
                <p className="mt-1 text-sm text-muted-foreground">Catch the next one — everyone you sit with shows up here.</p>
              </div>
            )}
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Your contacts stay here for good — names and how to reach them.
            </p>
          </motion.div>
        </>
      )}
    </LiveShell>
  );
}

function RecapStat({
  icon: Icon,
  value,
  label,
  bg,
  delay = 0,
  highlight,
}: {
  icon: React.ElementType;
  value: number;
  label: string;
  bg: string;
  delay?: number;
  highlight?: boolean;
}) {
  const ink = inkOn(bg);
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, duration: 0.4 }}
      className="relative overflow-hidden rounded-3xl p-5"
      style={{ background: bg, color: ink }}
    >
      {highlight && value > 0 && (
        <span className="absolute right-3 top-3 rounded-full bg-black/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
          mutual
        </span>
      )}
      <div className="pointer-events-none absolute -right-5 -top-5 h-16 w-16 rounded-full opacity-15" style={{ background: ink }} aria-hidden />
      <Icon className="relative h-5 w-5 opacity-80" aria-hidden />
      <div className="relative mt-3 font-display text-[clamp(30px,9vw,44px)] leading-none tracking-[-0.03em]">
        <CountUp to={value} />
      </div>
      <div className="relative mt-1 text-xs opacity-80">{label}</div>
    </motion.div>
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
