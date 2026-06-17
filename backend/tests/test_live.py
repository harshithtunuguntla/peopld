"""Live Dashboard recovery endpoint tests — GET /events/:id/live (Step 5).

This is the REQ-RT-01 guaranteed-recovery path: one authoritative snapshot for
the signed-in attendee, covering every phase the phone can land in (on load,
reconnect, wake-from-sleep). Realtime is best-effort; this endpoint is truth.
"""

from datetime import datetime, timedelta

from tests.conftest import (
    ATTENDEE_AUTH,
    ATTENDEE_USER_ID,
    AUTH,
    make_assignment,
    make_attendee,
    make_round,
)


def _me(db, event_id, **overrides) -> dict:
    """The signed-in attendee (attendee-token -> ATTENDEE_USER_ID)."""
    defaults = {"name": "Asha", "status": "arrived", "user_id": ATTENDEE_USER_ID}
    defaults.update(overrides)
    return make_attendee(db, event_id, **defaults)


# --- auth + registration gating ---


def test_live_requires_auth(client, event):
    assert client.get(f"/events/{event['id']}/live").status_code == 401


def test_live_not_registered_returns_404(client, db, event):
    # Authenticated, but this user has no attendee row for the event.
    r = client.get(f"/events/{event['id']}/live", headers=ATTENDEE_AUTH)
    assert r.status_code == 404
    assert "Not registered" in r.json()["detail"]


def test_live_unknown_event_404(client):
    r = client.get("/events/00000000-0000-0000-0000-000000000000/live", headers=ATTENDEE_AUTH)
    assert r.status_code == 404


# --- phases ---


def test_live_not_started(client, db, event):
    _me(db, event["id"], status="registered")
    r = client.get(f"/events/{event['id']}/live", headers=ATTENDEE_AUTH)
    assert r.status_code == 200
    body = r.json()
    assert body["phase"] == "not_started"
    assert body["event_status"] == "upcoming"
    assert body["seated"] is False
    assert body["round"] is None
    assert body["seat"] is None
    assert body["server_time"] is not None  # clock-skew anchor always present


def test_live_in_round_seated_with_tablemates(client, db, event):
    me = _me(db, event["id"])
    mate1 = make_attendee(db, event["id"], name="Bobby", status="arrived")
    mate2 = make_attendee(db, event["id"], name="Anita", status="arrived")
    elsewhere = make_attendee(db, event["id"], name="FarAway", status="arrived")
    rnd = make_round(db, event["id"], round_number=3, status="active")
    make_assignment(db, event["id"], rnd["id"], me["id"], table_number=6)
    make_assignment(db, event["id"], rnd["id"], mate1["id"], table_number=6)
    make_assignment(db, event["id"], rnd["id"], mate2["id"], table_number=6)
    make_assignment(db, event["id"], rnd["id"], elsewhere["id"], table_number=2)

    r = client.get(f"/events/{event['id']}/live", headers=ATTENDEE_AUTH)
    assert r.status_code == 200
    body = r.json()
    assert body["phase"] == "in_round"
    assert body["seated"] is True
    assert body["seat"]["table_number"] == 6
    assert body["round"]["round_number"] == 3
    assert body["round"]["duration_seconds"] == 300
    assert body["round"]["started_at"] is not None
    assert body["round"]["ends_at"] is not None  # started_at + duration, for the countdown

    names = [m["name"] for m in body["seat"]["tablemates"]]
    assert names == ["Anita", "Bobby"]  # self excluded, sorted, person at table 2 excluded
    assert all("role" in m for m in body["seat"]["tablemates"])


def test_live_seat_prefills_my_note_about_tablemate(client, db, event):
    """A private note I authored about a tablemate pre-fills in the live seat
    payload (so the at-table note editor opens with what I already wrote), and
    tablemates I haven't noted carry note=None."""
    me = _me(db, event["id"])
    noted = make_attendee(db, event["id"], name="Anita", status="arrived")
    blank = make_attendee(db, event["id"], name="Bobby", status="arrived")
    rnd = make_round(db, event["id"], round_number=1, status="active")
    make_assignment(db, event["id"], rnd["id"], me["id"], table_number=4)
    make_assignment(db, event["id"], rnd["id"], noted["id"], table_number=4)
    make_assignment(db, event["id"], rnd["id"], blank["id"], table_number=4)
    db.seed(
        "connection_notes",
        {
            "event_id": event["id"],
            "author_attendee_id": me["id"],
            "target_attendee_id": noted["id"],
            "note": "intro re: hiring",
        },
    )

    body = client.get(f"/events/{event['id']}/live", headers=ATTENDEE_AUTH).json()
    by_name = {m["name"]: m for m in body["seat"]["tablemates"]}
    assert by_name["Anita"]["note"] == "intro re: hiring"
    assert by_name["Bobby"]["note"] is None


