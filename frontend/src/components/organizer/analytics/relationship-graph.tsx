"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { forceSimulation, forceLink, forceManyBody, forceX, forceY, forceCollide, type Simulation } from "d3-force";
import { polygonHull } from "d3-polygon";
import { X, Maximize2, Heart, Repeat, Sparkles, Users, Crown, Zap, UsersRound, UserMinus, Link2, ArrowRight } from "lucide-react";

import { Avatar } from "@/components/brand/avatar";
import {
  COMMUNITY_COLORS,
  detectCommunities,
  edgeScore,
  storyInsights,
  suggestionsFor,
  tierOf,
  type GraphNode,
  type GraphEdge,
  type StoryKind,
} from "./graph-utils";

export type { GraphNode, GraphEdge };

const STORY_ICON: Record<StoryKind, typeof Zap> = { super: Zap, pair: Heart, group: UsersRound, isolated: UserMinus };

interface PNode {
  id: string;
  name: string;
  company?: string | null;
  role?: string | null;
  met: number;
  mutual: number;
  roundsPresent: number;
  community: number;
  color: string;
  r: number;
  x: number;
  y: number;
  isLeader: boolean;
  isSuper: boolean;
}
interface PLink {
  a: string;
  b: string;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  weight: number;
  rounds: number[];
  matched: boolean;
  liked: boolean;
  score: number;
}
interface Hull {
  community: number;
  color: string;
  path: string;
  labelX: number;
  labelY: number;
  count: number;
  leader: string;
}
interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

// d3-force mutates these in place during layout.
type SimNode = { id: string; community: number; r: number; x: number; y: number; vx?: number; vy?: number };
type SimLink = { source: string | SimNode; target: string | SimNode; dist: number; strength: number };

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function mid(a: [number, number], b: [number, number]): [number, number] {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

/** A soft, smoothed region around a community's members. */
function regionPath(pts: [number, number][], cx: number, cy: number, pad: number): string {
  if (pts.length === 1) {
    const [x, y] = pts[0];
    return `M ${x - pad},${y} a ${pad},${pad} 0 1,0 ${pad * 2},0 a ${pad},${pad} 0 1,0 ${-pad * 2},0 Z`;
  }
  if (pts.length === 2) {
    const [mx, my] = mid(pts[0], pts[1]);
    const r = Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]) / 2 + pad;
    return `M ${mx - r},${my} a ${r},${r} 0 1,0 ${r * 2},0 a ${r},${r} 0 1,0 ${-r * 2},0 Z`;
  }
  const hull = (polygonHull(pts) ?? pts) as [number, number][];
  const exp = hull.map(([x, y]) => {
    const dx = x - cx;
    const dy = y - cy;
    const L = Math.hypot(dx, dy) || 1;
    return [x + (dx / L) * pad, y + (dy / L) * pad] as [number, number];
  });
  let d = `M ${mid(exp[exp.length - 1], exp[0]).join(",")}`;
  for (let i = 0; i < exp.length; i++) {
    const cur = exp[i];
    const m = mid(cur, exp[(i + 1) % exp.length]);
    d += ` Q ${cur[0]},${cur[1]} ${m[0]},${m[1]}`;
  }
  return d + " Z";
}

/**
 * The signature relationship-intelligence graph — a community-first constellation.
 *
 * Built for discovery, not display: communities are anchored into distinct regions
 * (soft clouds + boundaries + labels) so the groups read in seconds; node hierarchy
 * (size = reach, glowing halo = super-connector, crown ring = group leader) shows
 * who drove the room; edge tiers (weak → strong → matched, with glow) make the
 * meaningful relationships jump out. A story rail surfaces the headline insights;
 * clicking anyone flies the camera to their ego-network and opens a deep panel.
 */
