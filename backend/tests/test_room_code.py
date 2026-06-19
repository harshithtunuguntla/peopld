"""Tests for Phase 2 — the self-service day-of ROOM code.

Covers owner-only room-code management (view / open / close), attendee
self-check-in (registered -> arrived) gated by the code, and the security
posture: attendees can't read the code, and the code value never lands in the
audit log.
"""

from tests.conftest import (
    ATTENDEE_AUTH,
    ATTENDEE_USER_ID,
    AUTH,
    OTHER_ATTENDEE_AUTH,
    OTHER_ATTENDEE_USER_ID,
    OTHER_AUTH,
    audit_actions,
    make_attendee,
)


def _set_room_code(db, event_id, code):
    db.seed("event_room_codes", {"event_id": event_id, "code": code})


def _status(db, attendee_id):
    return next(a["status"] for a in db.store["attendees"] if str(a["id"]) == str(attendee_id))


# --- Room-code management (owner only) ---

def test_owner_can_view_room_code(client, db, event):
    _set_room_code(db, event["id"], "AB12")
    res = client.get(f"/events/{event['id']}/room-code", headers=AUTH)
    assert res.status_code == 200
    assert res.json()["code"] == "AB12"


def test_room_code_null_until_opened(client, db, event):
    res = client.get(f"/events/{event['id']}/room-code", headers=AUTH)
    assert res.status_code == 200
    assert res.json()["code"] is None


def test_other_organizer_cannot_view_room_code(client, db, event):
    _set_room_code(db, event["id"], "AB12")
    res = client.get(f"/events/{event['id']}/room-code", headers=OTHER_AUTH)
    assert res.status_code == 403


def test_attendee_cannot_view_room_code(client, db, event):
    """The whole point of a second code: a phone must never be able to read it."""
    _set_room_code(db, event["id"], "AB12")
    res = client.get(f"/events/{event['id']}/room-code", headers=ATTENDEE_AUTH)
    assert res.status_code in (401, 403)


def test_regenerate_opens_checkin(client, db, event):
    res = client.post(f"/events/{event['id']}/room-code/regenerate", headers=AUTH)
    assert res.status_code == 200
    code = res.json()["code"]
    assert code and len(code) == 6
    # persisted: a fresh GET returns the same code
    assert client.get(f"/events/{event['id']}/room-code", headers=AUTH).json()["code"] == code


def test_regenerate_replaces_old_code(client, db, event):
    _set_room_code(db, event["id"], "OLD1")
    new_code = client.post(f"/events/{event['id']}/room-code/regenerate", headers=AUTH).json()["code"]
    assert new_code != "OLD1"
    # old code no longer checks anyone in
    a = make_attendee(db, event["id"], user_id=ATTENDEE_USER_ID, status="registered")
    assert client.post(
        f"/events/{event['id']}/attendees/me/arrive", json={"room_code": "OLD1"}, headers=ATTENDEE_AUTH
    ).status_code == 403
    assert _status(db, a["id"]) == "registered"


def test_other_organizer_cannot_regenerate(client, db, event):
    res = client.post(f"/events/{event['id']}/room-code/regenerate", headers=OTHER_AUTH)
    assert res.status_code == 403


def test_clear_closes_checkin(client, db, event):
    _set_room_code(db, event["id"], "AB12")
    res = client.delete(f"/events/{event['id']}/room-code", headers=AUTH)
    assert res.status_code == 200
    assert res.json()["code"] is None
    assert client.get(f"/events/{event['id']}/room-code", headers=AUTH).json()["code"] is None


# --- Attendee self check-in ---

def test_self_arrive_with_correct_code(client, db, event):
    _set_room_code(db, event["id"], "AB12")
    a = make_attendee(db, event["id"], user_id=ATTENDEE_USER_ID, status="registered")
    res = client.post(
        f"/events/{event['id']}/attendees/me/arrive", json={"room_code": "AB12"}, headers=ATTENDEE_AUTH
    )
    assert res.status_code == 200
    assert res.json()["status"] == "arrived"
    assert _status(db, a["id"]) == "arrived"
    assert "attendee.self_arrived" in audit_actions(db)


