"""Phase 6 — organizer-authored round agenda.

Covers: round_topics persistence + validation on create/update, the live snapshot
exposing them, and the round theme steering the icebreaker prompt (the topic isn't
just a label — it shapes the conversation).
"""

from app.icebreakers import engine, prompts
from app.icebreakers.provider import StubClient
from tests.conftest import (
    ATTENDEE_AUTH,
    ATTENDEE_USER_ID,
    AUTH,
    make_assignment,
    make_attendee,
    make_round,
)

EVENT_PAYLOAD = {
    "name": "Founder Meetup",
    "date": "2026-07-01",
    "time": "18:00:00",
    "location": "Hyderabad",
    "num_tables": 4,
    "seats_per_table": 4,
    "default_round_duration_seconds": 300,
}


# --- persistence + validation -------------------------------------------------


def test_create_event_persists_round_topics(client):
    payload = {**EVENT_PAYLOAD, "round_topics": ["Origins", "What you're building"]}
    r = client.post("/events", json=payload, headers=AUTH)
    assert r.status_code == 201
    assert r.json()["round_topics"] == ["Origins", "What you're building"]


def test_create_event_defaults_round_topics_to_empty(client):
    r = client.post("/events", json=EVENT_PAYLOAD, headers=AUTH)
    assert r.status_code == 201
    assert r.json()["round_topics"] == []


def test_round_topics_trimmed_and_trailing_blanks_dropped(client):
    # Interior blanks are kept (round 2 = default); trailing blanks are dropped.
    payload = {**EVENT_PAYLOAD, "round_topics": ["  Origins  ", "", "Bold opinions", "", "  "]}
    r = client.post("/events", json=payload, headers=AUTH)
    assert r.status_code == 201
    assert r.json()["round_topics"] == ["Origins", "", "Bold opinions"]


def test_round_topic_length_is_capped(client):
    long = "x" * 200
    r = client.post("/events", json={**EVENT_PAYLOAD, "round_topics": [long]}, headers=AUTH)
    assert r.status_code == 201
    assert len(r.json()["round_topics"][0]) == 80


def test_update_sets_then_preserves_then_clears_round_topics(client):
    created = client.post("/events", json=EVENT_PAYLOAD, headers=AUTH).json()
    eid = created["id"]

    # set
    r = client.patch(f"/events/{eid}", json={"round_topics": ["Origins", "Help wanted"]}, headers=AUTH)
    assert r.json()["round_topics"] == ["Origins", "Help wanted"]

    # omit → untouched (None is excluded from the update)
    r = client.patch(f"/events/{eid}", json={"location": "Bengaluru"}, headers=AUTH)
    assert r.json()["round_topics"] == ["Origins", "Help wanted"]

    # explicit [] → cleared back to defaults
    r = client.patch(f"/events/{eid}", json={"round_topics": []}, headers=AUTH)
    assert r.json()["round_topics"] == []


# --- live snapshot ------------------------------------------------------------


def test_live_snapshot_includes_round_topics(client, db, event):
    db.table("events").update({"round_topics": ["Origins", "Bold opinions"]}).eq(
        "id", event["id"]
    ).execute()
    make_attendee(db, event["id"], name="Asha", status="registered", user_id=ATTENDEE_USER_ID)

    r = client.get(f"/events/{event['id']}/live", headers=ATTENDEE_AUTH)
    assert r.status_code == 200
    assert r.json()["round_topics"] == ["Origins", "Bold opinions"]


def test_live_snapshot_round_topics_default_empty(client, db, event):
    make_attendee(db, event["id"], name="Asha", status="registered", user_id=ATTENDEE_USER_ID)
    r = client.get(f"/events/{event['id']}/live", headers=ATTENDEE_AUTH)
    assert r.json()["round_topics"] == []


# --- icebreaker theming -------------------------------------------------------


def test_build_user_prompt_embeds_theme():
    roster = [{"name": "Anita", "role": "Founder", "looking_for": "investors"}]
    prompt = prompts.build_user_prompt(roster, {}, "What you're building")
    assert "What you're building" in prompt
    assert "theme" in prompt.lower()


def test_build_user_prompt_without_theme_is_clean():
    roster = [{"name": "Anita", "role": "Founder", "looking_for": "investors"}]
    assert "theme" not in prompts.build_user_prompt(roster, {}, None).lower()


def test_round_theme_maps_round_number(db, event):
    db.table("events").update({"round_topics": ["Origins", "Bold opinions"]}).eq(
        "id", event["id"]
    ).execute()
    r1 = make_round(db, event["id"], round_number=1)
    r2 = make_round(db, event["id"], round_number=2)
    r3 = make_round(db, event["id"], round_number=3)  # past the agenda → no theme
    assert engine._round_theme(db, event["id"], r1["id"]) == "Origins"
    assert engine._round_theme(db, event["id"], r2["id"]) == "Bold opinions"
    assert engine._round_theme(db, event["id"], r3["id"]) is None


def test_round_theme_blank_entry_is_none(db, event):
    db.table("events").update({"round_topics": ["", "Bold opinions"]}).eq(
        "id", event["id"]
    ).execute()
    r1 = make_round(db, event["id"], round_number=1)
    assert engine._round_theme(db, event["id"], r1["id"]) is None


class _CaptureClient:
    """Stub that records the user prompt it was handed, then answers like StubClient."""

    def __init__(self):
        self.prompts: list[str] = []
        self._stub = StubClient()

    def complete(self, **kwargs):
        self.prompts.append(kwargs["user"])
        return self._stub.complete(**kwargs)


def test_generation_passes_round_theme_into_prompt(db, event):
    db.table("events").update({"round_topics": ["Origins", "What you're building"]}).eq(
        "id", event["id"]
    ).execute()
    rnd = make_round(db, event["id"], round_number=2, status="active")
    for name in ["Anita", "Bobby", "Charlie"]:
        a = make_attendee(db, event["id"], name=name, status="arrived")
        make_assignment(db, event["id"], rnd["id"], a["id"], table_number=1)

    capture = _CaptureClient()
    engine.generate_for_round(db, event["id"], rnd["id"], client=capture)

    assert capture.prompts, "the LLM client should have been called"
    assert all("What you're building" in p for p in capture.prompts)
