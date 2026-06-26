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
    "company": "XYZ Labs",
    "description": "Building an AI scheduling tool",
    "looking_for": "investors, designers",
    "linkedin_url": "https://linkedin.com/in/asha",
    "website_url": "https://asha.dev",
}


def test_register_requires_auth(client, event):
    response = client.post(f"/events/{event['id']}/attendees", json=REGISTER_PAYLOAD)
    assert response.status_code == 401


def test_register_captures_avatar_url(client, event):
    payload = {**REGISTER_PAYLOAD, "avatar_url": "https://lh3.googleusercontent.com/a/x"}
    response = client.post(f"/events/{event['id']}/attendees", json=payload, headers=ATTENDEE_AUTH)
    assert response.status_code == 201
    assert response.json()["avatar_url"] == "https://lh3.googleusercontent.com/a/x"


def test_organizer_adds_walkin(client, event):
    response = client.post(
        f"/events/{event['id']}/attendees/walkin",
        json={"name": "Walk In", "role": "Guest"},
        headers=AUTH,
    )
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Walk In"
    assert body["status"] == "arrived"
    assert body["user_id"] is None


def test_organizer_adds_pre_event_speaker(client, event):
    """Pre-staging a guest/speaker: registered (not in the room yet) + tagged."""
    response = client.post(
        f"/events/{event['id']}/attendees/walkin",
        json={"name": "Keynote Kim", "role": "Speaker", "tag": "speaker", "status": "registered"},
        headers=AUTH,
    )
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "registered"
    assert body["tag"] == "speaker"
    assert body["user_id"] is None


def test_walkin_requires_organizer(client, event):
    assert (
        client.post(
            f"/events/{event['id']}/attendees/walkin",
            json={"name": "X", "role": "Y"},
            headers=ATTENDEE_AUTH,
        ).status_code
        == 403
    )


def test_walkin_wrong_organizer_forbidden(client, event):
    assert (
        client.post(
            f"/events/{event['id']}/attendees/walkin",
            json={"name": "X", "role": "Y"},
            headers=OTHER_AUTH,
        ).status_code
        == 403
    )


def test_register_attendee_links_user_id(client, event):
    response = client.post(
        f"/events/{event['id']}/attendees", json=REGISTER_PAYLOAD, headers=ATTENDEE_AUTH
    )
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Asha"
    # Fixture event has auto_arrive_on_register=true (the pilot default):
    # registering at the venue marks you arrived immediately.
    assert body["status"] == "arrived"
    assert body["event_id"] == event["id"]
    assert body["user_id"] == ATTENDEE_USER_ID


def test_register_without_auto_arrive_stays_registered(client, db, event):
    # Organizer turned the flag off (e.g., pre-registration opens before event day)
    db.table("events").update({"auto_arrive_on_register": False}).eq(
        "id", event["id"]
    ).execute()

    response = client.post(
        f"/events/{event['id']}/attendees", json=REGISTER_PAYLOAD, headers=ATTENDEE_AUTH
    )
    assert response.status_code == 201
    assert response.json()["status"] == "registered"


def test_register_writes_audit_entry(client, db, event):
    client.post(
        f"/events/{event['id']}/attendees", json=REGISTER_PAYLOAD, headers=ATTENDEE_AUTH
    )
    rows = [r for r in db.store["audit_log"] if r["action"] == "attendee.registered"]
    assert len(rows) == 1
    assert rows[0]["actor_user_id"] == ATTENDEE_USER_ID
    assert rows[0]["metadata"] == {"auto_arrived": True}
    # Dedupe path must NOT write a second audit row
    client.post(
        f"/events/{event['id']}/attendees", json=REGISTER_PAYLOAD, headers=ATTENDEE_AUTH
    )
    rows = [r for r in db.store["audit_log"] if r["action"] == "attendee.registered"]
    assert len(rows) == 1


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


def test_same_user_can_register_for_two_events(client, db, event):
    # Dedupe is scoped per-event — one person attends many events
    other_event = db.seed(
        "events",
        {**{k: v for k, v in event.items() if k != "id"}, "name": "Second Meetup"},
    )[0]

    first = client.post(
        f"/events/{event['id']}/attendees", json=REGISTER_PAYLOAD, headers=ATTENDEE_AUTH
    )
    second = client.post(
        f"/events/{other_event['id']}/attendees", json=REGISTER_PAYLOAD, headers=ATTENDEE_AUTH
    )
    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["id"] != second.json()["id"]


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
    assert body["website_url"] is None
    assert body["company"] is None
    assert body["show_in_directory"] is True
    assert body["tag"] == "attendee"


