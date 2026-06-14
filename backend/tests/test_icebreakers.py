from tests.conftest import (
    ATTENDEE_AUTH,
    ATTENDEE_USER_ID,
    AUTH,
    OTHER_ATTENDEE_AUTH,
    make_assignment,
    make_attendee,
    make_round,
)


def test_get_icebreaker_requires_auth(client, db, event):
    attendee = make_attendee(db, event["id"])
    round_row = make_round(db, event["id"])

    response = client.get(
        f"/events/{event['id']}/rounds/{round_row['id']}/icebreaker/{attendee['id']}"
    )
    assert response.status_code == 401


def test_get_icebreaker_other_user_forbidden(client, db, event):
    # Icebreakers are personalized — recipient or event organizer only
    attendee = make_attendee(db, event["id"], user_id=ATTENDEE_USER_ID)
    round_row = make_round(db, event["id"])

    response = client.get(
        f"/events/{event['id']}/rounds/{round_row['id']}/icebreaker/{attendee['id']}",
        headers=OTHER_ATTENDEE_AUTH,
    )
    assert response.status_code == 403


def test_get_icebreaker_not_found(client, db, event):
    attendee = make_attendee(db, event["id"], user_id=ATTENDEE_USER_ID)
    round_row = make_round(db, event["id"])

    response = client.get(
        f"/events/{event['id']}/rounds/{round_row['id']}/icebreaker/{attendee['id']}",
        headers=ATTENDEE_AUTH,
    )
    assert response.status_code == 404


def test_get_icebreaker_returns_latest(client, db, event):
    me = make_attendee(db, event["id"], name="Me", user_id=ATTENDEE_USER_ID)
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
        f"/events/{event['id']}/rounds/{round_row['id']}/icebreaker/{me['id']}",
        headers=ATTENDEE_AUTH,
    )
    assert response.status_code == 200
    assert response.json()["question_text"] == "Newer question"


def test_get_icebreaker_organizer_can_view(client, db, event):
    attendee = make_attendee(db, event["id"], user_id=ATTENDEE_USER_ID)
    round_row = make_round(db, event["id"])
    db.seed(
        "icebreakers",
        {
            "round_id": round_row["id"],
            "table_number": 1,
            "recipient_attendee_id": attendee["id"],
            "target_attendee_id": attendee["id"],
            "question_text": "Q",
            "generated_at": "2026-07-01T18:00:00+00:00",
        },
    )

    response = client.get(
        f"/events/{event['id']}/rounds/{round_row['id']}/icebreaker/{attendee['id']}",
        headers=AUTH,
    )
    assert response.status_code == 200


def test_refresh_icebreaker_requires_auth(client, db, event):
    attendee = make_attendee(db, event["id"])
    round_row = make_round(db, event["id"])

    response = client.post(
        f"/events/{event['id']}/rounds/{round_row['id']}/icebreaker/{attendee['id']}/refresh"
    )
    assert response.status_code == 401


def test_refresh_generates_a_new_icebreaker(client, db, event):
    # A seated attendee taps "Generate Another" — gets a fresh question for the table.
    me = make_attendee(db, event["id"], name="Asha", user_id=ATTENDEE_USER_ID, status="arrived")
    other = make_attendee(db, event["id"], name="Bobby", status="arrived")
    round_row = make_round(db, event["id"])
    make_assignment(db, event["id"], round_row["id"], me["id"], table_number=1)
    make_assignment(db, event["id"], round_row["id"], other["id"], table_number=1)

    response = client.post(
        f"/events/{event['id']}/rounds/{round_row['id']}/icebreaker/{me['id']}/refresh",
        headers=ATTENDEE_AUTH,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["recipient_attendee_id"] == me["id"]
    assert body["target_attendee_id"] == other["id"]  # the only other person
    assert body["question_text"]


def test_refresh_when_not_seated_is_409(client, db, event):
    me = make_attendee(db, event["id"], user_id=ATTENDEE_USER_ID, status="arrived")
    round_row = make_round(db, event["id"])  # no assignment for me

    response = client.post(
        f"/events/{event['id']}/rounds/{round_row['id']}/icebreaker/{me['id']}/refresh",
        headers=ATTENDEE_AUTH,
    )
    assert response.status_code == 409
