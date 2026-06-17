from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str
    supabase_service_role_key: str
    supabase_jwt_secret: str = ""

    @field_validator("supabase_url", "supabase_service_role_key", "supabase_jwt_secret", mode="before")
    @classmethod
    def strip_whitespace(cls, v: str) -> str:
        return v.encode("utf-8").decode("utf-8-sig").strip()
    frontend_url: str = "http://localhost:3000"
    log_format: str = "text"  # set LOG_FORMAT=json on Cloud Run (Cloud Logging parses it)

    # --- JWT verification (app/deps.py::_decode_local) ---
    # We verify Supabase access tokens LOCALLY (no per-request auth round-trip).
    # Production: leave supabase_jwt_secret empty -> tokens are verified against
    # the project's asymmetric public key (ES256) fetched from the JWKS endpoint.
    # Dev/tests: set SUPABASE_JWT_SECRET to verify HS256 tokens minted locally
    # (offline, no JWKS fetch). HS256 is ONLY accepted when this secret is set, so
    # production never accepts it — closing the alg-confusion attack surface.
    # (supabase_jwt_secret is declared above so the strip_whitespace validator covers it.)

    # --- Icebreaker engine (Step 6) ---
    # The LLM is reached through a provider abstraction (app/icebreakers/provider.py).
    # "vertex" = Claude on GCP Vertex AI (uses GCP credits + Application Default
    # Credentials, no API key). "stub" = deterministic offline client (tests/dev).
    # "disabled" = never call the LLM, always serve the curated fallback bank.
    llm_provider: str = "vertex"
    vertex_project_id: str = ""  # GCP project with Vertex AI + Claude enabled
    vertex_region: str = "us-east5"  # a region where Claude Sonnet is served on Vertex
    vertex_model: str = "claude-sonnet-4-6"  # Vertex model id; override via env

    # Direct Anthropic API key — unused with Vertex, kept for an easy provider swap.
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-6"

    # Generation tunables — all env-overridable, no magic numbers in the engine.
    icebreaker_enabled: bool = True  # kill switch: False => fallback bank only
    icebreaker_max_tokens: int = 1024
    icebreaker_temperature: float = 0.7
    icebreaker_timeout_seconds: float = 8.0  # exceed => fallback, never hang the room


settings = Settings()  # type: ignore[call-arg]
