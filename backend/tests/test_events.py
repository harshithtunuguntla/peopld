from tests.conftest import AUTH, OTHER_AUTH, ORGANIZER_ID, make_attendee, make_round, make_assignment

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


def test_create_event_malformed_auth_header(client):
    response = client.post(
        "/events", json=EVENT_PAYLOAD, headers={"X-Organizer-Id": "not-a-uuid"}
    )
    assert response.status_code == 401


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


def test_end_event_completes_active_rounds(client, db, event):
    active = make_round(db, event["id"], round_number=1, status="active")

    response = client.post(f"/events/{event['id']}/end", headers=AUTH)
    assert response.status_code == 200
    assert response.json()["status"] == "ended"

    rounds = db.store["rounds"]
    assert all(r["status"] == "completed" for r in rounds)
    assert rounds[0]["id"] == active["id"]
    assert rounds[0]["ended_at"] is not None


def test_list_attendees(client, db, event):
    make_attendee(db, event["id"], name="Asha")
    make_attendee(db, event["id"], name="Ravi")

    response = client.get(f"/events/{event['id']}/attendees")
    assert response.status_code == 200
    assert {a["name"] for a in response.json()} == {"Asha", "Ravi"}


def test_analytics_empty_event(client, event):
    response = client.get(f"/events/{event['id']}/analytics")
    assert response.status_code == 200
    body = response.json()
    assert body == {
        "total_attendees": 0,
        "rounds_completed": 0,
        "avg_unique_people_met": 0.0,
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

    response = client.get(f"/events/{event['id']}/analytics")
    assert response.status_code == 200
    body = response.json()
    assert body["total_attendees"] == 4
    assert body["rounds_completed"] == 2
    assert body["avg_unique_people_met"] == 2.0
