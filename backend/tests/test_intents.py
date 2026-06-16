"""Phase 3a — meeting intents ("I want to meet X") + privacy + the at-table nudge."""

from tests.conftest import (
    AUTH,
    ATTENDEE_AUTH,
    ATTENDEE_USER_ID,
    OTHER_ATTENDEE_AUTH,
    OTHER_ATTENDEE_USER_ID,
    make_assignment,
    make_attendee,
    make_round,
)


def _me(db, event_id, **overrides):
    return make_attendee(db, event_id, name="Me", user_id=ATTENDEE_USER_ID, **overrides)


def _other(db, event_id, **overrides):
    return make_attendee(db, event_id, name="Other", user_id=OTHER_ATTENDEE_USER_ID, **overrides)


def _set(client, event_id, target_id, auth=ATTENDEE_AUTH):
    return client.post(
        f"/events/{event_id}/intents",
        json={"target_attendee_id": target_id},
        headers=auth,
    )


# ── setting picks ──────────────────────────────────────────────────────────

def test_set_intent_records_pick(client, db, event):
    me = _me(db, event["id"])
    target = make_attendee(db, event["id"], name="Target")
    r = _set(client, event["id"], target["id"])
    assert r.status_code == 201
    body = r.json()
    assert body == {"wants": True, "used": 1, "cap": 5}
    assert me  # registered


def test_set_intent_is_idempotent(client, db, event):
    _me(db, event["id"])
    target = make_attendee(db, event["id"], name="Target")
    _set(client, event["id"], target["id"])
    again = _set(client, event["id"], target["id"])
    assert again.status_code == 201
    assert again.json()["used"] == 1  # not double-counted


def test_set_intent_respects_cap(client, db, event):
    _me(db, event["id"])
    targets = [make_attendee(db, event["id"], name=f"T{i}") for i in range(6)]
    for t in targets[:5]:
        assert _set(client, event["id"], t["id"]).status_code == 201
    over = _set(client, event["id"], targets[5]["id"])
    assert over.status_code == 409
    assert "picks" in over.json()["detail"]


def test_cap_follows_target_rounds(client, db):
    ev = db.seed(
        "events",
        {
            "name": "Tiny", "date": "2026-07-01", "time": "18:00:00",
            "location": "HYD", "num_tables": 5, "seats_per_table": 4,
            "default_round_duration_seconds": 300, "auto_arrive_on_register": False,
            "organizer_id": "11111111-1111-1111-1111-111111111111",
            "status": "upcoming", "target_rounds": 2,
        },
    )[0]
    _me(db, ev["id"])
    targets = [make_attendee(db, ev["id"], name=f"T{i}") for i in range(3)]
    assert _set(client, ev["id"], targets[0]["id"]).json()["cap"] == 2
    _set(client, ev["id"], targets[1]["id"])
    over = _set(client, ev["id"], targets[2]["id"])
    assert over.status_code == 409


def test_cannot_pick_self(client, db, event):
    me = _me(db, event["id"])
    r = _set(client, event["id"], me["id"])
    assert r.status_code == 400


def test_cannot_pick_unknown(client, db, event):
    _me(db, event["id"])
    r = _set(client, event["id"], "99999999-9999-9999-9999-999999999999")
    assert r.status_code == 404


def test_cannot_pick_speaker(client, db, event):
    _me(db, event["id"])
    speaker = make_attendee(db, event["id"], name="Keynote", tag="speaker")
    r = _set(client, event["id"], speaker["id"])
    assert r.status_code == 400
    assert "rotation" in r.json()["detail"].lower()


def test_cannot_pick_host(client, db, event):
    _me(db, event["id"])
    host = make_attendee(db, event["id"], name="Host", tag="host")
    assert _set(client, event["id"], host["id"]).status_code == 400


def test_set_requires_registration(client, db, event):
    target = make_attendee(db, event["id"], name="Target")
    r = _set(client, event["id"], target["id"])  # caller has no attendee row
    assert r.status_code == 404


def test_set_requires_auth(client, db, event):
    target = make_attendee(db, event["id"], name="Target")
    r = client.post(
        f"/events/{event['id']}/intents",
        json={"target_attendee_id": target["id"]},
    )
    assert r.status_code == 401


def test_cannot_pick_after_event_ended(client, db, event):
    db.table("events").update({"status": "ended"}).eq("id", event["id"]).execute()
    _me(db, event["id"])
    target = make_attendee(db, event["id"], name="Target")
    r = _set(client, event["id"], target["id"])
    assert r.status_code == 409


# ── clearing picks ─────────────────────────────────────────────────────────

def test_clear_intent(client, db, event):
    _me(db, event["id"])
    target = make_attendee(db, event["id"], name="Target")
    _set(client, event["id"], target["id"])
    r = client.delete(f"/events/{event['id']}/intents/{target['id']}", headers=ATTENDEE_AUTH)
    assert r.status_code == 200
    assert r.json() == {"wants": False, "used": 0, "cap": 5}


def test_clear_is_idempotent(client, db, event):
    _me(db, event["id"])
    target = make_attendee(db, event["id"], name="Target")
    r = client.delete(f"/events/{event['id']}/intents/{target['id']}", headers=ATTENDEE_AUTH)
    assert r.status_code == 200
    assert r.json()["used"] == 0


# ── my picks (privacy) ─────────────────────────────────────────────────────

