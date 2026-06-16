"""Direct tests for local Supabase JWT verification (app/auth_jwt.py).

Security-sensitive: these assert that bad tokens are rejected and that HS256 is
only ever accepted when a secret is explicitly configured (so production, which
runs ES256/JWKS with no secret, can never be tricked into HS256).
"""

import time

import jwt
import pytest

from app.auth_jwt import JWTVerificationError, decode_supabase_jwt
from app.config import settings

SECRET = "test-jwt-signing-secret-do-not-use-in-prod"  # matches conftest


def _mint(secret: str = SECRET, alg: str = "HS256", **claims) -> str:
    payload = {"sub": "user-1", "email": "a@test.local", "aud": "authenticated",
               "exp": int(time.time()) + 3600}
    payload.update(claims)
    return jwt.encode(payload, secret, algorithm=alg)


def test_valid_token_decodes():
    claims = decode_supabase_jwt(_mint())
    assert claims["sub"] == "user-1"
    assert claims["email"] == "a@test.local"


def test_role_from_app_metadata():
    token = _mint(app_metadata={"role": "organizer"})
    assert decode_supabase_jwt(token)["app_metadata"]["role"] == "organizer"


def test_expired_token_rejected():
    with pytest.raises(JWTVerificationError):
        decode_supabase_jwt(_mint(exp=int(time.time()) - 10))


def test_wrong_signature_rejected():
    with pytest.raises(JWTVerificationError):
        decode_supabase_jwt(_mint(secret="a-completely-different-secret-key-32b"))


def test_wrong_audience_rejected():
    with pytest.raises(JWTVerificationError):
        decode_supabase_jwt(_mint(aud="anon"))


def test_missing_sub_rejected():
    # require=["exp","sub"] — a token without sub must fail even if well-signed.
    token = jwt.encode(
        {"email": "a@test.local", "aud": "authenticated", "exp": int(time.time()) + 3600},
        SECRET, algorithm="HS256",
    )
    with pytest.raises(JWTVerificationError):
        decode_supabase_jwt(token)


def test_malformed_token_rejected():
    with pytest.raises(JWTVerificationError):
        decode_supabase_jwt("not.a.jwt")


def test_hs256_rejected_when_no_secret_configured(monkeypatch):
    """Without a configured secret (production), an HS256 token is NOT accepted via
    the secret path — verification falls through to JWKS, which can't validate it
    (and here can't even be fetched), so it's rejected. Closes alg-confusion."""
    monkeypatch.setattr(settings, "supabase_jwt_secret", "")
    with pytest.raises(JWTVerificationError):
        decode_supabase_jwt(_mint())
