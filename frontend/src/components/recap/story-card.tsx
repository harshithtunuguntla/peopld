"use client";

import { forwardRef, useEffect, useRef, useState } from "react";

import { COLORS } from "@/lib/design/colors";
import { avatarColor } from "@/lib/design/avatar";

// True design size (4:5 — fits IG/WhatsApp status + feed). The card is authored at
// this size for crisp, deterministic export; the preview scales it down to fit.
const W = 1080;
const H = 1350;

export interface StoryCardData {
  eventName: string;
  attendeeName: string;
  peopleMet: number;
  matches: number;
  rounds: number;
  hearts: number;
  /** A few faces met, for the celebratory stack (gradient/initials — no photos,
   *  so export never taints the canvas). */
  faces: { name: string; seed: string }[];
}

function initialsOf(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

/**
 * The shareable post-event "story card". Renders the full-size face (captured for
 * the PNG) inside a wrapper that scales it to the available width for preview.
 * `ref` points at the full-size face — that's what `shareStoryCard` rasterizes.
 */
export const StoryCard = forwardRef<HTMLDivElement, { data: StoryCardData }>(
  function StoryCard({ data }, ref) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(0.3);

    // Fit the 1080px design to the wrapper's real width (fluid on every screen).
    useEffect(() => {
      const el = wrapRef.current;
      if (!el) return;
      const update = () => setScale(el.clientWidth / W);
      update();
      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    return (
      <div
        ref={wrapRef}
        className="relative w-full overflow-hidden rounded-[28px]"
        style={{ height: H * scale }}
        aria-label="Your event recap card"
      >
        <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", position: "absolute", inset: 0 }}>
          <CardFace ref={ref} data={data} />
        </div>
      </div>
    );
  },
);

/** The full 1080×1350 artwork. All sizing in px against the 1080 canvas. */
const CardFace = forwardRef<HTMLDivElement, { data: StoryCardData }>(function CardFace({ data }, ref) {
  const firstName = data.attendeeName.trim().split(/\s+/)[0] || "My";
  const moreFaces = Math.max(0, data.peopleMet - data.faces.length);

  return (
    <div
      ref={ref}
      style={{
        width: W,
        height: H,
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        padding: 76,
        boxSizing: "border-box",
        color: COLORS.cream,
        // Brand aurora — layered radial glows over a deep ink gradient. Pure
        // gradients (no blur filter) so the export is fast + reliable.
        backgroundColor: COLORS.ink950,
        backgroundImage: [
          "radial-gradient(115% 80% at 88% -5%, rgba(255,78,43,0.42), transparent 58%)",
          "radial-gradient(100% 75% at -10% 108%, rgba(182,108,255,0.32), transparent 56%)",
          `linear-gradient(160deg, ${COLORS.ink800}, ${COLORS.ink950})`,
        ].join(", "),
      }}
    >
      {/* Hairline inner frame for a premium, "designed" edge. */}
      <div
        style={{
          position: "absolute",
          inset: 20,
          borderRadius: 36,
          border: "1px solid rgba(244,239,228,0.12)",
          pointerEvents: "none",
        }}
        aria-hidden
      />

      {/* Header: brand lockup + recap tag */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative" }}>
        <Lockup />
        <span
          style={{
            fontSize: 22,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: COLORS.cream,
            opacity: 0.7,
            border: "1px solid rgba(244,239,228,0.22)",
            borderRadius: 999,
            padding: "10px 20px",
          }}
        >
          Event recap
        </span>
      </div>

      {/* Title block */}
      <div style={{ position: "relative", marginTop: 64 }}>
        <div
          style={{
            fontSize: 27,
            letterSpacing: 5,
            textTransform: "uppercase",
            color: COLORS.ember,
            fontWeight: 600,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {data.eventName || "The event"}
        </div>
        <div
          className="font-display"
          style={{
            fontSize: 104,
            lineHeight: 1.0,
            letterSpacing: -2,
            marginTop: 18,
            color: COLORS.cream,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {firstName}&rsquo;s night
        </div>
        <div style={{ fontSize: 31, marginTop: 18, color: COLORS.cream, opacity: 0.62 }}>
          Here&rsquo;s how the conversations went.
        </div>
      </div>

      {/* Hero stat — the headline number */}
      <div style={{ position: "relative", marginTop: 56 }}>
        <div
          className="font-display"
          style={{
            fontSize: 224,
            lineHeight: 0.86,
            letterSpacing: -8,
            color: COLORS.ember,
            textShadow: "0 12px 60px rgba(255,78,43,0.45)",
          }}
        >
          {data.peopleMet}
        </div>
        <div style={{ fontSize: 34, marginTop: 8, color: COLORS.cream, opacity: 0.85 }}>
          new people met
        </div>
      </div>

      {/* Secondary stats */}
      <div style={{ position: "relative", marginTop: 52, display: "flex", gap: 26 }}>
        <MiniStat value={data.matches} label={data.matches === 1 ? "match" : "matches"} color={COLORS.plasma} />
        <MiniStat value={data.rounds} label={data.rounds === 1 ? "round" : "rounds"} color={COLORS.ice} />
        <MiniStat value={data.hearts} label="hearts sent" color={COLORS.gold} />
      </div>

      {/* Faces met + footer pinned to the bottom */}
      <div style={{ position: "relative", marginTop: "auto" }}>
        {data.faces.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", marginBottom: 40 }}>
            {data.faces.map((f, i) => {
              const c = avatarColor(f.seed);
              return (
                <div
                  key={f.seed}
                  style={{
                    width: 108,
                    height: 108,
                    borderRadius: 999,
                    background: c.css,
                    color: c.ink,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 42,
                    fontWeight: 700,
                    border: `5px solid ${COLORS.ink950}`,
                    marginLeft: i === 0 ? 0 : -30,
                  }}
                >
                  {initialsOf(f.name)}
                </div>
              );
            })}
            {moreFaces > 0 && (
              <div
                style={{
                  height: 108,
                  borderRadius: 999,
                  background: "rgba(244,239,228,0.10)",
                  color: COLORS.cream,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 38,
                  fontWeight: 600,
                  padding: "0 34px",
                  border: `5px solid ${COLORS.ink950}`,
                  marginLeft: -30,
                }}
              >
                +{moreFaces}
              </div>
            )}
          </div>
        )}

        <div style={{ height: 1, background: "rgba(244,239,228,0.14)", marginBottom: 34 }} aria-hidden />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 26, color: COLORS.cream, opacity: 0.55 }}>Made with Peopld</span>
          <span style={{ fontSize: 28, color: COLORS.ember, fontWeight: 600 }}>Find your next room &rarr;</span>
        </div>
      </div>
    </div>
  );
});

function MiniStat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div
      style={{
        flex: 1,
        borderRadius: 28,
        padding: "28px 30px",
        background: "rgba(244,239,228,0.05)",
        border: "1px solid rgba(244,239,228,0.10)",
      }}
    >
      <div className="font-display" style={{ fontSize: 76, lineHeight: 1, color }}>
        {value}
      </div>
      <div style={{ fontSize: 25, marginTop: 10, color: COLORS.cream, opacity: 0.7 }}>{label}</div>
    </div>
  );
}

/** The Peopld lockup, drawn inline at card scale (ember tile + wordmark). */
function Lockup() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 16,
          background: COLORS.ember,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span className="font-display" style={{ fontStyle: "italic", fontSize: 34, color: COLORS.ink950, lineHeight: 1 }}>
          p
        </span>
      </div>
      <span className="font-display" style={{ fontSize: 40, color: COLORS.cream, lineHeight: 1 }}>
        Peopld
      </span>
    </div>
  );
}
