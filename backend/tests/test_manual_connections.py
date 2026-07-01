"""Manually-added connections ("Add someone you met") — CRUD + how they merge into
the cross-event /me/connections rolodex, and owner isolation."""

from tests.conftest import ATTENDEE_AUTH, OTHER_ATTENDEE_AUTH


def _create(client, **fields):
    body = {"name": "Priya Nair"}
    body.update(fields)
    return client.post("/me/connections/manual", json=body, headers=ATTENDEE_AUTH)


# --- Create ---

def test_create_manual_connection_appears_in_rolodex(client, db):
    res = _create(
        client,
        role="Product Designer",
        company="Figma",
        instagram="priyadraws",
        note="met at the coffee bar, wants a design intro",
        met_context="coffee bar",
    )
    assert res.status_code == 201
    created = res.json()
    assert created["name"] == "Priya Nair"

    body = client.get("/me/connections", headers=ATTENDEE_AUTH).json()
    cards = {c["name"]: c for c in body["connections"]}
    assert "Priya Nair" in cards
    card = cards["Priya Nair"]
    assert card["source"] == "manual"
    assert card["manual_id"] == created["id"]
    assert card["met"] is False               # never shared a table
    assert card["instagram"] == "priyadraws"
    assert body["rel_counts"]["added"] == 1
    assert body["total_people_met"] == 0      # manual isn't "met"


def test_create_requires_name(client, db):
    res = client.post("/me/connections/manual", json={"name": "   "}, headers=ATTENDEE_AUTH)
    assert res.status_code == 422


def test_manual_without_event_does_not_inflate_events_count(client, db):
    _create(client)
    body = client.get("/me/connections", headers=ATTENDEE_AUTH).json()
    assert body["events_count"] == 0
    # still shows regardless of an event filter being absent
    assert any(c["name"] == "Priya Nair" for c in body["connections"])


def test_manual_connection_tagged_with_event(client, db, event):
    res = _create(client, event_id=event["id"])
    assert res.status_code == 201
    body = client.get("/me/connections", headers=ATTENDEE_AUTH).json()
    card = next(c for c in body["connections"] if c["name"] == "Priya Nair")
    assert card["event_id"] == str(event["id"])
    assert card["event_name"] == event["name"]


# --- Update ---

def test_update_manual_connection(client, db):
    created = _create(client, company="Figma").json()
    res = client.patch(
        f"/me/connections/manual/{created['id']}",
        json={"company": "Framer", "note": "moved to Framer"},
        headers=ATTENDEE_AUTH,
    )
    assert res.status_code == 200
    assert res.json()["company"] == "Framer"
    body = client.get("/me/connections", headers=ATTENDEE_AUTH).json()
    card = next(c for c in body["connections"] if c["name"] == "Priya Nair")
    assert card["company"] == "Framer"
    assert card["note"] == "moved to Framer"


def test_update_cannot_blank_name(client, db):
    created = _create(client).json()
    res = client.patch(
        f"/me/connections/manual/{created['id']}", json={"name": "  "}, headers=ATTENDEE_AUTH
    )
    assert res.status_code == 422


# --- Delete ---

def test_delete_manual_connection(client, db):
    created = _create(client).json()
    res = client.delete(f"/me/connections/manual/{created['id']}", headers=ATTENDEE_AUTH)
    assert res.status_code == 200
    body = client.get("/me/connections", headers=ATTENDEE_AUTH).json()
    assert all(c["name"] != "Priya Nair" for c in body["connections"])


# --- Owner isolation ---

def test_manual_connection_is_private_to_owner(client, db):
    _create(client)
    body = client.get("/me/connections", headers=OTHER_ATTENDEE_AUTH).json()
    assert all(c["name"] != "Priya Nair" for c in body["connections"])


def test_cannot_edit_or_delete_someone_elses_connection(client, db):
    created = _create(client).json()
    edit = client.patch(
        f"/me/connections/manual/{created['id']}",
        json={"company": "Hijack"},
        headers=OTHER_ATTENDEE_AUTH,
    )
    assert edit.status_code == 404
    delete = client.delete(
        f"/me/connections/manual/{created['id']}", headers=OTHER_ATTENDEE_AUTH
    )
    assert delete.status_code == 404
    # untouched for the real owner
    body = client.get("/me/connections", headers=ATTENDEE_AUTH).json()
    assert any(c["name"] == "Priya Nair" for c in body["connections"])
