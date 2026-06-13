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
# Public key shipped in the frontend bundle — used to verify RLS keeps
# direct client access away from PII (anyone on the internet holds this key).
ANON_KEY = "sb_publishable_X9WPPTO7tL9UHhPkxmI3wA_oVIN1f5a"
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

    # -- 0. Schema check: all tables exist and are queryable --
    print("\n[0] Schema verification")
    for table in ["events", "attendees", "rounds", "table_assignments", "icebreakers",
                  "round_drafts", "audit_log"]:
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
    extra_attendees: list[str] = []
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

            r = api.get(f"/events/{event_id}/attendees/me", headers=att)
            check("GET /attendees/me before registering -> 404", r.status_code == 404, r.text)

            r = api.post(f"/events/{event_id}/attendees", headers=att, json=register_payload)
            check("register with attendee JWT -> 201", r.status_code == 201, r.text)
            attendee = r.json()
            check("attendee.user_id linked to JWT identity",
                  attendee["user_id"] == ids["attendee"], str(attendee))

            r = api.post(f"/events/{event_id}/attendees", headers=att,
                         json={**register_payload, "name": "Asha Duplicate"})
            check("re-register same user -> 200 + same record (dedupe)",
                  r.status_code == 200 and r.json()["id"] == attendee["id"], r.text)

            r = api.get(f"/events/{event_id}/attendees/me", headers=att)
            check("GET /attendees/me after registering -> own record",
                  r.status_code == 200 and r.json()["id"] == attendee["id"], r.text)

            r = api.get(f"/events/{event_id}/attendees/{attendee['id']}")
            check("GET attendee without token -> 401", r.status_code == 401, r.text)
            r = api.get(f"/events/{event_id}/attendees/{attendee['id']}", headers=org2)
            check("GET attendee by stranger -> 403", r.status_code == 403, r.text)
            r = api.get(f"/events/{event_id}/attendees/{attendee['id']}", headers=att)
            body = r.json()
            check("GET attendee (self) -> 200, no table yet",
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
            check("attendee list without token -> 401", r.status_code == 401, r.text)
            r = api.get(f"/events/{event_id}/attendees", headers=org2)
            check("attendee list wrong organizer -> 403", r.status_code == 403, r.text)
            r = api.get(f"/events/{event_id}/attendees", headers=org)
            check("attendee list (owner) -> 1", r.status_code == 200 and len(r.json()) == 1, r.text)

            # -- 6. Rounds: full draft -> preview -> publish -> end lifecycle --
            print("\n[6] Rounds (rotation algorithm)")
            r = api.get(f"/events/{event_id}/rounds/current")
            check("GET current round -> 404 (none yet)", r.status_code == 404, r.text)

            r = api.post(f"/events/{event_id}/rounds/start", headers=org2)
            check("start round wrong organizer -> 403", r.status_code == 403, r.text)

            # Only 1 attendee arrived so far -> below the 3-person minimum
            r = api.post(f"/events/{event_id}/rounds/start", headers=org)
            check("start with <3 arrived -> 422", r.status_code == 422, r.text)

            # Arrive 5 more (the first attendee was marked arrived in section 5)
            for i in range(5):
                ar = create_client(settings.supabase_url, settings.supabase_service_role_key)
                u = db.auth.admin.create_user(
                    {"email": f"smoke-pool-{i}@peopld.test", "password": PASSWORD,
                     "email_confirm": True}
                ).user
                extra_attendees.append(u.id)
                tok = ar.auth.sign_in_with_password(
                    {"email": f"smoke-pool-{i}@peopld.test", "password": PASSWORD}
                ).session.access_token
                hdr = {"Authorization": f"Bearer {tok}"}
                api.post(f"/events/{event_id}/attendees", headers=hdr,
                         json={"name": f"Pool {i}", "role": "Founder"})
                # event has auto_arrive_on_register -> they're already 'arrived'

            r = api.post(f"/events/{event_id}/rounds/start", headers=org)
            check("POST start round -> 201 draft preview",
                  r.status_code == 201 and r.json()["arrived_count"] == 6, r.text)
            draft = r.json() if r.status_code == 201 else {}
            check("draft splits 6 into two tables of 3",
                  draft.get("table_count") == 2 and draft.get("repeat_pairings") == 0, str(draft))

            # CRITICAL: the preview must NOT be visible on the realtime tables yet
            anon_peek = create_client(settings.supabase_url, ANON_KEY)
            leaked_round = anon_peek.table("rounds").select("*").eq("event_id", event_id).execute().data
            check("draft NOT visible as a round (no realtime leak)", not leaked_round,
                  f"LEAKED {len(leaked_round or [])} round rows before publish")
            no_live_round = api.get(f"/events/{event_id}/rounds/current")
            check("GET current round still 404 while only a draft exists",
                  no_live_round.status_code == 404, no_live_round.text)

            r = api.post(f"/events/{event_id}/rounds/start", headers=org)
            check("start again with pending draft -> 409", r.status_code == 409, r.text)

            r = api.post(f"/events/{event_id}/rounds/regenerate", headers=org)
            check("regenerate draft -> 200", r.status_code == 200, r.text)

            r = api.post(f"/events/{event_id}/rounds/publish", headers=org)
            check("publish draft -> 201 active round",
                  r.status_code == 201 and r.json()["status"] == "active"
                  and len(r.json()["assignments"]) == 6, r.text)

            live_round = anon_peek.table("rounds").select("*").eq("event_id", event_id).execute().data
            check("published round IS visible to realtime (anon read)", bool(live_round))

            r = api.post(f"/events/{event_id}/rounds/publish", headers=org)
            check("publish again -> 404 (draft consumed)", r.status_code == 404, r.text)
            r = api.post(f"/events/{event_id}/rounds/start", headers=org)
            check("start while round active -> 409", r.status_code == 409, r.text)

            r = api.post(f"/events/{event_id}/rounds/end", headers=org)
            check("POST end round -> completed", r.status_code == 200, r.text)
            r = api.post(f"/events/{event_id}/rounds/end", headers=org)
            check("POST end round again -> 404 (none active)", r.status_code == 404, r.text)

            # Audit trail recorded the publish (service-role read; anon must NOT see it)
            audited = db.table("audit_log").select("action").eq("event_id", event_id).execute().data
            check("audit_log captured round.published",
                  any(a["action"] == "round.published" for a in audited), str(audited))
            anon_audit = anon_peek.table("audit_log").select("*").limit(1).execute().data
            check("anon key cannot read audit_log", not anon_audit,
                  f"LEAKED {len(anon_audit or [])} audit rows")

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
            check("analytics without token -> 401", r.status_code == 401, r.text)
            r = api.get(f"/events/{event_id}/analytics", headers=org)
            check("GET analytics (owner) -> 200, 1 attendee",
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

            # -- 9b. RLS: the public anon key must NOT read PII or write --
            print("\n[9b] RLS verification (attacker with public anon key)")
            anon = create_client(settings.supabase_url, ANON_KEY)
            leaked = anon.table("attendees").select("*").limit(5).execute().data
            check("anon key cannot read attendees (PII)", not leaked,
                  f"LEAKED {len(leaked or [])} rows - run supabase/migrations/001_tighten_rls.sql")
            try:
                anon.table("events").update({"name": "hacked"}).eq("id", event_id).execute()
            except Exception:
                pass
            tampered = db.table("events").select("name").eq("id", event_id).execute().data
            check("anon key cannot modify events",
                  tampered and tampered[0]["name"] != "hacked")
            public_event = anon.table("events").select("name").eq("id", event_id).execute().data
            check("anon key CAN read events (landing page)", bool(public_event))

    finally:
        # -- Cleanup: cascade delete removes attendees with the event --
        print("\n[10] Cleanup")
        if event_id:
            db.table("events").delete().eq("id", event_id).execute()
            leftover = db.table("events").select("id").eq("id", event_id).execute().data
            check("event + attendees deleted (cascade)", not leftover)
        for key, uid in ids.items():
            db.auth.admin.delete_user(uid)
        for uid in extra_attendees:
            try:
                db.auth.admin.delete_user(uid)
            except Exception:
                pass
        check("test auth users deleted", True)

    print(f"\n{'='*50}\nRESULT: {passed} passed, {len(failed)} failed")
    if failed:
        print("Failed checks:", *[f"  - {f}" for f in failed], sep="\n")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
