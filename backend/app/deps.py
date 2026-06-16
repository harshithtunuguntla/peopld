import secrets
from dataclasses import dataclass

import jwt
from jwt import PyJWKClient
from fastapi import Depends, Header, HTTPException, Request
from supabase import Client

from app.config import settings

ORGANIZER_ROLE = "organizer"

# Asymmetric algorithms (Supabase's new JWT signing keys). For these we verify
# the signature against the project's published public keys (JWKS) — never a
# shared secret. HS256 is the legacy/shared-secret case (kept for older projects
# and the test suite).
_ASYMMETRIC_ALGS = ("ES256", "RS256", "EdDSA")

# Lazily-built JWKS client (fetches + caches the project's public keys). Cached
# across requests so verification is local CPU, not a network call per request.
_jwks_client: PyJWKClient | None = None


@dataclass
class AuthUser:
    """Authenticated Supabase user, resolved from a Bearer JWT."""

    id: str
    email: str | None
    role: str | None  # app_metadata.role — "organizer" or None (attendee)


def _get_jwks_client() -> PyJWKClient:
    """The project's JWKS endpoint, wrapped in a key-caching client.

    Supabase publishes its public signing keys at /auth/v1/.well-known/jwks.json.
    PyJWKClient caches the key set (so it's one fetch, then in-memory), and looks
    up the right key by the token's `kid` — handling key rotation transparently.
    """
    global _jwks_client
    if _jwks_client is None:
        url = f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
        _jwks_client = PyJWKClient(url, cache_keys=True, lifespan=600)
    return _jwks_client


def _decode_local(token: str) -> AuthUser:
    """Verify a Supabase JWT locally (no Supabase round-trip).

    Picks the verification key from the token's algorithm:
      - ES256/RS256/EdDSA → the project's public key via JWKS (new signing keys).
      - HS256 → the shared SUPABASE_JWT_SECRET (legacy / tests).

    Local verification is both faster (~0.1ms vs ~100ms) AND the only path that
    works for projects on asymmetric signing keys: the server-side get_user()
    session lookup returns session_not_found for those tokens.
    """
    try:
        alg = jwt.get_unverified_header(token).get("alg")
        if alg in _ASYMMETRIC_ALGS:
            key = _get_jwks_client().get_signing_key_from_jwt(token).key
            algorithms = [alg]
        elif alg == "HS256":
            if not settings.supabase_jwt_secret:
                raise HTTPException(status_code=500, detail="SUPABASE_JWT_SECRET not configured")
            key = settings.supabase_jwt_secret
            algorithms = ["HS256"]
        else:
            raise HTTPException(status_code=401, detail="Unsupported token algorithm")
        payload = jwt.decode(token, key, algorithms=algorithms, audience="authenticated")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except HTTPException:
        raise
    except Exception:
        # Bad signature, malformed token, or a JWKS lookup miss — all "unauthorized".
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    role = (payload.get("app_metadata") or {}).get("role")
    return AuthUser(id=str(payload["sub"]), email=payload.get("email"), role=role)