export function RelationshipGraph({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const rafRef = useRef<number | undefined>(undefined);
  const viewRef = useRef<View | null>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setDims({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(el);
    setDims({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // ---- Layout (community-first force simulation) ----------------------------
  const layout = useMemo(() => {
    const { w, h } = dims;
    if (w < 2 || h < 2 || nodes.length < 2) return null;

    const community = detectCommunities(
      nodes.map((n) => n.attendee_id),
      edges,
    );
    const commIds = [...new Set([...community.values()])].sort((a, b) => a - b);
    const cx = w / 2;
    const cy = h / 2 + 8;
    const rx = w * (commIds.length > 1 ? 0.3 : 0);
    const ry = h * (commIds.length > 1 ? 0.3 : 0);
    const anchor = new Map<number, { x: number; y: number }>();
    commIds.forEach((c, i) => {
      const ang = (i / commIds.length) * Math.PI * 2 - Math.PI / 2;
      anchor.set(c, { x: cx + rx * Math.cos(ang), y: cy + ry * Math.sin(ang) });
    });

    const maxMet = Math.max(1, ...nodes.map((n) => n.met));
    const rOf = (met: number) => 6 + Math.sqrt(met / maxMet) * (Math.min(w, h) * 0.05);

    const simNodes: SimNode[] = nodes.map((n) => {
      const c = community.get(n.attendee_id) ?? 0;
      const a = anchor.get(c)!;
      return { id: n.attendee_id, community: c, r: rOf(n.met), x: a.x + (Math.random() - 0.5) * 40, y: a.y + (Math.random() - 0.5) * 40 };
    });
    const simLinks: SimLink[] = edges.map((e) => {
      const s = edgeScore({ matched: e.matched, weight: e.weight ?? 1, liked: e.liked ?? false });
      return { source: e.a, target: e.b, dist: Math.max(36, 96 - s * 7), strength: 0.05 + Math.min(s, 6) * 0.02 };
    });

    const sim: Simulation<SimNode, undefined> = forceSimulation(simNodes)
      .force("link", forceLink<SimNode, SimLink>(simLinks).id((d) => d.id).distance((l) => l.dist).strength((l) => l.strength))
      .force("charge", forceManyBody().strength(-Math.min(w, h) * 0.5))
      .force("x", forceX<SimNode>((d) => anchor.get(d.community)!.x).strength(0.16))
      .force("y", forceY<SimNode>((d) => anchor.get(d.community)!.y).strength(0.16))
      .force("collide", forceCollide<SimNode>((d) => d.r + 7))
      .stop();
    for (let i = 0; i < 340; i++) sim.tick();

    const padX = 36;
    const padTop = 52;
    const padBottom = 36;
    const posById = new Map<string, SimNode>();
    simNodes.forEach((n) => {
      n.x = Math.max(n.r + padX, Math.min(w - n.r - padX, n.x));
      n.y = Math.max(n.r + padTop, Math.min(h - n.r - padBottom, n.y));
      posById.set(n.id, n);
    });

    // Node hierarchy: global super-connector + per-community leader.
    const superId = [...nodes].sort((a, b) => b.met - a.met || a.name.localeCompare(b.name))[0]?.attendee_id;
    const leaderByComm = new Map<number, string>();
    for (const n of nodes) {
      const c = community.get(n.attendee_id) ?? 0;
      const cur = leaderByComm.get(c);
      const curMet = cur ? nodes.find((x) => x.attendee_id === cur)!.met : -1;
      if (n.met > curMet) leaderByComm.set(c, n.attendee_id);
    }

    const pnodes: PNode[] = nodes.map((n) => {
      const c = community.get(n.attendee_id) ?? 0;
      const p = posById.get(n.attendee_id)!;
      return {
        id: n.attendee_id,
        name: n.name,
        company: n.company,
        role: n.role,
        met: n.met,
        mutual: n.mutual_likes ?? 0,
        roundsPresent: n.rounds_present ?? 0,
        community: c,
        color: COMMUNITY_COLORS[c % COMMUNITY_COLORS.length],
        r: p.r,
        x: p.x,
        y: p.y,
        isLeader: leaderByComm.get(c) === n.attendee_id,
        isSuper: n.attendee_id === superId && n.met > 0,
      };
    });

    const plinks: PLink[] = edges.map((e) => {
      const s = posById.get(e.a)!;
      const t = posById.get(e.b)!;
      return {
        a: e.a,
        b: e.b,
        ax: s.x,
        ay: s.y,
        bx: t.x,
        by: t.y,
        weight: e.weight ?? 1,
        rounds: e.rounds ?? [],
        matched: e.matched,
        liked: e.liked ?? false,
        score: edgeScore({ matched: e.matched, weight: e.weight ?? 1, liked: e.liked ?? false }),
      };
    });

    const hulls: Hull[] = commIds
      .map((c) => {
        const members = pnodes.filter((n) => n.community === c);
        if (members.length < 2) return null;
        const pts = members.map((m) => [m.x, m.y] as [number, number]);
        const ccx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
        const ccy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
        const maxR = Math.max(...members.map((m) => m.r));
        const minY = Math.min(...members.map((m) => m.y - m.r));
        return {
          community: c,
          color: COMMUNITY_COLORS[c % COMMUNITY_COLORS.length],
          path: regionPath(pts, ccx, ccy, maxR + 26),
          labelX: ccx,
          labelY: minY - 30,
          count: members.length,
          leader: members.find((m) => m.isLeader)?.name ?? "",
        };
      })
      .filter((x): x is Hull => x !== null);

    return { pnodes, plinks, hulls, base: { x: 0, y: 0, w, h } as View, posById };
  }, [nodes, edges, dims]);

  // Adjacency for the panel.
  const adjacency = useMemo(() => {
    const m = new Map<string, PLink[]>();
    layout?.plinks.forEach((l) => {
      (m.get(l.a) ?? m.set(l.a, []).get(l.a)!).push(l);
      (m.get(l.b) ?? m.set(l.b, []).get(l.b)!).push(l);
    });
    return m;
  }, [layout]);

  const story = useMemo(() => storyInsights(nodes, edges), [nodes, edges]);
  const neighborIds = useMemo(() => {
    if (!selected || !layout) return null;
    const s = new Set<string>([selected]);
    (adjacency.get(selected) || []).forEach((l) => s.add(l.a === selected ? l.b : l.a));
    return s;
  }, [selected, adjacency, layout]);

  // ---- Camera (animated viewBox) -------------------------------------------
  const animateTo = useCallback((target: View) => {
    const svg = svgRef.current;
    if (!svg) return;
    const start = viewRef.current ?? target;
    const t0 = performance.now();
    const dur = 650;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = easeInOut(p);
      const v: View = {
        x: start.x + (target.x - start.x) * e,
        y: start.y + (target.y - start.y) * e,
        w: start.w + (target.w - start.w) * e,
        h: start.h + (target.h - start.h) * e,
      };
      viewRef.current = v;
      svg.setAttribute("viewBox", `${v.x} ${v.y} ${v.w} ${v.h}`);
      if (p < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, []);

  // Reset the camera whenever the layout (re)builds.
  useEffect(() => {
    if (layout) {
      viewRef.current = layout.base;
      svgRef.current?.setAttribute("viewBox", `0 0 ${layout.base.w} ${layout.base.h}`);
    }
  }, [layout]);

  const egoRect = useCallback(
    (ids: Set<string>): View => {
      if (!layout) return { x: 0, y: 0, w: 1, h: 1 };
      const ps = layout.pnodes.filter((n) => ids.has(n.id));
      if (!ps.length) return layout.base;
      let x0 = Math.min(...ps.map((n) => n.x - n.r));
      let x1 = Math.max(...ps.map((n) => n.x + n.r));
      let y0 = Math.min(...ps.map((n) => n.y - n.r));
      let y1 = Math.max(...ps.map((n) => n.y + n.r));
      const px = (x1 - x0) * 0.28 + 60;
      const py = (y1 - y0) * 0.28 + 60;
      x0 -= px; x1 += px; y0 -= py; y1 += py;
      let bw = x1 - x0;
      let bh = y1 - y0;
      const aspect = layout.base.w / layout.base.h;
      if (bw / bh > aspect) {
        const nh = bw / aspect;
        y0 -= (nh - bh) / 2;
        bh = nh;
      } else {
        const nw = bh * aspect;
        x0 -= (nw - bw) / 2;
        bw = nw;
      }
      return { x: x0, y: y0, w: bw, h: bh };
    },
    [layout],
  );

  function focusNode(id: string) {
    setSelected(id);
    const ids = new Set<string>([id]);
    (adjacency.get(id) || []).forEach((l) => ids.add(l.a === id ? l.b : l.a));
    animateTo(egoRect(ids));
  }
  function reset() {
    setSelected(null);
    if (layout) animateTo(layout.base);
  }

  if (nodes.length < 2) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">The network fills in once people have been seated together.</p>
    );
  }

  const selNode = selected && layout ? layout.pnodes.find((n) => n.id === selected) ?? null : null;

  return (
    <div className="space-y-3">
      {/* Story rail — the headline insights, tap to fly there */}
      {story.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {story.map((s) => {
            const Icon = STORY_ICON[s.kind];
            return (
              <button
                key={s.kind + s.focusId}
                type="button"
                onClick={() => focusNode(s.focusId)}
                className="group inline-flex shrink-0 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-left transition-colors hover:border-accent/50"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                </span>
                <span className="max-w-[220px] truncate text-xs font-medium text-foreground">{s.text}</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
              </button>
            );
          })}
        </div>
      )}

      <div ref={wrapRef} className="relative h-[460px] w-full overflow-hidden rounded-2xl border border-border bg-[#0a0910] sm:h-[600px] lg:h-[660px]">
        {layout && (
          <svg ref={svgRef} className="absolute inset-0 h-full w-full select-none" role="img" aria-label="Relationship constellation — communities, connections and matches from the event">
            <defs>
              <filter id="rg-glow" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="3" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="rg-cloud" x="-80%" y="-80%" width="260%" height="260%">
                <feGaussianBlur stdDeviation="22" />
              </filter>
            </defs>

            {/* background catches clicks to reset */}
            <rect x={-9999} y={-9999} width={19998} height={19998} fill="transparent" onClick={reset} />

            {/* community clouds + boundaries + labels */}
            <g style={{ opacity: selected ? 0.35 : 1, transition: "opacity 350ms", pointerEvents: "none" }}>
              {layout.hulls.map((h, i) => (
                <g key={`h${h.community}`}>
                  <path d={h.path} fill={h.color} opacity={0.1} filter="url(#rg-cloud)" />
                  <path d={h.path} fill="none" stroke={h.color} strokeOpacity={0.32} strokeWidth={1.25} strokeDasharray="5 6" />
                  <text
                    x={h.labelX}
                    y={h.labelY}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={700}
                    letterSpacing="0.12em"
                    fill={h.color}
                    fillOpacity={0.9}
                    stroke="#0a0910"
                    strokeWidth={3}
                    paintOrder="stroke"
                  >
                    GROUP {i + 1} · {h.count}
                  </text>
                </g>
              ))}
            </g>

            {/* edges (weak → strong; matched on top, with glow) */}
            <g style={{ pointerEvents: "none" }}>
              {[...layout.plinks]
                .sort((a, b) => a.score - b.score)
                .map((l, i) => {
                  const incident = selected ? l.a === selected || l.b === selected : false;
                  const faded = selected && !incident;
                  const t = tierOf({ matched: l.matched, weight: l.weight, liked: l.liked });
                  const base = 0.7 + (l.weight - 1) * 1.4 + (l.matched ? 1.2 : 0);
                  const strong = l.matched || l.weight >= 3;
                  return (
                    <line
                      key={`l${i}`}
                      x1={l.ax}
                      y1={l.ay}
                      x2={l.bx}
                      y2={l.by}
                      stroke={faded ? "#6b7280" : t.color}
                      strokeOpacity={faded ? 0.05 : l.matched ? 0.9 : l.weight >= 2 ? 0.6 : 0.22}
                      strokeWidth={incident ? base + 1.6 : base}
                      strokeLinecap="round"
                      filter={strong && !faded ? "url(#rg-glow)" : undefined}
                      style={{ transition: "stroke-opacity 350ms" }}
                    />
                  );
                })}
            </g>

            {/* nodes */}
            <g>
              {layout.pnodes.map((n) => {
                const inEgo = !selected || (neighborIds?.has(n.id) ?? false);
                const dim = !!selected && !inEgo;
                const isSel = n.id === selected;
                const isHover = n.id === hover;
                const showLabel = n.isLeader || n.isSuper || isSel || isHover || (!!selected && inEgo);
                return (
                  <g
                    key={n.id}
                    style={{ opacity: dim ? 0.14 : 1, transition: "opacity 350ms", cursor: "pointer" }}
                    onClick={() => focusNode(n.id)}
                    onMouseEnter={() => setHover(n.id)}
                    onMouseLeave={() => setHover(null)}
                  >
                    {/* super-connector halo */}
                    {n.isSuper && !dim && <circle cx={n.x} cy={n.y} r={n.r + 7} fill="none" stroke={n.color} strokeOpacity={0.5} strokeWidth={2} filter="url(#rg-glow)" />}
                    {/* selection ring */}
                    {(isSel || isHover) && <circle cx={n.x} cy={n.y} r={n.r + 4} fill="none" stroke="#ffffff" strokeOpacity={isSel ? 0.9 : 0.5} strokeWidth={1.5} />}
                    {/* leader crown ring */}
                    {n.isLeader && !n.isSuper && <circle cx={n.x} cy={n.y} r={n.r + 3} fill="none" stroke={n.color} strokeOpacity={0.7} strokeWidth={1.5} />}
                    <circle cx={n.x} cy={n.y} r={n.r} fill={n.color} stroke="#0a0910" strokeWidth={1.5} filter={n.isSuper && !dim ? "url(#rg-glow)" : undefined} />
                    {/* mutual-match marker */}
                    {n.mutual > 0 && !dim && (
                      <circle cx={n.x + n.r * 0.62} cy={n.y - n.r * 0.62} r={Math.max(3, n.r * 0.32)} fill="#B66CFF" stroke="#0a0910" strokeWidth={1} />
                    )}
                    {(n.isLeader || n.isSuper) && !dim && (
                      <g transform={`translate(${n.x - 5}, ${n.y - n.r - 14})`}>
                        <Crown x={0} y={0} width={10} height={10} color={n.color} aria-hidden />
                      </g>
                    )}
                    {showLabel && (
                      <text
                        x={n.x}
                        y={n.y + n.r + 13}
                        textAnchor="middle"
                        fontSize={n.isSuper ? 13 : 11}
                        fontWeight={n.isSuper || n.isLeader ? 700 : 500}
                        fill="#ffffff"
                        stroke="#0a0910"
                        strokeWidth={3}
                        paintOrder="stroke"
                        style={{ pointerEvents: "none" }}
                      >
                        {n.name}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        )}

        {/* controls + legend */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
          <div className="pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-black/40 px-3 py-2 text-[11px] text-white/80 backdrop-blur">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#B66CFF]" /> matched</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full bg-[#FFC24B]" /> met again</span>
            <span className="inline-flex items-center gap-1.5"><Crown className="h-3 w-3 text-white/70" aria-hidden /> group leader</span>
            <span className="inline-flex items-center gap-1.5"><Zap className="h-3 w-3 text-white/70" aria-hidden /> super-connector</span>
          </div>
          {selected && (
            <button
              type="button"
              onClick={reset}
              className="pointer-events-auto inline-flex h-8 items-center gap-1.5 rounded-lg bg-black/40 px-2.5 text-[11px] font-medium text-white/80 backdrop-blur transition-colors hover:text-white"
            >
              <Maximize2 className="h-3.5 w-3.5" aria-hidden /> Reset
            </button>
          )}
        </div>

        {!selected && (
          <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[11px] text-white/45">
            Tap a person to explore their network — or tap an insight above
          </p>
        )}

        {selNode && <IntelligencePanel node={selNode} links={adjacency.get(selNode.id) || []} nodes={nodes} edges={edges} onPick={focusNode} onClose={reset} />}
      </div>
    </div>
  );
}

function IntelligencePanel({
  node,
  links,
  nodes,
  edges,
  onPick,
  onClose,
}: {
  node: PNode;
  links: PLink[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const nameOf = useMemo(() => new Map(nodes.map((n) => [n.attendee_id, n.name])), [nodes]);
  const neighbors = useMemo(
    () =>
      links
        .map((l) => {
          const otherId = l.a === node.id ? l.b : l.a;
          return { id: otherId, name: nameOf.get(otherId) || "—", weight: l.weight, rounds: l.rounds, matched: l.matched, liked: l.liked, score: l.score };
        })
        .sort((a, b) => b.score - a.score || b.weight - a.weight),
    [links, node.id, nameOf],
  );
  const repeatCount = neighbors.filter((n) => n.weight >= 2).length;
  const allRounds = [...new Set(neighbors.flatMap((n) => n.rounds))].sort((a, b) => a - b);
  const suggestions = useMemo(() => suggestionsFor(node.id, nodes, edges), [node.id, nodes, edges]);

  return (
    <div className="absolute inset-x-3 bottom-3 max-h-[88%] overflow-y-auto rounded-2xl border border-white/10 bg-[#15141c]/95 p-4 text-white shadow-2xl backdrop-blur sm:inset-x-auto sm:right-3 sm:top-3 sm:bottom-3 sm:w-[20rem]">
      <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 text-white/50 transition-colors hover:text-white">
        <X className="h-4 w-4" aria-hidden />
      </button>

      {/* Identity */}
      <div className="flex items-center gap-3 pr-6">
        <div className="relative">
          <Avatar name={node.name} seed={node.id} size={44} />
          {node.isSuper && <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent"><Zap className="h-2.5 w-2.5 text-accent-foreground" aria-hidden /></span>}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-display text-lg leading-tight">{node.name}</span>
            {node.isLeader && <Crown className="h-3.5 w-3.5 shrink-0" style={{ color: node.color }} aria-hidden />}
          </div>
          {(node.role || node.company) && <div className="truncate text-xs text-white/55">{[node.role, node.company].filter(Boolean).join(" · ")}</div>}
          <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-white/45">
            <span className="h-2 w-2 rounded-full" style={{ background: node.color }} /> Group member{node.isSuper ? " · super-connector" : node.isLeader ? " · leader" : ""}
          </div>
        </div>
      </div>

      {/* Relationship intelligence */}
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        <Stat icon={Users} value={node.met} label="met" />
        <Stat icon={Repeat} value={repeatCount} label="repeat" />
        <Stat icon={Heart} value={node.mutual} label="match" />
        <Stat icon={Link2} value={node.roundsPresent} label="rounds" />
      </div>

      {/* Timeline */}
      {allRounds.length > 0 && (
        <div className="mt-3 rounded-xl bg-white/5 px-3 py-2">
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/45">Timeline</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {allRounds.map((r, i) => (
              <span key={r} className="inline-flex items-center">
                <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/80">R{r}</span>
                {i < allRounds.length - 1 && <span className="px-0.5 text-white/30">→</span>}
              </span>
            ))}
          </div>
          <div className="mt-1.5 text-[10px] text-white/45">
            First met R{allRounds[0]}
            {allRounds.length > 1 && ` · most recent R${allRounds[allRounds.length - 1]}`}
          </div>
        </div>
      )}

      {/* Top relationships */}
      <div className="mt-3 text-[10px] font-medium uppercase tracking-[0.18em] text-white/45">Top relationships</div>
      {neighbors.length === 0 ? (
        <p className="mt-2 rounded-lg bg-white/5 px-3 py-3 text-xs text-white/55">Wasn&apos;t seated with anyone — a strong candidate for a personal intro.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {neighbors.slice(0, 6).map((nb) => {
            const t = tierOf(nb);
            return (
              <li key={nb.id}>
                <button type="button" onClick={() => onPick(nb.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/5">
                  <Avatar name={nb.name} seed={nb.id} size={24} />
                  <span className="min-w-0 flex-1 truncate text-sm">{nb.name}</span>
                  {nb.weight > 1 && <span className="text-[10px] text-white/45">×{nb.weight}</span>}
                  <span className="inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ background: `${t.color}22`, color: t.color }}>{t.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Future opportunity */}
      {(suggestions.reconnect.length > 0 || suggestions.introduce.length > 0) && (
        <div className="mt-3 rounded-xl border border-accent/25 bg-accent/5 p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-accent">
            <Sparkles className="h-3 w-3" aria-hidden /> Future opportunity
          </div>
          {suggestions.reconnect.map((s) => (
            <button key={`r${s.id}`} type="button" onClick={() => onPick(s.id)} className="mt-2 flex w-full items-center gap-2 text-left">
              <Avatar name={s.name} seed={s.id} size={22} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-white">Reconnect {s.name}</span>
                <span className="block truncate text-[10px] text-white/45">{s.reason}</span>
              </span>
            </button>
          ))}
          {suggestions.introduce.map((s) => (
            <button key={`i${s.id}`} type="button" onClick={() => onPick(s.id)} className="mt-2 flex w-full items-center gap-2 text-left">
              <Avatar name={s.name} seed={s.id} size={22} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-white">Introduce to {s.name}</span>
                <span className="block truncate text-[10px] text-white/45">{s.reason}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, value, label }: { icon: typeof Users; value: number; label: string }) {
  return (
    <div className="rounded-lg bg-white/5 px-1 py-2 text-center">
      <Icon className="mx-auto h-3 w-3 text-white/40" aria-hidden />
      <div className="mt-1 font-display text-base leading-none">{value}</div>
      <div className="mt-0.5 text-[9px] uppercase tracking-wide text-white/45">{label}</div>
    </div>
  );
}
