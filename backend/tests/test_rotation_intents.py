"""Phase 3b — the seating algorithm HONORS pre-event "want to meet" picks.

The objective (validated offline in scripts/simulate_intent.py across 15 scenarios,
n=30→160) becomes: minimize repeats − λ·(weight of satisfied picks), mutual ≫
one-way. Two guarantees this file pins down:
  • adding picks never changes seating when there are none (pure-novelty parity);
  • mutual picks are satisfied whenever they physically fit (the "mutual is free"
    finding), one-way picks are honored when feasible, and novelty is preserved.
Plus the rounds.py wiring (the draft seats picked pairs together) and the plan-
cache key that makes a mid-event pick change re-plan the tail.
"""

import random

from app.algorithm import plan_rounds
from app.routers.rounds import _plan_cache_hash, _meeting_intents, _arrived_pool
from tests.conftest import (
    AUTH,
    ATTENDEE_AUTH,
    ATTENDEE_USER_ID,
    OTHER_ATTENDEE_AUTH,
    OTHER_ATTENDEE_USER_ID,
    make_arrived,
    make_attendee,
)


def _ids(n: int) -> list[str]:
    return [f"p{i}" for i in range(n)]


def _coseated(seating: dict[str, int], a: str, b: str) -> bool:
    return seating[a] == seating[b]


def _pairs_from(groups: list[list[str]]) -> dict:
    """Co-seat history (pair_counts) from a list of already-played tables."""
    counts: dict = {}
    for group in groups:
        for i in range(len(group)):
            for j in range(i + 1, len(group)):
                pair = frozenset((group[i], group[j]))
                counts[pair] = counts.get(pair, 0) + 1
    return counts


# ── pure-novelty parity: no picks => byte-for-byte the old plan ───────────────

def test_no_intents_is_identical_to_baseline():
    """The whole point of folding the reward in at λ·0: an event with no picks
    must seat exactly as it did before Phase 3b (same seed => same plan)."""
    people = _ids(17)
    baseline = plan_rounds(people, {}, 10, 4, horizon=5, rng=random.Random(42))
    with_none = plan_rounds(people, {}, 10, 4, horizon=5, rng=random.Random(42),
                            intents=None)
    with_empty = plan_rounds(people, {}, 10, 4, horizon=5, rng=random.Random(42),
                             intents=set())
    assert with_none.rounds == baseline.rounds
    assert with_empty.rounds == baseline.rounds
    assert with_none.total_repeat_pairings == baseline.total_repeat_pairings
    assert with_none.intent_pairs_requested == 0
    assert with_none.intent_pairs_satisfied == 0


# ── mutual picks are free: satisfied whenever they fit ───────────────────────

def test_mutual_picks_all_satisfied_when_feasible():
    # 8 people, two tables of 4. The four mutual pairs fit perfectly in one round
    # (two pairs per table). The "mutual is free" finding: 100% across seeds.
    people = _ids(8)
    pairs = [("p0", "p1"), ("p2", "p3"), ("p4", "p5"), ("p6", "p7")]
    intents = {(a, b) for a, b in pairs} | {(b, a) for a, b in pairs}
    for seed in range(10):
        plan = plan_rounds(people, {}, num_tables=2, seats_per_table=4, horizon=1,
                           rng=random.Random(seed), intents=intents)
        seating = plan.rounds[0]
        assert all(_coseated(seating, a, b) for a, b in pairs), f"seed {seed}"
        assert plan.intent_pairs_satisfied == 4
        assert plan.intent_pairs_requested == 4


def test_mutual_pick_does_not_wreck_novelty():
    # 9 people, 3 tables of 3, 4 rounds: a perfect repeat-free design exists
    # (AG(2,3)). One mutual pick that the design already places together must be
    # honored at ZERO novelty cost — repeats stay 0.
    people = _ids(9)
    intents = {("p0", "p1"), ("p1", "p0")}
    plan = plan_rounds(people, {}, num_tables=3, seats_per_table=3, horizon=4,
                       rng=random.Random(5), warm_restarts=60, intents=intents)
    assert plan.total_repeat_pairings == 0
    # p0 and p1 meet in at least one of the four rounds.
    assert any(_coseated(r, "p0", "p1") for r in plan.rounds)
    assert plan.intent_pairs_satisfied == 1


# ── one-way picks: honored when feasible ─────────────────────────────────────

def test_oneway_pick_satisfied_when_feasible():
    people = _ids(8)
    # a single one-way pick across the id range — baseline luck is well under 100%
    intents = {("p0", "p7")}
    satisfied = 0
    for seed in range(10):
        plan = plan_rounds(people, {}, num_tables=2, seats_per_table=4, horizon=1,
                           rng=random.Random(seed), intents=intents)
        if _coseated(plan.rounds[0], "p0", "p7"):
            satisfied += 1
    assert satisfied == 10  # one feasible one-way pick is always honored


