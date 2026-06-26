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


def test_roster_counts_only_checked_in_not_registered(client, db, event):
    """"N in the room" must be people who CHECKED IN (arrived), not everyone who
    registered — the post-pilot fix. Registered-but-not-arrived people aren't here
    yet and must not inflate the count."""
    _me(db, event["id"], status="arrived")
    make_attendee(db, event["id"], name="Here", status="arrived")
    # Two registered no-shows that must NOT be counted as "in the room".
    make_attendee(db, event["id"], name="NoShow1", status="registered")
    make_attendee(db, event["id"], name="NoShow2", status="registered")

    body = client.get(f"/events/{event['id']}/live", headers=ATTENDEE_AUTH).json()
    assert body["roster"]["count"] == 2  # me + Here, not the 2 registered no-shows
    names = {p["name"] for p in body["roster"]["preview"]}
    assert "NoShow1" not in names and "NoShow2" not in names
    # But the pre-event headline ("N signed up") DOES include them — they're
    # registered, just not physically checked in yet.
    assert body["roster"]["registered_count"] == 4


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


def test_live_between_rounds_surfaces_recent_table(client, db, event):
    """Between rounds, the table you just left comes back (recent_seat) so you can
    still ❤️/note the people you met before the next round whisks them away."""
    me = _me(db, event["id"])
    mate = make_attendee(db, event["id"], name="Bobby", status="arrived")
    other = make_attendee(db, event["id"], name="FarAway", status="arrived")
    rnd = make_round(
        db, event["id"], round_number=1, status="completed",
        ended_at="2026-07-01T18:30:00+00:00",
    )
    make_assignment(db, event["id"], rnd["id"], me["id"], table_number=4)
    make_assignment(db, event["id"], rnd["id"], mate["id"], table_number=4)
    make_assignment(db, event["id"], rnd["id"], other["id"], table_number=9)

    body = client.get(f"/events/{event['id']}/live", headers=ATTENDEE_AUTH).json()
    assert body["phase"] == "between_rounds"
    assert body["recent_round_number"] == 1
    assert body["recent_seat"]["table_number"] == 4
    names = [m["name"] for m in body["recent_seat"]["tablemates"]]
    assert names == ["Bobby"]  # self + the person at table 9 excluded


def test_live_between_rounds_no_recent_seat_when_unseated(client, db, event):
    """A late arrival who never had a table that round gets no recent_seat."""
    _me(db, event["id"])
    seated = make_attendee(db, event["id"], name="Bobby", status="arrived")
    rnd = make_round(
        db, event["id"], round_number=1, status="completed",
        ended_at="2026-07-01T18:30:00+00:00",
    )
    make_assignment(db, event["id"], rnd["id"], seated["id"], table_number=1)

    body = client.get(f"/events/{event['id']}/live", headers=ATTENDEE_AUTH).json()
    assert body["phase"] == "between_rounds"
    assert body["recent_seat"] is None


def test_live_ended(client, db, event):
    db.table("events").update({"status": "ended"}).eq("id", event["id"]).execute()
    _me(db, event["id"])
    make_round(db, event["id"], round_number=1, status="completed")
    r = client.get(f"/events/{event['id']}/live", headers=ATTENDEE_AUTH)
    body = r.json()
    assert body["phase"] == "ended"
    assert body["event_status"] == "ended"


# --- privacy: realtime path never carries contact PII ---


def test_live_payload_includes_tablemate_contact_links(client, db, event):
    """Tablemates' public professional links (LinkedIn/website) surface live, so
    you can look someone up while seated with them — but never a phone or email
    (those still only exist on the post-event rolodex, never the live path)."""
    me = _me(db, event["id"])
    mate = make_attendee(
        db, event["id"], name="Bobby", status="arrived",
        website_url="https://bobby.dev", linkedin_url="https://linkedin.com/in/bobby",
    )
    rnd = make_round(db, event["id"], round_number=1, status="active")
    make_assignment(db, event["id"], rnd["id"], me["id"], table_number=1)
    make_assignment(db, event["id"], rnd["id"], mate["id"], table_number=1)

    r = client.get(f"/events/{event['id']}/live", headers=ATTENDEE_AUTH)
    tablemate = r.json()["seat"]["tablemates"][0]
    assert tablemate["website_url"] == "https://bobby.dev"
    assert tablemate["linkedin_url"] == "https://linkedin.com/in/bobby"


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


# --- resilience: one malformed row must never 500 the whole room's snapshot ---
# Regression for the live-event failure where /live returned 500 for EVERY attendee
# in a round: the snapshot is built in a shared path, so a single bad row (null
# name/role, malformed icebreaker) used to take the entire room dark. It must now
# degrade gracefully — coerce/skip the bad row and still return 200.


def test_live_survives_null_name_in_roster(client, db, event):
    """An arrived attendee with a NULL name must not 500 the room — the roster
    coerces it to a placeholder so every other phone still gets its snapshot."""
    _me(db, event["id"], status="arrived")
    make_attendee(db, event["id"], name=None, status="arrived")  # corrupt row

    r = client.get(f"/events/{event['id']}/live", headers=ATTENDEE_AUTH)
    assert r.status_code == 200
    body = r.json()
    assert body["roster"]["count"] == 2  # both arrived still counted
    # The bad row is coerced, not dropped from the count, and never crashes.
    assert all(p["name"] for p in body["roster"]["preview"])


