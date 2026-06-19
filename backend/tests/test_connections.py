from tests.conftest import (
    ATTENDEE_AUTH,
    ATTENDEE_USER_ID,
    AUTH,
    OTHER_ATTENDEE_AUTH,
    OTHER_AUTH,
    make_assignment,
    make_attendee,
    make_round,
)


def test_connections_require_auth(client, db, event):
    attendee = make_attendee(db, event["id"])

    response = client.get(
        f"/events/{event['id']}/attendees/{attendee['id']}/connections"
    )
    assert response.status_code == 401


def test_connections_attendee_not_found(client, event):
    response = client.get(
        f"/events/{event['id']}/attendees/00000000-0000-0000-0000-000000000000/connections",
        headers=AUTH,
    )
    assert response.status_code == 404


def test_connections_other_attendee_forbidden(client, db, event):
    attendee = make_attendee(db, event["id"], user_id=ATTENDEE_USER_ID)

    response = client.get(
        f"/events/{event['id']}/attendees/{attendee['id']}/connections",
        headers=OTHER_ATTENDEE_AUTH,
    )
    assert response.status_code == 403


def test_connections_wrong_organizer_forbidden(client, db, event):
    attendee = make_attendee(db, event["id"])

    response = client.get(
        f"/events/{event['id']}/attendees/{attendee['id']}/connections",
        headers=OTHER_AUTH,
    )
    assert response.status_code == 403


def test_connections_self_access(client, db, event):
    attendee = make_attendee(db, event["id"], user_id=ATTENDEE_USER_ID)

    response = client.get(
        f"/events/{event['id']}/attendees/{attendee['id']}/connections",
        headers=ATTENDEE_AUTH,
    )
    assert response.status_code == 200


def test_connections_empty_when_never_assigned(client, db, event):
    attendee = make_attendee(db, event["id"])

    response = client.get(
        f"/events/{event['id']}/attendees/{attendee['id']}/connections",
        headers=AUTH,  # event organizer may view any attendee's rolodex
    )
    assert response.status_code == 200
    assert response.json() == {
        "total_people_met": 0,
        "rounds_count": 0,
        "matches_count": 0,
        "connections": [],
    }


def test_connections_rolodex(client, db, event):
    # Round 1: ME sits with B at table 1; C is elsewhere
    # Round 2: ME sits with C and D at table 2
    me = make_attendee(db, event["id"], name="Me", user_id=ATTENDEE_USER_ID)
    b = make_attendee(db, event["id"], name="B", website_url="https://b.dev")
    c = make_attendee(db, event["id"], name="C", website_url=None)
    d = make_attendee(db, event["id"], name="D")
    r1 = make_round(db, event["id"], round_number=1, status="completed")
    r2 = make_round(db, event["id"], round_number=2, status="completed")

    make_assignment(db, event["id"], r1["id"], me["id"], 1)
    make_assignment(db, event["id"], r1["id"], b["id"], 1)
    make_assignment(db, event["id"], r1["id"], c["id"], 3)
    make_assignment(db, event["id"], r2["id"], me["id"], 2)
    make_assignment(db, event["id"], r2["id"], c["id"], 2)
    make_assignment(db, event["id"], r2["id"], d["id"], 2)

    response = client.get(
        f"/events/{event['id']}/attendees/{me['id']}/connections",
        headers=ATTENDEE_AUTH,
    )
    assert response.status_code == 200
    body = response.json()

    assert body["total_people_met"] == 3
    assert body["rounds_count"] == 2

    entries = body["connections"]
    assert len(entries) == 3
    # Sorted by round, then table
    assert [e["name"] for e in entries] == ["B", "C", "D"]
    assert entries[0]["round_number"] == 1
    assert entries[0]["website_url"] == "https://b.dev"
    assert entries[1]["round_number"] == 2


def test_connections_repeat_pairing_counts_once(client, db, event):
    # Met the same person in two rounds → 2 entries, but 1 unique person
    me = make_attendee(db, event["id"], name="Me", user_id=ATTENDEE_USER_ID)
    b = make_attendee(db, event["id"], name="B")
    r1 = make_round(db, event["id"], round_number=1, status="completed")
    r2 = make_round(db, event["id"], round_number=2, status="completed")

    make_assignment(db, event["id"], r1["id"], me["id"], 1)
    make_assignment(db, event["id"], r1["id"], b["id"], 1)
    make_assignment(db, event["id"], r2["id"], me["id"], 4)
    make_assignment(db, event["id"], r2["id"], b["id"], 4)

    # ...and it's a mutual like (a match). Met across two rounds -> 2 entries,
    # but it must still count as ONE person met and ONE match (regression: the
    # count used to sum per-entry and report 2).
    db.table("connection_likes").insert(
        {"event_id": event["id"], "liker_attendee_id": me["id"], "liked_attendee_id": b["id"]}
    ).execute()
    db.table("connection_likes").insert(
        {"event_id": event["id"], "liker_attendee_id": b["id"], "liked_attendee_id": me["id"]}
    ).execute()

    response = client.get(
        f"/events/{event['id']}/attendees/{me['id']}/connections",
        headers=ATTENDEE_AUTH,
    )
    body = response.json()
    assert body["total_people_met"] == 1
    assert len(body["connections"]) == 2
    assert body["matches_count"] == 1
    assert all(e["mutual"] for e in body["connections"])
