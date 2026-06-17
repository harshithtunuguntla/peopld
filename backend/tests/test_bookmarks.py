"""Saved-contacts (bookmark) tests — PUT/DELETE /events/:id/bookmarks/:target.

Bookmarks are the explicit "save this person" shortlist, owner-private, surfaced
as the `saved` flag on rolodex entries for the Saved filter.
"""

from tests.conftest import (
    ATTENDEE_AUTH,
    ATTENDEE_USER_ID,
    OTHER_ATTENDEE_AUTH,
    OTHER_ATTENDEE_USER_ID,
    make_assignment,
    make_attendee,
    make_round,
)


def _me(db, event_id, **overrides) -> dict:
    defaults = {"name": "Asha", "status": "arrived", "user_id": ATTENDEE_USER_ID}
    defaults.update(overrides)
    return make_attendee(db, event_id, **defaults)


def test_bookmark_requires_auth(client, event):
    r = client.put(f"/events/{event['id']}/bookmarks/00000000-0000-0000-0000-000000000000")
    assert r.status_code == 401


def test_bookmark_requires_registration(client, db, event):
    # Authenticated, but the caller has no attendee row for this event.
    target = make_attendee(db, event["id"], name="Target")
    r = client.put(f"/events/{event['id']}/bookmarks/{target['id']}", headers=ATTENDEE_AUTH)
    assert r.status_code == 404


def test_save_and_unsave_round_trip(client, db, event):
    me = _me(db, event["id"])
    target = make_attendee(db, event["id"], name="Bobby", status="arrived")

    saved = client.put(f"/events/{event['id']}/bookmarks/{target['id']}", headers=ATTENDEE_AUTH)
    assert saved.status_code == 200
    assert saved.json() == {"target_attendee_id": str(target["id"]), "saved": True}
    assert len(db.store.get("connection_bookmarks", [])) == 1

    # Idempotent save — still one row, still saved.
    again = client.put(f"/events/{event['id']}/bookmarks/{target['id']}", headers=ATTENDEE_AUTH)
    assert again.json()["saved"] is True
    assert len(db.store.get("connection_bookmarks", [])) == 1

    removed = client.delete(f"/events/{event['id']}/bookmarks/{target['id']}", headers=ATTENDEE_AUTH)
    assert removed.status_code == 200
    assert removed.json()["saved"] is False
    assert db.store.get("connection_bookmarks", []) == []

    # Idempotent unsave — fine to delete what isn't there.
    assert client.delete(f"/events/{event['id']}/bookmarks/{target['id']}", headers=ATTENDEE_AUTH).status_code == 200


def test_cannot_save_yourself(client, db, event):
    me = _me(db, event["id"])
    r = client.put(f"/events/{event['id']}/bookmarks/{me['id']}", headers=ATTENDEE_AUTH)
    assert r.status_code == 400


def test_cannot_save_someone_not_in_event(client, db, event):
    _me(db, event["id"])
    r = client.put(
        f"/events/{event['id']}/bookmarks/00000000-0000-0000-0000-000000000000",
        headers=ATTENDEE_AUTH,
    )
    assert r.status_code == 404


def test_saved_flag_surfaces_in_connections_and_is_owner_private(client, db, event):
    """A saved contact reads back as saved=True in MY rolodex, but never in
    someone else's view of the same person."""
    me = _me(db, event["id"])
    mate = make_attendee(db, event["id"], name="Bobby", status="arrived")
    other = make_attendee(db, event["id"], name="Ravi", status="arrived", user_id=OTHER_ATTENDEE_USER_ID)
    rnd = make_round(db, event["id"], round_number=1, status="active")
    make_assignment(db, event["id"], rnd["id"], me["id"], table_number=1)
    make_assignment(db, event["id"], rnd["id"], mate["id"], table_number=1)
    make_assignment(db, event["id"], rnd["id"], other["id"], table_number=1)

    client.put(f"/events/{event['id']}/bookmarks/{mate['id']}", headers=ATTENDEE_AUTH)

    mine = client.get(f"/events/{event['id']}/attendees/{me['id']}/connections", headers=ATTENDEE_AUTH).json()
    by_id = {c["attendee_id"]: c for c in mine["connections"]}
    assert by_id[str(mate["id"])]["saved"] is True
    assert by_id[str(other["id"])]["saved"] is False  # I didn't save Ravi

    # Ravi saved nobody — Bobby is not saved in HIS rolodex (owner-private).
    theirs = client.get(f"/events/{event['id']}/attendees/{other['id']}/connections", headers=OTHER_ATTENDEE_AUTH).json()
    theirs_by_id = {c["attendee_id"]: c for c in theirs["connections"]}
    assert theirs_by_id[str(mate["id"])]["saved"] is False