def test_live_survives_null_role_tablemate(client, db, event):
    """A tablemate row with a NULL role must not 500 the seat for everyone at the
    table — it's coerced so the seated attendee still gets their table."""
    me = _me(db, event["id"])
    bad = make_attendee(db, event["id"], name="Bobby", role=None, status="arrived")  # corrupt
    rnd = make_round(db, event["id"], round_number=4, status="active")
    make_assignment(db, event["id"], rnd["id"], me["id"], table_number=1)
    make_assignment(db, event["id"], rnd["id"], bad["id"], table_number=1)

    r = client.get(f"/events/{event['id']}/live", headers=ATTENDEE_AUTH)
    assert r.status_code == 200
    body = r.json()
    assert body["seated"] is True
    assert body["seat"]["table_number"] == 1
    mate = body["seat"]["tablemates"][0]
    assert mate["name"] == "Bobby"
    assert mate["role"] == ""  # coerced from null, schema stays happy


def test_live_survives_malformed_icebreaker(client, db, event):
    """A malformed icebreaker (null target) degrades to no-icebreaker, never a 500
    — the table matters far more than the question."""
    me = _me(db, event["id"])
    mate = make_attendee(db, event["id"], name="Bobby", status="arrived")
    rnd = make_round(db, event["id"], round_number=4, status="active")
    make_assignment(db, event["id"], rnd["id"], me["id"], table_number=1)
    make_assignment(db, event["id"], rnd["id"], mate["id"], table_number=1)
    db.seed("icebreakers", {
        "round_id": rnd["id"],
        "table_number": 1,
        "recipient_attendee_id": me["id"],
        "target_attendee_id": None,  # corrupt — must not crash the seat
        "question_text": "Ask Bobby about scaling.",
    })

    r = client.get(f"/events/{event['id']}/live", headers=ATTENDEE_AUTH)
    assert r.status_code == 200
    body = r.json()
    assert body["seat"]["table_number"] == 1
    assert body["icebreaker"] is None  # degraded, room still works


def test_live_survives_null_duration_round(client, db, event):
    """A round row with a NULL/garbage duration must not 500 the in-round snapshot
    — duration coerces to 0 and the phone still learns a round is live."""
    me = _me(db, event["id"])
    rnd = make_round(db, event["id"], round_number=4, status="active", duration_seconds=None)
    make_assignment(db, event["id"], rnd["id"], me["id"], table_number=1)

    r = client.get(f"/events/{event['id']}/live", headers=ATTENDEE_AUTH)
    assert r.status_code == 200
    body = r.json()
    assert body["phase"] == "in_round"
    assert body["round"]["round_number"] == 4
    assert body["round"]["duration_seconds"] == 0


# --- the timer-start 500: robust timestamp parsing (Python 3.10 fromisoformat) ---
# Postgres trims trailing zeros on fractional seconds and can emit a '+00' offset,
# both of which 3.10's strict datetime.fromisoformat rejects — which 500'd /live the
# instant a round's started_at was set. _parse_iso must handle every real format.


def test_parse_iso_handles_postgres_timestamp_formats():
    from datetime import datetime, timezone

    from app.routers.live import _parse_iso

    want = datetime(2026, 7, 1, 18, 0, 0, tzinfo=timezone.utc)
    # All of these are shapes Postgres/Supabase actually returns for a timestamptz.
    for raw in (
        "2026-07-01T18:00:00+00:00",      # clean (the only one tests used before)
        "2026-07-01T18:00:00Z",            # Z suffix
        "2026-07-01T18:00:00+00",          # offset without minutes (3.10 rejects)
        "2026-07-01T18:00:00.000000+00:00",
    ):
        got = _parse_iso(raw)
        assert got == want, raw
        assert got.tzinfo is not None, raw

    # Trailing-zero-trimmed fractions (the common live case) must parse, not raise.
    assert _parse_iso("2026-07-01T18:00:00.1+00:00").microsecond == 100000
    assert _parse_iso("2026-07-01T18:00:00.5+00").microsecond == 500000
    assert _parse_iso("2026-07-01T18:00:00.123456+00:00").microsecond == 123456


def test_live_timer_start_with_realistic_timestamp_does_not_500(client, db, event):
    """Regression for the live-event failure: starting the timer set started_at to a
    real timestamp (trimmed fraction + offset) and GET /live 500'd for everyone the
    moment the round became running. It must return 200 with a correct ends_at."""
    _me(db, event["id"])
    # started_at exactly as Postgres hands it back: one fractional digit, '+00:00'.
    # round_payload (and its ends_at) is built whether or not I'm seated, so this is
    # the minimal repro — no assignment needed.
    make_round(
        db, event["id"], round_number=1, status="active",
        started_at="2026-07-01T18:00:00.1+00:00",
    )

    r = client.get(f"/events/{event['id']}/live", headers=ATTENDEE_AUTH)
    assert r.status_code == 200
    rnd = r.json()["round"]
    assert rnd["started_at"] is not None
    # ends_at = started_at + duration(300) = 18:05:00 — the countdown the phone needs.
    assert rnd["ends_at"].startswith("2026-07-01T18:05:00")


def test_live_resolves_attendee_from_jwt_not_url(client, db, event):
    """No attendee id in the URL: the signed-in user only ever sees their own
    state, even when other attendees exist on the same event (no IDOR surface)."""
    me = _me(db, event["id"])
    make_attendee(db, event["id"], name="SomeoneElse", status="arrived")
    r = client.get(f"/events/{event['id']}/live", headers=ATTENDEE_AUTH)
    assert r.json()["attendee_id"] == str(me["id"])
