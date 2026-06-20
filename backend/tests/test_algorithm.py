"""Unit tests for the rotation algorithm — pure functions, no app/db needed.

Covers the table-math rules and the greedy novelty optimizer from
docs/design/rotation-algorithm.md.
"""

import random

import pytest

from app.algorithm import (
    Rotation,
    RotationError,
    RotationPlan,
    draft_snapshot_hash,
    generate_rotation,
    plan_rounds,
    plan_table_sizes,
)

# --- plan_table_sizes: MIN-DRIVEN packing (fill every table to min, sprinkle the rest) ---


def test_plan_exact_multiple():
    assert plan_table_sizes(8, 4, 10) == [4, 4]
    assert plan_table_sizes(40, 4, 10) == [4] * 10


def test_plan_packs_to_min_then_sprinkles_leftovers():
    # Default min is 3: pack as many 3s as possible, leftovers bump tables to 4.
    # 22 people → six tables of 3 + one of 4 (the user's worked example).
    assert plan_table_sizes(22, 4, 10) == [4, 3, 3, 3, 3, 3, 3]
    # 13 → four tables, one leftover → [4,3,3,3] (no longer a fuller table of 5)
    assert plan_table_sizes(13, 4, 10) == [4, 3, 3, 3]
    assert plan_table_sizes(5, 4, 10) == [5]


def test_plan_remainder_two_makes_two_tables_of_three():
    assert plan_table_sizes(14, 4, 10) == [4, 4, 3, 3]
    assert plan_table_sizes(6, 4, 10) == [3, 3]


def test_plan_remainder_three():
    assert plan_table_sizes(11, 4, 10) == [4, 4, 3]
    assert plan_table_sizes(7, 4, 10) == [4, 3]


def test_plan_small_pools():
    assert plan_table_sizes(3, 4, 10) == [3]
    assert plan_table_sizes(4, 4, 10) == [4]


def test_plan_never_a_table_below_floor():
    # Default floor is 3 with plenty of tables → no size ever drops below it.
    for pool in range(3, 60):
        assert min(plan_table_sizes(pool, 4, 20)) >= 3, f"pool={pool}"


def test_plan_fewer_than_min_raises():
    with pytest.raises(RotationError, match="at least 3 arrived"):
        plan_table_sizes(2, 4, 10)


def test_plan_over_capacity_overfills_instead_of_erroring():
    # 10 tables, ceiling 4 → 40 comfortable seats. 51 people no longer errors:
    # everyone is seated by overfilling some tables past the ceiling.
    sizes = plan_table_sizes(51, 4, 10)
    assert len(sizes) == 10
    assert sum(sizes) == 51  # nobody dropped
    assert max(sizes) > 4  # at least one table is overfilled past the ceiling


def test_plan_capacity_boundary_fits():
    sizes = plan_table_sizes(50, 4, 10)
    assert len(sizes) == 10 and all(s == 5 for s in sizes)


def test_plan_caps_table_count_at_num_tables():
    # 14 people but only 3 physical tables: squeeze, don't overflow table numbers
    sizes = plan_table_sizes(14, 4, 3)
    assert len(sizes) == 3
    assert sorted(sizes, reverse=True) == [5, 5, 4]


# --- organizer-set min/max per-table bounds ---


def test_table_bounds_higher_min_makes_bigger_tables():
    # Min IS the size the algorithm packs toward: min 4 → 32 people = eight tables of 4.
    assert plan_table_sizes(32, 4, 10, min_size=4) == [4, 4, 4, 4, 4, 4, 4, 4]


def test_table_bounds_low_min_makes_many_small_tables():
    # min 2 is now allowed → pack toward 2, leftovers become 3s.
    assert plan_table_sizes(22, 4, 10, min_size=2, max_size=3) == [3, 3, 2, 2, 2, 2, 2, 2, 2, 2]


def test_table_bounds_custom_min_forces_fewer_tables():
    # min 5 means no table may drop below 5 → 20 people = four tables of 5.
    assert plan_table_sizes(20, 5, 8, min_size=5, max_size=6) == [5, 5, 5, 5]


def test_table_bounds_allows_two_but_never_one():
    # min 2 is honored (tables of 2 appear); asking for 1 is clamped up to 2.
    sizes_two = plan_table_sizes(9, 3, 10, min_size=2)
    assert min(sizes_two) == 2
    assert min(plan_table_sizes(9, 3, 10, min_size=1)) >= 2  # never a lonely 1