def test_get_attendee_requires_auth(client, db, event):
    attendee = make_attendee(db, event["id"])

    response = client.get(f"/events/{event['id']}/attendees/{attendee['id']}")
    assert response.status_code == 401


def test_get_attendee_other_user_forbidden(client, db, event):
    # Profiles contain contact info — only self or the event organizer
    attendee = make_attendee(db, event["id"], user_id=ATTENDEE_USER_ID)

    response = client.get(
        f"/events/{event['id']}/attendees/{attendee['id']}",
        headers=OTHER_ATTENDEE_AUTH,
    )
    assert response.status_code == 403


def test_get_attendee_self_without_active_round(client, db, event):
    attendee = make_attendee(db, event["id"], user_id=ATTENDEE_USER_ID)

    response = client.get(
        f"/events/{event['id']}/attendees/{attendee['id']}", headers=ATTENDEE_AUTH
    )
    assert response.status_code == 200
    body = response.json()
    assert body["current_table_number"] is None
    assert body["current_round_id"] is None


def test_get_attendee_with_active_assignment(client, db, event):
    # Event organizer can view any attendee
    attendee = make_attendee(db, event["id"])
    round_row = make_round(db, event["id"], round_number=3, status="active")
    make_assignment(db, event["id"], round_row["id"], attendee["id"], table_number=7)

    response = client.get(
        f"/events/{event['id']}/attendees/{attendee['id']}", headers=AUTH
    )
    assert response.status_code == 200
    body = response.json()
    assert body["current_table_number"] == 7
    assert body["current_round_id"] == round_row["id"]
    assert body["current_round_number"] == 3


def test_get_attendee_not_found(client, event):
    response = client.get(
        f"/events/{event['id']}/attendees/00000000-0000-0000-0000-000000000000",
        headers=AUTH,
    )
    assert response.status_code == 404


def test_my_registration_requires_auth(client, event):
    response = client.get(f"/events/{event['id']}/attendees/me")
    assert response.status_code == 401


def test_my_registration_not_registered(client, event):
    response = client.get(
        f"/events/{event['id']}/attendees/me", headers=ATTENDEE_AUTH
    )
    assert response.status_code == 404


def test_my_registration_found(client, event):
    created = client.post(
        f"/events/{event['id']}/attendees", json=REGISTER_PAYLOAD, headers=ATTENDEE_AUTH
    )

    response = client.get(
        f"/events/{event['id']}/attendees/me", headers=ATTENDEE_AUTH
    )
    assert response.status_code == 200
    assert response.json()["id"] == created.json()["id"]


def test_profile_defaults_requires_auth(client, event):
    response = client.get(f"/events/{event['id']}/attendees/me/profile-defaults")
    assert response.status_code == 401


def test_profile_defaults_empty_for_first_event(client, event):
    response = client.get(
        f"/events/{event['id']}/attendees/me/profile-defaults", headers=ATTENDEE_AUTH
    )
    assert response.status_code == 200
    body = response.json()
    assert body["name"] is None
    assert body["role"] is None
    assert body["interests"] == []


def test_profile_defaults_uses_latest_attendee_profile(client, db, event):
    older_event = db.seed(
        "events",
        {**{k: v for k, v in event.items() if k != "id"}, "name": "Older Meetup"},
    )[0]
    make_attendee(
        db,
        older_event["id"],
        name="Old Name",
        user_id=ATTENDEE_USER_ID,
        role="Builder",
        company="Old Co",
        description="Old description",
        looking_for="old asks",
        linkedin_url="https://linkedin.com/in/old",
        website_url="https://old.example",
        interests=["Ops"],
        created_at="2026-01-01T00:00:00+00:00",
    )
    make_attendee(
        db,
        event["id"],
        name="Asha Reddy",
        user_id=ATTENDEE_USER_ID,
        role="Founder",
        company="Peopld",
        description="Building event intelligence",
        looking_for="design partners",
        linkedin_url="https://linkedin.com/in/asha",
        website_url="https://asha.example",
        interests=["AI", "Events"],
        created_at="2026-02-01T00:00:00+00:00",
    )

    response = client.get(
        f"/events/{event['id']}/attendees/me/profile-defaults", headers=ATTENDEE_AUTH
    )
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Asha Reddy"
    assert body["role"] == "Founder"
    assert body["company"] == "Peopld"
    assert body["description"] == "Building event intelligence"
    assert body["looking_for"] == "design partners"
    assert body["linkedin_url"] == "https://linkedin.com/in/asha"
    assert body["website_url"] == "https://asha.example"
    assert body["interests"] == ["AI", "Events"]