def test_live_seat_note_is_author_private(client, db, event):
    """Someone ELSE's note about my tablemate must never leak into my snapshot."""
    me = _me(db, event["id"])
    mate = make_attendee(db, event["id"], name="Anita", status="arrived")
    other = make_attendee(db, event["id"], name="Stranger", status="arrived")
    rnd = make_round(db, event["id"], round_number=1, status="active")
    make_assignment(db, event["id"], rnd["id"], me["id"], table_number=4)
    make_assignment(db, event["id"], rnd["id"], mate["id"], table_number=4)
    # `other` wrote a note about my tablemate — not mine, must not appear.
    db.seed(
        "connection_notes",
        {
            "event_id": event["id"],
            "author_attendee_id": other["id"],
            "target_attendee_id": mate["id"],
            "note": "secret",
        },
    )

    body = client.get(f"/events/{event['id']}/live", headers=ATTENDEE_AUTH).json()
    assert body["seat"]["tablemates"][0]["note"] is None


def test_live_round_paused_shifts_ends_at_and_reports_paused(client, db, event):
    """A paused round banks time into the effective end and tells the phone it's
    paused, so the attendee countdown freezes (migration 008)."""
    _me(db, event["id"])
    make_round(
        db, event["id"], round_number=1, status="active",
        started_at="2026-07-01T18:00:00+00:00",
        paused_at="2026-07-01T18:02:00+00:00",
        total_paused_seconds=120,
    )
    r = client.get(f"/events/{event['id']}/live", headers=ATTENDEE_AUTH)
    assert r.status_code == 200
    rnd = r.json()["round"]
    # ends_at = started_at + duration(300) + total_paused(120) = 18:07:00
    assert rnd["ends_at"].startswith("2026-07-01T18:07:00")
    assert rnd["paused_at"] is not None


def test_live_in_round_not_seated(client, db, event):
    """Late arrival: a round is live but this attendee has no table yet."""
    _me(db, event["id"], status="arrived")
    rnd = make_round(db, event["id"], round_number=2, status="active")
    other = make_attendee(db, event["id"], name="Seated", status="arrived")
    make_assignment(db, event["id"], rnd["id"], other["id"], table_number=1)

    r = client.get(f"/events/{event['id']}/live", headers=ATTENDEE_AUTH)
    body = r.json()
    assert body["phase"] == "in_round"
    assert body["seated"] is False
    assert body["seat"] is None
    assert body["round"]["round_number"] == 2  # phone still knows a round is running
    # A normal attendee here is a late arrival → the "next round is yours" screen,
    # so the tag must read 'attendee' (the default when no tag is set).
    assert body["attendee_tag"] == "attendee"


def test_live_guest_in_round_carries_tag_not_attendee(client, db, event):
    """A speaker/host is in the room during a round but deliberately never seated.
    The snapshot must surface their tag so the phone shows the guest message
    ("you're not in the rotation") instead of falsely promising a seat next round."""
    _me(db, event["id"], status="arrived", tag="speaker")
    rnd = make_round(db, event["id"], round_number=2, status="active")
    other = make_attendee(db, event["id"], name="Seated", status="arrived")
    make_assignment(db, event["id"], rnd["id"], other["id"], table_number=1)

    body = client.get(f"/events/{event['id']}/live", headers=ATTENDEE_AUTH).json()
    assert body["phase"] == "in_round"
    assert body["seated"] is False
    assert body["attendee_tag"] == "speaker"


def test_live_left_attendee_reports_status_for_recheckin(client, db, event):
    """An attendee marked 'left' still gets an authoritative snapshot (not a 404),
    so the phone can offer the room-code screen again to rejoin the rotation."""
    _me(db, event["id"], status="left")
    make_round(db, event["id"], round_number=1, status="active")

    r = client.get(f"/events/{event['id']}/live", headers=ATTENDEE_AUTH)
    assert r.status_code == 200
    body = r.json()
    assert body["attendee_status"] == "left"
    assert body["seated"] is False  # never seated while 'left'


def test_live_between_rounds(client, db, event):
    _me(db, event["id"])
    make_round(db, event["id"], round_number=1, status="completed")
    r = client.get(f"/events/{event['id']}/live", headers=ATTENDEE_AUTH)
    body = r.json()
    assert body["phase"] == "between_rounds"
    assert body["seated"] is False
    assert body["round"] is None


def test_live_ended(client, db, event):
    db.table("events").update({"status": "ended"}).eq("id", event["id"]).execute()
    _me(db, event["id"])
    make_round(db, event["id"], round_number=1, status="completed")
    r = client.get(f"/events/{event['id']}/live", headers=ATTENDEE_AUTH)
    body = r.json()
    assert body["phase"] == "ended"
    assert body["event_status"] == "ended"


# --- privacy: realtime path never carries contact PII ---


def test_live_payload_has_no_contact_pii(client, db, event):
    me = _me(db, event["id"])
    mate = make_attendee(
        db, event["id"], name="Bobby", status="arrived",
        website_url="https://bobby.dev", linkedin_url="https://linkedin.com/in/bobby",
    )
    rnd = make_round(db, event["id"], round_number=1, status="active")
    make_assignment(db, event["id"], rnd["id"], me["id"], table_number=1)
    make_assignment(db, event["id"], rnd["id"], mate["id"], table_number=1)

    r = client.get(f"/events/{event['id']}/live", headers=ATTENDEE_AUTH)
    raw = r.text
    # Tablemate name/role are shown; contact details are NOT (rolodex only).
    assert "Bobby" in raw
    assert "bobby.dev" not in raw.lower()
    assert "linkedin" not in raw.lower()


