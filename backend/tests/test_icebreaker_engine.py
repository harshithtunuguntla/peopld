"""Icebreaker engine — generation, parsing/fallback, idempotency, audit, PII.

These exercise app.icebreakers.engine directly with injected fake LLM clients, so
the real parse -> validate -> index-map -> persist path runs with no network.
"""

import json

from app.icebreakers import engine, prompts
from app.icebreakers.engine import MAX_QUESTION_LEN
from app.icebreakers.provider import DisabledClient, StubClient
from tests.conftest import (
    ATTENDEE_AUTH,
    ATTENDEE_USER_ID,
    AUTH,
    audit_actions,
    make_attendee,
    make_assignment,
    make_round,
)


class _JsonClient:
    """Returns a fixed JSON array regardless of the prompt."""

    def __init__(self, payload):
        self._payload = payload

    def complete(self, **_):
        return json.dumps(self._payload)


class _MalformedClient:
    def complete(self, **_):
        return "Sure! Here are your icebreakers: (not json)"


def _seat_table(db, event_id, round_id, names, table_number=1, **overrides):
    attendees = []
    for name in names:
        a = make_attendee(db, event_id, name=name, status="arrived", **overrides)
        make_assignment(db, event_id, round_id, a["id"], table_number)
        attendees.append(a)
    return attendees


def _icebreakers(db):
    return db.store.get("icebreakers", [])


def test_generate_one_question_per_person(db, event):
    round_row = make_round(db, event["id"])
    _seat_table(db, event["id"], round_row["id"], ["Anita", "Bobby", "Charlie"])

    summary = engine.generate_for_round(db, event["id"], round_row["id"], client=StubClient())

    rows = _icebreakers(db)
    assert len(rows) == 3
    recipients = {r["recipient_attendee_id"] for r in rows}
    assert len(recipients) == 3  # exactly one per person
    for r in rows:
        assert r["recipient_attendee_id"] != r["target_attendee_id"]
        assert r["question_text"]
    assert summary["llm"] == 3 and summary["fallback"] == 0


def test_index_mapping_uses_sorted_roster(db, event):
    round_row = make_round(db, event["id"])
    # Seeded out of order; the engine sorts the roster by name for a stable index.
    seated = _seat_table(db, event["id"], round_row["id"], ["Charlie", "Anita", "Bobby"])
    by_name = {a["name"]: a["id"] for a in seated}

    # recipient 1 (Anita) -> target 2 (Bobby) after sorting A,B,C
    engine.generate_for_round(
        db, event["id"], round_row["id"],
        client=_JsonClient([{"recipient": 1, "target": 2, "question": "Q?"}]),
    )
    rows = _icebreakers(db)
    anitas = [r for r in rows if r["recipient_attendee_id"] == by_name["Anita"]]
    assert len(anitas) == 1
    assert anitas[0]["target_attendee_id"] == by_name["Bobby"]
    assert anitas[0]["question_text"] == "Q?"


def test_malformed_output_falls_back_per_person(db, event):
    round_row = make_round(db, event["id"])
    _seat_table(db, event["id"], round_row["id"], ["Anita", "Bobby", "Charlie"])

    summary = engine.generate_for_round(
        db, event["id"], round_row["id"], client=_MalformedClient()
    )

    rows = _icebreakers(db)
    assert len(rows) == 3  # nobody left without a question
    assert all(r["question_text"] for r in rows)
    assert summary["fallback"] == 3 and summary["llm"] == 0


def test_partial_output_fills_gaps_with_fallback(db, event):
    round_row = make_round(db, event["id"])
    _seat_table(db, event["id"], round_row["id"], ["Anita", "Bobby", "Charlie"])

    # Only person 1 answered; 2 and 3 must still get (fallback) questions.
    summary = engine.generate_for_round(
        db, event["id"], round_row["id"],
        client=_JsonClient([{"recipient": 1, "target": 2, "question": "Real?"}]),
    )
    assert summary["llm"] == 1 and summary["fallback"] == 2
    assert len(_icebreakers(db)) == 3


def test_disabled_provider_uses_fallback_bank(db, event):
    round_row = make_round(db, event["id"])
    _seat_table(db, event["id"], round_row["id"], ["Anita", "Bobby"])

    summary = engine.generate_for_round(
        db, event["id"], round_row["id"], client=DisabledClient()
    )
    assert summary["llm"] == 0 and summary["fallback"] == 2
    assert len(_icebreakers(db)) == 2


