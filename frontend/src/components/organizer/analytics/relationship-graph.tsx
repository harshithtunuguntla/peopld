"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { forceSimulation, forceLink, forceManyBody, forceX, forceY, forceCollide, type Simulation } from "d3-force";
import { polygonHull } from "d3-polygon";
import { X, Maximize2, Heart, Sparkles, Crown, Zap, UsersRound, UserMinus, ArrowRight, Plus, Minus } from "lucide-react";

import { Avatar } from "@/components/brand/avatar";
import { cn } from "@/lib/utils";
import {
  COMMUNITY_COLORS,
  detectCommunities,
  edgeScore,
  meetingStrength,
  storyInsights,
  suggestionsFor,
  tierOf,
  type GraphNode,
  type GraphEdge,
  type StoryKind,
  type TierKey,
} from "./graph-utils";

export type { GraphNode, GraphEdge };

const BG = "#0E1015";
const MINI_W = 132;
const STORY_ICON: Record<StoryKind, typeof Zap> = { super: Zap, pair: Heart, group: UsersRound, isolated: UserMinus };
const EDGE_W: Record<TierKey, number> = { met: 0.6, spark: 1.0, repeat: 1.3, matched: 2.0 };
const EDGE_O: Record<TierKey, number> = { met: 0.1, spark: 0.34, repeat: 0.52, matched: 0.8 };

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
  d: string;
  weight: number;
  rounds: number[];
  matched: boolean;
  liked: boolean;
  score: number;
  tier: TierKey;
  color: string;
}
interface Hull {
  community: number;
  color: string;
  path: string;
  labelX: number;
  labelY: number;
}
interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

type SimNode = { id: string; community: number; r: number; x: number; y: number };
type SimLink = { source: string | SimNode; target: string | SimNode; dist: number; strength: number };

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const mid = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

function fitRect(x0: number, y0: number, x1: number, y1: number, aspect: number): View {
  let bw = Math.max(x1 - x0, 1);
  let bh = Math.max(y1 - y0, 1);
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
}

function edgePath(ax: number, ay: number, bx: number, by: number): string {
  const dx = bx - ax;
  const dy = by - ay;
  const L = Math.hypot(dx, dy) || 1;
  const off = L * 0.13;
  const mx = (ax + bx) / 2 - (dy / L) * off;
  const my = (ay + by) / 2 + (dx / L) * off;
  return `M${ax},${ay} Q${mx},${my} ${bx},${by}`;
}

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
 * Relationship Intelligence Explorer (desktop) / Interactive Relationship Map
 * (mobile). A community-first constellation built for discovery: a fit-to-content
 * camera with full pan/zoom/pinch + minimap, edges as the hero, sparse labels, and
 * a Maps-style bottom sheet on mobile that keeps the network visible while you
 * inspect a person.
 */
