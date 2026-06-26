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


def test_start_over_capacity_overfills_and_warns(client, db, event):
    # Event fixture: 10 tables, ceiling 4 → 40 comfortable seats. 51 arrived no
    # longer errors — everyone is seated (some tables overfilled) and the draft
    # carries a capacity_warning so the organizer can add a table or accept it.
    arrived = make_arrived(db, event["id"], 51)
    response = client.post(f"/events/{event['id']}/rounds/start", headers=AUTH)
    assert response.status_code == 201
    body = response.json()
    seated = {a["attendee_id"] for a in body["assignments"]}
    assert seated == {a["id"] for a in arrived}  # nobody dropped
    warn = body["capacity_warning"]
    assert warn is not None
    assert warn["seated"] == 51
    assert warn["capacity"] == 40
    assert warn["num_tables"] == 10
    assert warn["max_per_table"] == 4
    assert warn["biggest_table"] > 4
    assert warn["overfilled_tables"] >= 1


def test_start_within_capacity_has_no_warning(client, db, event):
    make_arrived(db, event["id"], 12)
    body = client.post(f"/events/{event['id']}/rounds/start", headers=AUTH).json()
    assert body["capacity_warning"] is None


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
    # Publish reveals seating but does NOT start the clock — started_at stays null
    # until the organizer hits "Start round" (POST /begin).
    assert body["started_at"] is None
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


# --- begin (start the clock) / extend (add time) ---


def _publish(client, db, event_id: str, n: int = 6) -> dict:
    make_arrived(db, event_id, n)
    client.post(f"/events/{event_id}/rounds/start", headers=AUTH)
    return client.post(f"/events/{event_id}/rounds/publish", headers=AUTH).json()


def test_begin_starts_the_clock(client, db, event):
    _publish(client, db, event["id"])
    response = client.post(f"/events/{event['id']}/rounds/begin", headers=AUTH)
    assert response.status_code == 200
    assert response.json()["started_at"] is not None
    assert "round.started" in audit_actions(db)


def test_begin_is_idempotent_and_never_restarts_clock(client, db, event):
    _publish(client, db, event["id"])
    first = client.post(f"/events/{event['id']}/rounds/begin", headers=AUTH).json()
    second = client.post(f"/events/{event['id']}/rounds/begin", headers=AUTH).json()
    assert second["started_at"] == first["started_at"]  # clock not reset


def test_begin_with_no_active_round_is_404(client, event):
    assert client.post(f"/events/{event['id']}/rounds/begin", headers=AUTH).status_code == 404


def test_begin_requires_organizer(client, db, event):
    _publish(client, db, event["id"])
    assert client.post(f"/events/{event['id']}/rounds/begin").status_code == 401


def test_extend_adds_time_to_duration(client, db, event):
    published = _publish(client, db, event["id"])
    base = published["duration_seconds"]
    response = client.post(
        f"/events/{event['id']}/rounds/extend", headers=AUTH, json={"seconds": 120}
    )
    assert response.status_code == 200
    assert response.json()["duration_seconds"] == base + 120
    assert "round.extended" in audit_actions(db)


def test_extend_rejects_non_positive(client, db, event):
    _publish(client, db, event["id"])
    assert (
        client.post(f"/events/{event['id']}/rounds/extend", headers=AUTH, json={"seconds": 0}).status_code
        == 422
    )


def test_extend_with_no_active_round_is_404(client, event):
    assert (
        client.post(f"/events/{event['id']}/rounds/extend", headers=AUTH, json={"seconds": 60}).status_code
        == 404
    )


# --- run sheet (printable event-day backup) ---


def test_run_sheet_requires_organizer(client, event):
    assert client.get(f"/events/{event['id']}/rounds/run-sheet").status_code == 401


def test_run_sheet_plans_all_rounds_over_arrived(client, db, event):
    db.table("events").update(
        {"seats_per_table": 3, "num_tables": 3, "target_rounds": 2}
    ).eq("id", event["id"]).execute()
    make_arrived(db, event["id"], 9)

    body = client.get(f"/events/{event['id']}/rounds/run-sheet", headers=AUTH).json()
    assert body["basis"] == "arrived"
    assert body["total_people"] == 9
    assert len(body["rounds"]) == 2
    for rnd in body["rounds"]:
        seated = sum(len(t["people"]) for t in rnd["tables"])
        assert seated == 9  # everyone placed every round


def test_run_sheet_falls_back_to_registered_pre_doors(client, db, event):
    db.table("events").update(
        {"seats_per_table": 3, "num_tables": 3, "target_rounds": 1}
    ).eq("id", event["id"]).execute()
    for i in range(6):
        make_attendee(db, event["id"], name=f"R{i}", status="registered")

    body = client.get(f"/events/{event['id']}/rounds/run-sheet", headers=AUTH).json()
    assert body["basis"] == "registered"  # nobody arrived yet → registered crowd
    assert body["total_people"] == 6
    assert len(body["rounds"]) == 1