def test_register_upserts_global_profile(client, db, event):
    """Registering for an event keeps the one global profile (user_profiles) in
    sync — not just this event's attendee row — so a correction made while
    joining flows back into what prefills the NEXT event too."""
    response = client.post(f"/events/{event['id']}/attendees", json=REGISTER_PAYLOAD, headers=ATTENDEE_AUTH)
    assert response.status_code == 201

    profiles = db.store.get("user_profiles", [])
    assert len(profiles) == 1
    assert profiles[0]["name"] == REGISTER_PAYLOAD["name"]
    assert profiles[0]["role"] == REGISTER_PAYLOAD["role"]
    assert profiles[0]["linkedin_url"] == REGISTER_PAYLOAD["linkedin_url"]

    got = client.get("/me/profile", headers=ATTENDEE_AUTH).json()
    assert got["complete"] is True
    assert got["name"] == REGISTER_PAYLOAD["name"]


def test_register_succeeds_even_if_global_profile_sync_fails(client, db, event, monkeypatch):
    """Reliability over cleverness: a broken/lagging global-profile sync (e.g. a
    migration that hasn't landed yet) must never block registration itself —
    the one flow that absolutely cannot fail at a live event."""
    def _boom(*_args, **_kwargs):
        raise Exception("relation \"user_profiles\" does not exist")

    monkeypatch.setattr("app.deps.upsert_user_profile", _boom)

    response = client.post(f"/events/{event['id']}/attendees", json=REGISTER_PAYLOAD, headers=ATTENDEE_AUTH)
    assert response.status_code == 201
    assert response.json()["name"] == REGISTER_PAYLOAD["name"]
    assert db.store.get("user_profiles", []) == []  # the sync genuinely failed


def test_registering_for_a_second_event_updates_the_same_global_profile(client, db, event):
    client.post(f"/events/{event['id']}/attendees", json=REGISTER_PAYLOAD, headers=ATTENDEE_AUTH)

    second_event = db.seed(
        "events", {**{k: v for k, v in event.items() if k != "id"}, "name": "Second Mixer"}
    )[0]
    corrected = {**REGISTER_PAYLOAD, "role": "Founder & CEO"}
    client.post(f"/events/{second_event['id']}/attendees", json=corrected, headers=ATTENDEE_AUTH)

    # One global profile row throughout, now reflecting the correction.
    assert len(db.store.get("user_profiles", [])) == 1
    got = client.get("/me/profile", headers=ATTENDEE_AUTH).json()
    assert got["role"] == "Founder & CEO"


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

    audit = [r for r in db.store["audit_log"] if r["action"] == "attendee.status_changed"]
    assert len(audit) == 1
    assert audit[0]["metadata"] == {"from": "registered", "to": "arrived"}


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