# ── robustness: picks that can't be placed are simply ignored ────────────────

def test_intents_outside_pool_are_ignored():
    people = _ids(6)
    # picks referencing people who never arrived must not crash or distort the plan
    intents = {("p0", "ghost"), ("nobody", "p1"), ("p2", "p3"), ("p3", "p2")}
    plan = plan_rounds(people, {}, num_tables=2, seats_per_table=3, horizon=1,
                       rng=random.Random(1), intents=intents)
    assert sorted(plan.rounds[0].keys()) == sorted(people)
    assert plan.intent_pairs_requested == 1  # only the p2<->p3 pair is seatable
    assert plan.intent_pairs_satisfied == 1


def test_intents_deterministic_with_seed():
    people = _ids(12)
    intents = {("p0", "p11"), ("p11", "p0"), ("p1", "p10")}
    a = plan_rounds(people, {}, 3, 4, horizon=3, rng=random.Random(7), intents=intents)
    b = plan_rounds(people, {}, 3, 4, horizon=3, rng=random.Random(7), intents=intents)
    assert a.rounds == b.rounds
    assert a.intent_pairs_satisfied == b.intent_pairs_satisfied


# ── already met: a redundant pick must NOT burn novelty re-seating them ──────

def test_already_met_pick_is_not_re_seated():
    """The sharp case: two people met in round 1, THEN one picks the other. The
    pick is already satisfied by history, so the planner must not waste a future
    round re-pairing them — it keeps round 2 repeat-free and counts the pick done.

    Uses 9 people / 3 tables of 3: after round 1's three triples a repeat-free
    round 2 provably exists (AG(2,3)), and in any repeat-free round the already-met
    pair is necessarily separated. So 'don't re-seat' and 'stay repeat-free' coincide."""
    people = _ids(9)
    history = _pairs_from([people[0:3], people[3:6], people[6:9]])  # round 1
    # p0 & p1 met in round 1; a (now-redundant) mutual pick between them remains
    intents = {("p0", "p1"), ("p1", "p0")}
    plan = plan_rounds(people, history, num_tables=3, seats_per_table=3, horizon=1,
                       rng=random.Random(7), warm_restarts=100, intents=intents)
    seating = plan.rounds[0]
    assert plan.total_repeat_pairings == 0          # a fresh round exists; take it
    assert not _coseated(seating, "p0", "p1")        # NOT needlessly re-paired
    assert plan.intent_pairs_satisfied == 1          # but still credited (they met in r1)


def test_unmet_pick_is_seated_even_with_history():
    """Contrast: a pick between two who have NOT met is honored on the next round,
    even though other pairs share history — proves the reward is unmet-pairs-only."""
    people = _ids(8)
    history = _pairs_from([people[0:4], people[4:8]])
    # p0 (was with p1,p2,p3) has not met p4 — pick it; must be seated round 2
    intents = {("p0", "p4"), ("p4", "p0")}
    plan = plan_rounds(people, history, num_tables=2, seats_per_table=4, horizon=1,
                       rng=random.Random(1), intents=intents)
    assert _coseated(plan.rounds[0], "p0", "p4")
    assert plan.intent_pairs_satisfied == 1


# ── speakers/hosts are guests: never seated in the rotation ───────────────────

def test_speakers_and_hosts_excluded_from_seating(client, db, event):
    make_arrived(db, event["id"], 6)  # six real attendees
    make_attendee(db, event["id"], name="Keynote", status="arrived", tag="speaker")
    make_attendee(db, event["id"], name="Emcee", status="arrived", tag="host")

    pool = _arrived_pool(db, event["id"])
    names = {a["name"] for a in pool}
    assert names == {f"P{i}" for i in range(6)}  # guests dropped
    assert "Keynote" not in names and "Emcee" not in names

    resp = client.post(f"/events/{event['id']}/rounds/start", headers=AUTH)
    assert resp.status_code == 201
    assert resp.json()["arrived_count"] == 6  # only the seated pool


# ── the plan-cache key reacts to picks (live re-planning) ────────────────────

def test_plan_cache_hash_changes_with_picks():
    base = "attendance-hash"
    none = _plan_cache_hash(base, set())
    one = _plan_cache_hash(base, {("a", "b")})
    two = _plan_cache_hash(base, {("a", "b"), ("c", "d")})
    assert none != one != two and none != two
    # stable + order-independent: same picks => same key
    assert _plan_cache_hash(base, {("a", "b"), ("c", "d")}) == \
           _plan_cache_hash(base, {("c", "d"), ("a", "b")})
    # a different attendance hash with the same picks is a different plan
    assert _plan_cache_hash("other", {("a", "b")}) != one


