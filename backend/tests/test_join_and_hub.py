"""Tests for the join-first hub: reverse code -> event lookup, organizer
access-code management (view / regenerate / clear, owner-only), and the
cross-event /me/connections rolodex."""

from tests.conftest import (
    ATTENDEE_AUTH,
    ATTENDEE_USER_ID,
    AUTH,
    OTHER_AUTH,
    OTHER_ATTENDEE_AUTH,
    make_assignment,
    make_attendee,
    make_round,
)


def _set_code(db, event_id, code):
    db.seed("event_access_codes", {"event_id": event_id, "code": code})


# --- POST /events/join (reverse code lookup) ---

def test_join_resolves_event_by_code(client, db, event):
    _set_code(db, event["id"], "MIXER7")
    res = client.post("/events/join", json={"code": "MIXER7"}, headers=ATTENDEE_AUTH)
    assert res.status_code == 200
    body = res.json()
    assert body["event_id"] == str(event["id"])
    assert body["name"] == event["name"]
    assert body["requires_code"] is True


def test_join_is_case_and_space_insensitive(client, db, event):
    _set_code(db, event["id"], "MIXER7")
    res = client.post("/events/join", json={"code": "  mixer7 "}, headers=ATTENDEE_AUTH)
    assert res.status_code == 200
    assert res.json()["event_id"] == str(event["id"])


def test_join_unknown_code_is_404(client, db, event):
    _set_code(db, event["id"], "MIXER7")
    res = client.post("/events/join", json={"code": "NOPE99"}, headers=ATTENDEE_AUTH)
    assert res.status_code == 404


def test_join_works_without_auth(client, db, event):
    """The hub requires sign-in, but the lookup itself is public (the event id is
    already public) — so a shared /join?code= link resolves before sign-in too."""
    _set_code(db, event["id"], "OPEN42")
    res = client.post("/events/join", json={"code": "OPEN42"})
    assert res.status_code == 200


# --- Access-code management (owner only) ---

def test_owner_can_view_access_code(client, db, event):
    _set_code(db, event["id"], "MIXER7")
    res = client.get(f"/events/{event['id']}/access-code", headers=AUTH)
    assert res.status_code == 200
    assert res.json()["code"] == "MIXER7"


def test_view_access_code_is_null_when_open(client, db, event):
    res = client.get(f"/events/{event['id']}/access-code", headers=AUTH)
    assert res.status_code == 200
    assert res.json()["code"] is None


def test_other_organizer_cannot_view_code(client, db, event):
    _set_code(db, event["id"], "MIXER7")
    res = client.get(f"/events/{event['id']}/access-code", headers=OTHER_AUTH)
    assert res.status_code == 403


def test_attendee_cannot_view_code(client, db, event):
    _set_code(db, event["id"], "MIXER7")
    res = client.get(f"/events/{event['id']}/access-code", headers=ATTENDEE_AUTH)
    assert res.status_code in (401, 403)


def test_generate_works_once_then_is_locked(client, db, event):
    # Event created open -> first 'regenerate' mints the code (the one-time generate)
    res = client.post(f"/events/{event['id']}/access-code/regenerate", headers=AUTH)
    assert res.status_code == 200
    code = res.json()["code"]
    assert code
    assert client.post("/events/join", json={"code": code}).status_code == 200
    # A second call is rejected — the code is permanent, never rotated
    res2 = client.post(f"/events/{event['id']}/access-code/regenerate", headers=AUTH)
    assert res2.status_code == 409
    # ...and the original code still resolves, unchanged
    assert client.get(f"/events/{event['id']}/access-code", headers=AUTH).json()["code"] == code
    assert client.post("/events/join", json={"code": code}).status_code == 200


def test_other_organizer_cannot_regenerate(client, db, event):
    res = client.post(f"/events/{event['id']}/access-code/regenerate", headers=OTHER_AUTH)
    assert res.status_code == 403


def test_clear_code_is_blocked_once_set(client, db, event):
    _set_code(db, event["id"], "MIXER7")
    res = client.delete(f"/events/{event['id']}/access-code", headers=AUTH)
    assert res.status_code == 409
    # the code is permanent — still present and still resolving
    assert client.get(f"/events/{event['id']}/access-code", headers=AUTH).json()["code"] == "MIXER7"
    assert client.post("/events/join", json={"code": "MIXER7"}).status_code == 200


# --- GET /me/connections (cross-event rolodex) ---

def _met_in(db, event_id, other_name):
    """Seed me (the attendee user) + someone, sharing a completed round."""
    me = make_attendee(db, event_id, name="Me", user_id=ATTENDEE_USER_ID, interests=["AI"])
    other = make_attendee(db, event_id, name=other_name, interests=["AI", "Climate"])
    r = make_round(db, event_id, round_number=1, status="completed")
    make_assignment(db, event_id, r["id"], me["id"], 1)
    make_assignment(db, event_id, r["id"], other["id"], 1)
    return me, other


