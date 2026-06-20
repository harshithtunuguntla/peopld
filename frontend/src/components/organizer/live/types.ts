// Shared types + helpers for the organizer live command center.
// (These mirror the backend round schemas.)

export interface EventInfo {
  id: string;
  name: string;
  num_tables: number;
  seats_per_table: number;
  default_round_duration_seconds: number;
  target_rounds: number | null;
  round_topics: string[];
  auto_advance: boolean; // end a round automatically when its timer runs out
  status: "upcoming" | "active" | "ended";
}

export interface Attendee {
  id: string;
  name: string;
  role: string;
  status: "registered" | "arrived" | "left";
  tag: "attendee" | "speaker" | "host";
  avatar_url: string | null;
}

export interface DraftAssignment {
  attendee_id: string;
  name: string;
  table_number: number;
}

export interface CapacityWarning {
  seated: number;
  capacity: number;
  num_tables: number;
  max_per_table: number;
  biggest_table: number;
  overfilled_tables: number;
}

export interface RoundDraft {
  id: string;
  round_number: number;
  duration_seconds: number;
  arrived_count: number;
  table_count: number;
  repeat_pairings: number;
  assignments: DraftAssignment[];
  capacity_warning: CapacityWarning | null;
}

export interface ActiveAssignment {
  attendee_id: string;
  table_number: number;
}

export interface ActiveRound {
  id: string;
  round_number: number;
  duration_seconds: number;
  started_at: string | null;
  status: string;
  paused_at: string | null;
  total_paused_seconds: number;
  assignments: ActiveAssignment[];
}

export interface LiveStats {
  registered: number;
  arrived: number;
  seated_now: number;
  not_seated: number;
  likes_count: number;
  matches_count: number;
  active_round_number: number | null;
  rounds_completed: number;
}

export type Phase =
  | { kind: "loading" }
  | { kind: "ended" }
  | { kind: "active"; round: ActiveRound }
  | { kind: "draft"; draft: RoundDraft }
  | { kind: "idle" };

/** A seated person for the grid — name + avatar resolved from the attendee list. */
export interface Seat {
  attendee_id: string;
  name: string;
  avatar_url: string | null;
}

export function groupByTable(
  assignments: { attendee_id: string; table_number: number; name?: string }[],
  byId: Map<string, Attendee>,
): { table_number: number; seats: Seat[] }[] {
  const tables = new Map<number, Seat[]>();
  for (const a of assignments) {
    const info = byId.get(a.attendee_id);
    const seat: Seat = {
      attendee_id: a.attendee_id,
      name: a.name ?? info?.name ?? "(unknown)",
      avatar_url: info?.avatar_url ?? null,
    };
    if (!tables.has(a.table_number)) tables.set(a.table_number, []);
    tables.get(a.table_number)!.push(seat);
  }
  return [...tables.entries()]
    .sort(([a], [b]) => a - b)
    .map(([table_number, seats]) => ({
      table_number,
      seats: seats.sort((x, y) => x.name.localeCompare(y.name)),
    }));
}
