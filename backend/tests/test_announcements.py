"""Organizer live announcements — owner-only create, surfaced on the /live snapshot."""

from tests.conftest import AUTH, OTHER_AUTH, ATTENDEE_AUTH, ATTENDEE_USER_ID, make_attendee

BASE = "/events/{eid}/announcements"
LIVE = "/events/{eid}/live"


def test_announce_requires_auth(client, event):
    assert client.post(BASE.format(eid=event["id"]), json={"message": "Hi"}).status_code == 401


def test_announce_is_owner_only(client, event):
    r = client.post(BASE.format(eid=event["id"]), json={"message": "Hi"}, headers=OTHER_AUTH)
    assert r.status_code == 403


def test_announce_empty_rejected(client, event):
    r = client.post(BASE.format(eid=event["id"]), json={"message": "   "}, headers=AUTH)
    assert r.status_code == 422


def test_announce_creates_rings_doorbell_and_surfaces_in_live(client, db, event, realtime_post):
    eid = event["id"]
    make_attendee(db, eid, name="Asha", status="arrived", user_id=ATTENDEE_USER_ID)

    r = client.post(BASE.format(eid=eid), json={"message": "Pizza's here"}, headers=AUTH)
    assert r.status_code == 200 and r.json()["message"] == "Pizza's here"

    # the realtime doorbell fired (so phones re-fetch /live)
    assert any(c["json"]["messages"][0]["event"] == "resync" for c in realtime_post)

    # ...and on BOTH topics — the /live page AND the app-wide notifier. The notifier
    # subscribes to notify:{id}, so without this an announcement only lands on its
    # slow backstop poll (the "doesn't arrive until I tap something" bug).
    topics = {m["topic"] for c in realtime_post for m in c["json"]["messages"]}
    assert f"live:{eid}" in topics and f"notify:{eid}" in topics

    live = client.get(LIVE.format(eid=eid), headers=ATTENDEE_AUTH).json()
    assert live["latest_announcement"]["message"] == "Pizza's here"


def test_live_latest_announcement_is_most_recent(client, db, event):
    eid = event["id"]
    make_attendee(db, eid, name="Asha", status="arrived", user_id=ATTENDEE_USER_ID)
    # Seed two with explicit timestamps so ordering is deterministic.
    db.seed("event_announcements", {"event_id": eid, "message": "First", "created_at": "2026-07-01T10:00:00+00:00"})
    db.seed("event_announcements", {"event_id": eid, "message": "Second", "created_at": "2026-07-01T11:00:00+00:00"})

    live = client.get(LIVE.format(eid=eid), headers=ATTENDEE_AUTH).json()
    assert live["latest_announcement"]["message"] == "Second"


def test_live_no_announcement_is_null(client, db, event):
    eid = event["id"]
    make_attendee(db, eid, name="Asha", status="arrived", user_id=ATTENDEE_USER_ID)
    live = client.get(LIVE.format(eid=eid), headers=ATTENDEE_AUTH).json()
    assert live["latest_announcement"] is None
