from tests.conftest import (
    ATTENDEE_AUTH,
    ATTENDEE_USER_ID,
    AUTH,
    OTHER_ATTENDEE_AUTH,
    OTHER_AUTH,
    make_assignment,
    make_attendee,
    make_round,
)

REGISTER_PAYLOAD = {
    "name": "Asha",
    "role": "Founder at XYZ",
    "looking_for": "investors, designers",
    "linkedin_url": "https://linkedin.com/in/asha",
    "whatsapp_number": "+919999999999",
}


def test_register_requires_auth(client, event):
    response = client.post(f"/events/{event['id']}/attendees", json=REGISTER_PAYLOAD)
    assert response.status_code == 401


def test_register_attendee_links_user_id(client, event):
    response = client.post(
        f"/events/{event['id']}/attendees", json=REGISTER_PAYLOAD, headers=ATTENDEE_AUTH
    )
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Asha"
    assert body["status"] == "registered"
    assert body["event_id"] == event["id"]
    assert body["user_id"] == ATTENDEE_USER_ID


def test_register_twice_returns_existing_record(client, event):
    first = client.post(
        f"/events/{event['id']}/attendees", json=REGISTER_PAYLOAD, headers=ATTENDEE_AUTH
    )
    assert first.status_code == 201

    again = client.post(
        f"/events/{event['id']}/attendees",
        json={**REGISTER_PAYLOAD, "name": "Asha Again"},
        headers=ATTENDEE_AUTH,
    )
    assert again.status_code == 200  # deduped, not created
    assert again.json()["id"] == first.json()["id"]
    assert again.json()["name"] == "Asha"  # original record untouched


def test_register_different_users_both_created(client, event):
    first = client.post(
        f"/events/{event['id']}/attendees", json=REGISTER_PAYLOAD, headers=ATTENDEE_AUTH
    )
    second = client.post(
        f"/events/{event['id']}/attendees",
        json={**REGISTER_PAYLOAD, "name": "Ravi"},
        headers=OTHER_ATTENDEE_AUTH,
    )
    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["id"] != second.json()["id"]


def test_register_event_not_found(client):
    response = client.post(
        "/events/00000000-0000-0000-0000-000000000000/attendees",
        json=REGISTER_PAYLOAD,
        headers=ATTENDEE_AUTH,
    )
    assert response.status_code == 404


def test_register_ended_event_rejected(client, db, event):
    db.table("events").update({"status": "ended"}).eq("id", event["id"]).execute()

    response = client.post(
        f"/events/{event['id']}/attendees", json=REGISTER_PAYLOAD, headers=ATTENDEE_AUTH
    )
    assert response.status_code == 409


def test_reregister_after_event_ends_returns_existing(client, db, event):
    # Already-registered attendees keep access to their record post-event
    first = client.post(
        f"/events/{event['id']}/attendees", json=REGISTER_PAYLOAD, headers=ATTENDEE_AUTH
    )
    db.table("events").update({"status": "ended"}).eq("id", event["id"]).execute()

    again = client.post(
        f"/events/{event['id']}/attendees", json=REGISTER_PAYLOAD, headers=ATTENDEE_AUTH
    )
    assert again.status_code == 200
    assert again.json()["id"] == first.json()["id"]


def test_register_optional_fields_omitted(client, event):
    response = client.post(
        f"/events/{event['id']}/attendees",
        json={"name": "Ravi", "role": "Designer"},
        headers=ATTENDEE_AUTH,
    )
    assert response.status_code == 201
    body = response.json()
    assert body["linkedin_url"] is None
    assert body["whatsapp_number"] is None


def test_get_attendee_without_active_round(client, db, event):
    attendee = make_attendee(db, event["id"])

    response = client.get(f"/events/{event['id']}/attendees/{attendee['id']}")
    assert response.status_code == 200
    body = response.json()
    assert body["current_table_number"] is None
    assert body["current_round_id"] is None


def test_get_attendee_with_active_assignment(client, db, event):
    attendee = make_attendee(db, event["id"])
    round_row = make_round(db, event["id"], round_number=3, status="active")
    make_assignment(db, event["id"], round_row["id"], attendee["id"], table_number=7)

    response = client.get(f"/events/{event['id']}/attendees/{attendee['id']}")
    assert response.status_code == 200
    body = response.json()
    assert body["current_table_number"] == 7
    assert body["current_round_id"] == round_row["id"]
    assert body["current_round_number"] == 3


def test_get_attendee_not_found(client, event):
    response = client.get(
        f"/events/{event['id']}/attendees/00000000-0000-0000-0000-000000000000"
    )
    assert response.status_code == 404


def test_patch_attendee_requires_auth(client, db, event):
    attendee = make_attendee(db, event["id"])

    response = client.patch(
        f"/events/{event['id']}/attendees/{attendee['id']}",
        json={"status": "arrived"},
    )
    assert response.status_code == 401


def test_organizer_marks_attendee_arrived(client, db, event):
    attendee = make_attendee(db, event["id"])

    response = client.patch(
        f"/events/{event['id']}/attendees/{attendee['id']}",
        json={"status": "arrived"},
        headers=AUTH,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "arrived"


def test_organizer_marks_attendee_left(client, db, event):
    attendee = make_attendee(db, event["id"], status="arrived")

    response = client.patch(
        f"/events/{event['id']}/attendees/{attendee['id']}",
        json={"status": "left"},
        headers=AUTH,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "left"


def test_attendee_cannot_patch_status(client, db, event):
    # PATCH is the organizer control panel feature; attendees (even on their
    # own record) cannot use it — spec gives status control to the organizer.
    attendee = make_attendee(db, event["id"], user_id=ATTENDEE_USER_ID)

    response = client.patch(
        f"/events/{event['id']}/attendees/{attendee['id']}",
        json={"status": "left"},
        headers=ATTENDEE_AUTH,
    )
    assert response.status_code == 403


def test_wrong_organizer_cannot_modify_attendee(client, db, event):
    attendee = make_attendee(db, event["id"])

    response = client.patch(
        f"/events/{event['id']}/attendees/{attendee['id']}",
        json={"status": "arrived"},
        headers=OTHER_AUTH,
    )
    assert response.status_code == 403
