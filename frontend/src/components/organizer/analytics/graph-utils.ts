// Shared relationship-graph logic — used by both the interactive graph and the
// relationship-intelligence sections so the two never disagree on communities,
// strength tiers, or who's isolated. Pure (no React / no lucide) by design.

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

// On-brand palette for community tinting (the natural groups that formed).
export const COMMUNITY_COLORS = ["#FF5A3C", "#B66CFF", "#39C2FF", "#D9FF4D", "#FF8FB1", "#5BE0A8", "#FFC24B", "#7C9CFF"];

export type TierKey = "matched" | "repeat" | "spark" | "met";

/** Relationship strength tier for an edge — drives color + badges everywhere. */
export function tierOf(e: { matched: boolean; weight: number; liked: boolean }): { key: TierKey; label: string; color: string } {
  if (e.matched) return { key: "matched", label: "Matched", color: "#B66CFF" };
  if (e.weight >= 2) return { key: "repeat", label: "Repeat", color: "#FFC24B" };
  if (e.liked) return { key: "spark", label: "Spark", color: "#39C2FF" };
  return { key: "met", label: "Met", color: "#9aa0aa" };
}

/** A single comparable strength score: repeat meetings matter most, a mutual
 *  match is a strong signal, a one-way like a mild one. */
export function edgeScore(e: { matched: boolean; weight: number; liked: boolean }): number {
  return e.weight + (e.matched ? 3 : 0) + (e.liked ? 1 : 0);
}

/** Label-propagation community detection — light, deterministic, good enough at
 *  pilot scale to reveal the groups that circulated together. */
export function detectCommunities(nodeIds: string[], edges: { a: string; b: string }[]): Map<string, number> {
  const adj = new Map<string, string[]>();
  nodeIds.forEach((id) => adj.set(id, []));
  edges.forEach((e) => {
    adj.get(e.a)?.push(e.b);
    adj.get(e.b)?.push(e.a);
  });
  const ids = [...nodeIds].sort();
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

export interface StrongPair {
  a: string;
  b: string;
  aName: string;
  bName: string;
  weight: number;
  rounds: number[];
  matched: boolean;
  liked: boolean;
  score: number;
}

export interface Community {
  index: number;
  members: GraphNode[];
  leader: GraphNode; // highest-degree member — a natural connector for that group
}

export interface NetworkInsights {
  strongest: StrongPair[];
  repeatPairs: number;
  isolated: GraphNode[]; // seated but met the fewest people
  communities: Community[];
  avgMet: number;
  medianMet: number;
  maxMet: number;
}

/** One pass over the graph payload → every relationship-intelligence section. */
export function computeInsights(nodes: GraphNode[], edges: GraphEdge[]): NetworkInsights {
  const nameOf = new Map(nodes.map((n) => [n.attendee_id, n.name]));
  const norm = edges.map((e) => ({
    a: e.a,
    b: e.b,
    weight: e.weight ?? 1,
    rounds: e.rounds ?? [],
    matched: e.matched,
    liked: e.liked ?? false,
  }));

  const strongest: StrongPair[] = norm
    .map((e) => ({
      a: e.a,
      b: e.b,
      aName: nameOf.get(e.a) || "—",
      bName: nameOf.get(e.b) || "—",
      weight: e.weight,
      rounds: e.rounds,
      matched: e.matched,
      liked: e.liked,
      score: edgeScore(e),
    }))
    .sort((x, y) => y.score - x.score || y.weight - x.weight || x.aName.localeCompare(y.aName));

  const repeatPairs = norm.filter((e) => e.weight >= 2).length;

  // Isolated: seated people who met the fewest others (the ones to introduce).
  const isolated = [...nodes].sort((a, b) => a.met - b.met || a.name.localeCompare(b.name)).filter((n) => n.met <= 1);

  // Communities + their natural leader (highest met within the group).
  const community = detectCommunities(
    nodes.map((n) => n.attendee_id),
    edges,
  );
  const byComm = new Map<number, GraphNode[]>();
  for (const n of nodes) {
    const c = community.get(n.attendee_id) ?? 0;
    (byComm.get(c) ?? byComm.set(c, []).get(c)!).push(n);
  }
  const communities: Community[] = [...byComm.entries()]
    .map(([index, members]) => {
      const leader = [...members].sort((a, b) => b.met - a.met || a.name.localeCompare(b.name))[0];
      return { index, members, leader };
    })
    .filter((c) => c.members.length >= 2)
    .sort((a, b) => b.members.length - a.members.length);

  const metVals = nodes.map((n) => n.met).sort((a, b) => a - b);
  const avgMet = metVals.length ? Math.round((metVals.reduce((s, v) => s + v, 0) / metVals.length) * 10) / 10 : 0;
  const medianMet = metVals.length ? metVals[Math.floor(metVals.length / 2)] : 0;
  const maxMet = metVals.length ? metVals[metVals.length - 1] : 0;

  return { strongest, repeatPairs, isolated, communities, avgMet, medianMet, maxMet };
}
