from tests.conftest import make_attendee, make_round


def test_get_icebreaker_not_found(client, db, event):
    attendee = make_attendee(db, event["id"])
    round_row = make_round(db, event["id"])

    response = client.get(
        f"/events/{event['id']}/rounds/{round_row['id']}/icebreaker/{attendee['id']}"
    )
    assert response.status_code == 404


def test_get_icebreaker_returns_latest(client, db, event):
    me = make_attendee(db, event["id"], name="Me")
    target = make_attendee(db, event["id"], name="Target")
    round_row = make_round(db, event["id"])

    db.seed(
        "icebreakers",
        {
            "round_id": round_row["id"],
            "table_number": 1,
            "recipient_attendee_id": me["id"],
            "target_attendee_id": target["id"],
            "question_text": "Old question",
            "generated_at": "2026-07-01T18:00:00+00:00",
        },
        {
            "round_id": round_row["id"],
            "table_number": 1,
            "recipient_attendee_id": me["id"],
            "target_attendee_id": target["id"],
            "question_text": "Newer question",
            "generated_at": "2026-07-01T18:05:00+00:00",
        },
    )

    response = client.get(
        f"/events/{event['id']}/rounds/{round_row['id']}/icebreaker/{me['id']}"
    )
    assert response.status_code == 200
    assert response.json()["question_text"] == "Newer question"


def test_refresh_icebreaker_not_implemented_yet(client, db, event):
    # Step 6 delivers the Claude-powered icebreaker engine
    attendee = make_attendee(db, event["id"])
    round_row = make_round(db, event["id"])

    response = client.post(
        f"/events/{event['id']}/rounds/{round_row['id']}/icebreaker/{attendee['id']}/refresh"
    )
    assert response.status_code == 501