def test_generation_is_idempotent(db, event):
    round_row = make_round(db, event["id"])
    _seat_table(db, event["id"], round_row["id"], ["Anita", "Bobby", "Charlie"])

    engine.generate_for_round(db, event["id"], round_row["id"], client=StubClient())
    first = len(_icebreakers(db))
    summary = engine.generate_for_round(db, event["id"], round_row["id"], client=StubClient())

    assert summary["skipped"] is True
    assert len(_icebreakers(db)) == first  # no duplicates on a retried publish


def test_single_person_table_is_skipped(db, event):
    round_row = make_round(db, event["id"])
    _seat_table(db, event["id"], round_row["id"], ["Solo"])  # no one to ask about

    summary = engine.generate_for_round(db, event["id"], round_row["id"], client=StubClient())
    assert summary["tables"] == 0
    assert _icebreakers(db) == []


def test_multiple_tables_each_get_one_call_worth(db, event):
    round_row = make_round(db, event["id"])
    _seat_table(db, event["id"], round_row["id"], ["A1", "A2"], table_number=1)
    _seat_table(db, event["id"], round_row["id"], ["B1", "B2", "B3"], table_number=2)

    summary = engine.generate_for_round(db, event["id"], round_row["id"], client=StubClient())
    assert summary["tables"] == 2
    assert len(_icebreakers(db)) == 5  # 2 + 3


def test_audit_records_generation_with_counts_only(db, event):
    round_row = make_round(db, event["id"])
    _seat_table(db, event["id"], round_row["id"], ["Anita", "Bobby"])

    engine.generate_for_round(db, event["id"], round_row["id"], client=StubClient())

    assert "icebreaker.generated" in audit_actions(db)
    entry = next(r for r in db.store["audit_log"] if r["action"] == "icebreaker.generated")
    assert set(entry["metadata"]) == {"table_count", "llm_count", "fallback_count"}
    # No PII anywhere in the audit row.
    blob = json.dumps(entry, default=str)
    assert "Anita" not in blob and "Bobby" not in blob


# --- anti-repetition / boredom (multi-round) ---


def test_fallback_bank_rotates_without_immediate_repeats():
    # Simulate one person across many rounds: each round we know what they've seen.
    used: set[str] = set()
    picks = []
    for round_index in range(len(prompts.FALLBACK_BANK)):
        q = prompts.fallback_question("Bobby", used=used, offset=round_index)
        picks.append(q)
        used.add(q)
    assert len(set(picks)) == len(prompts.FALLBACK_BANK)  # every one distinct, no repeats


def test_no_repeat_across_rounds_with_fallback(db, event):
    # Same two people meet in two rounds; the fallback bank must not repeat itself.
    asha = make_attendee(db, event["id"], name="Asha", status="arrived")
    bobby = make_attendee(db, event["id"], name="Bobby", status="arrived")

    r1 = make_round(db, event["id"], round_number=1)
    make_assignment(db, event["id"], r1["id"], asha["id"], 1)
    make_assignment(db, event["id"], r1["id"], bobby["id"], 1)
    engine.generate_for_round(db, event["id"], r1["id"], client=DisabledClient())

    r2 = make_round(db, event["id"], round_number=2)
    make_assignment(db, event["id"], r2["id"], asha["id"], 1)
    make_assignment(db, event["id"], r2["id"], bobby["id"], 1)
    engine.generate_for_round(db, event["id"], r2["id"], client=DisabledClient())

    ashas = [r["question_text"] for r in _icebreakers(db)
             if r["recipient_attendee_id"] == asha["id"]]
    assert len(ashas) == 2
    assert ashas[0] != ashas[1]  # not bored: different question in round 2


def test_llm_literal_repeat_is_rejected(db, event):
    asha = make_attendee(db, event["id"], name="Asha", status="arrived")
    bobby = make_attendee(db, event["id"], name="Bobby", status="arrived")
    r1 = make_round(db, event["id"], round_number=1)
    make_assignment(db, event["id"], r1["id"], asha["id"], 1)
    make_assignment(db, event["id"], r1["id"], bobby["id"], 1)
    # Asha already heard exactly this in a previous round.
    db.seed("icebreakers", {
        "round_id": r1["id"], "table_number": 1,
        "recipient_attendee_id": asha["id"], "target_attendee_id": bobby["id"],
        "question_text": "What problem are you working on?",
        "generated_at": "2026-07-01T18:00:00+00:00",
    })

    r2 = make_round(db, event["id"], round_number=2)
    make_assignment(db, event["id"], r2["id"], asha["id"], 1)
    make_assignment(db, event["id"], r2["id"], bobby["id"], 1)
    # The model tries to hand Asha (index 1 after sorting) the same question again.
    engine.generate_for_round(
        db, event["id"], r2["id"],
        client=_JsonClient([{"recipient": 1, "target": 2,
                             "question": "What problem are you working on?"}]),
    )
    r2_q = next(r["question_text"] for r in _icebreakers(db)
                if r["recipient_attendee_id"] == asha["id"] and r["round_id"] == r2["id"])
    assert r2_q != "What problem are you working on?"  # repeat rejected -> fresh fallback


