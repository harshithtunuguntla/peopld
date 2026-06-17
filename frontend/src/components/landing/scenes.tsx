"use client";

import { useState, useEffect, type ReactElement } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, MapPin, Timer, Heart, ArrowRight, Crown, Play, Download } from "lucide-react";
import { Avatar } from "@/components/brand/avatar";
import { BoardingPass } from "@/components/brand/boarding-pass";
import { roundFor, ROUNDS } from "@/lib/design/rounds";
import { COLORS } from "@/lib/design/colors";
import { ATTENDEES, SAMPLE_ICEBREAKER } from "@/lib/content/landing";

/**
 * Marketing-only preview screens for the landing ScenesGallery. These are
 * presentational mocks; the real wired attendee/organizer pages are separate and
 * reuse the same brand components. See docs/design/DESIGN_SYSTEM.md §9.
 */

export type SceneKey = "join" | "waiting" | "reveal" | "live" | "recap" | "organizer";

export const SCENE_META: { key: SceneKey; label: string; sub: string }[] = [
  { key: "join", label: "Join", sub: "They tap in. 8 seconds." },
  { key: "waiting", label: "Waiting room", sub: "Pre-game. Anticipation." },
  { key: "reveal", label: "Reveal", sub: "The moment." },
  { key: "live", label: "Live table", sub: "Boarding pass + icebreaker." },
  { key: "recap", label: "Recap", sub: "Walk out with the list." },
  { key: "organizer", label: "Command", sub: "Your air-traffic tower." },
];

function JoinScene() {
  return (
    <div className="flex h-full flex-col p-7 pt-9 text-cream">
      <div className="mb-10 flex items-center gap-2">
        <div className="relative flex h-7 w-7 items-center justify-center rounded-lg bg-coral">
          <span className="font-display text-base italic text-ink-950">p</span>
        </div>
        <span className="font-display text-lg">Peopld</span>
      </div>
      <div className="mb-2 text-[10px] uppercase tracking-[0.3em] text-cream/50">You are invited</div>
      <h1 className="mb-3 font-display text-4xl leading-[1.02] tracking-[-0.025em]">
        Founders &amp;<br />Friends <em className="italic text-coral">Summer Mixer</em>
      </h1>
      <p className="mb-8 flex items-center gap-1.5 text-xs text-cream/55">
        <MapPin className="h-3 w-3" /> The Battery, SF · Tonight 7:00 PM
      </p>
      <div className="mb-6 space-y-4">
        <div>
          <span className="mb-1.5 block text-[10px] uppercase tracking-[0.2em] text-cream/45">Your name</span>
          <div className="flex h-11 items-center rounded-xl border border-white/10 bg-white/5 px-3.5 text-sm">
            Alex Morgan
          </div>
        </div>
        <div>
          <span className="mb-1.5 block text-[10px] uppercase tracking-[0.2em] text-cream/45">
            What are you working on?
          </span>
          <div className="flex h-11 items-center rounded-xl border border-white/10 bg-white/5 px-3.5 text-sm">
            Building an AI co-pilot for chefs
          </div>
          <p className="mt-1.5 text-[10px] text-cream/40">We use this to seat you with the right humans.</p>
        </div>
      </div>
      <div className="mt-auto">
        <div className="glow-ember flex h-12 items-center justify-center gap-2 rounded-full bg-ember font-medium text-white">
          Join the event <ArrowRight className="h-4 w-4" />
        </div>
        <div className="mt-3 flex items-center justify-center gap-2 text-[10px] text-cream/45">
          <div className="flex -space-x-1.5">
            {ATTENDEES.slice(0, 4).map((a) => (
              <Avatar key={a.id} name={a.name} color={a.color} size={16} />
            ))}
          </div>
          38 already inside
        </div>
      </div>
    </div>
  );
}

