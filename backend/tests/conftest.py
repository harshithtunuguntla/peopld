import os

# Must be set before importing the app — config reads env at import time.
os.environ.setdefault("SUPABASE_URL", "http://test.local")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
os.environ.setdefault("ANTHROPIC_API_KEY", "test-anthropic-key")
os.environ.setdefault("LLM_PROVIDER", "stub")  # deterministic, offline icebreakers

import pytest
from fastapi.testclient import TestClient

from app.database import get_supabase
from app.main import app
from tests.fake_supabase import FakeSupabase

ORGANIZER_ID = "11111111-1111-1111-1111-111111111111"
OTHER_ORGANIZER_ID = "22222222-2222-2222-2222-222222222222"
ATTENDEE_USER_ID = "33333333-3333-3333-3333-333333333333"
OTHER_ATTENDEE_USER_ID = "44444444-4444-4444-4444-444444444444"

# Real Authorization headers — resolved by FakeAuth.get_user(), so the real
# get_current_user dependency code runs in every test (nothing is overridden).
AUTH = {"Authorization": "Bearer organizer-token"}
OTHER_AUTH = {"Authorization": "Bearer other-organizer-token"}
ATTENDEE_AUTH = {"Authorization": "Bearer attendee-token"}
OTHER_ATTENDEE_AUTH = {"Authorization": "Bearer other-attendee-token"}


@pytest.fixture
def db() -> FakeSupabase:
    fake = FakeSupabase()
    fake.register_token("organizer-token", ORGANIZER_ID, "org@test.local", role="organizer")
    fake.register_token("other-organizer-token", OTHER_ORGANIZER_ID, "org2@test.local", role="organizer")
    fake.register_token("attendee-token", ATTENDEE_USER_ID, "asha@test.local")
    fake.register_token("other-attendee-token", OTHER_ATTENDEE_USER_ID, "ravi@test.local")
    return fake


@pytest.fixture
def client(db):
    app.dependency_overrides[get_supabase] = lambda: db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def event(db) -> dict:
    """A seeded upcoming event owned by ORGANIZER_ID."""
    return db.seed(
        "events",
        {
            "name": "Founder Meetup",
            "date": "2026-07-01",
            "time": "18:00:00",
            "location": "Hyderabad",
            "description": "Pilot event",
            "num_tables": 10,
            "seats_per_table": 4,
            "default_round_duration_seconds": 300,
            "auto_arrive_on_register": True,  # production default (pilot: register at venue)
            "organizer_id": ORGANIZER_ID,
            "status": "upcoming",
        },
    )[0]


def make_attendee(db, event_id: str, name: str = "Asha", **overrides) -> dict:
    row = {
        "event_id": event_id,
        "user_id": None,
        "name": name,
        "role": "Founder at XYZ",
        "looking_for": "investors",
        "linkedin_url": None,
        "whatsapp_number": "+919999999999",
        "status": "registered",
    }
    row.update(overrides)
    return db.seed("attendees", row)[0]


def make_round(db, event_id: str, round_number: int = 1, status: str = "active", **overrides) -> dict:
    row = {
        "event_id": event_id,
        "round_number": round_number,
        "duration_seconds": 300,
        "started_at": "2026-07-01T18:00:00+00:00",
        "ended_at": None,
        "status": status,
    }
    row.update(overrides)
    return db.seed("rounds", row)[0]


def make_arrived(db, event_id: str, count: int, prefix: str = "P") -> list[dict]:
    """Seed N arrived attendees — the round-start pool."""
    return [
        make_attendee(db, event_id, name=f"{prefix}{i}", status="arrived")
        for i in range(count)
    ]


def audit_actions(db) -> list[str]:
    return [row["action"] for row in db.store.get("audit_log", [])]


def make_assignment(db, event_id: str, round_id: str, attendee_id: str, table_number: int) -> dict:
    return db.seed(
        "table_assignments",
        {
            "event_id": event_id,
            "round_id": round_id,
            "attendee_id": attendee_id,
            "table_number": table_number,
        },
    )[0]
