"""Customizable feedback forms — builder (owner-only), attendee fill/submit,
recap gating, and aggregated results.
"""

from tests.conftest import (
    AUTH,
    OTHER_AUTH,
    ATTENDEE_AUTH,
    ATTENDEE_USER_ID,
    OTHER_ATTENDEE_AUTH,
    OTHER_ATTENDEE_USER_ID,
    make_attendee,
)

BASE = "/events/{eid}/feedback-form"


def _me(db, event_id, **overrides) -> dict:
    defaults = {"name": "Asha", "status": "arrived", "user_id": ATTENDEE_USER_ID}
    defaults.update(overrides)
    return make_attendee(db, event_id, **defaults)


def _form_body(**overrides) -> dict:
    body = {
        "title": "How was tonight?",
        "description": "Quick one.",
        "gate_recap": False,
        "questions": [
            {"type": "rating", "label": "Overall?", "required": True, "scale": 5},
            {"type": "single_choice", "label": "Come again?", "required": True, "options": ["Yes", "No"]},
            {"type": "long_text", "label": "Anything else?", "required": False},
        ],
    }
    body.update(overrides)
    return body


# --- auth / ownership -----------------------------------------------------------
def test_form_endpoints_require_auth(client, event):
    eid = event["id"]
    assert client.get(BASE.format(eid=eid)).status_code == 401
    assert client.put(BASE.format(eid=eid), json=_form_body()).status_code == 401
    assert client.get(f"{BASE.format(eid=eid)}/results").status_code == 401


def test_form_builder_is_owner_only(client, event):
    eid = event["id"]
    assert client.get(BASE.format(eid=eid), headers=OTHER_AUTH).status_code == 403
    assert client.put(BASE.format(eid=eid), json=_form_body(), headers=OTHER_AUTH).status_code == 403
    assert client.get(f"{BASE.format(eid=eid)}/results", headers=OTHER_AUTH).status_code == 403


# --- builder --------------------------------------------------------------------
def test_get_form_returns_default_scaffold_when_none(client, event):
    body = client.get(BASE.format(eid=event["id"]), headers=AUTH).json()
    assert body["id"] is None and body["is_published"] is False
    assert len(body["questions"]) >= 3  # a usable default template, not empty


def test_save_then_get_roundtrips(client, event):
    eid = event["id"]
    saved = client.put(BASE.format(eid=eid), json=_form_body(gate_recap=True), headers=AUTH)
    assert saved.status_code == 200
    got = client.get(BASE.format(eid=eid), headers=AUTH).json()
    assert got["title"] == "How was tonight?"
    assert got["gate_recap"] is True
    assert [q["type"] for q in got["questions"]] == ["rating", "single_choice", "long_text"]
    assert got["questions"][1]["options"] == ["Yes", "No"]


def test_form_reports_response_count(client, db, event):
    eid = event["id"]
    _publish_form(client, db, eid)
    # No responses yet.
    assert client.get(BASE.format(eid=eid), headers=AUTH).json()["response_count"] == 0
    qs = client.get(f"{BASE.format(eid=eid)}/fill", headers=ATTENDEE_AUTH).json()["questions"]
    client.post(
        f"{BASE.format(eid=eid)}/submit",
        json={"answers": [{"question_id": qs[0]["id"], "value": 5}, {"question_id": qs[1]["id"], "value": "Yes"}]},
        headers=ATTENDEE_AUTH,
    )
    assert client.get(BASE.format(eid=eid), headers=AUTH).json()["response_count"] == 1


def test_editing_form_preserves_question_ids_and_answers(client, db, event):
    """Regression: editing a published form that already has responses must NOT
    drop collected answers (question rows are reconciled by id, not recreated)."""
    eid = event["id"]
    _publish_form(client, db, eid)
    qs = client.get(f"{BASE.format(eid=eid)}/fill", headers=ATTENDEE_AUTH).json()["questions"]
    rating_id, choice_id, text_id = qs[0]["id"], qs[1]["id"], qs[2]["id"]
    client.post(
        f"{BASE.format(eid=eid)}/submit",
        json={"answers": [
            {"question_id": rating_id, "value": 4},
            {"question_id": choice_id, "value": "Yes"},
            {"question_id": text_id, "value": "Loved it"},
        ]},
        headers=ATTENDEE_AUTH,
    )

    # Organizer re-saves: same questions (carrying their ids), one relabelled and
    # reordered, plus a brand-new question appended.
    full = client.get(BASE.format(eid=eid), headers=AUTH).json()
    edited = full["questions"]
    edited[0]["label"] = "Overall rating?"          # edit wording in place
    edited[0], edited[1] = edited[1], edited[0]      # reorder
    edited.append({"type": "short_text", "label": "One word for tonight?", "required": False})
    save = client.put(
        BASE.format(eid=eid),
        json={"title": full["title"], "gate_recap": full["gate_recap"], "questions": edited},
        headers=AUTH,
    )
    assert save.status_code == 200

    # The kept questions keep their ids; the answers are still attached.
    res = client.get(f"{BASE.format(eid=eid)}/results", headers=AUTH).json()
    assert res["response_count"] == 1
    ids_now = {q["question_id"] for q in res["questions"]}
    assert {rating_id, choice_id, text_id} <= ids_now
    by_id = {q["question_id"]: q for q in res["questions"]}
    assert by_id[rating_id]["average"] == 4.0
    assert by_id[choice_id]["option_counts"] == {"Yes": 1}
    assert by_id[text_id]["text_answers"] == ["Loved it"]