function WaitingScene() {
  return (
    <div className="flex h-full flex-col p-6 pt-8 text-cream">
      <div className="mb-7 flex items-center justify-between">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-chlorine px-2.5 py-1 text-[10px] font-medium text-ink-900">
          <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-ink-900" /> You are in
        </div>
        <span className="text-[10px] text-cream/50">Hi, Alex</span>
      </div>
      <div className="my-5 text-center">
        <p className="mb-2 text-[10px] uppercase tracking-[0.3em] text-cream/50">Doors close in</p>
        <div className="font-display text-[64px] leading-none tracking-[-0.03em]">04:32</div>
        <p className="mx-auto mt-3 max-w-[230px] text-xs text-cream/55">
          Grab a drink. We will buzz the second your table is ready.
        </p>
      </div>
      <div className="mb-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <div className="mb-2.5 flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-[0.22em] text-cream/50">Tonight</p>
          <span className="text-[10px] text-cream/40">5 rounds · 8 min</span>
        </div>
        <div className="space-y-2">
          {ROUNDS.map((r, i) => (
            <div key={r.key} className="flex items-center gap-2.5 text-xs">
              <div
                className="flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-semibold"
                style={{ background: r.bg, color: r.ink }}
              >
                {i + 1}
              </div>
              <span className={i === 0 ? "text-cream" : "text-cream/55"}>{r.name}</span>
              {i === 0 && <span className="ml-auto text-[9px] text-chlorine">Up next</span>}
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <p className="mb-2 text-[10px] uppercase tracking-[0.22em] text-cream/50">38 in the room</p>
        <div className="flex -space-x-1.5">
          {ATTENDEES.slice(0, 8).map((a) => (
            <Avatar key={a.id} name={a.name} color={a.color} size={26} />
          ))}
          <div className="flex h-[26px] w-[26px] items-center justify-center rounded-full border-2 border-ink-950 bg-white/10 text-[9px]">
            +30
          </div>
        </div>
      </div>
    </div>
  );
}

function RevealScene({ roundIdx = 1 }: { roundIdx?: number }) {
  const [phase, setPhase] = useState(0);
  const round = roundFor(roundIdx);
  useEffect(() => {
    setPhase(0);
    const t1 = setTimeout(() => setPhase(1), 700);
    const t2 = setTimeout(() => setPhase(2), 2200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [roundIdx]);

  return (
    <div
      className="relative h-full overflow-hidden"
      style={{ background: phase >= 1 ? round.bg : COLORS.ink900, transition: "background 0.8s ease" }}
    >
      {phase >= 1 &&
        Array.from({ length: 16 }).map((_, i) => (
          <motion.div
            key={`${roundIdx}-${i}`}
            initial={{ x: 180, y: 360, opacity: 0, scale: 0 }}
            animate={{
              x: 180 + Math.cos((i / 16) * Math.PI * 2) * 260,
              y: 360 + Math.sin((i / 16) * Math.PI * 2) * 300,
              opacity: [0, 1, 0],
              scale: [0, 1, 0.3],
            }}
            transition={{ duration: 1.6, delay: 0.1 + i * 0.03 }}
            className="absolute h-2 w-2 rounded-full"
            style={{ background: round.ink, opacity: 0.5 }}
          />
        ))}
      <div className="relative flex h-full flex-col items-center justify-center px-5 text-center" style={{ color: round.ink }}>
        <AnimatePresence mode="wait">
          {phase === 0 && (
            <motion.div key="p0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center text-cream">
              <div className="mb-5 h-12 w-12 animate-spin rounded-full border-2 border-cream/25 border-t-cream" />
              <p className="font-display text-xl">Reading the room...</p>
              <p className="mt-2 text-xs text-cream/45">Pairing you with the perfect humans</p>
            </motion.div>
          )}
          {phase >= 1 && (
            <motion.div key="p1" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <motion.div initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }} className="mb-2 text-[10px] uppercase tracking-[0.4em] opacity-80">
                Round {roundIdx + 1} · {round.name}
              </motion.div>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="mb-1 text-xs opacity-70">
                Your table is
              </motion.div>
              <motion.div
                initial={{ scale: 0.4, opacity: 0, filter: "blur(15px)" }}
                animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
                transition={{ type: "spring", stiffness: 220, damping: 19 }}
                className="font-display leading-[0.8] tracking-[-0.05em]"
                style={{ fontSize: "12rem" }}
              >
                07
              </motion.div>
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="font-display text-xl italic opacity-90">
                seven
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.55 }}
                className="mt-6 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px]"
                style={{ background: round.ink, color: round.bg }}
              >
                <Sparkles className="h-3 w-3" /> 3 humans waiting
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function LiveScene() {
  const round = roundFor(1);
  const tablemates = ATTENDEES.slice(0, 3);
  const [secs, setSecs] = useState(7 * 60 + 23);
  useEffect(() => {
    const i = setInterval(() => setSecs((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(i);
  }, []);
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  const progress = ((8 * 60 - secs) / (8 * 60)) * 100;

  return (
    <div className="flex h-full flex-col text-cream">
      <div className="px-3 pt-3">
        <BoardingPass round={round} tableNumber="07" showIcebreaker={false} />
      </div>
      <div className="mt-3 px-3">
        <div className="rounded-2xl bg-chlorine p-4 text-ink-900">
          <div className="mb-2 flex items-center gap-1.5 text-[9px] uppercase tracking-[0.22em] opacity-70">
            <Sparkles className="h-3 w-3" /> AI Icebreaker
          </div>
          <p className="font-display text-[15px] italic leading-snug">&ldquo;{SAMPLE_ICEBREAKER}&rdquo;</p>
        </div>
      </div>
      <div className="mt-3 space-y-1.5 px-3">
        {tablemates.map((a) => (
          <div key={a.id} className="flex items-center gap-2.5 rounded-xl border border-white/5 bg-white/[0.04] p-2.5">
            <Avatar name={a.name} color={a.color} size={34} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">{a.name}</p>
              <p className="truncate text-[10px] text-cream/55">{a.role}</p>
            </div>
            <button className="flex h-7 w-7 items-center justify-center rounded-full bg-white/5" aria-label={`Heart ${a.name}`}>
              <Heart className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-auto px-3 pb-3 pt-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <div className="mb-1.5 flex items-center justify-between">
            <div className="flex items-center gap-1 text-[10px] text-cream/55">
              <Timer className="h-3 w-3" /> Round ends
            </div>
            <div className="font-mono text-lg tabular-nums">
              {mm}:{ss}
            </div>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-white/5">
            <motion.div className="h-full" animate={{ width: `${progress}%` }} style={{ background: round.bg }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function RecapScene() {
  const stats = [
    { v: "15", l: "Connections", fill: "rose" },
    { v: "5", l: "Rounds", fill: "chlorine" },
    { v: "4", l: "Hearted", fill: "ice" },
  ] as const;
  const fillMap: Record<string, string> = { rose: "bg-rose", chlorine: "bg-chlorine", ice: "bg-ice" };
  return (
    <div className="flex h-full flex-col text-cream">
      <div className="px-5 pt-8 text-center">
        <div className="mb-2 text-[10px] uppercase tracking-[0.3em] text-cream/45">That is a wrap</div>
        <h1 className="font-display text-3xl leading-tight tracking-[-0.02em]">
          You met <em className="italic text-coral">15 brilliant<br />humans</em> tonight.
        </h1>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-1.5 px-5">
        {stats.map((s) => (
          <div key={s.l} className={`rounded-xl py-3 text-center text-ink-900 ${fillMap[s.fill]}`}>
            <div className="font-display text-2xl">{s.v}</div>
            <div className="mt-0.5 text-[9px] uppercase tracking-[0.18em] opacity-65">{s.l}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex-1 space-y-1.5 overflow-y-auto scrollbar-hide px-5 pb-3">
        {ATTENDEES.slice(0, 6).map((a, i) => (
          <div key={a.id} className="flex items-center gap-2.5 rounded-xl border border-white/5 bg-white/[0.04] p-2.5">
            <Avatar name={a.name} color={a.color} size={32} ring={i < 3} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <p className="truncate text-xs font-semibold">{a.name}</p>
                {i < 3 && <Heart className="h-2.5 w-2.5 fill-ember text-ember" />}
              </div>
              <p className="truncate text-[10px] text-cream/55">{a.role}</p>
            </div>
            <button className="rounded-full bg-ember px-2.5 py-1 text-[10px] font-medium text-white">Save</button>
          </div>
        ))}
      </div>
      <div className="border-t border-white/5 p-4">
        <div className="flex h-11 items-center justify-center gap-2 rounded-full bg-cream font-medium text-ink-950">
          <Download className="h-3.5 w-3.5" /> Download my night
        </div>
      </div>
    </div>
  );
}

function OrganizerScene() {
  const round = roundFor(1);
  return (
    <div className="flex h-full flex-col p-4 pt-7 text-cream">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.22em] text-cream/50">
          <Crown className="h-3 w-3" style={{ color: round.bg }} /> Command
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full bg-chlorine px-2 py-0.5 text-[9px] font-medium text-ink-900">
          <span className="h-1 w-1 animate-pulse-soft rounded-full bg-ink-900" /> Live
        </div>
      </div>
      <h2 className="mb-3 font-display text-2xl leading-[1] tracking-[-0.02em]">
        Summer Mixer <em className="italic" style={{ color: round.bg }}>R.2</em>
      </h2>
      <div className="mb-3 grid grid-cols-2 gap-1.5">
        <div className="rounded-xl bg-rose p-3 text-ink-900">
          <p className="text-[9px] uppercase tracking-[0.2em] opacity-65">Arrived</p>
          <div className="font-display text-2xl">
            38<span className="text-xs opacity-60">/42</span>
          </div>
        </div>
        <div className="rounded-xl bg-chlorine p-3 text-ink-900">
          <p className="text-[9px] uppercase tracking-[0.2em] opacity-65">Time left</p>
          <div className="font-display font-mono text-2xl">7:23</div>
        </div>
      </div>
      <div className="mb-2 rounded-xl border border-white/10 bg-white/[0.02] p-3">
        <p className="mb-2 text-[9px] uppercase tracking-[0.22em] text-cream/45">Floor map</p>
        <div className="grid grid-cols-5 gap-1.5">
          {Array.from({ length: 10 }).map((_, i) => {
            const filled = [4, 4, 3, 4, 2, 4, 3, 4, 2, 3][i];
            const dot = filled === 4 ? COLORS.chlorine : filled >= 2 ? COLORS.ember : "rgba(255,255,255,0.2)";
            return (
              <div key={i} className="rounded-md border border-white/10 p-1.5 text-center">
                <span className="mb-1 inline-block h-1.5 w-1.5 rounded-full" style={{ background: dot }} />
                <div className="font-display text-sm leading-none">{String(i + 1).padStart(2, "0")}</div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-auto rounded-2xl p-3" style={{ background: round.bg, color: round.ink }}>
        <div className="mb-0.5 text-[9px] uppercase tracking-[0.2em] opacity-75">Next move</div>
        <div className="mb-2 font-display text-lg leading-tight">Start Round 3</div>
        <div
          className="flex h-10 items-center justify-center gap-1.5 rounded-full text-sm font-medium"
          style={{ background: round.ink, color: round.bg }}
        >
          <Play className="h-3 w-3 fill-current" /> Start round
        </div>
      </div>
    </div>
  );
}

export const SCENE_MAP: Record<SceneKey, () => ReactElement> = {
  join: JoinScene,
  waiting: WaitingScene,
  reveal: () => <RevealScene roundIdx={1} />,
  live: LiveScene,
  recap: RecapScene,
  organizer: OrganizerScene,
};
