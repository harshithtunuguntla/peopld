"""Send a real OTP email through the configured SMTP to verify delivery.

Usage (from backend/):
    python scripts/test_otp_email.py someone@example.com

Then check the recipient's inbox (and spam folder) for the 6-digit code.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

load_dotenv()

from app.config import settings  # noqa: E402
from supabase import create_client  # noqa: E402


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python scripts/test_otp_email.py <email>")
        return 1
    email = sys.argv[1].strip()

    client = create_client(settings.supabase_url, settings.supabase_service_role_key)
    try:
        client.auth.sign_in_with_otp(
            {"email": email, "options": {"should_create_user": True}}
        )
    except Exception as e:
        print(f"FAIL: Supabase rejected the OTP send: {e}")
        print("Check Project Settings -> Authentication -> SMTP Settings.")
        return 1

    print(f"OK: OTP email sent to {email}")
    print("Check the inbox AND the spam folder. The code is in the Magic Link template.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
