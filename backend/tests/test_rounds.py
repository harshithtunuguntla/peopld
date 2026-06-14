"""Round lifecycle tests: draft -> preview -> publish -> end.

Edge-case matrix from docs/design/rotation-algorithm.md §6 — every row here.
"""

from tests.conftest import (
    ATTENDEE_AUTH,
    AUTH,
    OTHER_AUTH,
    audit_actions,
    make_arrived,
    make_assignment,
    make_attendee,
    make_round,
)


def _table_sizes(assignments: list[dict]) -> list[int]:
    counts: dict[int, int] = {}
    for a in assignments:
        counts[a["table_number"]] = counts.get(a["table_number"], 0) + 1
    return sorted(counts.values(), reverse=True)


# --- start (draft generation) ---


def test_start_requires_auth(client, event):
    assert client.post(f"/events/{event['id']}/rounds/start").status_code == 401


def test_start_non_organizer_forbidden(client, db, event):
    make_arrived(db, event["id"], 6)
    response = client.post(f"/events/{event['id']}/rounds/start", headers=ATTENDEE_AUTH)
    assert response.status_code == 403


def test_start_wrong_organizer_forbidden(client, db, event):
    make_arrived(db, event["id"], 6)
    response = client.post(f"/events/{event['id']}/rounds/start", headers=OTHER_AUTH)
    assert response.status_code == 403


def test_start_too_few_arrived(client, db, event):
    make_arrived(db, event["id"], 2)
    response = client.post(f"/events/{event['id']}/rounds/start", headers=AUTH)
    assert response.status_code == 422
    assert "at least 3 arrived" in response.json()["detail"]


def test_start_ignores_non_arrived_attendees(client, db, event):
    # 5 registered + 2 left: nobody is 'arrived', so no round
    for i in range(5):
        make_attendee(db, event["id"], name=f"R{i}", status="registered")
    for i in range(2):
        make_attendee(db, event["id"], name=f"L{i}", status="left")

    response = client.post(f"/events/{event['id']}/rounds/start", headers=AUTH)
    assert response.status_code == 422


def test_start_over_capacity(client, db, event):
    # Event fixture: 10 tables x (4+1) = 50 max; 51 arrived must be rejected
    make_arrived(db, event["id"], 51)
    response = client.post(f"/events/{event['id']}/rounds/start", headers=AUTH)
    assert response.status_code == 422
    assert "capacity" in response.json()["detail"]


def test_start_creates_draft_preview(client, db, event):
    arrived = make_arrived(db, event["id"], 6)
    make_attendee(db, event["id"], name="NotHere", status="registered")

    response = client.post(f"/events/{event['id']}/rounds/start", headers=AUTH)
    assert response.status_code == 201
    body = response.json()
    assert body["round_number"] == 1
    assert body["arrived_count"] == 6
    assert body["table_count"] == 2  # 6 people -> two tables of 3
    assert body["repeat_pairings"] == 0
    assert body["duration_seconds"] == 300
    seated = {a["attendee_id"] for a in body["assignments"]}
    assert seated == {a["id"] for a in arrived}  # everyone arrived, nobody else
    assert _table_sizes(body["assignments"]) == [3, 3]
    assert all(a["name"].startswith("P") for a in body["assignments"])

    # CRITICAL: nothing reached the client-readable realtime tables yet
    assert db.store.get("rounds", []) == []
    assert db.store.get("table_assignments", []) == []
    assert len(db.store["round_drafts"]) == 1


def test_start_twice_conflicts(client, db, event):
    make_arrived(db, event["id"], 6)
    assert client.post(f"/events/{event['id']}/rounds/start", headers=AUTH).status_code == 201
    response = client.post(f"/events/{event['id']}/rounds/start", headers=AUTH)
    assert response.status_code == 409
    assert "draft already exists" in response.json()["detail"]


def test_start_while_round_active_conflicts(client, db, event):
    make_arrived(db, event["id"], 6)
    make_round(db, event["id"], round_number=1, status="active")
    response = client.post(f"/events/{event['id']}/rounds/start", headers=AUTH)
    assert response.status_code == 409
    assert "End the current round" in response.json()["detail"]


# --- draft retrieval ---