def test_my_intents_lists_only_my_picks(client, db, event):
    _me(db, event["id"])
    other = _other(db, event["id"])
    t1 = make_attendee(db, event["id"], name="T1")
    t2 = make_attendee(db, event["id"], name="T2")
    _set(client, event["id"], t1["id"])
    # the OTHER attendee picks t2 — must not leak into my view
    _set(client, event["id"], t2["id"], auth=OTHER_ATTENDEE_AUTH)

    r = client.get(f"/events/{event['id']}/intents/me", headers=ATTENDEE_AUTH)
    assert r.status_code == 200
    body = r.json()
    assert body["used"] == 1
    assert body["cap"] == 5
    assert body["target_ids"] == [str(t1["id"])]
    assert other  # the other attendee exists but their pick is invisible to me


# ── matches (mutual-only, post-event reveal) ───────────────────────────────

def test_matches_hidden_until_event_ends(client, db, event):
    _me(db, event["id"])
    r = client.get(f"/events/{event['id']}/intents/matches", headers=ATTENDEE_AUTH)
    assert r.status_code == 409


def test_matches_reveal_mutual_only(client, db, event):
    me = _me(db, event["id"])
    other = _other(db, event["id"])
    oneway = make_attendee(db, event["id"], name="Oneway")

    # mutual: me <-> other ; one-way: me -> oneway (no reciprocation)
    _set(client, event["id"], other["id"])
    _set(client, event["id"], oneway["id"])
    # other picks me back → the only mutual pair
    client.post(
        f"/events/{event['id']}/intents",
        json={"target_attendee_id": str(me["id"])},
        headers=OTHER_ATTENDEE_AUTH,
    )

    db.table("events").update({"status": "ended"}).eq("id", event["id"]).execute()
    r = client.get(f"/events/{event['id']}/intents/matches", headers=ATTENDEE_AUTH)
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 1
    ids = {m["attendee_id"] for m in body["matches"]}
    assert str(other["id"]) in ids
    assert str(oneway["id"]) not in ids  # one-way interest is never revealed


def test_oneway_target_sees_no_match(client, db, event):
    """The person I picked one-way must NOT see me as a match (privacy)."""
    me = _me(db, event["id"])
    oneway = _other(db, event["id"])  # I pick them, they don't pick back
    _set(client, event["id"], oneway["id"])
    db.table("events").update({"status": "ended"}).eq("id", event["id"]).execute()

    r = client.get(f"/events/{event['id']}/intents/matches", headers=OTHER_ATTENDEE_AUTH)
    assert r.status_code == 200
    assert r.json()["count"] == 0
    assert me  # exists, but the one-way liker is never disclosed


# ── directory integration ──────────────────────────────────────────────────

def test_directory_marks_my_picks(client, db, event):
    _me(db, event["id"])
    picked = make_attendee(db, event["id"], name="Picked")
    unpicked = make_attendee(db, event["id"], name="Unpicked")
    _set(client, event["id"], picked["id"])

    r = client.get(f"/events/{event['id']}/directory", headers=ATTENDEE_AUTH)
    assert r.status_code == 200
    body = r.json()
    assert body["my_intents_used"] == 1
    assert body["my_intents_cap"] == 5
    by_id = {e["attendee_id"]: e for e in body["attendees"]}
    assert by_id[str(picked["id"])]["wanted_by_me"] is True
    assert by_id[str(unpicked["id"])]["wanted_by_me"] is False


def test_directory_hides_picks_for_organizer(client, db, event):
    """An organizer previewing the list isn't an attendee → cap 0 (no pick UI)."""
    make_attendee(db, event["id"], name="Someone")
    r = client.get(f"/events/{event['id']}/directory", headers=AUTH)
    assert r.status_code == 200
    assert r.json()["my_intents_cap"] == 0


# ── the at-table nudge (live state) ────────────────────────────────────────

def test_live_state_flags_wanted_tablemate(client, db, event):
    me = _me(db, event["id"], status="arrived")
    mate = make_attendee(db, event["id"], name="Mate", status="arrived")
    stranger = make_attendee(db, event["id"], name="Stranger", status="arrived")
    _set(client, event["id"], mate["id"])  # I picked my tablemate pre-event

    rnd = make_round(db, event["id"], round_number=1, status="active")
    make_assignment(db, event["id"], rnd["id"], str(me["id"]), 1)
    make_assignment(db, event["id"], rnd["id"], str(mate["id"]), 1)
    make_assignment(db, event["id"], rnd["id"], str(stranger["id"]), 1)

    r = client.get(f"/events/{event['id']}/live", headers=ATTENDEE_AUTH)
    assert r.status_code == 200
    mates = {m["attendee_id"]: m for m in r.json()["seat"]["tablemates"]}
    assert mates[str(mate["id"])]["wanted"] is True
    assert mates[str(stranger["id"])]["wanted"] is False


def test_nudge_is_one_sided(client, db, event):
    """If I pick someone, THEY don't get a nudge about me (one-sided privacy)."""
    me = _me(db, event["id"], status="arrived")
    mate = make_attendee(db, event["id"], name="Mate", status="arrived",
                         user_id=OTHER_ATTENDEE_USER_ID)
    _set(client, event["id"], mate["id"])  # I pick them, not vice-versa

    rnd = make_round(db, event["id"], round_number=1, status="active")
    make_assignment(db, event["id"], rnd["id"], str(me["id"]), 1)
    make_assignment(db, event["id"], rnd["id"], str(mate["id"]), 1)

    # the mate's own live state must NOT show me as 'wanted'
    r = client.get(f"/events/{event['id']}/live", headers=OTHER_ATTENDEE_AUTH)
    assert r.status_code == 200
    mates = {m["attendee_id"]: m for m in r.json()["seat"]["tablemates"]}
    assert mates[str(me["id"])]["wanted"] is False