# --- icebreaker hook (Step 6) ---


def test_live_includes_icebreaker_when_present(client, db, event):
    me = _me(db, event["id"])
    mate = make_attendee(db, event["id"], name="Bobby", status="arrived")
    rnd = make_round(db, event["id"], round_number=1, status="active")
    make_assignment(db, event["id"], rnd["id"], me["id"], table_number=1)
    make_assignment(db, event["id"], rnd["id"], mate["id"], table_number=1)
    db.seed("icebreakers", {
        "round_id": rnd["id"],
        "table_number": 1,
        "recipient_attendee_id": me["id"],
        "target_attendee_id": mate["id"],
        "question_text": "Ask Bobby about scaling his team.",
    })

    r = client.get(f"/events/{event['id']}/live", headers=ATTENDEE_AUTH)
    body = r.json()
    assert body["icebreaker"]["question_text"] == "Ask Bobby about scaling his team."
    assert body["icebreaker"]["target_attendee_id"] == str(mate["id"])


def test_live_no_icebreaker_yet_is_null(client, db, event):
    """Table shows instantly; icebreaker is async, so null until generated."""
    me = _me(db, event["id"])
    mate = make_attendee(db, event["id"], name="Bobby", status="arrived")
    rnd = make_round(db, event["id"], round_number=1, status="active")
    make_assignment(db, event["id"], rnd["id"], me["id"], table_number=1)
    make_assignment(db, event["id"], rnd["id"], mate["id"], table_number=1)

    r = client.get(f"/events/{event['id']}/live", headers=ATTENDEE_AUTH)
    assert r.json()["icebreaker"] is None


# --- multi-device convergence + clock-skew + rollback recovery (review round 2) ---


def test_live_multi_device_convergence(client, db, event):
    """Same attendee on phone + laptop + a second tab: every device fetches /live
    and gets the identical authoritative view (server is the single source)."""
    me = _me(db, event["id"])
    rnd = make_round(db, event["id"], round_number=1, status="active")
    make_assignment(db, event["id"], rnd["id"], me["id"], table_number=4)

    a = client.get(f"/events/{event['id']}/live", headers=ATTENDEE_AUTH).json()
    b = client.get(f"/events/{event['id']}/live", headers=ATTENDEE_AUTH).json()
    a.pop("server_time")  # only field that legitimately differs between calls
    b.pop("server_time")
    assert a == b
    assert a["seat"]["table_number"] == 4


def test_live_timestamps_absolute_for_clock_skew(client, db, event):
    """Countdown survives an insanely-wrong device clock: the server returns
    absolute timestamps, so a phone only needs its own skew vs server_time —
    it never has to trust its local wall clock for when the round ends."""
    me = _me(db, event["id"])
    rnd = make_round(db, event["id"], round_number=1, status="active")  # dur 300
    make_assignment(db, event["id"], rnd["id"], me["id"], table_number=1)

    body = client.get(f"/events/{event['id']}/live", headers=ATTENDEE_AUTH).json()
    started = datetime.fromisoformat(body["round"]["started_at"].replace("Z", "+00:00"))
    ends = datetime.fromisoformat(body["round"]["ends_at"].replace("Z", "+00:00"))
    assert ends - started == timedelta(seconds=300)
    assert body["server_time"] is not None


def test_live_after_cancel_returns_to_between_rounds(client, db, event):
    """REQ-RT-02: organizer cancels the active round; the attendee's next /live
    fetch (triggered by the realtime doorbell) shows between-rounds, not a stale
    table. No client-side stale-event logic needed — the server is authoritative."""
    me = _me(db, event["id"])
    for n in (1, 2, 3):
        make_round(db, event["id"], round_number=n, status="completed")
    rnd = make_round(db, event["id"], round_number=4, status="active")
    make_assignment(db, event["id"], rnd["id"], me["id"], table_number=2)

    assert client.post(f"/events/{event['id']}/rounds/cancel", headers=AUTH).status_code == 200
    body = client.get(f"/events/{event['id']}/live", headers=ATTENDEE_AUTH).json()
    assert body["phase"] == "between_rounds"
    assert body["seated"] is False
    assert body["seat"] is None


def test_live_resolves_attendee_from_jwt_not_url(client, db, event):
    """No attendee id in the URL: the signed-in user only ever sees their own
    state, even when other attendees exist on the same event (no IDOR surface)."""
    me = _me(db, event["id"])
    make_attendee(db, event["id"], name="SomeoneElse", status="arrived")
    r = client.get(f"/events/{event['id']}/live", headers=ATTENDEE_AUTH)
    assert r.json()["attendee_id"] == str(me["id"])
