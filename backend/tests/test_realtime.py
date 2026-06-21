"""Realtime doorbell (Supabase Broadcast) — the scaling fix for missed publishes.

The backend rings ONE broadcast per state change instead of relying on
postgres_changes row fan-out (which overran Realtime and silently dropped events,
so publishes sometimes never reached phones). These tests assert the doorbell
fires on every mutation, that its payload is signal-only (no PII), and that the
manual "Re-sync room" endpoint is owner-only. The HTTP send itself is stubbed by
the autouse `realtime_post` fixture (conftest), which captures the calls.
"""

from tests.conftest import (
    ATTENDEE_AUTH,
    AUTH,
    OTHER_AUTH,
    make_arrived,
)


def _kinds(calls) -> list[str]:
    return [c["json"]["messages"][0]["payload"]["kind"] for c in calls]


def test_publish_rings_doorbell_with_signal_only_payload(client, db, event, realtime_post):
    make_arrived(db, event["id"], 6)
    client.post(f"/events/{event['id']}/rounds/start", headers=AUTH)
    realtime_post.clear()  # the draft phase rings nothing; clear to be explicit

    resp = client.post(f"/events/{event['id']}/rounds/publish", headers=AUTH)
    assert resp.status_code == 201

    assert "publish" in _kinds(realtime_post)
    # Every doorbell targets THIS event's channel, is a "resync" signal, and
    # carries NO PII — just a kind tag. This is the privacy guarantee.
    for c in realtime_post:
        msg = c["json"]["messages"][0]
        assert msg["topic"] == f"live:{event['id']}"
        assert msg["event"] == "resync"
        assert set(msg["payload"].keys()) == {"kind"}  # no names / ids / seating


def test_round_lifecycle_rings_doorbell_each_step(client, db, event, realtime_post):
    make_arrived(db, event["id"], 6)
    client.post(f"/events/{event['id']}/rounds/start", headers=AUTH)
    client.post(f"/events/{event['id']}/rounds/publish", headers=AUTH)
    client.post(f"/events/{event['id']}/rounds/begin", headers=AUTH)
    client.post(f"/events/{event['id']}/rounds/pause", headers=AUTH)
    client.post(f"/events/{event['id']}/rounds/resume", headers=AUTH)
    client.post(f"/events/{event['id']}/rounds/extend", headers=AUTH, json={"seconds": 60})
    client.post(f"/events/{event['id']}/rounds/end", headers=AUTH)

    assert {"publish", "begin", "pause", "resume", "extend", "round_end"} <= set(_kinds(realtime_post))


def test_cancel_rings_doorbell(client, db, event, realtime_post):
    make_arrived(db, event["id"], 6)
    client.post(f"/events/{event['id']}/rounds/start", headers=AUTH)
    client.post(f"/events/{event['id']}/rounds/publish", headers=AUTH)
    realtime_post.clear()

    client.post(f"/events/{event['id']}/rounds/cancel", headers=AUTH)
    assert "cancel" in _kinds(realtime_post)


def test_event_end_rings_doorbell(client, event, realtime_post):
    realtime_post.clear()
    resp = client.post(f"/events/{event['id']}/end", headers=AUTH)
    assert resp.status_code == 200
    assert "event_end" in _kinds(realtime_post)


# --- manual "Re-sync room" endpoint: owner-only, server-sent ---

def test_resync_requires_auth(client, event):
    assert client.post(f"/events/{event['id']}/resync").status_code == 401


def test_resync_forbidden_for_attendee(client, event):
    assert client.post(f"/events/{event['id']}/resync", headers=ATTENDEE_AUTH).status_code == 403


def test_resync_forbidden_for_non_owner_organizer(client, event):
    assert client.post(f"/events/{event['id']}/resync", headers=OTHER_AUTH).status_code == 403


def test_resync_owner_fires_doorbell(client, event, realtime_post):
    realtime_post.clear()
    resp = client.post(f"/events/{event['id']}/resync", headers=AUTH)
    assert resp.status_code == 200
    assert resp.json() == {"queued": True}
    assert "manual" in _kinds(realtime_post)
