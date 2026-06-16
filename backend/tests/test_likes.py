from tests.conftest import (
    ATTENDEE_AUTH,
    ATTENDEE_USER_ID,
    OTHER_ATTENDEE_AUTH,
    OTHER_ATTENDEE_USER_ID,
    make_assignment,
    make_attendee,
    make_round,
)


def _like(client, event_id, target_id, headers):
    return client.post(
        f"/events/{event_id}/likes", json={"target_attendee_id": target_id}, headers=headers
    )


def test_like_and_unlike_idempotent(client, db, event):
    make_attendee(db, event["id"], name="Me", user_id=ATTENDEE_USER_ID)
    b = make_attendee(db, event["id"], name="B")

    first = _like(client, event["id"], b["id"], ATTENDEE_AUTH)
    assert first.status_code == 201
    assert first.json()["liked"] is True
    # liking again is a no-op, still liked
    assert _like(client, event["id"], b["id"], ATTENDEE_AUTH).json()["liked"] is True
    assert len(db.store["connection_likes"]) == 1

    unlike = client.delete(f"/events/{event['id']}/likes/{b['id']}", headers=ATTENDEE_AUTH)
    assert unlike.json()["liked"] is False
    assert db.store["connection_likes"] == []


def test_like_requires_registration(client, db, event):
    b = make_attendee(db, event["id"], name="B")
    # caller is not a registered attendee of this event
    assert _like(client, event["id"], b["id"], ATTENDEE_AUTH).status_code == 404


def test_cannot_like_self(client, db, event):
    me = make_attendee(db, event["id"], name="Me", user_id=ATTENDEE_USER_ID)
    assert _like(client, event["id"], me["id"], ATTENDEE_AUTH).status_code == 400


def test_like_unknown_target(client, db, event):
    make_attendee(db, event["id"], name="Me", user_id=ATTENDEE_USER_ID)
    missing = "00000000-0000-0000-0000-000000000000"
    assert _like(client, event["id"], missing, ATTENDEE_AUTH).status_code == 404


def test_mutual_like_is_a_match_in_connections(client, db, event):
    me = make_attendee(db, event["id"], name="Me", user_id=ATTENDEE_USER_ID)
    b = make_attendee(db, event["id"], name="B", user_id=OTHER_ATTENDEE_USER_ID)
    r1 = make_round(db, event["id"], round_number=1, status="completed")
    make_assignment(db, event["id"], r1["id"], me["id"], 1)
    make_assignment(db, event["id"], r1["id"], b["id"], 1)

    _like(client, event["id"], b["id"], ATTENDEE_AUTH)        # I like B
    _like(client, event["id"], me["id"], OTHER_ATTENDEE_AUTH)  # B likes me back

    body = client.get(
        f"/events/{event['id']}/attendees/{me['id']}/connections", headers=ATTENDEE_AUTH
    ).json()
    assert body["matches_count"] == 1
    entry = body["connections"][0]
    assert entry["liked"] is True
    assert entry["mutual"] is True


def test_one_sided_like_is_not_mutual(client, db, event):
    me = make_attendee(db, event["id"], name="Me", user_id=ATTENDEE_USER_ID)
    b = make_attendee(db, event["id"], name="B")
    r1 = make_round(db, event["id"], round_number=1, status="completed")
    make_assignment(db, event["id"], r1["id"], me["id"], 1)
    make_assignment(db, event["id"], r1["id"], b["id"], 1)

    _like(client, event["id"], b["id"], ATTENDEE_AUTH)

    body = client.get(
        f"/events/{event['id']}/attendees/{me['id']}/connections", headers=ATTENDEE_AUTH
    ).json()
    assert body["matches_count"] == 0
    assert body["connections"][0]["liked"] is True
    assert body["connections"][0]["mutual"] is False


def test_like_reflected_in_live_tablemates(client, db, event):
    me = make_attendee(db, event["id"], name="Me", status="arrived", user_id=ATTENDEE_USER_ID)
    b = make_attendee(db, event["id"], name="B", status="arrived")
    rnd = make_round(
        db, event["id"], round_number=1, status="active", started_at="2026-07-01T18:00:00+00:00"
    )
    make_assignment(db, event["id"], rnd["id"], me["id"], 1)
    make_assignment(db, event["id"], rnd["id"], b["id"], 1)

    _like(client, event["id"], b["id"], ATTENDEE_AUTH)

    live = client.get(f"/events/{event['id']}/live", headers=ATTENDEE_AUTH).json()
    mates = live["seat"]["tablemates"]
    assert len(mates) == 1
    assert mates[0]["liked"] is True
