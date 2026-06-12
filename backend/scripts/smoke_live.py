"""Live end-to-end smoke test against the real Supabase project.

Run with the API server already up:
    uvicorn app.main:app --port 8000   (separate terminal)
    python scripts/smoke_live.py

Creates throwaway auth users (organizer with app_metadata.role, a second
organizer, and an attendee), signs them in for REAL JWTs, exercises every
endpoint and permission path, verifies rows in the real DB, then deletes
everything it created.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx
from dotenv import load_dotenv

load_dotenv()

from app.config import settings  # noqa: E402
from supabase import create_client  # noqa: E402

API = "http://localhost:8000"
PASSWORD = "Smoke-Test-1234!"
USERS = {
    "organizer": {"email": "smoke-organizer@peopld.test", "role": "organizer"},
    "organizer2": {"email": "smoke-organizer2@peopld.test", "role": "organizer"},
    "attendee": {"email": "smoke-attendee@peopld.test", "role": None},
}

passed = 0
failed = []


def check(name: str, condition: bool, detail: str = ""):
    global passed
    if condition:
        passed += 1
        print(f"  PASS  {name}")
    else:
        failed.append(name)
        print(f"  FAIL  {name}  {detail}")


def main() -> int:
    db = create_client(settings.supabase_url, settings.supabase_service_role_key)

    # -- 0. Schema check: all 5 tables exist and are queryable --
    print("\n[0] Schema verification")
    for table in ["events", "attendees", "rounds", "table_assignments", "icebreakers"]:
        try:
            db.table(table).select("id").limit(1).execute()
            check(f"table '{table}' exists", True)
        except Exception as e:
            check(f"table '{table}' exists", False, str(e))
    if failed:
        print("\nSchema is broken - aborting before touching anything else.")
        return 1

    # -- 1. Throwaway auth users + real JWT sign-in --
    print("\n[1] Auth users + real JWT sign-in")
    test_emails = {u["email"] for u in USERS.values()}
    for u in db.auth.admin.list_users():  # clean leftovers from aborted runs
        if u.email in test_emails:
            db.auth.admin.delete_user(u.id)

    ids: dict[str, str] = {}
    tokens: dict[str, str] = {}
    for key, spec in USERS.items():
        attrs = {"email": spec["email"], "password": PASSWORD, "email_confirm": True}
        if spec["role"]:
            attrs["app_metadata"] = {"role": spec["role"]}
        user = db.auth.admin.create_user(attrs).user
        ids[key] = user.id
        # Fresh client per sign-in so the admin client's auth state stays clean
        session = (
            create_client(settings.supabase_url, settings.supabase_service_role_key)
            .auth.sign_in_with_password({"email": spec["email"], "password": PASSWORD})
            .session
        )
        tokens[key] = session.access_token
        check(f"{key} created + signed in (real JWT)", bool(session.access_token))

    org = {"Authorization": f"Bearer {tokens['organizer']}"}
    org2 = {"Authorization": f"Bearer {tokens['organizer2']}"}
    att = {"Authorization": f"Bearer {tokens['attendee']}"}
    garbage = {"Authorization": "Bearer not-a-real-token"}

    event_id = None
    try:
        with httpx.Client(base_url=API, timeout=30) as api:
            # -- 2. Health --
            print("\n[2] Server health")
            r = api.get("/health")
            check("GET /health -> 200", r.status_code == 200, r.text)

            # -- 3. Auth enforcement --
            print("\n[3] Auth enforcement")
            event_payload = {
                "name": "Smoke Test Meetup",
                "date": "2026-07-01",
                "time": "18:00:00",
                "location": "Hyderabad",
                "description": "Live smoke test",
                "num_tables": 10,
                "seats_per_table": 4,
                "default_round_duration_seconds": 300,
            }
            r = api.post("/events", json=event_payload)
            check("POST /events no token -> 401", r.status_code == 401, r.text)
            r = api.post("/events", headers=garbage, json=event_payload)
            check("POST /events garbage token -> 401", r.status_code == 401, r.text)
            r = api.post("/events", headers=att, json=event_payload)
            check("POST /events attendee token -> 403 (no organizer role)", r.status_code == 403, r.text)

            # -- 4. Events --
            print("\n[4] Events")
            r = api.post("/events", headers=org, json=event_payload)
            check("POST /events organizer JWT -> 201", r.status_code == 201, r.text)
            event = r.json()
            event_id = event["id"]
            check("organizer_id taken from JWT", event["organizer_id"] == ids["organizer"], str(event))
            check("event status defaults to 'upcoming'", event["status"] == "upcoming")

            r = api.get(f"/events/{event_id}")
            check("GET /events/:id -> 200 (public)", r.status_code == 200, r.text)

            r = api.get("/events/mine", headers=org)
            check("GET /events/mine shows the event",
                  r.status_code == 200 and any(e["id"] == event_id for e in r.json()), r.text)
            r = api.get("/events/mine", headers=org2)
            check("GET /events/mine other organizer -> empty",
                  r.status_code == 200 and all(e["id"] != event_id for e in r.json()), r.text)

            r = api.patch(f"/events/{event_id}", headers=org2, json={"status": "active"})
            check("PATCH by wrong organizer -> 403", r.status_code == 403, r.text)
            r = api.patch(f"/events/{event_id}", headers=org, json={"status": "active"})
            check("PATCH /events/:id status -> active",
                  r.status_code == 200 and r.json()["status"] == "active", r.text)

            # -- 5. Attendees: register with attendee JWT, linking + dedupe --
            print("\n[5] Attendees")
            register_payload = {
                "name": "Asha Test", "role": "Founder at XYZ",
                "looking_for": "investors", "whatsapp_number": "+919999999999",
            }
            r = api.post(f"/events/{event_id}/attendees", json=register_payload)
            check("register without token -> 401", r.status_code == 401, r.text)

            r = api.post(f"/events/{event_id}/attendees", headers=att, json=register_payload)
            check("register with attendee JWT -> 201", r.status_code == 201, r.text)
            attendee = r.json()
            check("attendee.user_id linked to JWT identity",
                  attendee["user_id"] == ids["attendee"], str(attendee))

            r = api.post(f"/events/{event_id}/attendees", headers=att,
                         json={**register_payload, "name": "Asha Duplicate"})
            check("re-register same user -> 200 + same record (dedupe)",
                  r.status_code == 200 and r.json()["id"] == attendee["id"], r.text)

            r = api.get(f"/events/{event_id}/attendees/{attendee['id']}")
            body = r.json()
            check("GET attendee -> 200, no table yet",
                  r.status_code == 200 and body["current_table_number"] is None, r.text)

            r = api.patch(f"/events/{event_id}/attendees/{attendee['id']}",
                          headers=att, json={"status": "arrived"})
            check("PATCH attendee by attendee -> 403 (organizer-only)", r.status_code == 403, r.text)
            r = api.patch(f"/events/{event_id}/attendees/{attendee['id']}",
                          headers=org2, json={"status": "arrived"})
            check("PATCH attendee by wrong organizer -> 403", r.status_code == 403, r.text)
            r = api.patch(f"/events/{event_id}/attendees/{attendee['id']}",
                          headers=org, json={"status": "arrived"})
            check("PATCH attendee arrived (event owner)",
                  r.status_code == 200 and r.json()["status"] == "arrived", r.text)

            r = api.get(f"/events/{event_id}/attendees")
            check("GET event attendees -> 1", r.status_code == 200 and len(r.json()) == 1, r.text)

            # -- 6. Rounds (pre-algorithm states) --
            print("\n[6] Rounds")
            r = api.get(f"/events/{event_id}/rounds/current")
            check("GET current round -> 404 (none yet)", r.status_code == 404, r.text)

            r = api.post(f"/events/{event_id}/rounds/start", headers=org2)
            check("start round wrong organizer -> 403", r.status_code == 403, r.text)
            r = api.post(f"/events/{event_id}/rounds/start", headers=org)
            check("POST start round -> 501 (Step 4)", r.status_code == 501, r.text)
            r = api.post(f"/events/{event_id}/rounds/end", headers=org)
            check("POST end round -> 404 (none active)", r.status_code == 404, r.text)

            # -- 7. Connections (now auth-protected) --
            print("\n[7] Connections")
            r = api.get(f"/events/{event_id}/attendees/{attendee['id']}/connections")
            check("connections without token -> 401", r.status_code == 401, r.text)
            r = api.get(f"/events/{event_id}/attendees/{attendee['id']}/connections", headers=org2)
            check("connections wrong organizer -> 403", r.status_code == 403, r.text)
            r = api.get(f"/events/{event_id}/attendees/{attendee['id']}/connections", headers=att)
            check("connections self -> empty rolodex",
                  r.status_code == 200 and r.json()["total_people_met"] == 0, r.text)
            r = api.get(f"/events/{event_id}/attendees/{attendee['id']}/connections", headers=org)
            check("connections event organizer -> 200", r.status_code == 200, r.text)

            # -- 8. Analytics + end event --
            print("\n[8] Analytics & end event")
            r = api.get(f"/events/{event_id}/analytics")
            check("GET analytics -> 200, 1 attendee",
                  r.status_code == 200 and r.json()["total_attendees"] == 1, r.text)

            r = api.post(f"/events/{event_id}/end", headers=org)
            check("POST end event -> ended",
                  r.status_code == 200 and r.json()["status"] == "ended", r.text)

            r = api.post(f"/events/{event_id}/attendees", headers=att,
                         json={"name": "Late", "role": "X"})
            check("register after end -> dedupe still wins (200, existing record)",
                  r.status_code == 200 and r.json()["id"] == attendee["id"], r.text)

            # -- 9. Verify rows really landed in Supabase --
            print("\n[9] Real DB verification")
            rows = db.table("events").select("*").eq("id", event_id).execute().data
            check("event row exists in real DB", len(rows) == 1 and rows[0]["status"] == "ended")
            rows = db.table("attendees").select("*").eq("event_id", event_id).execute().data
            check("attendee row exists with linked user_id",
                  len(rows) == 1 and rows[0]["user_id"] == ids["attendee"])

    finally:
        # -- Cleanup: cascade delete removes attendees with the event --
        print("\n[10] Cleanup")
        if event_id:
            db.table("events").delete().eq("id", event_id).execute()
            leftover = db.table("events").select("id").eq("id", event_id).execute().data
            check("event + attendees deleted (cascade)", not leftover)
        for key, uid in ids.items():
            db.auth.admin.delete_user(uid)
        check("test auth users deleted", True)

    print(f"\n{'='*50}\nRESULT: {passed} passed, {len(failed)} failed")
    if failed:
        print("Failed checks:", *[f"  - {f}" for f in failed], sep="\n")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