def test_run_sheet_empty_when_too_few(client, db, event):
    make_arrived(db, event["id"], 2)  # fewer than a table — nothing to plan
    body = client.get(f"/events/{event['id']}/rounds/run-sheet", headers=AUTH).json()
    assert body["rounds"] == []


def test_run_sheet_freezes_already_played_rounds(client, db, event):
    """A round that actually happened is read verbatim from real
    table_assignments, not regenerated — and is flagged `actual`."""
    db.table("events").update({"seats_per_table": 3, "num_tables": 2}).eq("id", event["id"]).execute()
    people = make_arrived(db, event["id"], 6)
    rnd = make_round(db, event["id"], round_number=1, status="completed")
    for i, p in enumerate(people):
        make_assignment(db, event["id"], rnd["id"], p["id"], table_number=1 if i < 3 else 2)

    body = client.get(f"/events/{event['id']}/rounds/run-sheet", headers=AUTH).json()
    round1 = next(r for r in body["rounds"] if r["round_number"] == 1)
    assert round1["actual"] is True
    table1 = next(t for t in round1["tables"] if t["table_number"] == 1)
    table2 = next(t for t in round1["tables"] if t["table_number"] == 2)
    assert sorted(table1["people"]) == sorted(p["name"] for p in people[:3])
    assert sorted(table2["people"]) == sorted(p["name"] for p in people[3:])


def test_run_sheet_adding_a_person_never_changes_a_played_round(client, db, event):
    """The exact regression report: adding someone mid-event must reshape only
    the FUTURE plan — round 1, already played, comes back byte-for-byte the
    same, not a wholesale re-plan from round 1 that drags the new person in."""
    db.table("events").update(
        {"seats_per_table": 3, "num_tables": 2, "target_rounds": 3}
    ).eq("id", event["id"]).execute()
    people = make_arrived(db, event["id"], 6)
    rnd = make_round(db, event["id"], round_number=1, status="completed")
    for i, p in enumerate(people):
        make_assignment(db, event["id"], rnd["id"], p["id"], table_number=1 if i < 3 else 2)

    before = client.get(f"/events/{event['id']}/rounds/run-sheet", headers=AUTH).json()
    round1_before = next(r for r in before["rounds"] if r["round_number"] == 1)

    make_arrived(db, event["id"], 1, prefix="NewPerson")  # joins mid-event

    after = client.get(f"/events/{event['id']}/rounds/run-sheet", headers=AUTH).json()
    round1_after = next(r for r in after["rounds"] if r["round_number"] == 1)

    assert round1_after == round1_before  # untouched by the new arrival
    assert after["total_people"] == 7  # the future projection does grow


def test_run_sheet_projects_future_rounds_with_real_history(client, db, event):
    """Round 2+ are projections, marked `actual=False`, and honor round 1's
    real pairings — the planner doesn't just repeat the same table-1 trio."""
    db.table("events").update(
        {"seats_per_table": 3, "num_tables": 2, "target_rounds": 2}
    ).eq("id", event["id"]).execute()
    people = make_arrived(db, event["id"], 6)
    rnd = make_round(db, event["id"], round_number=1, status="completed")
    for i, p in enumerate(people):
        make_assignment(db, event["id"], rnd["id"], p["id"], table_number=1 if i < 3 else 2)

    body = client.get(f"/events/{event['id']}/rounds/run-sheet", headers=AUTH).json()
    assert [r["round_number"] for r in body["rounds"]] == [1, 2]
    round1, round2 = body["rounds"]
    assert round1["actual"] is True
    assert round2["actual"] is False

    table1_round1 = next(t for t in round1["tables"] if t["table_number"] == 1)["people"]
    for t in round2["tables"]:
        assert sorted(t["people"]) != sorted(table1_round1)


def test_run_sheet_keeps_played_history_when_room_empties_out(client, db, event):
    """Already-played rounds must survive even when too few people remain to
    project a future round — the real record is never wiped for that reason."""
    db.table("events").update({"seats_per_table": 3, "num_tables": 2}).eq("id", event["id"]).execute()
    people = make_arrived(db, event["id"], 6)
    rnd = make_round(db, event["id"], round_number=1, status="completed")
    for i, p in enumerate(people):
        make_assignment(db, event["id"], rnd["id"], p["id"], table_number=1 if i < 3 else 2)
    for p in people[2:]:
        db.table("attendees").update({"status": "left"}).eq("id", p["id"]).execute()

    body = client.get(f"/events/{event['id']}/rounds/run-sheet", headers=AUTH).json()
    assert len(body["rounds"]) == 1
    assert body["rounds"][0]["actual"] is True


# --- organizer table-size bounds reach the planner ---


