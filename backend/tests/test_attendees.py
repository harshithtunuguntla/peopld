from tests.conftest import make_attendee, make_round, make_assignment

REGISTER_PAYLOAD = {
    "name": "Asha",
    "role": "Founder at XYZ",
    "looking_for": "investors, designers",
    "linkedin_url": "https://linkedin.com/in/asha",
    "whatsapp_number": "+919999999999",
}


def test_register_attendee(client, event):
    response = client.post(f"/events/{event['id']}/attendees", json=REGISTER_PAYLOAD)
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Asha"
    assert body["status"] == "registered"
    assert body["event_id"] == event["id"]


def test_register_event_not_found(client):
    response = client.post(
        "/events/00000000-0000-0000-0000-000000000000/attendees",
        json=REGISTER_PAYLOAD,
    )
    assert response.status_code == 404


def test_register_ended_event_rejected(client, db, event):
    db.table("events").update({"status": "ended"}).eq("id", event["id"]).execute()

    response = client.post(f"/events/{event['id']}/attendees", json=REGISTER_PAYLOAD)
    assert response.status_code == 409


def test_register_optional_fields_omitted(client, event):
    response = client.post(
        f"/events/{event['id']}/attendees",
        json={"name": "Ravi", "role": "Designer"},
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


def test_mark_attendee_arrived(client, db, event):
    attendee = make_attendee(db, event["id"])

    response = client.patch(
        f"/events/{event['id']}/attendees/{attendee['id']}",
        json={"status": "arrived"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "arrived"


def test_mark_attendee_left(client, db, event):
    attendee = make_attendee(db, event["id"], status="arrived")

    response = client.patch(
        f"/events/{event['id']}/attendees/{attendee['id']}",
        json={"status": "left"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "left"