def test_get_draft_requires_organizer(client, db, event):
    make_arrived(db, event["id"], 6)
    client.post(f"/events/{event['id']}/rounds/start", headers=AUTH)

    assert client.get(f"/events/{event['id']}/rounds/draft").status_code == 401
    assert client.get(f"/events/{event['id']}/rounds/draft", headers=ATTENDEE_AUTH).status_code == 403
    assert client.get(f"/events/{event['id']}/rounds/draft", headers=OTHER_AUTH).status_code == 403


def test_get_draft_none_pending(client, event):
    response = client.get(f"/events/{event['id']}/rounds/draft", headers=AUTH)
    assert response.status_code == 404


def test_get_draft_returns_pending_preview(client, db, event):
    make_arrived(db, event["id"], 6)
    created = client.post(f"/events/{event['id']}/rounds/start", headers=AUTH).json()

    response = client.get(f"/events/{event['id']}/rounds/draft", headers=AUTH)
    assert response.status_code == 200
    assert response.json()["id"] == created["id"]
    assert response.json()["assignments"] == created["assignments"]


# --- regenerate ---


def test_regenerate_without_draft(client, event):
    response = client.post(f"/events/{event['id']}/rounds/regenerate", headers=AUTH)
    assert response.status_code == 404


def test_regenerate_picks_up_attendance_changes(client, db, event):
    make_arrived(db, event["id"], 6)
    first = client.post(f"/events/{event['id']}/rounds/start", headers=AUTH).json()
    assert first["arrived_count"] == 6

    late = make_attendee(db, event["id"], name="Late", status="arrived")
    response = client.post(f"/events/{event['id']}/rounds/regenerate", headers=AUTH)
    assert response.status_code == 200
    body = response.json()
    assert body["arrived_count"] == 7
    assert late["id"] in {a["attendee_id"] for a in body["assignments"]}
    assert len(db.store["round_drafts"]) == 1  # replaced, not duplicated


# --- publish ---


def test_publish_without_draft(client, event):
    response = client.post(f"/events/{event['id']}/rounds/publish", headers=AUTH)
    assert response.status_code == 404


def test_publish_creates_live_round(client, db, event):
    make_arrived(db, event["id"], 7)
    draft = client.post(f"/events/{event['id']}/rounds/start", headers=AUTH).json()

    response = client.post(f"/events/{event['id']}/rounds/publish", headers=AUTH)
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "active"
    assert body["round_number"] == 1
    assert body["started_at"] is not None
    assert len(body["assignments"]) == 7
    # Live assignments mirror the previewed draft exactly
    draft_map = {a["attendee_id"]: a["table_number"] for a in draft["assignments"]}
    live_map = {a["attendee_id"]: a["table_number"] for a in body["assignments"]}
    assert live_map == draft_map
    # Draft consumed; realtime tables populated
    assert db.store["round_drafts"] == []
    assert len(db.store["table_assignments"]) == 7

    current = client.get(f"/events/{event['id']}/rounds/current")
    assert current.status_code == 200
    assert len(current.json()["assignments"]) == 7


def test_publish_twice_is_idempotent(client, db, event):
    """REQ-RT-03: a retried publish (lost response / double-click) returns the
    SAME round, not a 404, and never creates a duplicate round."""
    make_arrived(db, event["id"], 6)
    client.post(f"/events/{event['id']}/rounds/start", headers=AUTH)
    first = client.post(f"/events/{event['id']}/rounds/publish", headers=AUTH)
    assert first.status_code == 201
    second = client.post(f"/events/{event['id']}/rounds/publish", headers=AUTH)
    assert second.status_code == 200
    assert second.json()["id"] == first.json()["id"]  # same round, idempotent
    assert len(db.store["rounds"]) == 1  # no duplicate round created


def test_publish_with_no_draft_and_no_round_is_404(client, db, event):
    make_arrived(db, event["id"], 6)
    # No start -> no draft -> nothing to publish or return
    assert client.post(f"/events/{event['id']}/rounds/publish", headers=AUTH).status_code == 404


# --- cancel / rollback (REQ-RT-02) ---