export function RelationshipGraph({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const miniVpRef = useRef<SVGRectElement>(null);
  const rafRef = useRef<number | undefined>(undefined);
  const viewRef = useRef<View | null>(null);
  const aspectRef = useRef(1);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const mobile = dims.w > 0 && dims.w < 640;

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

  // ---- Community-first force layout -----------------------------------------
  const layout = useMemo(() => {
    const { w, h } = dims;
    if (w < 2 || h < 2 || nodes.length < 2) return null;

    const community = detectCommunities(
      nodes.map((n) => n.attendee_id),
      edges,
    );
    const commIds = [...new Set([...community.values()])].sort((a, b) => a - b);
    const multi = commIds.length > 1;
    // Lay out in a generous virtual space, then fit the camera to the content —
    // so communities spread out and the graph always fills the canvas.
    const W = 1000;
    const H = Math.round((1000 * h) / w);
    const cx = W / 2;
    const cy = H / 2;
    const rx = W * (multi ? 0.38 : 0);
    const ry = H * (multi ? 0.38 : 0);
    const anchor = new Map<number, { x: number; y: number }>();
    commIds.forEach((c, i) => {
      const ang = (i / commIds.length) * Math.PI * 2 - Math.PI / 2;
      anchor.set(c, { x: cx + rx * Math.cos(ang), y: cy + ry * Math.sin(ang) });
    });

    const sortedMet = [...nodes.map((n) => n.met)].sort((a, b) => a - b);
    const pctOf = (met: number) => {
      let lo = 0;
      while (lo < sortedMet.length && sortedMet[lo] < met) lo++;
      return sortedMet.length > 1 ? lo / (sortedMet.length - 1) : 0;
    };
    const rOf = (met: number) => 9 + Math.pow(pctOf(met), 2.2) * 26;

    const simNodes: SimNode[] = nodes.map((n) => {
      const c = community.get(n.attendee_id) ?? 0;
      const a = anchor.get(c)!;
      return { id: n.attendee_id, community: c, r: rOf(n.met), x: a.x + (Math.random() - 0.5) * 80, y: a.y + (Math.random() - 0.5) * 80 };
    });
    const simLinks: SimLink[] = edges.map((e) => {
      const s = edgeScore({ matched: e.matched, weight: e.weight ?? 1, liked: e.liked ?? false });
      return { source: e.a, target: e.b, dist: Math.max(60, 180 - s * 12), strength: 0.04 + Math.min(s, 6) * 0.016 };
    });

    const sim: Simulation<SimNode, undefined> = forceSimulation(simNodes)
      .force("link", forceLink<SimNode, SimLink>(simLinks).id((d) => d.id).distance((l) => l.dist).strength((l) => l.strength))
      .force("charge", forceManyBody().strength(-540))
      .force("x", forceX<SimNode>((d) => anchor.get(d.community)!.x).strength(0.14))
      .force("y", forceY<SimNode>((d) => anchor.get(d.community)!.y).strength(0.14))
      .force("collide", forceCollide<SimNode>((d) => d.r + 16))
      .stop();
    for (let i = 0; i < 380; i++) sim.tick();

    const posById = new Map<string, SimNode>();
    simNodes.forEach((n) => posById.set(n.id, n));

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
      const tier = tierOf({ matched: e.matched, weight: e.weight ?? 1, liked: e.liked ?? false });
      return {
        a: e.a,
        b: e.b,
        d: edgePath(s.x, s.y, t.x, t.y),
        weight: e.weight ?? 1,
        rounds: e.rounds ?? [],
        matched: e.matched,
        liked: e.liked ?? false,
        score: edgeScore({ matched: e.matched, weight: e.weight ?? 1, liked: e.liked ?? false }),
        tier: tier.key,
        color: tier.color,
      };
    });

    const hulls: Hull[] = commIds
      .map((c) => {
        const members = pnodes.filter((n) => n.community === c);
        if (members.length < 2) return null;
        const pts = members.map((m) => [m.x, m.y] as [number, number]);
        const ccx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
        const ccy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
        const maxMR = Math.max(...members.map((m) => m.r));
        const minY = Math.min(...members.map((m) => m.y - m.r));
        return { community: c, color: COMMUNITY_COLORS[c % COMMUNITY_COLORS.length], path: regionPath(pts, ccx, ccy, maxMR + 40), labelX: ccx, labelY: minY - 26 };
      })
      .filter((x): x is Hull => x !== null);

    // Fit camera to content.
    const x0 = Math.min(...pnodes.map((n) => n.x - n.r));
    const x1 = Math.max(...pnodes.map((n) => n.x + n.r));
    const y0 = Math.min(...pnodes.map((n) => n.y - n.r), ...hulls.map((h) => h.labelY - 8));
    const y1 = Math.max(...pnodes.map((n) => n.y + n.r));
    const pad = 46;
    const base = fitRect(x0 - pad, y0 - pad, x1 + pad, y1 + pad, w / h);
    const content = { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };

    return { pnodes, plinks, hulls, base, content };
  }, [nodes, edges, dims]);

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

  // ---- Camera + navigation --------------------------------------------------
  const applyView = useCallback((v: View) => {
    const base = layout?.base;
    if (!base) return;
    const aspect = aspectRef.current;
    const minW = base.w * 0.12;
    const maxW = base.w * 1.6;
    const w = Math.min(maxW, Math.max(minW, v.w));
    const h = w / aspect;
    // keep the view centre within a sane range of the content
    let cxv = v.x + v.w / 2;
    let cyv = v.y + v.h / 2;
    const bx0 = base.x - base.w * 0.35;
    const bx1 = base.x + base.w + base.w * 0.35;
    const by0 = base.y - base.h * 0.35;
    const by1 = base.y + base.h + base.h * 0.35;
    cxv = Math.min(bx1, Math.max(bx0, cxv));
    cyv = Math.min(by1, Math.max(by0, cyv));
    const view: View = { x: cxv - w / 2, y: cyv - h / 2, w, h };
    viewRef.current = view;
    svgRef.current?.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
    const vp = miniVpRef.current;
    if (vp) {
      const sx = MINI_W / base.w;
      vp.setAttribute("x", String((view.x - base.x) * sx));
      vp.setAttribute("y", String((view.y - base.y) * sx));
      vp.setAttribute("width", String(view.w * sx));
      vp.setAttribute("height", String(view.h * sx));
    }
  }, [layout]);

  const animateTo = useCallback(
    (target: View) => {
      const start = viewRef.current ?? target;
      const t0 = performance.now();
      const dur = 680;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / dur);
        const e = easeInOut(p);
        applyView({
          x: start.x + (target.x - start.x) * e,
          y: start.y + (target.y - start.y) * e,
          w: start.w + (target.w - start.w) * e,
          h: start.h + (target.h - start.h) * e,
        });
        if (p < 1) rafRef.current = requestAnimationFrame(step);
      };
      rafRef.current = requestAnimationFrame(step);
    },
    [applyView],
  );

  // initialise / reset camera on (re)layout
  useEffect(() => {
    if (layout) {
      aspectRef.current = layout.base.w / layout.base.h;
      viewRef.current = layout.base;
      svgRef.current?.setAttribute("viewBox", `${layout.base.x} ${layout.base.y} ${layout.base.w} ${layout.base.h}`);
      applyView(layout.base);
    }
  }, [layout, applyView]);

  const egoRect = useCallback(
    (ids: Set<string>): View => {
      if (!layout) return { x: 0, y: 0, w: 1, h: 1 };
      const ps = layout.pnodes.filter((n) => ids.has(n.id));
      if (!ps.length) return layout.base;
      const x0 = Math.min(...ps.map((n) => n.x - n.r));
      const x1 = Math.max(...ps.map((n) => n.x + n.r));
      const y0 = Math.min(...ps.map((n) => n.y - n.r));
      const y1 = Math.max(...ps.map((n) => n.y + n.r));
      const px = (x1 - x0) * 0.32 + 90;
      const py = (y1 - y0) * 0.32 + 90;
      const rect = fitRect(x0 - px, y0 - py, x1 + px, y1 + py, layout.base.w / layout.base.h);
      // On mobile the bottom sheet covers the lower area — nudge the framing up.
      if (mobile) rect.y += rect.h * 0.1;
      return rect;
    },
    [layout, mobile],
  );

  const screenToView = useCallback((clientX: number, clientY: number): [number, number] => {
    const svg = svgRef.current;
    const v = viewRef.current;
    if (!svg || !v) return [0, 0];
    const r = svg.getBoundingClientRect();
    return [v.x + ((clientX - r.left) / r.width) * v.w, v.y + ((clientY - r.top) / r.height) * v.h];
  }, []);

  const zoomAt = useCallback(
    (factor: number, cxv: number, cyv: number, animate = false) => {
      const v = viewRef.current;
      if (!v) return;
      const nw = v.w * factor;
      const nh = v.h * factor;
      const nx = cxv - (cxv - v.x) * (nw / v.w);
      const ny = cyv - (cyv - v.y) * (nh / v.h);
      const target = { x: nx, y: ny, w: nw, h: nh };
      if (animate) animateTo(target);
      else applyView(target);
    },
    [applyView, animateTo],
  );

  function focusNode(id: string) {
    setSelected(id);
    const ids = new Set<string>([id]);
    (adjacency.get(id) || []).forEach((l) => ids.add(l.a === id ? l.b : l.a));
    animateTo(egoRect(ids));
  }
  function fit() {
    if (layout) animateTo(layout.base);
  }
  function reset() {
    setSelected(null);
    fit();
  }
  function zoomButton(factor: number) {
    const v = viewRef.current;
    if (v) zoomAt(factor, v.x + v.w / 2, v.y + v.h / 2, true);
  }

  // ---- Pointer pan / pinch + wheel zoom -------------------------------------
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const panStart = useRef<{ x: number; y: number; view: View } | null>(null);
  const pinchStart = useRef<{ dist: number; view: View; mvx: number; mvy: number } | null>(null);
  const movedRef = useRef(false);
  const downOnNode = useRef(false);
  const lastTap = useRef(0);

  function onPointerDown(e: React.PointerEvent) {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    movedRef.current = false;
    downOnNode.current = !!(e.target as Element).closest("[data-node]");
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (pointers.current.size === 1) {
      panStart.current = { x: e.clientX, y: e.clientY, view: { ...viewRef.current! } };
      pinchStart.current = null;
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const [mvx, mvy] = screenToView((a.x + b.x) / 2, (a.y + b.y) / 2);
      pinchStart.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), view: { ...viewRef.current! }, mvx, mvy };
      panStart.current = null;
    }
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (pointers.current.size >= 2 && pinchStart.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const ps = pinchStart.current;
      const factor = ps.dist / dist;
      const nw = ps.view.w * factor;
      const nh = ps.view.h * factor;
      applyView({ x: ps.mvx - (ps.mvx - ps.view.x) * (nw / ps.view.w), y: ps.mvy - (ps.mvy - ps.view.y) * (nh / ps.view.h), w: nw, h: nh });
      movedRef.current = true;
    } else if (pointers.current.size === 1 && panStart.current) {
      const v = panStart.current.view;
      const dx = ((e.clientX - panStart.current.x) / rect.width) * v.w;
      const dy = ((e.clientY - panStart.current.y) / rect.height) * v.h;
      if (Math.abs(e.clientX - panStart.current.x) > 4 || Math.abs(e.clientY - panStart.current.y) > 4) movedRef.current = true;
      applyView({ x: v.x - dx, y: v.y - dy, w: v.w, h: v.h });
    }
  }
  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) {
      if (!movedRef.current && !downOnNode.current) {
        const now = performance.now();
        if (now - lastTap.current < 300) {
          const [cxv, cyv] = screenToView(e.clientX, e.clientY);
          zoomAt(0.55, cxv, cyv, true);
          lastTap.current = 0;
        } else {
          lastTap.current = now;
          if (selected) reset();
        }
      }
      panStart.current = null;
    }
  }

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !layout) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const [cxv, cyv] = screenToView(e.clientX, e.clientY);
      zoomAt(Math.exp(e.deltaY * 0.0015), cxv, cyv, false);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [layout, screenToView, zoomAt]);

  function minimapClick(e: React.MouseEvent) {
    if (!layout) return;
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const sx = layout.base.w / MINI_W;
    const cx = layout.base.x + ((e.clientX - r.left) / r.width) * MINI_W * sx;
    const cy = layout.base.y + ((e.clientY - r.top) / r.height) * (MINI_W / aspectRef.current) * sx;
    const v = viewRef.current!;
    animateTo({ x: cx - v.w / 2, y: cy - v.h / 2, w: v.w, h: v.h });
  }

  if (nodes.length < 2) {
    return <p className="py-12 text-center text-sm text-muted-foreground">The network fills in once people have been seated together.</p>;
  }

  const selNode = selected && layout ? layout.pnodes.find((n) => n.id === selected) ?? null : null;
  const miniH = layout ? MINI_W / (layout.base.w / layout.base.h) : MINI_W;

  return (
    <div className="space-y-3">
      {/* Story rail */}
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

      <div ref={wrapRef} className="relative h-[540px] w-full overflow-hidden rounded-2xl border border-border sm:h-[660px] lg:h-[740px]" style={{ background: BG }}>
        {layout && (
          <svg
            ref={svgRef}
            className="absolute inset-0 h-full w-full select-none"
            style={{ touchAction: "none", cursor: "grab" }}
            role="img"
            aria-label="Relationship constellation — communities, connections and matches from the event"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <defs>
              <filter id="rg-glow" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="2" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="rg-cloud" x="-90%" y="-90%" width="280%" height="280%">
                <feGaussianBlur stdDeviation="34" />
              </filter>
            </defs>

            <rect x={-99999} y={-99999} width={199998} height={199998} fill="transparent" />

            {/* community regions */}
            <g style={{ opacity: selected ? 0.22 : 1, transition: "opacity 400ms", pointerEvents: "none" }}>
              {layout.hulls.map((h, i) => (
                <g key={`h${h.community}`}>
                  <path d={h.path} fill={h.color} opacity={0.07} filter="url(#rg-cloud)" />
                  <text x={h.labelX} y={h.labelY} textAnchor="middle" fontSize={14} fontWeight={600} letterSpacing="0.18em" fill={h.color} fillOpacity={0.5}>
                    GROUP {i + 1}
                  </text>
                </g>
              ))}
            </g>

            {/* edges */}
            <g fill="none" style={{ pointerEvents: "none" }}>
              {[...layout.plinks]
                .sort((a, b) => a.score - b.score)
                .map((l, i) => {
                  const incident = selected ? l.a === selected || l.b === selected : false;
                  const faded = selected && !incident;
                  const strong = l.matched || l.weight >= 3;
                  return (
                    <path
                      key={`l${i}`}
                      d={l.d}
                      stroke={faded ? "#5b6270" : l.color}
                      strokeOpacity={faded ? 0.04 : incident ? Math.min(0.95, EDGE_O[l.tier] + 0.3) : EDGE_O[l.tier]}
                      strokeWidth={incident ? EDGE_W[l.tier] + 1.4 : EDGE_W[l.tier] + (l.weight >= 3 ? 0.7 : 0)}
                      strokeLinecap="round"
                      filter={strong && !faded ? "url(#rg-glow)" : undefined}
                      style={{ transition: "stroke-opacity 400ms" }}
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
                const showLabel = n.isSuper || isSel || isHover || (!!selected && inEgo);
                return (
                  <g
                    key={n.id}
                    data-node
                    style={{ opacity: dim ? 0.1 : 1, transition: "opacity 400ms", cursor: "pointer" }}
                    onClick={() => {
                      if (!movedRef.current) focusNode(n.id);
                    }}
                    onMouseEnter={() => setHover(n.id)}
                    onMouseLeave={() => setHover(null)}
                  >
                    {n.isSuper && !dim && (
                      <circle cx={n.x} cy={n.y} r={n.r + 7} fill="none" stroke={n.color} strokeWidth={1.5}>
                        <animate attributeName="stroke-opacity" values="0.5;0.15;0.5" dur="3.2s" repeatCount="indefinite" />
                        <animate attributeName="r" values={`${n.r + 6};${n.r + 12};${n.r + 6}`} dur="3.2s" repeatCount="indefinite" />
                      </circle>
                    )}
                    {(isSel || isHover) && <circle cx={n.x} cy={n.y} r={n.r + 5} fill="none" stroke="#ffffff" strokeOpacity={isSel ? 0.85 : 0.45} strokeWidth={1.5} />}
                    {n.isLeader && !n.isSuper && !dim && <circle cx={n.x} cy={n.y} r={n.r + 3.5} fill="none" stroke={n.color} strokeOpacity={0.45} strokeWidth={1.25} />}
                    <circle cx={n.x} cy={n.y} r={n.r} fill={n.color} stroke={BG} strokeWidth={1.5} filter={n.isSuper && !dim ? "url(#rg-glow)" : undefined} />
                    {showLabel && (
                      <text
                        x={n.x}
                        y={n.y + n.r + 16}
                        textAnchor="middle"
                        fontSize={n.isSuper ? 17 : 14}
                        fontWeight={n.isSuper ? 700 : 500}
                        fill="#ffffff"
                        fillOpacity={isSel || isHover || n.isSuper ? 0.95 : 0.7}
                        stroke={BG}
                        strokeWidth={4}
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

        {/* legend (top-left) */}
        <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-white/[0.04] px-3 py-2 text-[11px] text-white/60 backdrop-blur">
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: "#B66CFF" }} /> matched</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-px w-4" style={{ background: "#E7B36A" }} /> met again</span>
          <span className="inline-flex items-center gap-1.5"><Zap className="h-3 w-3 text-white/55" aria-hidden /> connector</span>
        </div>

        {/* reset selection (top-right) */}
        {selected && (
          <button
            type="button"
            onClick={reset}
            className="absolute right-3 top-3 inline-flex h-8 items-center gap-1.5 rounded-lg bg-white/[0.06] px-2.5 text-[11px] font-medium text-white/70 backdrop-blur transition-colors hover:text-white"
          >
            <X className="h-3.5 w-3.5" aria-hidden /> Clear
          </button>
        )}

        {/* navigation controls (bottom-left) */}
        <div className="absolute bottom-3 left-3 flex flex-col items-start gap-2">
          {!mobile && layout && (
            <svg
              width={MINI_W}
              height={miniH}
              viewBox={`${layout.content.x0} ${layout.content.y0} ${layout.content.x1 - layout.content.x0} ${layout.content.y1 - layout.content.y0}`}
              onClick={minimapClick}
              className="cursor-pointer rounded-lg border border-white/10 bg-black/30 backdrop-blur"
              aria-label="Minimap"
            >
              {layout.plinks.map((l, i) => (
                <path key={i} d={l.d} fill="none" stroke={l.color} strokeOpacity={0.25} strokeWidth={l.weight >= 2 ? 3 : 1.5} />
              ))}
              {layout.pnodes.map((n) => (
                <circle key={n.id} cx={n.x} cy={n.y} r={Math.max(3, n.r * 0.7)} fill={n.color} fillOpacity={0.85} />
              ))}
              <rect ref={miniVpRef} fill="#ffffff" fillOpacity={0.12} stroke="#ffffff" strokeOpacity={0.6} strokeWidth={4} />
            </svg>
          )}
          <div className="flex items-center gap-1 rounded-lg bg-white/[0.06] p-1 backdrop-blur">
            <CtrlBtn label="Zoom in" onClick={() => zoomButton(0.7)}><Plus className="h-4 w-4" aria-hidden /></CtrlBtn>
            <CtrlBtn label="Zoom out" onClick={() => zoomButton(1.4)}><Minus className="h-4 w-4" aria-hidden /></CtrlBtn>
            <CtrlBtn label="Fit to screen" onClick={fit}><Maximize2 className="h-4 w-4" aria-hidden /></CtrlBtn>
          </div>
        </div>

        {!selected && (
          <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[11px] text-white/35">
            {mobile ? "Tap a person · pinch to zoom · drag to pan" : "Tap a person · scroll to zoom · drag to pan"}
          </p>
        )}

        {selNode &&
          (mobile ? (
            <MobileSheet key={selNode.id} node={selNode} links={adjacency.get(selNode.id) || []} nodes={nodes} edges={edges} cardH={dims.h} onPick={focusNode} onClose={reset} />
          ) : (
            <DesktopPanel node={selNode} links={adjacency.get(selNode.id) || []} nodes={nodes} edges={edges} onPick={focusNode} onClose={reset} />
          ))}
      </div>
    </div>
  );
}

function CtrlBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="flex h-8 w-8 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-white">
      {children}
    </button>
  );
}

// ---- Panel content (shared by desktop panel + mobile sheet) -----------------

function usePanelData(node: PNode, links: PLink[], nodes: GraphNode[], edges: GraphEdge[]) {
  const info = useMemo(() => {
    const m = new Map<string, { name: string; meta: string }>();
    nodes.forEach((n) => m.set(n.attendee_id, { name: n.name, meta: [n.role, n.company].filter(Boolean).join(" · ") }));
    return m;
  }, [nodes]);
  // Total rounds in the event — so the "rounds active" pills + per-pair round dots
  // show the full timeline, lit where this person actually met someone.
  const totalRounds = useMemo(() => edges.reduce((mx, e) => Math.max(mx, ...(e.rounds && e.rounds.length ? e.rounds : [0])), 0), [edges]);
  const neighbors = useMemo(
    () =>
      links
        .map((l) => {
          const otherId = l.a === node.id ? l.b : l.a;
          const i = info.get(otherId);
          return { id: otherId, name: i?.name || "—", meta: i?.meta || "", weight: l.weight, rounds: l.rounds, matched: l.matched, strength: meetingStrength(l.weight) };
        })
        .sort((a, b) => b.weight - a.weight || Number(b.matched) - Number(a.matched) || a.name.localeCompare(b.name)),
    [links, node.id, info],
  );
  const totalMeetings = neighbors.reduce((s, n) => s + n.weight, 0); // sum of times this person shared a table
  const strongestTie = neighbors.reduce((mx, n) => Math.max(mx, n.weight), 0); // most meetings with any one person
  const activeRounds = useMemo(() => [...new Set(neighbors.flatMap((n) => n.rounds))].sort((a, b) => a - b), [neighbors]);
  const suggestions = useMemo(() => suggestionsFor(node.id, nodes, edges), [node.id, nodes, edges]);
  return { neighbors, totalMeetings, strongestTie, activeRounds, totalRounds, suggestions };
}

function PanelHeader({ node }: { node: PNode }) {
  return (
    <div className="flex items-center gap-3 pr-6">
      <div className="relative">
        <Avatar name={node.name} seed={node.id} size={44} />
        {node.isSuper && <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent"><Zap className="h-2.5 w-2.5 text-accent-foreground" aria-hidden /></span>}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-display text-lg leading-tight">{node.name}</span>
          {node.isLeader && <Crown className="h-3.5 w-3.5 shrink-0" style={{ color: node.color }} aria-hidden />}
        </div>
        {(node.role || node.company) && <div className="truncate text-xs text-white/55">{[node.role, node.company].filter(Boolean).join(" · ")}</div>}
        <span className="mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ color: node.color, background: `${node.color}26` }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: node.color }} />
          {node.isSuper ? "Super-connector" : node.isLeader ? "Group leader" : "Community member"}
        </span>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-display text-xl leading-none">{node.met}</div>
        <div className="text-[9px] uppercase tracking-wide text-white/45">met</div>
      </div>
    </div>
  );
}

function PanelDetails({ node, data, onPick }: { node: PNode; data: ReturnType<typeof usePanelData>; onPick: (id: string) => void }) {
  const { neighbors, totalMeetings, strongestTie, activeRounds, totalRounds, suggestions } = data;
  return (
    <>
      {/* KPIs — the reference metric set */}
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        <Kpi value={totalMeetings} label="Meetings" />
        <Kpi value={`${strongestTie}×`} label="Strongest" />
        <Kpi value={node.mutual} label="Matches" />
        <Kpi value={node.roundsPresent} label="Rounds" />
      </div>

      {/* Rounds active */}
      {totalRounds > 0 && (
        <div className="mt-4">
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/45">Rounds active</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Array.from({ length: totalRounds }, (_, i) => i + 1).map((r) => {
              const on = activeRounds.includes(r);
              return (
                <span
                  key={r}
                  className={cn(
                    "min-w-[38px] flex-1 rounded-lg border px-1 py-1.5 text-center font-mono text-[11px] font-semibold",
                    on ? "border-transparent bg-accent text-accent-foreground" : "border-white/10 text-white/35",
                  )}
                >
                  R{r}
                </span>
              );
            })}
          </div>
          {activeRounds.length > 0 && (
            <div className="mt-1.5 text-[10px] text-white/45">
              First met R{activeRounds[0]}
              {activeRounds.length > 1 && ` · most recent R${activeRounds[activeRounds.length - 1]}`}
            </div>
          )}
        </div>
      )}

      {/* Connections — name, round dots, meeting-strength chip */}
      <div className="mt-4 flex items-center justify-between">
        <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/45">Connections</div>
        <div className="font-mono text-[10px] text-white/35">{neighbors.length}</div>
      </div>
      {neighbors.length === 0 ? (
        <p className="mt-2 rounded-lg bg-white/5 px-3 py-3 text-xs text-white/55">Wasn&apos;t seated with anyone — a strong candidate for a personal intro.</p>
      ) : (
        <ul className="mt-2 space-y-0.5">
          {neighbors.map((nb) => (
            <li key={nb.id}>
              <button type="button" onClick={() => onPick(nb.id)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/5">
                <Avatar name={nb.name} seed={nb.id} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium leading-tight">{nb.name}</span>
                  {nb.meta && <span className="block truncate text-[11px] text-white/45">{nb.meta}</span>}
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  {totalRounds > 0 && <RoundDots total={totalRounds} on={nb.rounds} />}
                  <span className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: nb.strength.color, borderColor: `${nb.strength.color}66` }}>
                    {nb.matched && <Heart className="h-2.5 w-2.5" aria-hidden />}
                    {nb.weight}× {nb.strength.label}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

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
    </>
  );
}

function DesktopPanel({
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
  const data = usePanelData(node, links, nodes, edges);
  return (
    <div className="absolute right-3 top-3 bottom-3 w-[20rem] overflow-y-auto rounded-2xl border border-white/10 bg-[#14161c]/95 p-4 text-white shadow-2xl backdrop-blur">
      <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 z-10 text-white/50 transition-colors hover:text-white">
        <X className="h-4 w-4" aria-hidden />
      </button>
      <PanelHeader node={node} />
      <PanelDetails node={node} data={data} onPick={onPick} />
    </div>
  );
}

function MobileSheet({
  node,
  links,
  nodes,
  edges,
  cardH,
  onPick,
  onClose,
}: {
  node: PNode;
  links: PLink[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  cardH: number;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const data = usePanelData(node, links, nodes, edges);
  const COLLAPSED = 132;
  const EXPANDED = Math.max(COLLAPSED + 80, Math.min(Math.round(cardH * 0.74), cardH - 64));
  const range = EXPANDED - COLLAPSED;
  const [ty, setTy] = useState(range); // start collapsed (peek)
  const drag = useRef<{ startY: number; base: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  function down(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { startY: e.clientY, base: ty };
    setDragging(true);
  }
  function move(e: React.PointerEvent) {
    if (!drag.current) return;
    setTy(Math.min(range, Math.max(0, drag.current.base + (e.clientY - drag.current.startY))));
  }
  function up() {
    if (!drag.current) return;
    setTy((cur) => (cur < range / 2 ? 0 : range));
    drag.current = null;
    setDragging(false);
  }

  return (
    <div
      className="absolute inset-x-0 bottom-0 z-10 flex flex-col rounded-t-2xl border-t border-white/10 bg-[#14161c]/97 text-white shadow-2xl backdrop-blur"
      style={{ height: EXPANDED, transform: `translateY(${ty}px)`, transition: dragging ? "none" : "transform 320ms cubic-bezier(0.22,1,0.36,1)" }}
    >
      {/* drag handle + peek header */}
      <div className="shrink-0 cursor-grab touch-none px-4 pb-2 pt-2" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.18em] text-white/40">{ty > range / 2 ? "Drag up for details" : "Relationship intelligence"}</span>
          <button type="button" onClick={onClose} aria-label="Close" className="text-white/50 transition-colors hover:text-white">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <PanelHeader node={node} />
        <PanelDetails node={node} data={data} onPick={onPick} />
      </div>
    </div>
  );
}

function Kpi({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="rounded-xl bg-white/5 px-2 py-3 text-center">
      <div className="font-display text-2xl leading-none text-white">{value}</div>
      <div className="mt-1.5 text-[9px] font-medium uppercase tracking-[0.1em] text-white/45">{label}</div>
    </div>
  );
}

/** Per-round presence dots for one connection — lit for the rounds the pair met. */
function RoundDots({ total, on }: { total: number; on: number[] }) {
  return (
    <span className="flex gap-0.5">
      {Array.from({ length: total }, (_, i) => i + 1).map((r) => (
        <span key={r} className="h-1.5 w-1.5 rounded-full" style={{ background: on.includes(r) ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.15)" }} />
      ))}
    </span>
  );
}