def get_current_user(
    request: Request,
    authorization: str | None = Header(default=None),
) -> AuthUser:
    """Resolve the signed-in user from the Bearer JWT via local verification.

    No Supabase round-trip — saves ~100ms per request, and (critically) works
    with the project's asymmetric signing keys, which the get_user() path does
    not. See _decode_local.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing bearer token")
    user = _decode_local(token)
    request.state.user_id = user.id  # picked up by the request-log middleware
    return user


def get_optional_user(
    request: Request,
    authorization: str | None = Header(default=None),
) -> AuthUser | None:
    """Like get_current_user, but never raises — returns None when there's no
    valid token. For public endpoints that ENRICH their response when signed in
    (e.g. the events list annotating which ones you're registered for) but must
    still work for anonymous browsers.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    try:
        return get_current_user(request, authorization)
    except HTTPException:
        return None


async def get_current_organizer_id(
    user: AuthUser = Depends(get_current_user),
) -> str:
    """Organizer-only endpoints. Role is set via app_metadata (see scripts/tag_organizer.py)."""
    if user.role != ORGANIZER_ROLE:
        raise HTTPException(status_code=403, detail="Organizer access required")
    return user.id


def fetch_event_or_404(db: Client, event_id: str) -> dict:
    result = db.table("events").select("*").eq("id", event_id).limit(1).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Event not found")
    return result.data[0]


def require_event_owner(event: dict, organizer_id: str) -> None:
    if str(event["organizer_id"]) != str(organizer_id):
        raise HTTPException(status_code=403, detail="Not the organizer of this event")


def fetch_access_code(db: Client, event_id: str) -> str | None:
    """The event's secret registration code, or None if the event is open.

    Read with the service-role key only — event_access_codes has no RLS policies,
    so attendee phones can never reach this value.
    """
    result = (
        db.table("event_access_codes")
        .select("code")
        .eq("event_id", event_id)
        .limit(1)
        .execute()
    )
    return result.data[0]["code"] if result.data else None


def fetch_my_attendee(db: Client, event_id: str, user_id: str) -> dict | None:
    """The caller's own attendee row for this event, or None if not registered."""
    res = (
        db.table("attendees")
        .select("*")
        .eq("event_id", event_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


# Meeting-intent ("I want to meet X") pick cap. Tied to the round count so it
# scales with how many people you can actually meet — roughly one prioritized
# pick per round. Falls back to a sensible default when the organizer hasn't set
# target_rounds yet (the event may still be in planning).
DEFAULT_INTENT_CAP = 5


def intent_cap(event: dict) -> int:
    """How many people one attendee may pick to meet at this event (= planned
    rounds, so picks stay meaningful and within meeting capacity)."""
    target = event.get("target_rounds")
    return int(target) if target else DEFAULT_INTENT_CAP


def code_matches(required: str | None, supplied: str | None) -> bool:
    """True if `supplied` unlocks the gate. Open events (no code) always pass.

    Trimmed + case-insensitive, so 'mixer', ' MIXER ' and 'Mixer' all match.
    """
    required = (required or "").strip()
    if not required:
        return True
    return (supplied or "").strip().casefold() == required.casefold()


def fetch_room_code(db: Client, event_id: str) -> str | None:
    """The event's secret ROOM code (self-service check-in), or None if check-in
    isn't open yet. Separate from fetch_access_code — different table, different
    secret. Read with the service-role key only — event_room_codes has no RLS
    policies, so attendee phones can never reach this value.
    """
    result = (
        db.table("event_room_codes")
        .select("code")
        .eq("event_id", event_id)
        .limit(1)
        .execute()
    )
    return result.data[0]["code"] if result.data else None


# Unambiguous alphabet — no I/L/O/0/1, so codes are easy to read aloud and type.
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 6
# Room codes are entered at a busy door, so they're shorter than the join code.
# They're only ever matched within one event (the arrive endpoint is event-scoped),
# so they need no global uniqueness — just a quick, readable string.
ROOM_CODE_LENGTH = 4


def generate_access_code(db: Client, length: int = CODE_LENGTH) -> str:
    """A fresh, human-friendly access code that doesn't collide with any existing
    one (so the global code -> event lookup stays unambiguous).

    Read with the service-role key; event_access_codes has no RLS policies.
    """
    existing = {
        str(r["code"]).casefold()
        for r in (db.table("event_access_codes").select("code").execute().data or [])
    }
    while True:
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(length))
        if code.casefold() not in existing:
            return code


def generate_room_code(length: int = ROOM_CODE_LENGTH) -> str:
    """A fresh, human-friendly ROOM code for day-of check-in.

    Unlike the join code, this needs no collision check: it is only ever matched
    within a single event (POST /attendees/me/arrive is event-scoped), so there
    is no global code -> event lookup to keep unambiguous.
    """
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(length))


def find_event_by_code(db: Client, code: str | None) -> str | None:
    """Reverse lookup: the event whose access code matches `code`, or None.

    Powers the "join via code/QR" hub — attendees enter a code without knowing
    the event id. Trimmed + case-insensitive. Service-role only (secret table).
    """
    supplied = (code or "").strip().casefold()
    if not supplied:
        return None
    rows = db.table("event_access_codes").select("event_id, code").execute().data or []
    for row in rows:
        if str(row["code"]).strip().casefold() == supplied:
            return str(row["event_id"])
    return None