def test_cancel_removes_round_and_assignments(client, db, event):
    make_arrived(db, event["id"], 6)
    client.post(f"/events/{event['id']}/rounds/start", headers=AUTH)
    client.post(f"/events/{event['id']}/rounds/publish", headers=AUTH)
    assert len(db.store["rounds"]) == 1
    assert len(db.store["table_assignments"]) == 6

    r = client.post(f"/events/{event['id']}/rounds/cancel", headers=AUTH)
    assert r.status_code == 200
    assert r.json()["cancelled"] is True
    assert r.json()["round_number"] == 1
    # Round + assignments gone — no trace left behind
    assert db.store["rounds"] == []
    assert db.store["table_assignments"] == []
    # Phones re-fetching /rounds/current now see no active round
    assert client.get(f"/events/{event['id']}/rounds/current").status_code == 404
    # Audit trail recorded the rollback
    assert "round.cancelled" in audit_actions(db)


def test_cancel_requires_organizer(client, db, event):
    make_arrived(db, event["id"], 6)
    client.post(f"/events/{event['id']}/rounds/start", headers=AUTH)
    client.post(f"/events/{event['id']}/rounds/publish", headers=AUTH)
    assert client.post(f"/events/{event['id']}/rounds/cancel").status_code == 401
    assert client.post(f"/events/{event['id']}/rounds/cancel", headers=ATTENDEE_AUTH).status_code == 403
    assert client.post(f"/events/{event['id']}/rounds/cancel", headers=OTHER_AUTH).status_code == 403


def test_cancel_with_no_active_round_is_404(client, db, event):
    assert client.post(f"/events/{event['id']}/rounds/cancel", headers=AUTH).status_code == 404


def test_cancelled_round_leaves_no_pairing_history(client, db, event):
    """A cancelled round must not pollute future planning: re-publishing the same
    pool should again report zero repeat pairings."""
    make_arrived(db, event["id"], 6)
    client.post(f"/events/{event['id']}/rounds/start", headers=AUTH)
    client.post(f"/events/{event['id']}/rounds/publish", headers=AUTH)
    client.post(f"/events/{event['id']}/rounds/cancel", headers=AUTH)

    again = client.post(f"/events/{event['id']}/rounds/start", headers=AUTH)
    assert again.status_code == 201
    assert again.json()["round_number"] == 1  # number reused
    assert again.json()["repeat_pairings"] == 0  # no leftover history


def test_publish_stale_after_new_arrival(client, db, event):
    make_arrived(db, event["id"], 6)
    client.post(f"/events/{event['id']}/rounds/start", headers=AUTH)
    make_attendee(db, event["id"], name="Late", status="arrived")

    response = client.post(f"/events/{event['id']}/rounds/publish", headers=AUTH)
    assert response.status_code == 409
    assert "regenerate" in response.json()["detail"]


def test_publish_stale_after_attendee_left(client, db, event):
    arrived = make_arrived(db, event["id"], 6)
    client.post(f"/events/{event['id']}/rounds/start", headers=AUTH)
    db.table("attendees").update({"status": "left"}).eq("id", arrived[0]["id"]).execute()

    response = client.post(f"/events/{event['id']}/rounds/publish", headers=AUTH)
    assert response.status_code == 409


def test_publish_stale_after_table_config_change(client, db, event):
    make_arrived(db, event["id"], 6)
    client.post(f"/events/{event['id']}/rounds/start", headers=AUTH)
    client.patch(f"/events/{event['id']}", json={"seats_per_table": 5}, headers=AUTH)

    response = client.post(f"/events/{event['id']}/rounds/publish", headers=AUTH)
    assert response.status_code == 409


def test_publish_while_round_active_conflicts(client, db, event):
    make_arrived(db, event["id"], 6)
    client.post(f"/events/{event['id']}/rounds/start", headers=AUTH)
    make_round(db, event["id"], round_number=99, status="active")

    response = client.post(f"/events/{event['id']}/rounds/publish", headers=AUTH)
    assert response.status_code == 409


# --- end (pre-existing behavior, still covered) ---


def test_end_round_requires_auth(client, event):
    assert client.post(f"/events/{event['id']}/rounds/end").status_code == 401


def test_end_round_non_organizer_forbidden(client, db, event):
    make_round(db, event["id"], round_number=1, status="active")
    assert client.post(f"/events/{event['id']}/rounds/end", headers=ATTENDEE_AUTH).status_code == 403


