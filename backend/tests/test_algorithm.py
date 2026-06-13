"""Unit tests for the rotation algorithm — pure functions, no app/db needed.

Covers the table-math rules and the greedy novelty optimizer from
docs/design/rotation-algorithm.md.
"""

import random

import pytest

from app.algorithm import (
    Rotation,
    RotationError,
    draft_snapshot_hash,
    generate_rotation,
    plan_table_sizes,
)

# --- plan_table_sizes: the design's remainder rules (target 4, min 3, max 5) ---


def test_plan_exact_multiple():
    assert plan_table_sizes(8, 4, 10) == [4, 4]
    assert plan_table_sizes(40, 4, 10) == [4] * 10


def test_plan_remainder_one_makes_one_table_of_five():
    assert plan_table_sizes(13, 4, 10) == [5, 4, 4]
    assert plan_table_sizes(5, 4, 10) == [5]


def test_plan_remainder_two_makes_two_tables_of_three():
    assert plan_table_sizes(14, 4, 10) == [4, 4, 3, 3]
    assert plan_table_sizes(6, 4, 10) == [3, 3]


def test_plan_remainder_three_makes_one_table_of_three():
    assert plan_table_sizes(11, 4, 10) == [4, 4, 3]
    assert plan_table_sizes(7, 4, 10) == [4, 3]


def test_plan_small_pools():
    assert plan_table_sizes(3, 4, 10) == [3]
    assert plan_table_sizes(4, 4, 10) == [4]


def test_plan_never_a_table_of_two():
    for pool in range(3, 60):
        for size in plan_table_sizes(pool, 4, 20):
            assert 3 <= size <= 5, f"pool={pool} produced size {size}"


def test_plan_fewer_than_three_raises():
    with pytest.raises(RotationError, match="at least 3 arrived"):
        plan_table_sizes(2, 4, 10)


def test_plan_over_capacity_raises():
    # 10 tables x 5 max = 50; 51 must be rejected with config advice
    with pytest.raises(RotationError, match="exceed venue capacity"):
        plan_table_sizes(51, 4, 10)


def test_plan_capacity_boundary_fits():
    sizes = plan_table_sizes(50, 4, 10)
    assert len(sizes) == 10 and all(s == 5 for s in sizes)


def test_plan_caps_table_count_at_num_tables():
    # 14 people but only 3 physical tables: squeeze, don't overflow table numbers
    sizes = plan_table_sizes(14, 4, 3)
    assert len(sizes) == 3
    assert sorted(sizes, reverse=True) == [5, 5, 4]


def test_plan_seats_below_minimum_raises():
    with pytest.raises(RotationError, match="seats_per_table"):
        plan_table_sizes(10, 2, 10)


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


# --- draft_snapshot_hash: the stale-draft guard ---


def test_hash_ignores_order():
    assert draft_snapshot_hash(["b", "a"], 10, 4) == draft_snapshot_hash(["a", "b"], 10, 4)


def test_hash_changes_when_pool_changes():
    assert draft_snapshot_hash(["a", "b"], 10, 4) != draft_snapshot_hash(["a", "b", "c"], 10, 4)


def test_hash_changes_when_config_changes():
    base = draft_snapshot_hash(["a", "b"], 10, 4)
    assert base != draft_snapshot_hash(["a", "b"], 9, 4)
    assert base != draft_snapshot_hash(["a", "b"], 10, 5)
