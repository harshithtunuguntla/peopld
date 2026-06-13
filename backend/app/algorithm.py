"""Rotation algorithm — Step 4.

Seats arrived attendees so people meet as many NEW faces as possible.
Pure novelty: minimize repeat pairings, nothing else. Spec and decisions:
docs/design/rotation-algorithm.md (implementation must follow it).
"""

import hashlib
import random
from dataclasses import dataclass

MIN_TABLE_SIZE = 3
DEFAULT_RESTARTS = 20

# frozenset({attendee_id_a, attendee_id_b}) -> number of rounds they shared a table
PairCounts = dict[frozenset, int]


class RotationError(ValueError):
    """No valid seating exists for this pool + event config. Message is organizer-facing."""


@dataclass
class Rotation:
    tables: dict[str, int]  # attendee_id -> table_number (1-based, low numbers first)
    table_sizes: list[int]
    repeat_pairings: int  # seated pairs that have already met in a previous round


def draft_snapshot_hash(arrived_ids: list[str], num_tables: int, seats_per_table: int) -> str:
    """Fingerprint of everything a draft depends on (arrived set + table config).

    Publish compares this against a fresh snapshot — any change means the
    preview no longer matches reality and must be regenerated.
    """
    material = f"{num_tables}:{seats_per_table}:" + ",".join(sorted(arrived_ids))
    return hashlib.sha256(material.encode()).hexdigest()


def plan_table_sizes(pool_size: int, seats_per_table: int, num_tables: int) -> list[int]:
    """Decide how many tables of which sizes, per the design rules.

    Target = seats_per_table; min 3, max seats_per_table + 1; never 2.
    Remainder of 1 -> one bigger table; remainder of 2+ -> extra smaller
    tables (prefer 3s over 5s). Fewest tables, sizes descending.
    """
    if seats_per_table < MIN_TABLE_SIZE:
        raise RotationError(f"seats_per_table must be at least {MIN_TABLE_SIZE}")
    if pool_size < MIN_TABLE_SIZE:
        raise RotationError(
            f"Need at least {MIN_TABLE_SIZE} arrived attendees to start a round "
            f"({pool_size} currently)"
        )
    max_size = seats_per_table + 1
    capacity = num_tables * max_size
    if pool_size > capacity:
        raise RotationError(
            f"{pool_size} arrived attendees exceed venue capacity "
            f"({num_tables} tables x {max_size} max seats = {capacity}). "
            "Increase tables or seats per table in the event settings."
        )

    full_tables, remainder = divmod(pool_size, seats_per_table)
    table_count = full_tables if remainder <= 1 else full_tables + 1
    table_count = max(1, min(table_count, num_tables))
    # Splitting further would create tables under the minimum — merge instead.
    while table_count > 1 and pool_size // table_count < MIN_TABLE_SIZE:
        table_count -= 1

    base, extra = divmod(pool_size, table_count)
    sizes = [base + 1] * extra + [base] * (table_count - extra)
    if sizes[0] > max_size:
        raise RotationError(
            f"No valid table split for {pool_size} attendees with tables of "
            f"{seats_per_table} (min {MIN_TABLE_SIZE}, max {max_size} per table). "
            "Adjust seats per table in the event settings."
        )
    return sizes


def generate_rotation(
    arrived_ids: list[str],
    pair_counts: PairCounts,
    num_tables: int,
    seats_per_table: int,
    rng: random.Random | None = None,
    restarts: int = DEFAULT_RESTARTS,
) -> Rotation:
    """Greedy fill with random restarts; keeps the lowest-repeat arrangement.

    Deterministic for a seeded rng. At pilot scale (<=100 people) the whole
    thing is milliseconds. Raises RotationError when no valid plan exists.
    """
    rng = rng or random.Random()
    sizes = plan_table_sizes(len(arrived_ids), seats_per_table, num_tables)

    best_tables: dict[str, int] = {}
    best_score: int | None = None
    for _ in range(max(1, restarts)):
        tables, score = _greedy_fill(arrived_ids, pair_counts, sizes, rng)
        if best_score is None or score < best_score:
            best_tables, best_score = tables, score
        if best_score == 0:
            break  # can't beat zero repeats

    return Rotation(
        tables=best_tables,
        table_sizes=sizes,
        repeat_pairings=_count_repeat_pairs(best_tables, pair_counts),
    )


def _greedy_fill(
    arrived_ids: list[str],
    pair_counts: PairCounts,
    sizes: list[int],
    rng: random.Random,
) -> tuple[dict[str, int], int]:
    """One greedy pass: seat each person where they add the fewest repeats."""
    order = list(arrived_ids)
    rng.shuffle(order)
    members: list[list[str]] = [[] for _ in sizes]

    for person in order:
        best_cost: int | None = None
        candidates: list[int] = []
        for idx, group in enumerate(members):
            if len(group) >= sizes[idx]:
                continue
            cost = sum(pair_counts.get(frozenset((person, other)), 0) for other in group)
            if best_cost is None or cost < best_cost:
                best_cost, candidates = cost, [idx]
            elif cost == best_cost:
                candidates.append(idx)
        members[rng.choice(candidates)].append(person)

    tables = {
        person: table_idx + 1
        for table_idx, group in enumerate(members)
        for person in group
    }
    # Weighted score: pairing people who met twice is worse than once.
    score = 0
    for group in members:
        for i in range(len(group)):
            for j in range(i + 1, len(group)):
                score += pair_counts.get(frozenset((group[i], group[j])), 0)
    return tables, score


def _count_repeat_pairs(tables: dict[str, int], pair_counts: PairCounts) -> int:
    """Unweighted count of seated pairs that have met before (organizer-facing)."""
    groups: dict[int, list[str]] = {}
    for person, table_number in tables.items():
        groups.setdefault(table_number, []).append(person)
    repeats = 0
    for group in groups.values():
        for i in range(len(group)):
            for j in range(i + 1, len(group)):
                if pair_counts.get(frozenset((group[i], group[j])), 0) > 0:
                    repeats += 1
    return repeats