def test_end_round_wrong_organizer_forbidden(client, db, event):
    make_round(db, event["id"], round_number=1, status="active")
    assert client.post(f"/events/{event['id']}/rounds/end", headers=OTHER_AUTH).status_code == 403


def test_end_round_no_active(client, event):
    assert client.post(f"/events/{event['id']}/rounds/end", headers=AUTH).status_code == 404


def test_end_round_completes_active(client, db, event):
    make_round(db, event["id"], round_number=1, status="active")
    response = client.post(f"/events/{event['id']}/rounds/end", headers=AUTH)
    assert response.status_code == 200
    assert response.json()["status"] == "completed"
    assert response.json()["ended_at"] is not None


# --- multi-round flow: novelty, leavers, returns, numbering ---


def _run_round(client, event_id: str) -> dict:
    assert client.post(f"/events/{event_id}/rounds/start", headers=AUTH).status_code == 201
    published = client.post(f"/events/{event_id}/rounds/publish", headers=AUTH)
    assert published.status_code == 201
    assert client.post(f"/events/{event_id}/rounds/end", headers=AUTH).status_code == 200
    return published.json()


def test_round_numbers_increment(client, db, event):
    make_arrived(db, event["id"], 8)
    assert _run_round(client, event["id"])["round_number"] == 1
    assert _run_round(client, event["id"])["round_number"] == 2
    assert _run_round(client, event["id"])["round_number"] == 3


def test_second_round_minimizes_repeats(client, db, event):
    # 9 people in tables of 3: a perfectly novel round 2 exists; the draft
    # endpoint must surface how many repeats the algorithm could not avoid.
    db.table("events").update({"seats_per_table": 3}).eq("id", event["id"]).execute()
    make_arrived(db, event["id"], 9)
    _run_round(client, event["id"])

    draft = client.post(f"/events/{event['id']}/rounds/start", headers=AUTH)
    assert draft.status_code == 201
    # The router uses unseeded randomness (variety in production), so assert a
    # generous bound: greedy + restarts stays far below the naive worst case (9).
    # Exact-optimum behavior is pinned with seeded rngs in test_algorithm.py.
    assert draft.json()["repeat_pairings"] <= 2


def test_leaver_excluded_from_next_round(client, db, event):
    arrived = make_arrived(db, event["id"], 7)
    _run_round(client, event["id"])

    leaver = arrived[0]
    client.patch(
        f"/events/{event['id']}/attendees/{leaver['id']}",
        json={"status": "left"},
        headers=AUTH,
    )
    draft = client.post(f"/events/{event['id']}/rounds/start", headers=AUTH).json()
    assert draft["arrived_count"] == 6
    assert leaver["id"] not in {a["attendee_id"] for a in draft["assignments"]}


def test_left_then_returns_included_again(client, db, event):
    arrived = make_arrived(db, event["id"], 6)
    leaver = arrived[0]
    client.patch(
        f"/events/{event['id']}/attendees/{leaver['id']}",
        json={"status": "left"},
        headers=AUTH,
    )
    client.patch(
        f"/events/{event['id']}/attendees/{leaver['id']}",
        json={"status": "arrived"},
        headers=AUTH,
    )
    draft = client.post(f"/events/{event['id']}/rounds/start", headers=AUTH).json()
    assert leaver["id"] in {a["attendee_id"] for a in draft["assignments"]}


# --- re-planning lifecycle (docs/design/rotation-replanning.md) ---


def _plan_row(db, event_id: str) -> dict | None:
    rows = db.table("round_plans").select("*").eq("event_id", event_id).execute().data
    return rows[0] if rows else None


def test_plan_is_cached_on_start(client, db, event):
    make_arrived(db, event["id"], 8)
    client.post(f"/events/{event['id']}/rounds/start", headers=AUTH)
    plan = _plan_row(db, event["id"])
    assert plan is not None
    assert plan["horizon_start_round"] == 1
    assert len(plan["plan"]) >= 1