def test_organizer_edits_attendee_identity(client, db, event):
    # F6: organizer fixes a hurried walk-in typo (name/role/company).
    attendee = make_attendee(db, event["id"], name="Jhon", role="Fonder", company="Acme")

    response = client.patch(
        f"/events/{event['id']}/attendees/{attendee['id']}",
        json={"name": "John Smith", "role": "Founder", "company": "Acme Labs"},
        headers=AUTH,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "John Smith"
    assert body["role"] == "Founder"
    assert body["company"] == "Acme Labs"
    # status is untouched, so the edit is logged as a generic update (fields only).
    audit = [r for r in db.store["audit_log"] if r["action"] == "attendee.updated"]
    assert len(audit) == 1
    assert audit[0]["metadata"] == {"fields": ["company", "name", "role"]}


def test_organizer_edit_trims_and_rejects_blank_name(client, db, event):
    attendee = make_attendee(db, event["id"], name="Asha")

    # Whitespace-only name is rejected.
    blank = client.patch(
        f"/events/{event['id']}/attendees/{attendee['id']}",
        json={"name": "   "},
        headers=AUTH,
    )
    assert blank.status_code == 400

    # A real name is trimmed.
    ok = client.patch(
        f"/events/{event['id']}/attendees/{attendee['id']}",
        json={"name": "  Maya  "},
        headers=AUTH,
    )
    assert ok.status_code == 200
    assert ok.json()["name"] == "Maya"


def test_organizer_edit_clears_optional_field(client, db, event):
    attendee = make_attendee(db, event["id"], company="Acme")
    response = client.patch(
        f"/events/{event['id']}/attendees/{attendee['id']}",
        json={"company": ""},
        headers=AUTH,
    )
    assert response.status_code == 200
    assert response.json()["company"] is None


def test_non_owner_cannot_edit_attendee(client, db, event):
    attendee = make_attendee(db, event["id"], name="Asha")
    response = client.patch(
        f"/events/{event['id']}/attendees/{attendee['id']}",
        json={"name": "Hacked"},
        headers=OTHER_AUTH,
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


# --- Access-code gate enforcement (Step 7) ---

def test_register_blocked_without_correct_code(client, db, event):
    """Coded event: wrong/missing code -> 403; correct code -> 201; case-insensitive."""
    db.seed("event_access_codes", {"event_id": event["id"], "code": "MIXER"})
    eid = event["id"]

    missing = client.post(f"/events/{eid}/attendees", json=REGISTER_PAYLOAD, headers=ATTENDEE_AUTH)
    assert missing.status_code == 403

    wrong = client.post(
        f"/events/{eid}/attendees", json={**REGISTER_PAYLOAD, "access_code": "nope"}, headers=ATTENDEE_AUTH
    )
    assert wrong.status_code == 403

    ok = client.post(
        f"/events/{eid}/attendees", json={**REGISTER_PAYLOAD, "access_code": " mixer "}, headers=ATTENDEE_AUTH
    )
    assert ok.status_code == 201
    assert "access_code" not in ok.json()  # never stored/echoed on the attendee


def test_already_registered_skips_code_gate(client, db, event):
    """A returning attendee reaches their record even without re-entering the code."""
    db.seed("event_access_codes", {"event_id": event["id"], "code": "MIXER"})
    eid = event["id"]
    first = client.post(
        f"/events/{eid}/attendees", json={**REGISTER_PAYLOAD, "access_code": "MIXER"}, headers=ATTENDEE_AUTH
    )
    assert first.status_code == 201
    again = client.post(f"/events/{eid}/attendees", json=REGISTER_PAYLOAD, headers=ATTENDEE_AUTH)
    assert again.status_code == 200  # dedupe, no code needed


# --- bulk check-in (one-tap door action) ---


def test_check_in_all_requires_organizer(client, db, event):
    make_attendee(db, event["id"], name="R", status="registered")
    assert client.post(f"/events/{event['id']}/attendees/check-in-all").status_code == 401
    assert client.post(f"/events/{event['id']}/attendees/check-in-all", headers=ATTENDEE_AUTH).status_code == 403
    assert client.post(f"/events/{event['id']}/attendees/check-in-all", headers=OTHER_AUTH).status_code == 403


def test_check_in_all_moves_only_registered(client, db, event):
    make_attendee(db, event["id"], name="R1", status="registered")
    make_attendee(db, event["id"], name="R2", status="registered")
    make_attendee(db, event["id"], name="A1", status="arrived")
    make_attendee(db, event["id"], name="L1", status="left")

    r = client.post(f"/events/{event['id']}/attendees/check-in-all", headers=AUTH)
    assert r.status_code == 200
    assert r.json()["arrived"] == 2  # only the two registered moved

    rows = {a["name"]: a["status"] for a in db.store["attendees"] if a["event_id"] == event["id"]}
    assert rows["R1"] == "arrived"
    assert rows["R2"] == "arrived"
    assert rows["A1"] == "arrived"  # unchanged
    assert rows["L1"] == "left"  # never resurrected


def test_check_in_all_with_nobody_registered_is_noop(client, db, event):
    make_attendee(db, event["id"], name="L1", status="left")
    r = client.post(f"/events/{event['id']}/attendees/check-in-all", headers=AUTH)
    assert r.status_code == 200
    assert r.json()["arrived"] == 0
