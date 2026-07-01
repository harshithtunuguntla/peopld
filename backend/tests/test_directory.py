"""Pre-event attendee directory — the 'who's coming' list (Phase 1)."""

from tests.conftest import (
    ATTENDEE_AUTH,
    ATTENDEE_USER_ID,
    AUTH,
    OTHER_ATTENDEE_AUTH,
    make_attendee,
)


def _viewer(db, event_id, **overrides):
    """The signed-in attendee doing the browsing (resolved from ATTENDEE_AUTH)."""
    return make_attendee(db, event_id, name="Me", user_id=ATTENDEE_USER_ID, **overrides)


def test_directory_requires_auth(client, event):
    res = client.get(f"/events/{event['id']}/directory")
    assert res.status_code == 401


def test_directory_forbidden_for_non_registrant(client, db, event):
    # A signed-in user who hasn't registered for this event can't see the list.
    make_attendee(db, event["id"], name="Coming")
    res = client.get(f"/events/{event['id']}/directory", headers=OTHER_ATTENDEE_AUTH)
    assert res.status_code == 403


def test_registered_attendee_sees_others_excluding_self(client, db, event):
    _viewer(db, event["id"])
    make_attendee(db, event["id"], name="Asha")
    make_attendee(db, event["id"], name="Ravi")

    res = client.get(f"/events/{event['id']}/directory", headers=ATTENDEE_AUTH)
    assert res.status_code == 200
    body = res.json()
    names = [a["name"] for a in body["attendees"]]
    assert "Me" not in names  # never see your own card
    assert set(names) == {"Asha", "Ravi"}
    assert body["count"] == 2


def test_directory_hides_opted_out(client, db, event):
    _viewer(db, event["id"])
    make_attendee(db, event["id"], name="Visible")
    make_attendee(db, event["id"], name="Hidden", show_in_directory=False)

    res = client.get(f"/events/{event['id']}/directory", headers=ATTENDEE_AUTH)
    names = [a["name"] for a in res.json()["attendees"]]
    assert names == ["Visible"]


def test_directory_excludes_left_attendees(client, db, event):
    _viewer(db, event["id"])
    make_attendee(db, event["id"], name="Here", status="arrived")
    make_attendee(db, event["id"], name="Gone", status="left")

    res = client.get(f"/events/{event['id']}/directory", headers=ATTENDEE_AUTH)
    names = [a["name"] for a in res.json()["attendees"]]
    assert names == ["Here"]


def test_directory_owner_can_view(client, db, event):
    make_attendee(db, event["id"], name="Asha")
    res = client.get(f"/events/{event['id']}/directory", headers=AUTH)
    assert res.status_code == 200
    assert res.json()["count"] == 1


def test_directory_computes_shared_interests(client, db, event):
    _viewer(db, event["id"], interests=["AI", "Climate"])
    make_attendee(db, event["id"], name="Asha", interests=["climate", "hiring"])

    res = client.get(f"/events/{event['id']}/directory", headers=ATTENDEE_AUTH)
    entry = res.json()["attendees"][0]
    assert entry["shared_interests"] == ["climate"]  # case-insensitive overlap
    assert set(entry["interests"]) == {"climate", "hiring"}


def test_directory_open_channels_are_public(client, db, event):
    """IG / X / email / pro links are the open tier — shown to anyone on the list."""
    _viewer(db, event["id"])
    make_attendee(db, event["id"], name="Asha", website_url="https://asha.dev",
                  linkedin_url="https://linkedin.com/in/asha",
                  instagram="asha.codes", twitter="asha_x", email="asha@x.dev")
    res = client.get(f"/events/{event['id']}/directory", headers=ATTENDEE_AUTH)
    entry = res.json()["attendees"][0]
    assert entry["instagram"] == "asha.codes"
    assert entry["twitter"] == "asha_x"
    assert entry["email"] == "asha@x.dev"
    assert entry["website_url"] == "https://asha.dev"


def test_directory_gates_phone_by_visibility(client, db, event):
    """Phone is the ONE gated channel — only surfaced when the owner opted in.
    Enforced server-side, so a hidden number never leaves the API."""
    _viewer(db, event["id"])
    make_attendee(db, event["id"], name="Shy", phone="9876543210",
                  phone_dial_code="+91", phone_visible=False)
    make_attendee(db, event["id"], name="Open", phone="1234567890",
                  phone_dial_code="+91", phone_visible=True)

    res = client.get(f"/events/{event['id']}/directory", headers=ATTENDEE_AUTH)
    by_name = {a["name"]: a for a in res.json()["attendees"]}
    assert by_name["Shy"]["phone"] is None
    assert by_name["Shy"]["phone_dial_code"] is None
    assert by_name["Open"]["phone"] == "1234567890"
    assert by_name["Open"]["phone_dial_code"] == "+91"
    # The hidden number must not appear anywhere in the payload.
    assert "9876543210" not in res.text


def test_directory_hides_picks_after_event_ended(client, db, event):
    """Once the event has ended, seating is history — cap 0 tells the UI to drop the
    'want to meet' controls and become a pure 'who was here' contact list."""
    _viewer(db, event["id"])
    make_attendee(db, event["id"], name="Asha")
    db.table("events").update({"status": "ended"}).eq("id", event["id"]).execute()

    res = client.get(f"/events/{event['id']}/directory", headers=ATTENDEE_AUTH)
    assert res.status_code == 200
    assert res.json()["my_intents_cap"] == 0


def test_directory_speakers_first_and_counted(client, db, event):
    _viewer(db, event["id"])
    make_attendee(db, event["id"], name="Zara", tag="attendee")
    make_attendee(db, event["id"], name="Bob", tag="speaker")

    res = client.get(f"/events/{event['id']}/directory", headers=ATTENDEE_AUTH)
    body = res.json()
    assert body["speakers"] == 1
    assert body["attendees"][0]["name"] == "Bob"  # speakers float to the top


def test_organizer_can_tag_speaker(client, db, event):
    a = make_attendee(db, event["id"], name="Asha")
    res = client.patch(
        f"/events/{event['id']}/attendees/{a['id']}",
        json={"tag": "speaker"},
        headers=AUTH,
    )
    assert res.status_code == 200
    assert res.json()["tag"] == "speaker"
