from tests.conftest import make_attendee, make_round, make_assignment


def test_connections_attendee_not_found(client, event):
    response = client.get(
        f"/events/{event['id']}/attendees/00000000-0000-0000-0000-000000000000/connections"
    )
    assert response.status_code == 404


def test_connections_empty_when_never_assigned(client, db, event):
    attendee = make_attendee(db, event["id"])

    response = client.get(
        f"/events/{event['id']}/attendees/{attendee['id']}/connections"
    )
    assert response.status_code == 200
    assert response.json() == {
        "total_people_met": 0,
        "rounds_count": 0,
        "connections": [],
    }


def test_connections_rolodex(client, db, event):
    # Round 1: ME sits with B at table 1; C is elsewhere
    # Round 2: ME sits with C and D at table 2
    me = make_attendee(db, event["id"], name="Me")
    b = make_attendee(db, event["id"], name="B", whatsapp_number="+911111111111")
    c = make_attendee(db, event["id"], name="C", whatsapp_number=None)
    d = make_attendee(db, event["id"], name="D")
    r1 = make_round(db, event["id"], round_number=1, status="completed")
    r2 = make_round(db, event["id"], round_number=2, status="completed")

    make_assignment(db, event["id"], r1["id"], me["id"], 1)
    make_assignment(db, event["id"], r1["id"], b["id"], 1)
    make_assignment(db, event["id"], r1["id"], c["id"], 3)
    make_assignment(db, event["id"], r2["id"], me["id"], 2)
    make_assignment(db, event["id"], r2["id"], c["id"], 2)
    make_assignment(db, event["id"], r2["id"], d["id"], 2)

    response = client.get(f"/events/{event['id']}/attendees/{me['id']}/connections")
    assert response.status_code == 200
    body = response.json()

    assert body["total_people_met"] == 3
    assert body["rounds_count"] == 2

    entries = body["connections"]
    assert len(entries) == 3
    # Sorted by round, then table
    assert [e["name"] for e in entries] == ["B", "C", "D"]
    assert entries[0]["round_number"] == 1
    assert entries[0]["whatsapp_number"] == "+911111111111"
    assert entries[1]["round_number"] == 2


def test_connections_repeat_pairing_counts_once(client, db, event):
    # Met the same person in two rounds → 2 entries, but 1 unique person
    me = make_attendee(db, event["id"], name="Me")
    b = make_attendee(db, event["id"], name="B")
    r1 = make_round(db, event["id"], round_number=1, status="completed")
    r2 = make_round(db, event["id"], round_number=2, status="completed")

    make_assignment(db, event["id"], r1["id"], me["id"], 1)
    make_assignment(db, event["id"], r1["id"], b["id"], 1)
    make_assignment(db, event["id"], r2["id"], me["id"], 4)
    make_assignment(db, event["id"], r2["id"], b["id"], 4)

    response = client.get(f"/events/{event['id']}/attendees/{me['id']}/connections")
    body = response.json()
    assert body["total_people_met"] == 1
    assert len(body["connections"]) == 2
