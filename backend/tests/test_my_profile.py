"""Global user profile — GET/PUT /me/profile.

One profile per signed-in user (not per event), reused as the prefill for every
event they join. For a user who registered before this table existed, falls
back to deriving defaults from their most recent attendee row (same heuristic
the old profile-defaults endpoint used) — covered in test_attendees.py's
profile-defaults tests, which stay green unchanged.
"""

from tests.conftest import ATTENDEE_AUTH, ATTENDEE_USER_ID, make_attendee


def test_get_profile_requires_auth(client):
    assert client.get("/me/profile").status_code == 401


def test_put_profile_requires_auth(client):
    assert client.put("/me/profile", json={"name": "Asha", "role": "Founder"}).status_code == 401


def test_get_profile_incomplete_when_nothing_saved(client, db):
    r = client.get("/me/profile", headers=ATTENDEE_AUTH)
    assert r.status_code == 200
    body = r.json()
    assert body["complete"] is False
    assert body["name"] is None
    assert body["interests"] == []


def test_put_then_get_round_trips(client, db):
    payload = {
        "name": "Asha Reddy",
        "role": "Founder",
        "company": "Peopld",
        "description": "Building event intelligence",
        "looking_for": "design partners",
        "linkedin_url": "https://linkedin.com/in/asha",
        "website_url": "https://asha.dev",
        "interests": ["AI", "Events"],
    }
    put = client.put("/me/profile", json=payload, headers=ATTENDEE_AUTH)
    assert put.status_code == 200
    assert put.json()["complete"] is True
    for key, value in payload.items():
        assert put.json()[key] == value

    got = client.get("/me/profile", headers=ATTENDEE_AUTH)
    assert got.status_code == 200
    body = got.json()
    assert body["complete"] is True
    for key, value in payload.items():
        assert body[key] == value

    # Exactly one row, keyed by user — a second PUT updates it, never duplicates.
    assert len(db.store.get("user_profiles", [])) == 1


def test_put_twice_updates_the_same_row(client, db):
    client.put("/me/profile", json={"name": "Asha", "role": "Founder"}, headers=ATTENDEE_AUTH)
    client.put(
        "/me/profile",
        json={"name": "Asha Reddy", "role": "Founder & CEO"},
        headers=ATTENDEE_AUTH,
    )
    assert len(db.store.get("user_profiles", [])) == 1
    got = client.get("/me/profile", headers=ATTENDEE_AUTH).json()
    assert got["name"] == "Asha Reddy"
    assert got["role"] == "Founder & CEO"


def test_put_profile_requires_name_and_role(client, db):
    assert client.put("/me/profile", json={"name": "", "role": "Founder"}, headers=ATTENDEE_AUTH).status_code == 422
    assert client.put("/me/profile", json={"name": "Asha", "role": "   "}, headers=ATTENDEE_AUTH).status_code == 422
    assert client.put("/me/profile", json={"role": "Founder"}, headers=ATTENDEE_AUTH).status_code == 422
    assert db.store.get("user_profiles", []) == []


def test_global_profile_wins_over_attendee_fallback_when_both_exist(client, db, event):
    """A saved global profile is the single source of truth — it must not be
    shadowed by an older/divergent attendee row from some other event."""
    make_attendee(
        db, event["id"], name="Stale Name", user_id=ATTENDEE_USER_ID, role="Stale Role",
    )
    client.put(
        "/me/profile",
        json={"name": "Fresh Name", "role": "Fresh Role"},
        headers=ATTENDEE_AUTH,
    )
    got = client.get("/me/profile", headers=ATTENDEE_AUTH).json()
    assert got["name"] == "Fresh Name"
    assert got["role"] == "Fresh Role"

    defaults = client.get(
        f"/events/{event['id']}/attendees/me/profile-defaults", headers=ATTENDEE_AUTH
    ).json()
    assert defaults["name"] == "Fresh Name"
    assert defaults["role"] == "Fresh Role"