def test_removing_a_question_drops_only_its_answers(client, db, event):
    eid = event["id"]
    _publish_form(client, db, eid)
    qs = client.get(f"{BASE.format(eid=eid)}/fill", headers=ATTENDEE_AUTH).json()["questions"]
    rating_id, choice_id, text_id = qs[0]["id"], qs[1]["id"], qs[2]["id"]
    client.post(
        f"{BASE.format(eid=eid)}/submit",
        json={"answers": [
            {"question_id": rating_id, "value": 3},
            {"question_id": choice_id, "value": "No"},
            {"question_id": text_id, "value": "ok"},
        ]},
        headers=ATTENDEE_AUTH,
    )
    full = client.get(BASE.format(eid=eid), headers=AUTH).json()
    kept = [q for q in full["questions"] if q["id"] != text_id]  # drop the text question
    client.put(
        BASE.format(eid=eid),
        json={"title": full["title"], "gate_recap": full["gate_recap"], "questions": kept},
        headers=AUTH,
    )
    res = client.get(f"{BASE.format(eid=eid)}/results", headers=AUTH).json()
    ids_now = {q["question_id"] for q in res["questions"]}
    assert text_id not in ids_now            # the removed question is gone
    assert {rating_id, choice_id} <= ids_now  # the others survive
    assert res["response_count"] == 1         # the submission itself is intact


def test_choice_question_needs_two_options(client, event):
    body = _form_body(questions=[{"type": "single_choice", "label": "Pick", "options": ["Only one"]}])
    r = client.put(BASE.format(eid=event["id"]), json=body, headers=AUTH)
    assert r.status_code == 400


def test_publish_requires_a_saved_form_with_questions(client, event):
    eid = event["id"]
    # nothing saved yet
    assert client.post(f"{BASE.format(eid=eid)}/publish", json={"is_published": True}, headers=AUTH).status_code == 404
    # save an empty form, then publishing is rejected
    client.put(BASE.format(eid=eid), json=_form_body(questions=[]), headers=AUTH)
    assert client.post(f"{BASE.format(eid=eid)}/publish", json={"is_published": True}, headers=AUTH).status_code == 400
    # save real questions → publish ok
    client.put(BASE.format(eid=eid), json=_form_body(), headers=AUTH)
    ok = client.post(f"{BASE.format(eid=eid)}/publish", json={"is_published": True}, headers=AUTH)
    assert ok.status_code == 200 and ok.json()["is_published"] is True


# --- attendee fill / submit -----------------------------------------------------
def test_fill_hidden_until_published(client, db, event):
    eid = event["id"]
    _me(db, eid)
    client.put(BASE.format(eid=eid), json=_form_body(), headers=AUTH)
    # saved but not published → not available to the attendee
    assert client.get(f"{BASE.format(eid=eid)}/fill", headers=ATTENDEE_AUTH).json()["available"] is False
    client.post(f"{BASE.format(eid=eid)}/publish", json={"is_published": True}, headers=AUTH)
    fill = client.get(f"{BASE.format(eid=eid)}/fill", headers=ATTENDEE_AUTH).json()
    assert fill["available"] is True and fill["submitted"] is False
    assert len(fill["questions"]) == 3


def _publish_form(client, db, eid, **form_overrides):
    _me(db, eid)
    client.put(BASE.format(eid=eid), json=_form_body(**form_overrides), headers=AUTH)
    client.post(f"{BASE.format(eid=eid)}/publish", json={"is_published": True}, headers=AUTH)


def test_submit_validates_required_and_records(client, db, event):
    eid = event["id"]
    _publish_form(client, db, eid)
    qs = client.get(f"{BASE.format(eid=eid)}/fill", headers=ATTENDEE_AUTH).json()["questions"]
    rating_id, choice_id = qs[0]["id"], qs[1]["id"]

    # missing the required choice → rejected
    bad = client.post(
        f"{BASE.format(eid=eid)}/submit",
        json={"answers": [{"question_id": rating_id, "value": 4}]},
        headers=ATTENDEE_AUTH,
    )
    assert bad.status_code == 400

    # out-of-range rating → rejected
    assert client.post(
        f"{BASE.format(eid=eid)}/submit",
        json={"answers": [{"question_id": rating_id, "value": 9}, {"question_id": choice_id, "value": "Yes"}]},
        headers=ATTENDEE_AUTH,
    ).status_code == 400

    # valid → submitted
    ok = client.post(
        f"{BASE.format(eid=eid)}/submit",
        json={"answers": [{"question_id": rating_id, "value": 5}, {"question_id": choice_id, "value": "Yes"}]},
        headers=ATTENDEE_AUTH,
    )
    assert ok.status_code == 200 and ok.json()["submitted"] is True
    assert client.get(f"{BASE.format(eid=eid)}/fill", headers=ATTENDEE_AUTH).json()["submitted"] is True


