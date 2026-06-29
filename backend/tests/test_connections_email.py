"""Email-me-my-connections endpoint — self-only, clear errors, sends when configured."""

from tests.conftest import AUTH, ATTENDEE_AUTH, ATTENDEE_USER_ID, make_attendee, make_round

EMAIL = "/events/{eid}/attendees/{aid}/connections/email"


def _seat_together(db, eid):
    """Asha (the requester) + Ravi seated at the same table → one connection."""
    me = make_attendee(db, eid, name="Asha", status="arrived", user_id=ATTENDEE_USER_ID)
    other = make_attendee(db, eid, name="Ravi", status="arrived")
    rnd = make_round(db, eid, round_number=1, status="completed")
    for a in (me, other):
        db.seed("table_assignments", {"event_id": eid, "round_id": rnd["id"], "attendee_id": a["id"], "table_number": 1})
    return me, other


def test_email_requires_auth(client, db, event):
    me = make_attendee(db, event["id"], user_id=ATTENDEE_USER_ID)
    assert client.post(EMAIL.format(eid=event["id"], aid=me["id"])).status_code == 401


def test_email_self_only(client, db, event):
    eid = event["id"]
    make_attendee(db, eid, name="Asha", user_id=ATTENDEE_USER_ID)
    other = make_attendee(db, eid, name="Ravi")
    # Asha's token targeting Ravi's id → forbidden
    r = client.post(EMAIL.format(eid=eid, aid=other["id"]), headers=ATTENDEE_AUTH)
    assert r.status_code == 403


def test_email_no_connections_yet(client, db, event):
    eid = event["id"]
    me = make_attendee(db, eid, name="Asha", status="arrived", user_id=ATTENDEE_USER_ID)
    r = client.post(EMAIL.format(eid=eid, aid=me["id"]), headers=ATTENDEE_AUTH)
    assert r.status_code == 400  # nothing to email


def test_email_503_when_smtp_unconfigured(client, db, event):
    eid = event["id"]
    me, _ = _seat_together(db, eid)
    # tests run with no SMTP creds → send raises RuntimeError → 503
    r = client.post(EMAIL.format(eid=eid, aid=me["id"]), headers=ATTENDEE_AUTH)
    assert r.status_code == 503


def test_email_sends_when_configured(client, db, event, monkeypatch):
    eid = event["id"]
    me, _ = _seat_together(db, eid)
    captured: dict = {}

    def fake_send(to_email, event_name, people):
        captured["to"] = to_email
        captured["count"] = len(people)

    monkeypatch.setattr("app.routers.connections.send_connections_recap", fake_send)
    r = client.post(EMAIL.format(eid=eid, aid=me["id"]), headers=ATTENDEE_AUTH)
    assert r.status_code == 200 and r.json()["sent"] is True
    assert captured["to"] == "asha@test.local" and captured["count"] == 1
