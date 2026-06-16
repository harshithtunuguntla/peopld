"""Create (or reuse) a dev test event owned by a given organizer email.

Usage (from backend/):
    python scripts/seed_dev_event.py organizer@example.com

Prints the event id and the frontend URLs to test with.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

load_dotenv()

from app.config import settings  # noqa: E402
from supabase import create_client  # noqa: E402

EVENT_NAME = "Dev Test Meetup"


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python scripts/seed_dev_event.py <organizer-email>")
        return 1
    email = sys.argv[1].strip().lower()

    db = create_client(settings.supabase_url, settings.supabase_service_role_key)

    organizer = None
    for user in db.auth.admin.list_users():
        if (user.email or "").lower() == email:
            organizer = user
            break
    if organizer is None:
        print(f"ERROR: no auth user with email {email}")
        return 1

    existing = (
        db.table("events")
        .select("*")
        .eq("organizer_id", organizer.id)
        .eq("name", EVENT_NAME)
        .limit(1)
        .execute()
    )
    if existing.data:
        event = existing.data[0]
        print(f"Reusing existing dev event: {event['id']}")
    else:
        event = (
            db.table("events")
            .insert(
                {
                    "name": EVENT_NAME,
                    "date": "2026-07-01",
                    "time": "18:00:00",
                    "location": "Hyderabad",
                    "description": "Local development test event",
                    "num_tables": 10,
                    "seats_per_table": 4,
                    "default_round_duration_seconds": 300,
                    "organizer_id": organizer.id,
                    "status": "upcoming",
                }
            )
            .execute()
            .data[0]
        )
        print(f"Created dev event: {event['id']}")

    print(f"\nLanding:   http://localhost:3000/event/{event['id']}")
    print(f"Register:  http://localhost:3000/event/{event['id']}/register")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
