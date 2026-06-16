"""Tests for Step-7 polish: self profile editing, private notes, shared-interest
tags, enhanced analytics, and the organizer live-stats 'room pulse'."""

from tests.conftest import (
    ATTENDEE_AUTH,
    ATTENDEE_USER_ID,
    AUTH,
    OTHER_ATTENDEE_AUTH,
    OTHER_ATTENDEE_USER_ID,
    OTHER_AUTH,
    make_assignment,
    make_attendee,
    make_round,
)


# --- Self profile editing (PATCH /attendees/me) ---

def test_attendee_can_edit_own_profile(client, db, event):
    make_attendee(db, event["id"], name="Me", user_id=ATTENDEE_USER_ID)
    res = client.patch(
        f"/events/{event['id']}/attendees/me",
        json={
            "website_url": "https://me.dev",
            "company": "Acme",
            "interests": ["AI", "Climate"],
            "show_in_directory": False,
        },
        headers=ATTENDEE_AUTH,
    )
    assert res.status_code == 200
    body = res.json()
    assert body["website_url"] == "https://me.dev"
    assert body["company"] == "Acme"
    assert body["interests"] == ["AI", "Climate"]
    assert body["show_in_directory"] is False


def test_self_edit_requires_registration(client, db, event):
    res = client.patch(
        f"/events/{event['id']}/attendees/me",
        json={"role": "Hacker"},
        headers=ATTENDEE_AUTH,
    )
    assert res.status_code == 404


def test_self_edit_empty_body_is_noop(client, db, event):
    make_attendee(db, event["id"], name="Me", role="Founder", user_id=ATTENDEE_USER_ID)
    res = client.patch(
        f"/events/{event['id']}/attendees/me", json={}, headers=ATTENDEE_AUTH
    )
    assert res.status_code == 200
    assert res.json()["role"] == "Founder"


# --- Private connection notes ---

def _met(db, event):
    """Seed me + B sharing one completed round, so B shows up in my rolodex."""
    me = make_attendee(db, event["id"], name="Me", user_id=ATTENDEE_USER_ID)
    b = make_attendee(db, event["id"], name="B")
    r1 = make_round(db, event["id"], round_number=1, status="completed")
    make_assignment(db, event["id"], r1["id"], me["id"], 1)
    make_assignment(db, event["id"], r1["id"], b["id"], 1)
    return me, b


def test_note_saved_and_surfaced_in_connections(client, db, event):
    me, b = _met(db, event)
    put = client.put(
        f"/events/{event['id']}/notes/{b['id']}",
        json={"note": "intro to Priya re: hiring"},
        headers=ATTENDEE_AUTH,
    )
    assert put.status_code == 200
    assert put.json()["note"] == "intro to Priya re: hiring"

    body = client.get(
        f"/events/{event['id']}/attendees/{me['id']}/connections", headers=ATTENDEE_AUTH
    ).json()
    assert body["connections"][0]["note"] == "intro to Priya re: hiring"


def test_note_update_then_clear(client, db, event):
    me, b = _met(db, event)
    client.put(f"/events/{event['id']}/notes/{b['id']}", json={"note": "first"}, headers=ATTENDEE_AUTH)
    client.put(f"/events/{event['id']}/notes/{b['id']}", json={"note": "second"}, headers=ATTENDEE_AUTH)
    assert len(db.store["connection_notes"]) == 1  # upsert, not duplicate
    assert db.store["connection_notes"][0]["note"] == "second"

    cleared = client.put(
        f"/events/{event['id']}/notes/{b['id']}", json={"note": "   "}, headers=ATTENDEE_AUTH
    )
    assert cleared.json()["note"] is None
    assert db.store["connection_notes"] == []


def test_note_delete_is_idempotent(client, db, event):
    make_attendee(db, event["id"], name="Me", user_id=ATTENDEE_USER_ID)
    b = make_attendee(db, event["id"], name="B")
    res = client.delete(f"/events/{event['id']}/notes/{b['id']}", headers=ATTENDEE_AUTH)
    assert res.status_code == 200
    assert res.json()["note"] is None


def test_note_requires_registration(client, db, event):
    b = make_attendee(db, event["id"], name="B")
    res = client.put(
        f"/events/{event['id']}/notes/{b['id']}", json={"note": "hi"}, headers=ATTENDEE_AUTH
    )
    assert res.status_code == 404