# ── rounds.py wiring: the draft seats a picked pair together ──────────────────

def test_draft_honors_meeting_intent(client, db, event):
    # Force a single-round horizon so the pick must be honored in THIS draft
    # (over a multi-round horizon the planner may satisfy it in a later round).
    db.table("events").update({"target_rounds": 1}).eq("id", event["id"]).execute()
    arrived = make_arrived(db, event["id"], 8)  # two tables of 4
    a, b = arrived[0], arrived[7]
    # a mutual pick between two attendees seated far apart in id order
    for liker, liked in ((a, b), (b, a)):
        db.seed("meeting_intents", {
            "event_id": event["id"],
            "liker_attendee_id": liker["id"],
            "liked_attendee_id": liked["id"],
        })

    resp = client.post(f"/events/{event['id']}/rounds/start", headers=AUTH)
    assert resp.status_code == 201
    seat = {x["attendee_id"]: x["table_number"] for x in resp.json()["assignments"]}
    assert seat[str(a["id"])] == seat[str(b["id"])]  # the picked pair sits together


def test_meeting_intents_restricted_to_seated_pool(client, db, event):
    arrived = make_arrived(db, event["id"], 4)
    absent = make_attendee(db, event["id"], name="NoShow", status="registered")
    db.seed("meeting_intents", {
        "event_id": event["id"],
        "liker_attendee_id": arrived[0]["id"],
        "liked_attendee_id": absent["id"],  # picked someone who never arrived
    })
    db.seed("meeting_intents", {
        "event_id": event["id"],
        "liker_attendee_id": arrived[0]["id"],
        "liked_attendee_id": arrived[1]["id"],
    })
    seated = {str(a["id"]) for a in arrived}
    intents = _meeting_intents(db, event["id"], seated)
    assert intents == {(str(arrived[0]["id"]), str(arrived[1]["id"]))}


# ── end-to-end: pick -> seating honors it -> live nudge -> post-event match ───

def test_phase3_end_to_end(client, db, event):
    """The whole Phase 3 path through the real API: two attendees pick each other,
    a speaker shows up (and is NOT seated), the organizer runs a round that seats
    the picked pair together, the live snapshot nudges the liker, and after the
    event the pair sees a mutual match."""
    eid = event["id"]
    db.table("events").update({"target_rounds": 1}).eq("id", eid).execute()

    me = make_attendee(db, eid, name="Me", status="arrived", user_id=ATTENDEE_USER_ID)
    other = make_attendee(db, eid, name="Other", status="arrived",
                          user_id=OTHER_ATTENDEE_USER_ID, linkedin_url="https://lnkd.in/x")
    make_arrived(db, eid, 6)  # filler so there are two tables
    make_attendee(db, eid, name="Keynote", status="arrived", tag="speaker")  # guest

    # 1) mutual pick through the intents API (JWT identity, not URL)
    assert client.post(f"/events/{eid}/intents",
                       json={"target_attendee_id": str(other["id"])},
                       headers=ATTENDEE_AUTH).status_code == 201
    assert client.post(f"/events/{eid}/intents",
                       json={"target_attendee_id": str(me["id"])},
                       headers=OTHER_ATTENDEE_AUTH).status_code == 201

    # 2) organizer runs the round; the speaker is excluded, the pick is honored
    draft = client.post(f"/events/{eid}/rounds/start", headers=AUTH).json()
    assert draft["arrived_count"] == 8  # 2 + 6 filler, speaker not seated
    seat = {a["attendee_id"]: a["table_number"] for a in draft["assignments"]}
    assert str(other["id"]) not in {  # sanity: speaker is absent from seating
        a["attendee_id"] for a in draft["assignments"] if a["name"] == "Keynote"
    }
    assert seat[str(me["id"])] == seat[str(other["id"])]  # picked pair together
    client.post(f"/events/{eid}/rounds/publish", headers=AUTH)

    # 3) the live snapshot nudges ME about my pick — but is one-sided
    mine = client.get(f"/events/{eid}/live", headers=ATTENDEE_AUTH).json()
    mates = {m["attendee_id"]: m for m in mine["seat"]["tablemates"]}
    assert mates[str(other["id"])]["wanted"] is True

    # 4) after the event, the mutual pick is revealed to both — and only mutual
    db.table("events").update({"status": "ended"}).eq("id", eid).execute()
    matches = client.get(f"/events/{eid}/intents/matches", headers=ATTENDEE_AUTH).json()
    assert matches["count"] == 1
    assert matches["matches"][0]["attendee_id"] == str(other["id"])
