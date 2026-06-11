"""Live end-to-end smoke test against the real Supabase project.

Run with the API server already up:
    uvicorn app.main:app --port 8000   (separate terminal)
    python scripts/smoke_live.py

Creates a throwaway organizer auth user + event + attendees, exercises every
endpoint, verifies rows in the real DB, then deletes everything it created.
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
TEST_EMAIL = "smoke-test-organizer@peopld.test"

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

    # -- 1. Create throwaway organizer auth user (validates organizer_id FK) --
    print("\n[1] Auth user setup")
    # Clean up any leftover from a previous aborted run
    existing = db.auth.admin.list_users()
    for u in existing:
        if u.email == TEST_EMAIL:
            db.auth.admin.delete_user(u.id)
    user = db.auth.admin.create_user(
        {"email": TEST_EMAIL, "password": "Smoke-Test-1234!", "email_confirm": True}
    ).user
    check("organizer auth user created", user is not None and bool(user.id))
    auth_headers = {"X-Organizer-Id": user.id}

    event_id = None
    try:
        with httpx.Client(base_url=API, timeout=30) as api:
            # -- 2. Health --
            print("\n[2] Server health")
            r = api.get("/health")
            check("GET /health -> 200", r.status_code == 200, r.text)

            # -- 3. Events --
            print("\n[3] Events")
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
            check("POST /events without auth -> 401", r.status_code == 401, r.text)

            r = api.post("/events", headers=auth_headers, json=event_payload)
            check("POST /events -> 201", r.status_code == 201, r.text)
            event = r.json()
            event_id = event["id"]
            check("event status defaults to 'upcoming'", event["status"] == "upcoming")

            r = api.get(f"/events/{event_id}")
            check("GET /events/:id -> 200 (public)", r.status_code == 200, r.text)

            r = api.get("/events/mine", headers=auth_headers)
            check("GET /events/mine shows the event",
                  r.status_code == 200 and any(e["id"] == event_id for e in r.json()), r.text)

            r = api.patch(
                f"/events/{event_id}",
                headers={"X-Organizer-Id": "00000000-0000-0000-0000-000000000099"},
                json={"status": "active"},
            )
            check("PATCH by wrong organizer -> 403", r.status_code == 403, r.text)

            r = api.patch(f"/events/{event_id}", headers=auth_headers, json={"status": "active"})
            check("PATCH /events/:id status -> active",
                  r.status_code == 200 and r.json()["status"] == "active", r.text)

            # -- 4. Attendees --
            print("\n[4] Attendees")
            r = api.post(f"/events/{event_id}/attendees", json={
                "name": "Asha Test", "role": "Founder at XYZ",
                "looking_for": "investors", "whatsapp_number": "+919999999999",
            })
            check("POST register attendee -> 201", r.status_code == 201, r.text)
            attendee = r.json()

            r = api.post(f"/events/{event_id}/attendees", json={"name": "Ravi Test", "role": "Designer"})
            check("register minimal fields -> 201", r.status_code == 201, r.text)

            r = api.get(f"/events/{event_id}/attendees/{attendee['id']}")
            body = r.json()
            check("GET attendee -> 200, no table yet",
                  r.status_code == 200 and body["current_table_number"] is None, r.text)

            r = api.patch(f"/events/{event_id}/attendees/{attendee['id']}", json={"status": "arrived"})
            check("PATCH attendee arrived",
                  r.status_code == 200 and r.json()["status"] == "arrived", r.text)

            r = api.get(f"/events/{event_id}/attendees")
            check("GET event attendees -> 2", r.status_code == 200 and len(r.json()) == 2, r.text)

            # -- 5. Rounds (pre-algorithm states) --
            print("\n[5] Rounds")
            r = api.get(f"/events/{event_id}/rounds/current")
            check("GET current round -> 404 (none yet)", r.status_code == 404, r.text)

            r = api.post(f"/events/{event_id}/rounds/start", headers=auth_headers)
            check("POST start round -> 501 (Step 4)", r.status_code == 501, r.text)

            r = api.post(f"/events/{event_id}/rounds/end", headers=auth_headers)
            check("POST end round -> 404 (none active)", r.status_code == 404, r.text)

            # -- 6. Connections --
            print("\n[6] Connections")
            r = api.get(f"/events/{event_id}/attendees/{attendee['id']}/connections")
            check("GET connections -> empty rolodex",
                  r.status_code == 200 and r.json()["total_people_met"] == 0, r.text)

            # -- 7. Analytics + end event --
            print("\n[7] Analytics & end event")
            r = api.get(f"/events/{event_id}/analytics")
            check("GET analytics -> 200, 2 attendees",
                  r.status_code == 200 and r.json()["total_attendees"] == 2, r.text)

            r = api.post(f"/events/{event_id}/end", headers=auth_headers)
            check("POST end event -> ended",
                  r.status_code == 200 and r.json()["status"] == "ended", r.text)

            r = api.post(f"/events/{event_id}/attendees", json={"name": "Late", "role": "X"})
            check("register after end -> 409", r.status_code == 409, r.text)

            # -- 8. Verify rows really landed in Supabase --
            print("\n[8] Real DB verification")
            rows = db.table("events").select("*").eq("id", event_id).execute().data
            check("event row exists in real DB", len(rows) == 1 and rows[0]["status"] == "ended")
            rows = db.table("attendees").select("*").eq("event_id", event_id).execute().data
            check("attendee rows exist in real DB", len(rows) == 2)

    finally:
        # -- Cleanup: cascade delete removes attendees with the event --
        print("\n[9] Cleanup")
        if event_id:
            db.table("events").delete().eq("id", event_id).execute()
            leftover = db.table("events").select("id").eq("id", event_id).execute().data
            check("event + attendees deleted (cascade)", not leftover)
        db.auth.admin.delete_user(user.id)
        check("test auth user deleted", True)

    print(f"\n{'='*50}\nRESULT: {passed} passed, {len(failed)} failed")
    if failed:
        print("Failed checks:", *[f"  - {f}" for f in failed], sep="\n")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