def test_refresh_differs_from_current_question(client, db, event):
    me = make_attendee(db, event["id"], name="Asha", user_id=ATTENDEE_USER_ID, status="arrived")
    other = make_attendee(db, event["id"], name="Bobby", status="arrived")
    round_row = make_round(db, event["id"])
    make_assignment(db, event["id"], round_row["id"], me["id"], 1)
    make_assignment(db, event["id"], round_row["id"], other["id"], 1)
    db.seed("icebreakers", {
        "round_id": round_row["id"], "table_number": 1,
        "recipient_attendee_id": me["id"], "target_attendee_id": other["id"],
        "question_text": "What problem are you working on?",
        "generated_at": "2026-07-01T18:00:00+00:00",
    })

    response = client.post(
        f"/events/{event['id']}/rounds/{round_row['id']}/icebreaker/{me['id']}/refresh",
        headers=ATTENDEE_AUTH,
    )
    assert response.status_code == 200
    assert response.json()["question_text"] != "What problem are you working on?"


# --- output hygiene & robustness ---


def test_long_or_multiline_output_is_sanitized(db, event):
    round_row = make_round(db, event["id"])
    _seat_table(db, event["id"], round_row["id"], ["Anita", "Bobby"])
    rambling = "Sure!\n\nHere is a great question:  " + ("word " * 200)
    engine.generate_for_round(
        db, event["id"], round_row["id"],
        client=_JsonClient([{"recipient": 1, "target": 2, "question": rambling}]),
    )
    q = _icebreakers(db)[0]["question_text"]
    assert "\n" not in q and "  " not in q
    assert len(q) <= MAX_QUESTION_LEN


def test_partial_generation_self_heals(db, event):
    # Generation died after table 1; a retry must FINISH table 2, not skip the round.
    round_row = make_round(db, event["id"])
    t1 = _seat_table(db, event["id"], round_row["id"], ["A1", "A2"], table_number=1)
    _seat_table(db, event["id"], round_row["id"], ["B1", "B2", "B3"], table_number=2)
    # Pretend table 1 already finished last time.
    for a in t1:
        db.seed("icebreakers", {
            "round_id": round_row["id"], "table_number": 1,
            "recipient_attendee_id": a["id"], "target_attendee_id": t1[0]["id"],
            "question_text": "prior", "generated_at": "2026-07-01T18:00:00+00:00",
        })

    summary = engine.generate_for_round(db, event["id"], round_row["id"], client=StubClient())

    assert summary["skipped"] is False
    assert summary["tables"] == 1  # only table 2 was pending
    table2 = [r for r in _icebreakers(db) if r["table_number"] == 2]
    assert len(table2) == 3  # the previously-missing table is now filled


def test_blank_profiles_still_get_questions(db, event):
    round_row = make_round(db, event["id"])
    a = make_attendee(db, event["id"], name="Anita", role="", looking_for="", status="arrived")
    b = make_attendee(db, event["id"], name="Bobby", role="", looking_for="", status="arrived")
    make_assignment(db, event["id"], round_row["id"], a["id"], 1)
    make_assignment(db, event["id"], round_row["id"], b["id"], 1)

    engine.generate_for_round(db, event["id"], round_row["id"], client=DisabledClient())
    rows = _icebreakers(db)
    assert len(rows) == 2 and all(r["question_text"] for r in rows)


def test_publish_schedules_generation_and_live_shows_icebreaker(client, db, event):
    """End-to-end: organizer publishes -> background task runs -> /live carries
    the icebreaker for a seated attendee."""
    me = make_attendee(db, event["id"], name="Asha", user_id=ATTENDEE_USER_ID, status="arrived")
    make_attendee(db, event["id"], name="Bobby", status="arrived")
    make_attendee(db, event["id"], name="Chitra", status="arrived")

    start = client.post(f"/events/{event['id']}/rounds/start", headers=AUTH)
    assert start.status_code == 201
    publish = client.post(f"/events/{event['id']}/rounds/publish", headers=AUTH)
    assert publish.status_code == 201

    # TestClient runs background tasks before returning, so icebreakers exist now.
    live = client.get(f"/events/{event['id']}/live", headers=ATTENDEE_AUTH)
    assert live.status_code == 200
    body = live.json()
    assert body["phase"] == "in_round"
    assert body["seated"] is True
    assert body["icebreaker"] is not None
    assert body["icebreaker"]["question_text"]
