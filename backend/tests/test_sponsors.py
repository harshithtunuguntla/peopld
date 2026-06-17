"""Sponsors & branding tests — GET (public) / PUT (owner-only) /events/:id/sponsors."""

from tests.conftest import AUTH, OTHER_AUTH, ATTENDEE_AUTH


def _put(client, event_id, sponsors, headers=AUTH):
    return client.put(f"/events/{event_id}/sponsors", json={"sponsors": sponsors}, headers=headers)


def test_get_sponsors_is_public_and_empty_by_default(client, event):
    r = client.get(f"/events/{event['id']}/sponsors")  # no auth
    assert r.status_code == 200
    body = r.json()
    assert body["event_name"] == event["name"]
    assert body["sponsors"] == []
    assert body["show_event_logo"] is True
    assert body["logo_url"] is None


def test_replace_sponsors_requires_owner(client, event):
    # A different organizer can't author this event's sponsors.
    r = _put(client, event["id"], [{"name": "Acme"}], headers=OTHER_AUTH)
    assert r.status_code == 403
    # An attendee (no organizer role) is rejected too.
    assert _put(client, event["id"], [{"name": "Acme"}], headers=ATTENDEE_AUTH).status_code == 403


def test_put_then_get_round_trip_preserves_order(client, event):
    sponsors = [
        {"name": "Title Co", "image_url": "https://img/x.png", "tagline": "We back founders", "url": "https://title.co"},
        {"name": "Gold Co", "image_url": "https://img/g.png"},
    ]
    put = _put(client, event["id"], sponsors)
    assert put.status_code == 200
    assert [s["name"] for s in put.json()["sponsors"]] == ["Title Co", "Gold Co"]

    got = client.get(f"/events/{event['id']}/sponsors").json()
    assert [s["name"] for s in got["sponsors"]] == ["Title Co", "Gold Co"]
    assert got["sponsors"][0]["tagline"] == "We back founders"
    assert got["sponsors"][0]["url"] == "https://title.co"


def test_put_replaces_not_appends(client, event):
    _put(client, event["id"], [{"name": "First"}])
    _put(client, event["id"], [{"name": "Second"}])
    got = client.get(f"/events/{event['id']}/sponsors").json()
    assert [s["name"] for s in got["sponsors"]] == ["Second"]


def test_put_drops_blank_rows(client, event):
    sponsors = [
        {"name": "Real"},
        {"name": "", "image_url": ""},  # nothing to show → dropped
        {"name": "   ", "image_url": None},  # whitespace only → dropped
        {"name": "", "image_url": "https://img/only-logo.png"},  # image-only is fine
    ]
    got = _put(client, event["id"], sponsors).json()
    assert len(got["sponsors"]) == 2
    assert got["sponsors"][0]["name"] == "Real"
    # image-only row gets a fallback display name
    assert got["sponsors"][1]["image_url"] == "https://img/only-logo.png"


def test_put_caps_sponsor_count(client, event):
    many = [{"name": f"S{i}"} for i in range(50)]
    got = _put(client, event["id"], many).json()
    assert len(got["sponsors"]) == 20  # MAX_SPONSORS


def test_logo_and_toggle_via_event_patch(client, event):
    r = client.patch(
        f"/events/{event['id']}",
        json={"logo_url": "https://img/logo.png", "show_event_logo": False},
        headers=AUTH,
    )
    assert r.status_code == 200
    assert r.json()["logo_url"] == "https://img/logo.png"
    assert r.json()["show_event_logo"] is False

    branding = client.get(f"/events/{event['id']}/sponsors").json()
    assert branding["logo_url"] == "https://img/logo.png"
    assert branding["show_event_logo"] is False


def test_clearing_logo_with_empty_string(client, event):
    client.patch(f"/events/{event['id']}", json={"logo_url": "https://img/logo.png"}, headers=AUTH)
    client.patch(f"/events/{event['id']}", json={"logo_url": ""}, headers=AUTH)
    assert client.get(f"/events/{event['id']}/sponsors").json()["logo_url"] is None
