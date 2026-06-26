"use client";

import { useState, useEffect, type ReactElement } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, MapPin, ArrowRight, Crown, Play } from "lucide-react";
import { Avatar } from "@/components/brand/avatar";
import { roundFor } from "@/lib/design/rounds";
import { COLORS } from "@/lib/design/colors";
import { ATTENDEES } from "@/lib/content/landing";

/**
 * Preview screens for the landing ScenesGallery. Waiting/live/recap are real
 * screenshots captured from a live demo event (see frontend/scripts/capture-*.js);
 * join/organizer stay as presentational mocks built from brand components. See
 * docs/design/DESIGN_SYSTEM.md §9.
 */

export type SceneKey = "join" | "waiting" | "reveal" | "live" | "recap" | "organizer";

/** A real screenshot of the shipped app, captured from a live demo event —
 * not a redrawn mock. Fills the PhoneFrame exactly like the hand-built scenes. */
function RealScreenshot({ src, alt }: { src: string; alt: string }) {
  return <img src={src} alt={alt} className="h-full w-full object-cover object-top" />;
}

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
        <MapPin className="h-3 w-3" /> The Battery, SF · Doors 7:00 PM
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
  return <RealScreenshot src="/captures/waiting-room.png" alt="The Peopld waiting room — agenda and who's already in the room" />;
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
  return <RealScreenshot src="/captures/live-table.png" alt="A real Peopld table — round, tablemates, and an AI icebreaker" />;
}

function RecapScene() {
  return <RealScreenshot src="/captures/connections.png" alt="The Peopld rolodex — everyone you met, ready to follow up" />;
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