def test_table_bounds_max_below_min_raises():
    with pytest.raises(RotationError, match="smaller than the minimum"):
        plan_table_sizes(20, 4, 8, min_size=5, max_size=4)


def test_table_bounds_default_to_existing_behavior():
    # No bounds passed → identical to the unset result.
    assert plan_table_sizes(32, 3, 10) == plan_table_sizes(32, 3, 10, min_size=None, max_size=None)


# --- generate_rotation: greedy fill + restarts ---


def _ids(n: int) -> list[str]:
    return [f"person-{i}" for i in range(n)]


def test_rotation_seats_everyone_exactly_once():
    people = _ids(14)
    rotation = generate_rotation(people, {}, num_tables=10, seats_per_table=4,
                                 rng=random.Random(1))
    assert sorted(rotation.tables.keys()) == sorted(people)


def test_rotation_uses_low_table_numbers():
    # Design #6: fewer people than tables -> fill LOW numbers (physical signage)
    rotation = generate_rotation(_ids(7), {}, num_tables=10, seats_per_table=4,
                                 rng=random.Random(1))
    assert set(rotation.tables.values()) == {1, 2}


def test_rotation_group_sizes_match_plan():
    rotation = generate_rotation(_ids(14), {}, num_tables=10, seats_per_table=4,
                                 rng=random.Random(1))
    counts: dict[int, int] = {}
    for table in rotation.tables.values():
        counts[table] = counts.get(table, 0) + 1
    assert sorted(counts.values(), reverse=True) == [4, 4, 3, 3]
    assert rotation.table_sizes == [4, 4, 3, 3]


def test_rotation_first_round_has_zero_repeats():
    rotation = generate_rotation(_ids(20), {}, num_tables=10, seats_per_table=4,
                                 rng=random.Random(1))
    assert rotation.repeat_pairings == 0


def _pairs_from(groups: list[list[str]]) -> dict:
    counts: dict = {}
    for group in groups:
        for i in range(len(group)):
            for j in range(i + 1, len(group)):
                pair = frozenset((group[i], group[j]))
                counts[pair] = counts.get(pair, 0) + 1
    return counts


def test_rotation_avoids_known_pairs_when_possible():
    # 9 people, round 1 = three triples; a perfectly repeat-free round 2
    # exists (the classic 3x3 grid rotation) — the optimizer must find it.
    people = _ids(9)
    history = _pairs_from([people[0:3], people[3:6], people[6:9]])
    rotation = generate_rotation(people, history, num_tables=3, seats_per_table=3,
                                 rng=random.Random(7), restarts=100)
    assert rotation.repeat_pairings == 0


def test_rotation_unavoidable_repeats_are_minimized_and_reported():
    # 6 people, round 1 = two triples. Pigeonhole: any second round of two
    # triples must repeat at least 2 pairs. The optimum is exactly 2.
    people = _ids(6)
    history = _pairs_from([people[0:3], people[3:6]])
    rotation = generate_rotation(people, history, num_tables=2, seats_per_table=3,
                                 rng=random.Random(7), restarts=50)
    assert rotation.repeat_pairings == 2


def test_rotation_deterministic_with_seed():
    people = _ids(17)
    history = _pairs_from([people[0:4], people[4:8], people[8:12], people[12:17]])
    a = generate_rotation(people, history, 10, 4, rng=random.Random(42))
    b = generate_rotation(people, history, 10, 4, rng=random.Random(42))
    assert a.tables == b.tables
    assert a.repeat_pairings == b.repeat_pairings


def test_rotation_propagates_plan_errors():
    with pytest.raises(RotationError):
        generate_rotation(_ids(2), {}, num_tables=10, seats_per_table=4)


def test_rotation_returns_dataclass():
    rotation = generate_rotation(_ids(4), {}, 10, 4, rng=random.Random(1))
    assert isinstance(rotation, Rotation)


# --- plan_rounds: the re-planning optimizer (docs/design/rotation-replanning.md) ---


def _total_repeats(rounds: list[dict]) -> int:
    """Total repeat-pairings across a planned sequence = Σ pairs max(times − 1, 0)."""
    counts: dict = {}
    for seating in rounds:
        groups: dict = {}
        for aid, table in seating.items():
            groups.setdefault(table, []).append(aid)
        for group in groups.values():
            for i in range(len(group)):
                for j in range(i + 1, len(group)):
                    pair = frozenset((group[i], group[j]))
                    counts[pair] = counts.get(pair, 0) + 1
    return sum(c - 1 for c in counts.values() if c > 1)