def test_me_connections_aggregates_across_events(client, db, event):
    # second event owned by the same organizer
    event2 = db.seed(
        "events",
        {**{k: v for k, v in event.items() if k != "id"}, "name": "DevHouse Demo"},
    )[0]
    _met_in(db, event["id"], "Maya")
    _met_in(db, event2["id"], "Arjun")

    res = client.get("/me/connections", headers=ATTENDEE_AUTH)
    assert res.status_code == 200
    body = res.json()
    assert body["events_count"] == 2
    assert body["total_people_met"] == 2
    names = {c["name"] for c in body["connections"]}
    assert names == {"Maya", "Arjun"}
    # each entry is tagged with its event + shared interests are computed
    by_name = {c["name"]: c for c in body["connections"]}
    assert by_name["Maya"]["event_name"] == "Founder Meetup"
    assert "AI" in by_name["Maya"]["shared_interests"]


def test_me_connections_includes_co_attendees_not_just_met(client, db, event):
    """Post-pilot fix: "My connections" reflects the whole CHECKED-IN room you were
    in, not only the handful a round seated you with — but met vs. just-attended is
    distinguished, and registered no-shows are excluded."""
    me = make_attendee(db, event["id"], name="Me", status="arrived", user_id=ATTENDEE_USER_ID)
    met = make_attendee(db, event["id"], name="Met", status="arrived")
    make_attendee(db, event["id"], name="CoAttendee", status="arrived")
    make_attendee(db, event["id"], name="NoShow", status="registered")
    r = make_round(db, event["id"], round_number=1, status="completed")
    make_assignment(db, event["id"], r["id"], me["id"], 1)
    make_assignment(db, event["id"], r["id"], met["id"], 1)

    body = client.get("/me/connections", headers=ATTENDEE_AUTH).json()
    by_name = {c["name"]: c for c in body["connections"]}

    assert "Met" in by_name and "CoAttendee" in by_name  # whole room surfaced
    assert "NoShow" not in by_name                        # didn't actually attend
    assert by_name["Met"]["met"] is True
    assert by_name["CoAttendee"]["met"] is False
    assert body["total_people_met"] == 1                  # headline counts only met


def test_me_connections_excludes_other_users(client, db, event):
    _met_in(db, event["id"], "Maya")
    res = client.get("/me/connections", headers=OTHER_ATTENDEE_AUTH)
    assert res.status_code == 200
    assert res.json()["connections"] == []


def test_me_connections_empty_when_never_attended(client, db, event):
    res = client.get("/me/connections", headers=ATTENDEE_AUTH)
    assert res.status_code == 200
    body = res.json()
    assert body["total_people_met"] == 0
    assert body["events_count"] == 0


def test_me_connections_paginates_and_facets(client, db, event):
    eid = event["id"]
    me = make_attendee(db, eid, name="Me", status="arrived", user_id=ATTENDEE_USER_ID)
    r = make_round(db, eid, round_number=1, status="completed")
    make_assignment(db, eid, r["id"], me["id"], 1)
    for i in range(5):
        other = make_attendee(db, eid, name=f"Person{i}", status="arrived")
        make_assignment(db, eid, r["id"], other["id"], 1)

    body = client.get("/me/connections?page=1&limit=2", headers=ATTENDEE_AUTH).json()
    assert body["total"] == 5
    assert body["total_pages"] == 3
    assert body["page"] == 1 and body["limit"] == 2
    assert len(body["connections"]) == 2               # only a page ships over the wire
    assert body["rel_counts"]["all"] == 5 and body["rel_counts"]["met"] == 5
    assert len(body["events"]) == 1                     # one event in the filter dropdown
    # headline stats are over the whole set, not the page
    assert body["total_people_met"] == 5

    page1 = {c["name"] for c in body["connections"]}
    page2 = {c["name"] for c in client.get("/me/connections?page=2&limit=2", headers=ATTENDEE_AUTH).json()["connections"]}
    assert page1.isdisjoint(page2)                      # distinct people across pages

    # Search narrows the total; a dead-end filter returns nothing.
    found = client.get("/me/connections?q=Person3", headers=ATTENDEE_AUTH).json()
    assert found["total"] == 1 and found["connections"][0]["name"] == "Person3"
    assert client.get("/me/connections?rel=matches", headers=ATTENDEE_AUTH).json()["total"] == 0


def test_me_connections_survives_missing_optional_bookmarks_table(client, db, event, monkeypatch):
    _met_in(db, event["id"], "Maya")
    original_table = db.table

    def table(name):
        if name == "connection_bookmarks":
            raise RuntimeError("relation connection_bookmarks does not exist")
        return original_table(name)

    monkeypatch.setattr(db, "table", table)

    res = client.get("/me/connections", headers=ATTENDEE_AUTH)
    assert res.status_code == 200
    body = res.json()
    assert body["total_people_met"] == 1
    assert body["connections"][0]["name"] == "Maya"
    assert body["connections"][0]["saved"] is False