def test_gate_recap_flag_surfaces_to_attendee(client, db, event):
    eid = event["id"]
    _publish_form(client, db, eid, gate_recap=True)
    assert client.get(f"{BASE.format(eid=eid)}/fill", headers=ATTENDEE_AUTH).json()["gate_recap"] is True


def test_invalid_choice_rejected(client, db, event):
    eid = event["id"]
    _publish_form(client, db, eid)
    qs = client.get(f"{BASE.format(eid=eid)}/fill", headers=ATTENDEE_AUTH).json()["questions"]
    rating_id, choice_id = qs[0]["id"], qs[1]["id"]
    r = client.post(
        f"{BASE.format(eid=eid)}/submit",
        json={"answers": [{"question_id": rating_id, "value": 3}, {"question_id": choice_id, "value": "Maybe"}]},
        headers=ATTENDEE_AUTH,
    )
    assert r.status_code == 400  # "Maybe" isn't an option


# --- results --------------------------------------------------------------------
def test_results_aggregate_over_checked_in(client, db, event):
    eid = event["id"]
    # 3 checked in (incl. our attendee), 1 no-show → denominator is 3.
    _publish_form(client, db, eid)
    make_attendee(db, eid, name="B", status="arrived")
    make_attendee(db, eid, name="C", status="registered")  # no-show
    qs = client.get(f"{BASE.format(eid=eid)}/fill", headers=ATTENDEE_AUTH).json()["questions"]
    rating_id, choice_id, text_id = qs[0]["id"], qs[1]["id"], qs[2]["id"]

    client.post(
        f"{BASE.format(eid=eid)}/submit",
        json={"answers": [
            {"question_id": rating_id, "value": 4},
            {"question_id": choice_id, "value": "Yes"},
            {"question_id": text_id, "value": "Loved it"},
        ]},
        headers=ATTENDEE_AUTH,
    )
    # a second respondent (other attendee)
    make_attendee(db, eid, name="Ravi", status="arrived", user_id=OTHER_ATTENDEE_USER_ID)
    client.post(
        f"{BASE.format(eid=eid)}/submit",
        json={"answers": [
            {"question_id": rating_id, "value": 2},
            {"question_id": choice_id, "value": "No"},
        ]},
        headers=OTHER_ATTENDEE_AUTH,
    )

    res = client.get(f"{BASE.format(eid=eid)}/results", headers=AUTH).json()
    assert res["response_count"] == 2
    assert res["total_recipients"] == 3  # B(arrived) + Asha + Ravi; C excluded
    assert res["response_rate"] == 67    # 2/3
    by_label = {q["label"]: q for q in res["questions"]}
    assert by_label["Overall?"]["average"] == 3.0          # (4+2)/2
    assert by_label["Come again?"]["option_counts"] == {"Yes": 1, "No": 1}
    assert by_label["Anything else?"]["text_answers"] == ["Loved it"]

    # Per-respondent (Individual view): one entry per submission, named by default.
    assert res["collect_identity"] is True
    assert len(res["responses"]) == 2
    names = {r["respondent_name"] for r in res["responses"]}
    assert names == {"Asha", "Ravi"}
    asha = next(r for r in res["responses"] if r["respondent_name"] == "Asha")
    answers = {a["question_id"]: a["value"] for a in asha["answers"]}
    assert answers[rating_id] == 4 and answers[choice_id] == "Yes" and answers[text_id] == "Loved it"


def test_results_anonymous_when_identity_off(client, db, event):
    eid = event["id"]
    # Build a form with identity collection OFF, publish, and submit one response.
    _publish_form(client, db, eid, collect_identity=False)
    qs = client.get(f"{BASE.format(eid=eid)}/fill", headers=ATTENDEE_AUTH).json()
    assert qs["collect_identity"] is False  # the attendee is told it's anonymous
    rating_id, choice_id = qs["questions"][0]["id"], qs["questions"][1]["id"]
    client.post(
        f"{BASE.format(eid=eid)}/submit",
        json={"answers": [{"question_id": rating_id, "value": 5}, {"question_id": choice_id, "value": "Yes"}]},
        headers=ATTENDEE_AUTH,
    )
    res = client.get(f"{BASE.format(eid=eid)}/results", headers=AUTH).json()
    assert res["collect_identity"] is False
    assert len(res["responses"]) == 1
    r = res["responses"][0]
    # Identity withheld, but the answers are still there.
    assert r["respondent_name"] is None and r["respondent_company"] is None
    assert {a["question_id"] for a in r["answers"]} == {rating_id, choice_id}


def test_results_empty_when_no_form(client, event):
    res = client.get(f"{BASE.format(eid=event['id'])}/results", headers=AUTH).json()
    assert res["response_count"] == 0 and res["questions"] == [] and res["responses"] == []