def test_plan_returns_horizon_rounds_seating_everyone():
    people = _ids(14)
    plan = plan_rounds(people, {}, num_tables=10, seats_per_table=4, horizon=3,
                       rng=random.Random(1))
    assert isinstance(plan, RotationPlan)
    assert plan.horizon == 3 and len(plan.rounds) == 3
    assert plan.table_sizes == [4, 4, 3, 3]
    for seating in plan.rounds:
        assert sorted(seating.keys()) == sorted(people)
        assert set(seating.values()) <= {1, 2, 3, 4}


def test_plan_reported_repeats_match_recomputed():
    # The total_repeat_pairings field must equal an independent recomputation.
    people = _ids(20)
    plan = plan_rounds(people, {}, num_tables=5, seats_per_table=4, horizon=6,
                       rng=random.Random(3))
    assert plan.total_repeat_pairings == _total_repeats(plan.rounds)


def test_plan_finds_repeat_free_round_when_one_exists():
    # 9 people, round 1 = three triples; a repeat-free round 2 exists (3x3 grid).
    people = _ids(9)
    history = _pairs_from([people[0:3], people[3:6], people[6:9]])
    plan = plan_rounds(people, history, num_tables=3, seats_per_table=3, horizon=1,
                       rng=random.Random(7), warm_restarts=100)
    assert plan.total_repeat_pairings == 0


def test_plan_minimizes_unavoidable_repeats():
    # 6 people, round 1 = two triples. Any next round of two triples must repeat
    # at least 2 pairs (pigeonhole); the optimum is exactly 2.
    people = _ids(6)
    history = _pairs_from([people[0:3], people[3:6]])
    plan = plan_rounds(people, history, num_tables=2, seats_per_table=3, horizon=1,
                       rng=random.Random(7))
    assert plan.total_repeat_pairings == 2


def test_plan_multi_round_reaches_repeat_free_design():
    # 9 people, 3 tables of 3, 4 rounds: a perfect repeat-free schedule exists
    # (the affine plane AG(2,3) — 4 parallel classes covering every pair once).
    # The lookahead planner must build the whole 4-round design with zero overlap.
    people = _ids(9)
    plan = plan_rounds(people, {}, num_tables=3, seats_per_table=3, horizon=4,
                       rng=random.Random(5), warm_restarts=60)
    assert plan.total_repeat_pairings == 0
    assert _total_repeats(plan.rounds) == 0


def test_plan_deterministic_with_seed():
    people = _ids(17)
    a = plan_rounds(people, {}, 10, 4, horizon=5, rng=random.Random(42))
    b = plan_rounds(people, {}, 10, 4, horizon=5, rng=random.Random(42))
    assert a.rounds == b.rounds
    assert a.total_repeat_pairings == b.total_repeat_pairings


def test_plan_respects_time_budget():
    # Even a tiny budget returns a valid, fully-seated plan (falls back to warm start).
    people = _ids(60)
    plan = plan_rounds(people, {}, num_tables=15, seats_per_table=4, horizon=10,
                       rng=random.Random(1), time_budget_s=0.05)
    assert len(plan.rounds) == 10
    for seating in plan.rounds:
        assert sorted(seating.keys()) == sorted(people)


def test_plan_invalid_horizon_raises():
    with pytest.raises(RotationError, match="horizon"):
        plan_rounds(_ids(12), {}, 10, 4, horizon=0)


def test_plan_over_capacity_overfills_everyone():
    # Over capacity no longer raises — the planner overfills so nobody is unseated.
    people = _ids(51)
    plan = plan_rounds(people, {}, num_tables=10, seats_per_table=4, horizon=3)
    for seating in plan.rounds:
        assert sorted(seating.keys()) == sorted(people)  # all 51 placed every round


# --- draft_snapshot_hash: the stale-draft guard ---


def test_hash_ignores_order():
    assert draft_snapshot_hash(["b", "a"], 10, 4) == draft_snapshot_hash(["a", "b"], 10, 4)


def test_hash_changes_when_pool_changes():
    assert draft_snapshot_hash(["a", "b"], 10, 4) != draft_snapshot_hash(["a", "b", "c"], 10, 4)


def test_hash_changes_when_config_changes():
    base = draft_snapshot_hash(["a", "b"], 10, 4)
    assert base != draft_snapshot_hash(["a", "b"], 9, 4)
    assert base != draft_snapshot_hash(["a", "b"], 10, 5)
