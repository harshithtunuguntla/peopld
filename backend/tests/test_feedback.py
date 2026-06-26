"""Post-event feedback / testimonials — POST/GET /events/:id/feedback.

Subtle, never-forced: a 1-5 rating + optional free-text testimonial, one row
per attendee per event. Resubmitting updates rather than duplicating.
"""

from tests.conftest import ATTENDEE_AUTH, ATTENDEE_USER_ID, make_attendee


def _me(db, event_id, **overrides) -> dict:
    defaults = {"name": "Asha", "status": "arrived", "user_id": ATTENDEE_USER_ID}
    defaults.update(overrides)
    return make_attendee(db, event_id, **defaults)


def test_feedback_requires_auth(client, event):
    assert client.post(f"/events/{event['id']}/feedback", json={"rating": 5}).status_code == 401
    assert client.get(f"/events/{event['id']}/feedback/me").status_code == 401


def test_feedback_requires_registration(client, db, event):
    r = client.post(f"/events/{event['id']}/feedback", json={"rating": 5}, headers=ATTENDEE_AUTH)
    assert r.status_code == 404


def test_submit_feedback(client, db, event):
    _me(db, event["id"])
    r = client.post(
        f"/events/{event['id']}/feedback",
        json={"rating": 5, "comment": "  Loved the icebreakers!  "},
        headers=ATTENDEE_AUTH,
    )
    assert r.status_code == 201
    body = r.json()
    assert body["rating"] == 5
    assert body["comment"] == "Loved the icebreakers!"  # trimmed

    rows = db.store.get("event_feedback", [])
    assert len(rows) == 1
    assert rows[0]["rating"] == 5


def test_comment_is_optional(client, db, event):
    _me(db, event["id"])
    r = client.post(f"/events/{event['id']}/feedback", json={"rating": 4}, headers=ATTENDEE_AUTH)
    assert r.status_code == 201
    assert r.json()["comment"] is None


def test_blank_comment_becomes_none(client, db, event):
    _me(db, event["id"])
    r = client.post(f"/events/{event['id']}/feedback", json={"rating": 3, "comment": "   "}, headers=ATTENDEE_AUTH)
    assert r.json()["comment"] is None


def test_rating_out_of_range_rejected(client, db, event):
    _me(db, event["id"])
    assert client.post(f"/events/{event['id']}/feedback", json={"rating": 0}, headers=ATTENDEE_AUTH).status_code == 422
    assert client.post(f"/events/{event['id']}/feedback", json={"rating": 6}, headers=ATTENDEE_AUTH).status_code == 422


def test_resubmit_updates_not_duplicates(client, db, event):
    _me(db, event["id"])
    client.post(f"/events/{event['id']}/feedback", json={"rating": 2, "comment": "meh"}, headers=ATTENDEE_AUTH)
    r = client.post(f"/events/{event['id']}/feedback", json={"rating": 5, "comment": "actually great"}, headers=ATTENDEE_AUTH)
    assert r.status_code == 201

    rows = db.store.get("event_feedback", [])
    assert len(rows) == 1
    assert rows[0]["rating"] == 5
    assert rows[0]["comment"] == "actually great"


def test_my_feedback_reflects_submission_state(client, db, event):
    _me(db, event["id"])
    before = client.get(f"/events/{event['id']}/feedback/me", headers=ATTENDEE_AUTH).json()
    assert before == {"submitted": False, "rating": None, "comment": None}

    client.post(f"/events/{event['id']}/feedback", json={"rating": 4, "comment": "good time"}, headers=ATTENDEE_AUTH)

    after = client.get(f"/events/{event['id']}/feedback/me", headers=ATTENDEE_AUTH).json()
    assert after == {"submitted": True, "rating": 4, "comment": "good time"}
