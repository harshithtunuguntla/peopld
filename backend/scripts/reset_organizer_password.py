"""Reset (or set) an organizer's password directly via the Supabase Admin API.

We deliberately ship NO in-app password reset for organizers (manual provisioning,
minimal attack surface — see PRODUCT.md decision log). This dev/ops helper uses the
service-role key already in backend/.env to set a new password for a known user.

It also makes sure the account is actually an organizer (app_metadata.role =
"organizer"), so a freshly-set account can log in and pass the backend role checks.

Usage (run from the backend dir so .env + app.config load):

    .venv/Scripts/python.exe scripts/reset_organizer_password.py <email> <new_password>

Example:
    .venv/Scripts/python.exe scripts/reset_organizer_password.py you@example.com 'S0me-Strong-Pass'
"""

import os
import sys

# Make the backend root importable (so `app.*` resolves) regardless of cwd.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from supabase import create_client

from app.config import settings


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 2

    email, new_password = sys.argv[1].strip(), sys.argv[2]
    if len(new_password) < 8:
        print("Refusing: password must be at least 8 characters.")
        return 2

    db = create_client(settings.supabase_url, settings.supabase_service_role_key)

    # Find the user by email (paginate so we don't miss it on larger projects).
    target = None
    page = 1
    while True:
        users = db.auth.admin.list_users(page=page, per_page=200)
        if not users:
            break
        for u in users:
            if (u.email or "").lower() == email.lower():
                target = u
                break
        if target or len(users) < 200:
            break
        page += 1

    if target is None:
        print(f"No user found with email {email!r}.")
        print("Open Supabase → Authentication → Users to confirm the exact address,")
        print("or create the organizer there first, then re-run this.")
        return 1

    # Preserve any existing app_metadata, but guarantee the organizer role.
    app_meta = dict(getattr(target, "app_metadata", None) or {})
    app_meta["role"] = "organizer"

    db.auth.admin.update_user_by_id(
        target.id,
        {
            "password": new_password,
            "email_confirm": True,  # so the account can sign in immediately
            "app_metadata": app_meta,
        },
    )

    print(f"✅ Password updated for {email} (id={target.id}).")
    print("   Role ensured: organizer. You can sign in at /organizer/login now.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