def test_plan_is_followed_when_roster_unchanged(client, db, event):
    # Stable roster -> the round-1 plan is FOLLOWED for round 2, not re-planned.
    make_arrived(db, event["id"], 8)
    _run_round(client, event["id"])
    before = _plan_row(db, event["id"])
    client.post(f"/events/{event['id']}/rounds/start", headers=AUTH)  # round 2
    after = _plan_row(db, event["id"])
    assert after["horizon_start_round"] == before["horizon_start_round"] == 1
    assert after["planned_for_hash"] == before["planned_for_hash"]


def test_plan_is_replanned_when_roster_changes(client, db, event):
    # A latecomer arrives between rounds -> re-plan the remainder from here.
    make_arrived(db, event["id"], 8)
    _run_round(client, event["id"])
    before = _plan_row(db, event["id"])
    make_arrived(db, event["id"], 1)  # latecomer
    draft = client.post(f"/events/{event['id']}/rounds/start", headers=AUTH).json()
    after = _plan_row(db, event["id"])
    assert draft["round_number"] == 2 and draft["arrived_count"] == 9
    assert after["horizon_start_round"] == 2
    assert after["planned_for_hash"] != before["planned_for_hash"]


def test_target_rounds_sets_planning_horizon(client, db, event):
    db.table("events").update({"target_rounds": 5}).eq("id", event["id"]).execute()
    make_arrived(db, event["id"], 8)
    client.post(f"/events/{event['id']}/rounds/start", headers=AUTH)
    assert len(_plan_row(db, event["id"])["plan"]) == 5


def test_regenerate_replans_in_place(client, db, event):
    make_arrived(db, event["id"], 8)
    client.post(f"/events/{event['id']}/rounds/start", headers=AUTH)
    regenerated = client.post(f"/events/{event['id']}/rounds/regenerate", headers=AUTH)
    assert regenerated.status_code == 200
    assert regenerated.json()["arrived_count"] == 8
    assert _plan_row(db, event["id"])["horizon_start_round"] == 1


# --- audit trail ---


def test_round_lifecycle_is_audited(client, db, event):
    make_arrived(db, event["id"], 6)
    client.post(f"/events/{event['id']}/rounds/start", headers=AUTH)
    client.post(f"/events/{event['id']}/rounds/regenerate", headers=AUTH)
    client.post(f"/events/{event['id']}/rounds/publish", headers=AUTH)
    client.post(f"/events/{event['id']}/rounds/end", headers=AUTH)

    actions = audit_actions(db)
    for expected in (
        "round.draft_created",
        "round.draft_regenerated",
        "round.published",
        "round.ended",
    ):
        assert expected in actions

    # Audit metadata carries UUIDs/counts only — spot-check no PII leaked
    for row in db.store["audit_log"]:
        assert "name" not in row["metadata"]
        assert "email" not in row["metadata"]


# --- public reads (unchanged) ---


def test_current_round_none_active(client, event):
    assert client.get(f"/events/{event['id']}/rounds/current").status_code == 404


def test_current_round_includes_assignments(client, db, event):
    attendee_a = make_attendee(db, event["id"], name="A")
    attendee_b = make_attendee(db, event["id"], name="B")
    round_row = make_round(db, event["id"], round_number=2, status="active")
    make_assignment(db, event["id"], round_row["id"], attendee_a["id"], 1)
    make_assignment(db, event["id"], round_row["id"], attendee_b["id"], 1)

    response = client.get(f"/events/{event['id']}/rounds/current")
    assert response.status_code == 200
    body = response.json()
    assert body["round_number"] == 2
    assert len(body["assignments"]) == 2


def test_get_table_assignments(client, db, event):
    attendee_a = make_attendee(db, event["id"], name="A")
    attendee_b = make_attendee(db, event["id"], name="B")
    attendee_c = make_attendee(db, event["id"], name="C")
    round_row = make_round(db, event["id"], status="active")
    make_assignment(db, event["id"], round_row["id"], attendee_a["id"], 5)
    make_assignment(db, event["id"], round_row["id"], attendee_b["id"], 5)
    make_assignment(db, event["id"], round_row["id"], attendee_c["id"], 6)

    response = client.get(f"/events/{event['id']}/rounds/{round_row['id']}/tables/5")
    assert response.status_code == 200
    assert len(response.json()) == 2
    assert all(a["table_number"] == 5 for a in response.json())