def test_self_arrive_is_case_and_space_insensitive(client, db, event):
    _set_room_code(db, event["id"], "AB12")
    make_attendee(db, event["id"], user_id=ATTENDEE_USER_ID, status="registered")
    res = client.post(
        f"/events/{event['id']}/attendees/me/arrive", json={"room_code": "  ab12 "}, headers=ATTENDEE_AUTH
    )
    assert res.status_code == 200
    assert res.json()["status"] == "arrived"


def test_self_arrive_wrong_code_is_403(client, db, event):
    _set_room_code(db, event["id"], "AB12")
    a = make_attendee(db, event["id"], user_id=ATTENDEE_USER_ID, status="registered")
    res = client.post(
        f"/events/{event['id']}/attendees/me/arrive", json={"room_code": "ZZ99"}, headers=ATTENDEE_AUTH
    )
    assert res.status_code == 403
    assert _status(db, a["id"]) == "registered"  # unchanged


def test_self_arrive_before_checkin_open_is_409(client, db, event):
    """No room code set yet — must NOT silently pass (code_matches treats an empty
    required code as open; the endpoint guards against that)."""
    a = make_attendee(db, event["id"], user_id=ATTENDEE_USER_ID, status="registered")
    res = client.post(
        f"/events/{event['id']}/attendees/me/arrive", json={"room_code": "AB12"}, headers=ATTENDEE_AUTH
    )
    assert res.status_code == 409
    assert _status(db, a["id"]) == "registered"


def test_self_arrive_requires_registration(client, db, event):
    _set_room_code(db, event["id"], "AB12")
    # OTHER attendee never registered for this event
    res = client.post(
        f"/events/{event['id']}/attendees/me/arrive", json={"room_code": "AB12"}, headers=OTHER_ATTENDEE_AUTH
    )
    assert res.status_code == 404


def test_self_arrive_is_idempotent_when_already_arrived(client, db, event):
    _set_room_code(db, event["id"], "AB12")
    a = make_attendee(db, event["id"], user_id=ATTENDEE_USER_ID, status="arrived")
    # Even a wrong code is a no-op success — they're already in the room.
    res = client.post(
        f"/events/{event['id']}/attendees/me/arrive", json={"room_code": "WRONG"}, headers=ATTENDEE_AUTH
    )
    assert res.status_code == 200
    assert _status(db, a["id"]) == "arrived"


def test_left_attendee_can_re_arrive(client, db, event):
    """Self re-entry is intentional: a person who left and comes back can use the
    room code to re-check-in (unlike the organizer's bulk action, which never
    resurrects 'left')."""
    _set_room_code(db, event["id"], "AB12")
    a = make_attendee(db, event["id"], user_id=ATTENDEE_USER_ID, status="left")
    res = client.post(
        f"/events/{event['id']}/attendees/me/arrive", json={"room_code": "AB12"}, headers=ATTENDEE_AUTH
    )
    assert res.status_code == 200
    assert _status(db, a["id"]) == "arrived"


def test_self_arrive_after_event_ended_is_409(client, db, event):
    db.store["events"][0]["status"] = "ended"
    _set_room_code(db, event["id"], "AB12")
    make_attendee(db, event["id"], user_id=ATTENDEE_USER_ID, status="registered")
    res = client.post(
        f"/events/{event['id']}/attendees/me/arrive", json={"room_code": "AB12"}, headers=ATTENDEE_AUTH
    )
    assert res.status_code == 409


# --- Security: the code value never leaks into the audit log ---

def test_room_code_value_never_logged(client, db, event):
    code = client.post(f"/events/{event['id']}/room-code/regenerate", headers=AUTH).json()["code"]
    make_attendee(db, event["id"], user_id=ATTENDEE_USER_ID, status="registered")
    client.post(
        f"/events/{event['id']}/attendees/me/arrive", json={"room_code": code}, headers=ATTENDEE_AUTH
    )
    assert "event.room_code_regenerated" in audit_actions(db)
    assert "attendee.self_arrived" in audit_actions(db)
    # the secret must not appear anywhere in the audit trail
    assert code not in str(db.store.get("audit_log", []))