def test_start_respects_custom_min_per_table(client, db, event):
    """An event-level min_per_table merges into fewer, bigger tables."""
    db.table("events").update(
        {"seats_per_table": 4, "num_tables": 10, "min_per_table": 6, "max_per_table": 6}
    ).eq("id", event["id"]).execute()
    make_arrived(db, event["id"], 12)

    draft = client.post(f"/events/{event['id']}/rounds/start", headers=AUTH).json()
    sizes: dict[int, int] = {}
    for a in draft["assignments"]:
        sizes[a["table_number"]] = sizes.get(a["table_number"], 0) + 1
    assert sorted(sizes.values()) == [6, 6]  # not [4,4,4] — the min forced a merge


# --- manual override: move a person between tables in the draft ---


def test_move_draft_seat_changes_table(client, db, event):
    db.table("events").update({"seats_per_table": 3, "num_tables": 4}).eq("id", event["id"]).execute()
    make_arrived(db, event["id"], 6)
    draft = client.post(f"/events/{event['id']}/rounds/start", headers=AUTH).json()
    first = draft["assignments"][0]
    other_table = next(
        a["table_number"] for a in draft["assignments"] if a["table_number"] != first["table_number"]
    )
    resp = client.post(
        f"/events/{event['id']}/rounds/draft/move",
        headers=AUTH,
        json={"attendee_id": first["attendee_id"], "table_number": other_table},
    )
    assert resp.status_code == 200
    moved = next(a for a in resp.json()["assignments"] if a["attendee_id"] == first["attendee_id"])
    assert moved["table_number"] == other_table
    assert "round.draft_edited" in audit_actions(db)


def test_move_draft_seat_requires_organizer(client, db, event):
    make_arrived(db, event["id"], 6)
    draft = client.post(f"/events/{event['id']}/rounds/start", headers=AUTH).json()
    a = draft["assignments"][0]
    assert (
        client.post(
            f"/events/{event['id']}/rounds/draft/move",
            json={"attendee_id": a["attendee_id"], "table_number": 1},
        ).status_code
        == 401
    )


def test_move_draft_seat_unknown_table_is_422(client, db, event):
    make_arrived(db, event["id"], 6)
    draft = client.post(f"/events/{event['id']}/rounds/start", headers=AUTH).json()
    a = draft["assignments"][0]
    assert (
        client.post(
            f"/events/{event['id']}/rounds/draft/move",
            headers=AUTH,
            json={"attendee_id": a["attendee_id"], "table_number": 999},
        ).status_code
        == 422
    )


def test_move_draft_seat_without_draft_is_404(client, event):
    import uuid

    assert (
        client.post(
            f"/events/{event['id']}/rounds/draft/move",
            headers=AUTH,
            json={"attendee_id": str(uuid.uuid4()), "table_number": 1},
        ).status_code
        == 404
    )


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


# --- pause / resume (migration 008) ---


def test_pause_requires_organizer(client, db, event):
    make_round(db, event["id"], round_number=1, status="active")
    assert client.post(f"/events/{event['id']}/rounds/pause").status_code == 401
    assert client.post(f"/events/{event['id']}/rounds/pause", headers=ATTENDEE_AUTH).status_code == 403
    assert client.post(f"/events/{event['id']}/rounds/pause", headers=OTHER_AUTH).status_code == 403


def test_pause_and_resume_no_active_round_is_404(client, event):
    assert client.post(f"/events/{event['id']}/rounds/pause", headers=AUTH).status_code == 404
    assert client.post(f"/events/{event['id']}/rounds/resume", headers=AUTH).status_code == 404


def test_pause_sets_paused_at(client, db, event):
    make_round(db, event["id"], round_number=1, status="active")
    r = client.post(f"/events/{event['id']}/rounds/pause", headers=AUTH)
    assert r.status_code == 200
    assert r.json()["paused_at"] is not None
    assert "round.paused" in audit_actions(db)


def test_pause_is_idempotent(client, db, event):
    make_round(db, event["id"], round_number=1, status="active")
    first = client.post(f"/events/{event['id']}/rounds/pause", headers=AUTH).json()
    second = client.post(f"/events/{event['id']}/rounds/pause", headers=AUTH).json()
    assert first["paused_at"] == second["paused_at"]  # second pause doesn't move the clock


def test_resume_banks_paused_time_and_clears_flag(client, db, event):
    make_round(
        db, event["id"], round_number=1, status="active",
        paused_at="2026-07-01T18:00:00+00:00", total_paused_seconds=0,
    )
    r = client.post(f"/events/{event['id']}/rounds/resume", headers=AUTH)
    assert r.status_code == 200
    body = r.json()
    assert body["paused_at"] is None  # running again
    assert body["total_paused_seconds"] >= 0  # paused span banked
    assert "round.resumed" in audit_actions(db)


def test_resume_when_running_is_noop(client, db, event):
    make_round(db, event["id"], round_number=1, status="active")
    r = client.post(f"/events/{event['id']}/rounds/resume", headers=AUTH)
    assert r.status_code == 200
    assert r.json()["paused_at"] is None
    assert "round.resumed" not in audit_actions(db)  # nothing to resume


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
