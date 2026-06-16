from tests.conftest import (
    ATTENDEE_AUTH,
    ATTENDEE_USER_ID,
    AUTH,
    ORGANIZER_ID,
    OTHER_ATTENDEE_USER_ID,
    OTHER_AUTH,
    make_assignment,
    make_attendee,
    make_round,
)

EVENT_PAYLOAD = {
    "name": "Founder Meetup",
    "date": "2026-07-01",
    "time": "18:00:00",
    "location": "Hyderabad",
    "description": "Pilot event",
    "num_tables": 10,
    "seats_per_table": 4,
    "default_round_duration_seconds": 300,
}


def test_create_event_requires_auth(client):
    response = client.post("/events", json=EVENT_PAYLOAD)
    assert response.status_code == 401


def test_create_event_invalid_token(client):
    response = client.post(
        "/events", json=EVENT_PAYLOAD, headers={"Authorization": "Bearer garbage-token"}
    )
    assert response.status_code == 401


def test_create_event_non_organizer_forbidden(client):
    response = client.post("/events", json=EVENT_PAYLOAD, headers=ATTENDEE_AUTH)
    assert response.status_code == 403


def test_create_and_get_event(client):
    created = client.post("/events", json=EVENT_PAYLOAD, headers=AUTH)
    assert created.status_code == 201
    body = created.json()
    assert body["name"] == "Founder Meetup"
    assert body["status"] == "upcoming"
    assert body["organizer_id"] == ORGANIZER_ID

    fetched = client.get(f"/events/{body['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["id"] == body["id"]


def test_get_event_not_found(client):
    response = client.get("/events/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404


def test_list_my_events_only_returns_own(client):
    client.post("/events", json=EVENT_PAYLOAD, headers=AUTH)
    client.post("/events", json={**EVENT_PAYLOAD, "name": "Second"}, headers=AUTH)
    client.post("/events", json={**EVENT_PAYLOAD, "name": "Not mine"}, headers=OTHER_AUTH)

    response = client.get("/events/mine", headers=AUTH)
    assert response.status_code == 200
    names = {e["name"] for e in response.json()}
    assert names == {"Founder Meetup", "Second"}


def test_patch_event_status(client, event):
    response = client.patch(f"/events/{event['id']}", json={"status": "active"}, headers=AUTH)
    assert response.status_code == 200
    assert response.json()["status"] == "active"


def test_patch_event_wrong_organizer_forbidden(client, event):
    response = client.patch(f"/events/{event['id']}", json={"status": "active"}, headers=OTHER_AUTH)
    assert response.status_code == 403


def test_patch_event_edits_details_and_format(client, event):
    """The settings page edits name/location/date/time + capacity/timing/auto-arrive."""
    response = client.patch(
        f"/events/{event['id']}",
        json={
            "name": "Renamed Mixer",
            "location": "New Venue, Hyderabad",
            "date": "2026-08-01",
            "time": "19:30:00",
            "num_tables": 12,
            "seats_per_table": 5,
            "default_round_duration_seconds": 420,
            "auto_arrive_on_register": False,
            "target_rounds": 5,
        },
        headers=AUTH,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Renamed Mixer"
    assert body["location"] == "New Venue, Hyderabad"
    assert str(body["date"]) == "2026-08-01"
    assert body["num_tables"] == 12
    assert body["seats_per_table"] == 5
    assert body["default_round_duration_seconds"] == 420
    assert body["auto_arrive_on_register"] is False
    assert body["target_rounds"] == 5


def test_end_event_completes_active_rounds(client, db, event):
    active = make_round(db, event["id"], round_number=1, status="active")

    response = client.post(f"/events/{event['id']}/end", headers=AUTH)
    assert response.status_code == 200
    assert response.json()["status"] == "ended"

    rounds = db.store["rounds"]
    assert all(r["status"] == "completed" for r in rounds)
    assert rounds[0]["id"] == active["id"]
    assert rounds[0]["ended_at"] is not None


def test_list_attendees_requires_auth(client, db, event):
    make_attendee(db, event["id"])

    response = client.get(f"/events/{event['id']}/attendees")
    assert response.status_code == 401


def test_list_attendees_wrong_organizer_forbidden(client, db, event):
    make_attendee(db, event["id"])

    response = client.get(f"/events/{event['id']}/attendees", headers=OTHER_AUTH)
    assert response.status_code == 403


def test_list_attendees(client, db, event):
    make_attendee(db, event["id"], name="Asha")
    make_attendee(db, event["id"], name="Ravi")

    response = client.get(f"/events/{event['id']}/attendees", headers=AUTH)
    assert response.status_code == 200
    assert {a["name"] for a in response.json()} == {"Asha", "Ravi"}


def test_analytics_requires_organizer(client, event):
    assert client.get(f"/events/{event['id']}/analytics").status_code == 401
    assert (
        client.get(f"/events/{event['id']}/analytics", headers=ATTENDEE_AUTH).status_code
        == 403
    )
    assert (
        client.get(f"/events/{event['id']}/analytics", headers=OTHER_AUTH).status_code
        == 403
    )


def test_analytics_empty_event(client, event):
    response = client.get(f"/events/{event['id']}/analytics", headers=AUTH)
    assert response.status_code == 200
    body = response.json()
    assert body == {
        "total_attendees": 0,
        "rounds_completed": 0,
        "avg_unique_people_met": 0.0,
        "total_likes": 0,
        "total_matches": 0,
    }


def test_analytics_computes_unique_people_met(client, db, event):
    # 4 attendees, 2 completed rounds:
    #   R1: table 1 = (A, B), table 2 = (C, D)
    #   R2: table 1 = (A, C), table 2 = (B, D)
    # Everyone met exactly 2 unique people → avg 2.0
    a = make_attendee(db, event["id"], name="A")
    b = make_attendee(db, event["id"], name="B")
    c = make_attendee(db, event["id"], name="C")
    d = make_attendee(db, event["id"], name="D")
    r1 = make_round(db, event["id"], round_number=1, status="completed")
    r2 = make_round(db, event["id"], round_number=2, status="completed")

    make_assignment(db, event["id"], r1["id"], a["id"], 1)
    make_assignment(db, event["id"], r1["id"], b["id"], 1)
    make_assignment(db, event["id"], r1["id"], c["id"], 2)
    make_assignment(db, event["id"], r1["id"], d["id"], 2)
    make_assignment(db, event["id"], r2["id"], a["id"], 1)
    make_assignment(db, event["id"], r2["id"], c["id"], 1)
    make_assignment(db, event["id"], r2["id"], b["id"], 2)
    make_assignment(db, event["id"], r2["id"], d["id"], 2)

    response = client.get(f"/events/{event['id']}/analytics", headers=AUTH)
    assert response.status_code == 200
    body = response.json()
    assert body["total_attendees"] == 4
    assert body["rounds_completed"] == 2
    assert body["avg_unique_people_met"] == 2.0


# --- Access code gate + public stats (Step 7) ---

def test_get_event_reports_requires_code(client):
    """Open event -> requires_code false; coded event -> true, but the code itself never leaks."""
    open_event = client.post("/events", json=EVENT_PAYLOAD, headers=AUTH).json()
    assert open_event["requires_code"] is False
    assert "access_code" not in open_event

    coded = client.post("/events", json={**EVENT_PAYLOAD, "access_code": "MIXER"}, headers=AUTH).json()
    assert coded["requires_code"] is True
    assert "access_code" not in coded

    public = client.get(f"/events/{coded['id']}").json()
    assert public["requires_code"] is True
    assert "access_code" not in public  # secret stays server-side


def test_verify_code_is_case_insensitive_and_trimmed(client):
    coded = client.post("/events", json={**EVENT_PAYLOAD, "access_code": "MIXER"}, headers=AUTH).json()
    eid = coded["id"]
    assert client.post(f"/events/{eid}/verify-code", json={"code": " mixer "}).json()["valid"] is True
    assert client.post(f"/events/{eid}/verify-code", json={"code": "nope"}).json()["valid"] is False


def test_verify_code_open_event_always_valid(client):
    open_event = client.post("/events", json=EVENT_PAYLOAD, headers=AUTH).json()
    assert client.post(f"/events/{open_event['id']}/verify-code", json={"code": ""}).json()["valid"] is True


def test_update_event_can_set_and_clear_code(client):
    event = client.post("/events", json=EVENT_PAYLOAD, headers=AUTH).json()
    eid = event["id"]

    set_resp = client.patch(f"/events/{eid}", json={"access_code": "OPENSESAME"}, headers=AUTH)
    assert set_resp.json()["requires_code"] is True

    clear_resp = client.patch(f"/events/{eid}", json={"access_code": ""}, headers=AUTH)
    assert clear_resp.json()["requires_code"] is False


def test_event_stats_counts_attendees(client, db, event):
    eid = event["id"]
    assert client.get(f"/events/{eid}/stats").json()["attendee_count"] == 0
    make_attendee(db, eid, name="Asha")
    make_attendee(db, eid, name="Ravi")
    assert client.get(f"/events/{eid}/stats").json()["attendee_count"] == 2


# --- Attendee home feed: GET /events (public list) ---

def test_list_events_is_public_and_safe(client, db, event):
    """No auth needed; only public-safe fields, no organizer config or PII."""
    db.seed("event_access_codes", {"event_id": event["id"], "code": "MIXER"})
    make_attendee(db, event["id"], name="Asha")

    response = client.get("/events")
    assert response.status_code == 200
    [card] = response.json()
    assert card["name"] == "Founder Meetup"
    assert card["requires_code"] is True
    assert card["attendee_count"] == 1
    assert card["registered"] is False  # anonymous browser
    # organizer-internal config never appears on the public card
    assert "num_tables" not in card
    assert "seats_per_table" not in card
    assert "organizer_id" not in card


def test_list_events_marks_registered_for_signed_in_caller(client, db, event):
    # someone else registered (should NOT flip our flag) + the caller registered
    make_attendee(db, event["id"], name="Ravi", user_id=OTHER_ATTENDEE_USER_ID)
    make_attendee(db, event["id"], name="Asha", user_id=ATTENDEE_USER_ID)

    anon = client.get("/events").json()[0]
    assert anon["registered"] is False
    assert anon["attendee_count"] == 2

    mine = client.get("/events", headers=ATTENDEE_AUTH).json()[0]
    assert mine["registered"] is True


def test_list_events_sorted_soonest_first(client, db):
    db.seed("events", {
        "name": "Later", "date": "2026-08-01", "time": "18:00:00",
        "location": "Hyderabad", "description": None, "num_tables": 5,
        "seats_per_table": 4, "default_round_duration_seconds": 300,
        "auto_arrive_on_register": True, "organizer_id": ORGANIZER_ID, "status": "upcoming",
    })
    db.seed("events", {
        "name": "Sooner", "date": "2026-07-01", "time": "18:00:00",
        "location": "Hyderabad", "description": None, "num_tables": 5,
        "seats_per_table": 4, "default_round_duration_seconds": 300,
        "auto_arrive_on_register": True, "organizer_id": ORGANIZER_ID, "status": "upcoming",
    })

    names = [e["name"] for e in client.get("/events").json()]
    assert names == ["Sooner", "Later"]


def test_list_events_empty(client):
    assert client.get("/events").json() == []
