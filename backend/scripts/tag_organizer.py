"""Tag a Supabase auth user as an organizer.

The dashboard cannot edit app_metadata, so this script sets
app_metadata.role = "organizer" via the admin API (service-role key).

Usage (from backend/):
    python scripts/tag_organizer.py organizer@example.com
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import get_supabase  # noqa: E402


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python scripts/tag_organizer.py <email>")
        return 1
    email = sys.argv[1].strip().lower()

    db = get_supabase()

    page = 1
    target = None
    while target is None:
        users = db.auth.admin.list_users(page=page, per_page=100)
        if not users:
            break
        for user in users:
            if (user.email or "").lower() == email:
                target = user
                break
        if len(users) < 100:
            break
        page += 1

    if target is None:
        print(f"ERROR: no auth user found with email {email}")
        print("Create the user first: Supabase dashboard -> Authentication -> Users -> Add user")
        return 1

    existing_meta = dict(target.app_metadata or {})
    if existing_meta.get("role") == "organizer":
        print(f"OK: {email} ({target.id}) already has role=organizer")
        return 0

    existing_meta["role"] = "organizer"
    db.auth.admin.update_user_by_id(target.id, {"app_metadata": existing_meta})
    print(f"OK: tagged {email} ({target.id}) with app_metadata.role=organizer")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
