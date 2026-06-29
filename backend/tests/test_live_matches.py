"""Mutual matches surfaced on the /live snapshot (drives the 'it's a match' toast)."""

from tests.conftest import ATTENDEE_AUTH, ATTENDEE_USER_ID, make_attendee

LIVE = "/events/{eid}/live"


def _like(db, eid, liker, liked):
    db.seed("connection_likes", {"event_id": eid, "liker_attendee_id": liker, "liked_attendee_id": liked})


def test_live_surfaces_mutual_match(client, db, event):
    eid = event["id"]
    me = make_attendee(db, eid, name="Asha", status="arrived", user_id=ATTENDEE_USER_ID)
    other = make_attendee(db, eid, name="Ravi", status="arrived")
    _like(db, eid, me["id"], other["id"])
    _like(db, eid, other["id"], me["id"])

    live = client.get(LIVE.format(eid=eid), headers=ATTENDEE_AUTH).json()
    assert [m["name"] for m in live["matches"]] == ["Ravi"]


def test_live_one_way_like_is_not_a_match(client, db, event):
    eid = event["id"]
    me = make_attendee(db, eid, name="Asha", status="arrived", user_id=ATTENDEE_USER_ID)
    other = make_attendee(db, eid, name="Ravi", status="arrived")
    _like(db, eid, me["id"], other["id"])  # only I liked them

    live = client.get(LIVE.format(eid=eid), headers=ATTENDEE_AUTH).json()
    assert live["matches"] == []
