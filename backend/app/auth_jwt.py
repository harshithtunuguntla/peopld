"""Local Supabase JWT verification — no network round-trip per request.

Supabase signs access tokens with asymmetric ES256 keys (exposed at a JWKS
endpoint). The correct, standard way to trust such a token is to verify its
signature locally with the project's PUBLIC key — which we fetch once and cache.
This replaces a per-request `GET /auth/v1/user` call to Supabase Auth (one extra
cloud round-trip on EVERY API request) with in-process crypto.

Deliberate trade-off: a token stays valid until it expires (Supabase access
tokens live ~1 hour) even if the user signs out, because we verify the signature
and expiry — not "is this session still alive on the server." This is standard
for JWT auth and is mitigated by the short token lifetime; there is no instant
server-side revocation. Acceptable for the pilot (CLAUDE.md: reliability over
cleverness; short-lived tokens are the textbook mitigation).

Security properties:
- Algorithms are pinned. The asymmetric path accepts ES256/RS256 only and uses
  the public key from JWKS, so a token can't downgrade to `none` or trick us
  into HMAC-with-the-public-key alg confusion.
- HS256 is accepted ONLY when SUPABASE_JWT_SECRET is set (dev/tests). Production
  leaves it empty, so HS256 tokens are never accepted there.
- We verify `aud` (= "authenticated") and `exp`, require `sub`, and allow a small
  clock-skew leeway.
"""

import jwt
from jwt import PyJWKClient

from app.config import settings


class JWTVerificationError(Exception):
    """Token failed verification — bad signature, expired, wrong audience, or malformed."""


# Cached across requests: PyJWKClient fetches the JWKS once and refreshes it on
# its lifespan, so key rotation is picked up automatically without a per-request
# network call. Created lazily so tests (which use the HS256 secret path) never
# touch the network.
_jwks_client: PyJWKClient | None = None


def _jwks() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = PyJWKClient(
            f"{settings.supabase_url}/auth/v1/.well-known/jwks.json",
            cache_keys=True,
            lifespan=3600,  # refetch hourly to pick up signing-key rotation
        )
    return _jwks_client


def decode_supabase_jwt(token: str) -> dict:
    """Verify a Supabase access token and return its claims.

    Raises JWTVerificationError on any failure (signature, expiry, audience,
    malformed). Callers map that to a 401.
    """
    verify_opts = dict(
        audience=settings.supabase_jwt_aud,
        leeway=10,  # tolerate ~10s of client/server clock skew
        options={"require": ["exp", "sub"]},
    )
    try:
        header = jwt.get_unverified_header(token)
        if settings.supabase_jwt_secret and header.get("alg") == "HS256":
            # Dev/test seam: symmetric verification with a locally-held secret.
            return jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                **verify_opts,
            )
        # Production: asymmetric verification with the project's public key,
        # selected by the token's `kid`. Algorithms pinned to asymmetric only.
        signing_key = _jwks().get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256", "RS256"],
            **verify_opts,
        )
    except JWTVerificationError:
        raise
    except Exception as exc:  # noqa: BLE001 — collapse every jwt/JWKS error into one cause
        raise JWTVerificationError(str(exc)) from exc
