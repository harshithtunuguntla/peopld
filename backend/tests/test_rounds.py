from tests.conftest import ATTENDEE_AUTH, AUTH, OTHER_AUTH, make_attendee, make_round, make_assignment


def test_current_round_none_active(client, event):
    response = client.get(f"/events/{event['id']}/rounds/current")
    assert response.status_code == 404


def test_current_round_includes_assignments(client, db, event):
    attendee_a = make_attendee(db, event["id"], name="A")
    attendee_b = make_attendee(db, event["id"], name="B")
    round_row = make_round(db, event["id"], round_number=2, status="active")
    make_assignment(db, event["id"], round_row["id"], attendee_a["id"], 1)
    make_assignment(db, event["id"], round_row["id"], attendee_b["id"], 1)

    response = client.get(f"/events/{event['id']}/rounds/current")
    assert response.status_code == 200
    body = response.json()
    assert body["round_number"] == 2
    assert body["status"] == "active"
    assert len(body["assignments"]) == 2
    assert {a["attendee_id"] for a in body["assignments"]} == {
        attendee_a["id"],
        attendee_b["id"],
    }


def test_end_round_requires_auth(client, event):
    response = client.post(f"/events/{event['id']}/rounds/end")
    assert response.status_code == 401


def test_end_round_non_organizer_forbidden(client, db, event):
    make_round(db, event["id"], round_number=1, status="active")

    response = client.post(f"/events/{event['id']}/rounds/end", headers=ATTENDEE_AUTH)
    assert response.status_code == 403


def test_end_round_wrong_organizer_forbidden(client, db, event):
    make_round(db, event["id"], round_number=1, status="active")

    response = client.post(f"/events/{event['id']}/rounds/end", headers=OTHER_AUTH)
    assert response.status_code == 403


def test_end_round_no_active(client, event):
    response = client.post(f"/events/{event['id']}/rounds/end", headers=AUTH)
    assert response.status_code == 404


def test_end_round_completes_active(client, db, event):
    make_round(db, event["id"], round_number=1, status="active")

    response = client.post(f"/events/{event['id']}/rounds/end", headers=AUTH)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "completed"
    assert body["ended_at"] is not None


def test_start_round_not_implemented_yet(client, event):
    # Step 4 delivers the rotation algorithm
    response = client.post(f"/events/{event['id']}/rounds/start", headers=AUTH)
    assert response.status_code == 501


def test_get_table_assignments(client, db, event):
    attendee_a = make_attendee(db, event["id"], name="A")
    attendee_b = make_attendee(db, event["id"], name="B")
    attendee_c = make_attendee(db, event["id"], name="C")
    round_row = make_round(db, event["id"], status="active")
    make_assignment(db, event["id"], round_row["id"], attendee_a["id"], 5)
    make_assignment(db, event["id"], round_row["id"], attendee_b["id"], 5)
    make_assignment(db, event["id"], round_row["id"], attendee_c["id"], 6)

    response = client.get(
        f"/events/{event['id']}/rounds/{round_row['id']}/tables/5"
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2
    assert all(a["table_number"] == 5 for a in body)
