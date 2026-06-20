"use client";

import { useEffect, useMemo, useRef, useState } from "react";
// Statically imported, but this module is only ever loaded via a dynamic
// import({ ssr: false }) from the analytics recap — so react-force-graph (which
// touches `window`) never runs on the server. Static import lets us hold a real
// ref to call zoomToFit/centerAt.
import ForceGraph2D from "react-force-graph-2d";
import { X, Maximize2, Heart, Repeat, Sparkles, Users } from "lucide-react";

import { Avatar } from "@/components/brand/avatar";

export interface GraphNode {
  attendee_id: string;
  name: string;
  met: number;
  company?: string | null;
  role?: string | null;
  rounds_present?: number;
  mutual_likes?: number;
}
export interface GraphEdge {
  a: string;
  b: string;
  matched: boolean;
  liked?: boolean;
  weight?: number;
  rounds?: number[];
}

// On-brand palette for community tinting (natural groups that formed).
const COMMUNITY = ["#FF5A3C", "#B66CFF", "#39C2FF", "#D9FF4D", "#FF8FB1", "#5BE0A8", "#FFC24B", "#7C9CFF"];
const ACCENT = "#FF5A3C";
const MATCH = "#B66CFF";
const REPEAT = "#FFC24B";

type FNode = GraphNode & { id: string; community: number; _r: number; x?: number; y?: number };
type FLink = { source: string; target: string; weight: number; rounds: number[]; matched: boolean; liked: boolean };

interface Neighbor {
  id: string;
  name: string;
  weight: number;
  rounds: number[];
  matched: boolean;
  liked: boolean;
}

/** Relationship strength tier for an edge — drives color + the panel badge. */
function tierOf(e: { matched: boolean; weight: number; liked: boolean }) {
  if (e.matched) return { label: "Matched", color: MATCH, icon: Heart };
  if (e.weight >= 2) return { label: "Repeat", color: REPEAT, icon: Repeat };
  if (e.liked) return { label: "Spark", color: "#39C2FF", icon: Sparkles };
  return { label: "Met", color: "#9aa0aa", icon: Users };
}

/** Label-propagation community detection — light, deterministic, good enough at
 *  pilot scale to reveal the natural groups that circulated together. */