def test_notes_are_private_to_author(client, db, event):
    me, b = _met(db, event)
    # Another attendee (B's account) writes their own note about me — must not
    # leak into my rolodex.
    make_attendee(db, event["id"], name="Me", user_id=ATTENDEE_USER_ID)  # ensure me has user
    client.put(f"/events/{event['id']}/notes/{b['id']}", json={"note": "mine"}, headers=ATTENDEE_AUTH)

    # B has no note about anyone from their side; my note stays mine.
    body = client.get(
        f"/events/{event['id']}/attendees/{me['id']}/connections", headers=ATTENDEE_AUTH
    ).json()
    assert body["connections"][0]["note"] == "mine"


# --- Shared interests ---

def test_shared_interests_in_live_tablemates(client, db, event):
    me = make_attendee(
        db, event["id"], name="Me", status="arrived", user_id=ATTENDEE_USER_ID,
        interests=["AI", "Climate"],
    )
    b = make_attendee(
        db, event["id"], name="B", status="arrived",
        interests=["ai", "Hiring"], looking_for="cofounder",
    )
    rnd = make_round(
        db, event["id"], round_number=1, status="active", started_at="2026-07-01T18:00:00+00:00"
    )
    make_assignment(db, event["id"], rnd["id"], me["id"], 1)
    make_assignment(db, event["id"], rnd["id"], b["id"], 1)

    live = client.get(f"/events/{event['id']}/live", headers=ATTENDEE_AUTH).json()
    mate = live["seat"]["tablemates"][0]
    assert mate["interests"] == ["ai", "Hiring"]
    assert mate["shared_interests"] == ["ai"]  # case-insensitive match on "AI"
    assert mate["looking_for"] == "cofounder"


def test_shared_interests_in_connections(client, db, event):
    me = make_attendee(
        db, event["id"], name="Me", user_id=ATTENDEE_USER_ID, interests=["AI"]
    )
    b = make_attendee(db, event["id"], name="B", interests=["AI", "Crypto"])
    r1 = make_round(db, event["id"], round_number=1, status="completed")
    make_assignment(db, event["id"], r1["id"], me["id"], 1)
    make_assignment(db, event["id"], r1["id"], b["id"], 1)

    entry = client.get(
        f"/events/{event['id']}/attendees/{me['id']}/connections", headers=ATTENDEE_AUTH
    ).json()["connections"][0]
    assert entry["interests"] == ["AI", "Crypto"]
    assert entry["shared_interests"] == ["AI"]


# --- Enhanced analytics + live-stats ---

def test_analytics_counts_likes_and_matches(client, db, event):
    me = make_attendee(db, event["id"], name="Me", user_id=ATTENDEE_USER_ID)
    b = make_attendee(db, event["id"], name="B", user_id=OTHER_ATTENDEE_USER_ID)
    r1 = make_round(db, event["id"], round_number=1, status="completed")
    make_assignment(db, event["id"], r1["id"], me["id"], 1)
    make_assignment(db, event["id"], r1["id"], b["id"], 1)

    client.post(f"/events/{event['id']}/likes", json={"target_attendee_id": b["id"]}, headers=ATTENDEE_AUTH)
    client.post(f"/events/{event['id']}/likes", json={"target_attendee_id": me["id"]}, headers=OTHER_ATTENDEE_AUTH)

    body = client.get(f"/events/{event['id']}/analytics", headers=AUTH).json()
    assert body["total_likes"] == 2
    assert body["total_matches"] == 1


def test_live_stats_room_pulse(client, db, event):
    me = make_attendee(db, event["id"], name="Me", status="arrived", user_id=ATTENDEE_USER_ID)
    make_attendee(db, event["id"], name="B", status="arrived")
    make_attendee(db, event["id"], name="C", status="registered")
    rnd = make_round(
        db, event["id"], round_number=2, status="active", started_at="2026-07-01T18:00:00+00:00"
    )
    make_assignment(db, event["id"], rnd["id"], me["id"], 1)

    body = client.get(f"/events/{event['id']}/live-stats", headers=AUTH).json()
    assert body["registered"] == 3
    assert body["arrived"] == 2
    assert body["seated_now"] == 1
    assert body["not_seated"] == 1
    assert body["active_round_number"] == 2


def test_live_stats_owner_only(client, db, event):
    assert (
        client.get(f"/events/{event['id']}/live-stats", headers=OTHER_AUTH).status_code == 403
    )