function detectCommunities(nodes: { id: string }[], links: { source: string; target: string }[]): Map<string, number> {
  const adj = new Map<string, string[]>();
  nodes.forEach((n) => adj.set(n.id, []));
  links.forEach((l) => {
    adj.get(l.source)?.push(l.target);
    adj.get(l.target)?.push(l.source);
  });
  const ids = nodes.map((n) => n.id).sort();
  const label = new Map<string, string>(ids.map((id) => [id, id]));
  for (let iter = 0; iter < 12; iter++) {
    let changed = false;
    for (const id of ids) {
      const counts = new Map<string, number>();
      for (const nb of adj.get(id) || []) {
        const l = label.get(nb)!;
        counts.set(l, (counts.get(l) || 0) + 1);
      }
      if (!counts.size) continue;
      let best = label.get(id)!;
      let bestC = -1;
      for (const [l, c] of [...counts].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
        if (c > bestC) {
          bestC = c;
          best = l;
        }
      }
      if (best !== label.get(id)) {
        label.set(id, best);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const uniq = [...new Set(ids.map((id) => label.get(id)!))];
  const idx = new Map(uniq.map((l, i) => [l, i]));
  return new Map(ids.map((id) => [id, idx.get(label.get(id)!)!]));
}

function idOf(end: string | { id: string }): string {
  return typeof end === "object" ? end.id : end;
}

/**
 * The signature relationship-intelligence graph. Not a decorative chart — every
 * encoding answers an organizer question:
 *   • who met whom            → edges
 *   • who met repeatedly      → edge thickness + amber "repeat" color
 *   • strongest relationships → matched edges glow + animate
 *   • isolated attendees      → small, edge-less nodes (and the panel's 0-counts)
 *   • top value creators      → node size (people met)
 *   • natural groups          → community tinting
 *   • mutual interest         → matched (purple) edges
 *   • who to reconnect        → the relationship panel's repeat/strength history
 *
 * Click a node → focus mode (fade the rest, light up their relationships, open an
 * intelligence panel). Click the background to reset.
 */
export function RelationshipGraph({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const HEIGHT = 540;

  // Responsive width via ResizeObserver (the graph canvas needs explicit px).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const { graphData, neighbors, communityCount } = useMemo(() => {
    const maxMet = Math.max(1, ...nodes.map((n) => n.met));
    const links: FLink[] = edges.map((e) => ({
      source: e.a,
      target: e.b,
      weight: e.weight ?? 1,
      rounds: e.rounds ?? [],
      matched: e.matched,
      liked: e.liked ?? false,
    }));
    const community = detectCommunities(
      nodes.map((n) => ({ id: n.attendee_id })),
      links,
    );
    const fnodes: FNode[] = nodes.map((n) => ({
      ...n,
      id: n.attendee_id,
      community: community.get(n.attendee_id) ?? 0,
      _r: 4 + Math.sqrt(n.met / maxMet) * 10,
    }));
    // Adjacency for the panel — each person's connections with strength data.
    const nbh = new Map<string, Neighbor[]>();
    const nameOf = new Map(nodes.map((n) => [n.attendee_id, n.name]));
    for (const l of links) {
      nbh.get(l.source) ?? nbh.set(l.source, []);
      nbh.get(l.target) ?? nbh.set(l.target, []);
      nbh.get(l.source)!.push({ id: l.target, name: nameOf.get(l.target) || "—", weight: l.weight, rounds: l.rounds, matched: l.matched, liked: l.liked });
      nbh.get(l.target)!.push({ id: l.source, name: nameOf.get(l.source) || "—", weight: l.weight, rounds: l.rounds, matched: l.matched, liked: l.liked });
    }
    for (const list of nbh.values()) {
      list.sort((a, b) => Number(b.matched) - Number(a.matched) || b.weight - a.weight || a.name.localeCompare(b.name));
    }
    return { graphData: { nodes: fnodes, links }, neighbors: nbh, communityCount: new Set(community.values()).size };
  }, [nodes, edges]);

  const neighborIds = useMemo(() => {
    if (!selected) return null;
    return new Set((neighbors.get(selected) || []).map((n) => n.id));
  }, [selected, neighbors]);

  const selectedNode = selected ? (graphData.nodes.find((n) => n.id === selected) ?? null) : null;
  const selectedNbrs = selected ? neighbors.get(selected) || [] : [];
  const allRounds = selectedNbrs.flatMap((n) => n.rounds);
  const firstRound = allRounds.length ? Math.min(...allRounds) : null;
  const lastRound = allRounds.length ? Math.max(...allRounds) : null;

  function focusNode(id: string | null) {
    setSelected(id);
    if (id && fgRef.current) {
      const n = graphData.nodes.find((x) => x.id === id);
      if (n && n.x != null && n.y != null) {
        fgRef.current.centerAt(n.x, n.y, 600);
        fgRef.current.zoom(2.4, 600);
      }
    }
  }

  function resetView() {
    setSelected(null);
    fgRef.current?.zoomToFit(500, 70);
  }

  if (nodes.length < 2) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        The network fills in once people have been seated together.
      </p>
    );
  }

  return (
    <div ref={wrapRef} className="relative w-full overflow-hidden rounded-2xl border border-border bg-[#0c0b10]" style={{ height: HEIGHT }}>
      {width > 0 && (
        <ForceGraph2D
          ref={fgRef}
          graphData={graphData}
          width={width}
          height={HEIGHT}
          backgroundColor="rgba(0,0,0,0)"
          cooldownTicks={120}
          onEngineStop={() => fgRef.current?.zoomToFit(400, 70)}
          d3VelocityDecay={0.3}
          onNodeClick={(n: object) => focusNode((n as FNode).id)}
          onBackgroundClick={() => setSelected(null)}
          onNodeHover={(n: object | null) => setHover(n ? (n as FNode).id : null)}
          nodeRelSize={1}
          nodePointerAreaPaint={(node: object, color: string, ctx: CanvasRenderingContext2D) => {
            const n = node as FNode;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(n.x!, n.y!, n._r + 3, 0, 2 * Math.PI);
            ctx.fill();
          }}
          nodeCanvasObject={(node: object, ctx: CanvasRenderingContext2D, scale: number) => {
            const n = node as FNode;
            const isFocus = !!selected;
            const inNbh = !selected || selected === n.id || (neighborIds?.has(n.id) ?? false);
            const dim = isFocus && !inNbh;
            const isSel = n.id === selected;
            const isHover = n.id === hover;

            ctx.globalAlpha = dim ? 0.35 : 1;
            if ((isSel || isHover) && !dim) {
              ctx.shadowColor = isSel ? ACCENT : "#ffffff";
              ctx.shadowBlur = 18;
            }
            ctx.beginPath();
            ctx.arc(n.x!, n.y!, n._r, 0, 2 * Math.PI);
            ctx.fillStyle = dim ? "#6b7280" : COMMUNITY[n.community % COMMUNITY.length];
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.lineWidth = (isSel ? 2.5 : 1.2) / scale;
            ctx.strokeStyle = isSel ? "#ffffff" : "rgba(12,11,16,0.9)";
            ctx.stroke();

            // Labels: the selected person + their connections (and any hover).
            const showLabel = (isFocus && inNbh) || isHover || (!isFocus && n._r > 9);
            if (showLabel) {
              const font = Math.max(10, 12 / scale);
              ctx.font = `${isSel ? 700 : 500} ${font}px ui-sans-serif, system-ui`;
              ctx.textAlign = "center";
              ctx.textBaseline = "top";
              ctx.globalAlpha = dim ? 0.4 : 1;
              ctx.fillStyle = "rgba(255,255,255,0.92)";
              ctx.fillText(n.name, n.x!, n.y! + n._r + 2);
            }
            ctx.globalAlpha = 1;
          }}
          linkColor={(link: object) => {
            const l = link as FLink;
            const incident = selected && (idOf(l.source) === selected || idOf(l.target) === selected);
            if (selected && !incident) return "rgba(150,150,160,0.06)";
            if (l.matched) return "rgba(182,108,255,0.85)";
            if (l.weight >= 2) return "rgba(255,194,75,0.7)";
            return "rgba(255,255,255,0.14)";
          }}
          linkWidth={(link: object) => {
            const l = link as FLink;
            const incident = selected && (idOf(l.source) === selected || idOf(l.target) === selected);
            const base = 0.7 + (l.weight - 1) * 1.3;
            return incident ? base + 1.6 : base;
          }}
          linkDirectionalParticles={(link: object) => {
            const l = link as FLink;
            const incident = selected && (idOf(l.source) === selected || idOf(l.target) === selected);
            return incident && (l.matched || l.weight >= 2) ? 4 : 0;
          }}
          linkDirectionalParticleWidth={2.5}
          linkDirectionalParticleColor={(link: object) => ((link as FLink).matched ? MATCH : REPEAT)}
        />
      )}

      {/* Top-left: controls + legend */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
        <div className="pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-black/40 px-3 py-2 text-[11px] text-white/80 backdrop-blur">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: MATCH }} /> matched</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full" style={{ background: REPEAT }} /> met again</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border border-white/40" /> bigger = met more</span>
          {communityCount > 1 && <span className="opacity-80">· {communityCount} groups</span>}
        </div>
        <button
          type="button"
          onClick={resetView}
          className="pointer-events-auto inline-flex h-8 items-center gap-1.5 rounded-lg bg-black/40 px-2.5 text-[11px] font-medium text-white/80 backdrop-blur transition-colors hover:text-white"
        >
          <Maximize2 className="h-3.5 w-3.5" aria-hidden /> Reset
        </button>
      </div>

      {!selected && (
        <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[11px] text-white/45">
          Tap any person to explore their relationships
        </p>
      )}

      {/* Relationship intelligence panel */}
      {selectedNode && (
        <div className="absolute inset-x-3 bottom-3 max-h-[80%] overflow-y-auto rounded-2xl border border-white/10 bg-[#16151c]/95 p-4 text-white shadow-2xl backdrop-blur sm:inset-x-auto sm:right-3 sm:top-3 sm:bottom-3 sm:w-80">
          <button
            type="button"
            onClick={() => setSelected(null)}
            aria-label="Close"
            className="absolute right-3 top-3 text-white/50 transition-colors hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
          <div className="flex items-center gap-3 pr-6">
            <Avatar name={selectedNode.name} seed={selectedNode.id} size={40} />
            <div className="min-w-0">
              <div className="truncate font-display text-lg leading-tight">{selectedNode.name}</div>
              {(selectedNode.role || selectedNode.company) && (
                <div className="truncate text-xs text-white/55">
                  {[selectedNode.role, selectedNode.company].filter(Boolean).join(" · ")}
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <PanelStat value={selectedNode.met} label="connections" />
            <PanelStat value={selectedNode.rounds_present ?? 0} label="rounds" />
            <PanelStat value={selectedNode.mutual_likes ?? 0} label="matches" />
          </div>

          {firstRound != null && (
            <p className="mt-3 text-[11px] text-white/55">
              First met in <span className="text-white/80">Round {firstRound}</span>
              {lastRound != null && lastRound !== firstRound && <> · latest <span className="text-white/80">Round {lastRound}</span></>}
            </p>
          )}

          <div className="mt-3 text-[11px] font-medium uppercase tracking-[0.18em] text-white/45">Top connections</div>
          {selectedNbrs.length === 0 ? (
            <p className="mt-2 rounded-lg bg-white/5 px-3 py-3 text-xs text-white/55">
              Wasn&apos;t seated with anyone — a good candidate for a personal intro.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {selectedNbrs.slice(0, 8).map((nb) => {
                const t = tierOf(nb);
                const Icon = t.icon;
                return (
                  <li key={nb.id}>
                    <button
                      type="button"
                      onClick={() => focusNode(nb.id)}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/5"
                    >
                      <Avatar name={nb.name} seed={nb.id} size={24} />
                      <span className="min-w-0 flex-1 truncate text-sm">{nb.name}</span>
                      {nb.weight > 1 && <span className="text-[10px] text-white/45">×{nb.weight}</span>}
                      <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ background: `${t.color}22`, color: t.color }}>
                        <Icon className="h-3 w-3" aria-hidden /> {t.label}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function PanelStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl bg-white/5 px-2 py-2 text-center">
      <div className="font-display text-xl leading-none">{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wide text-white/50">{label}</div>
    </div>
  );
}
