from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str
    supabase_service_role_key: str

    @field_validator("supabase_url", "supabase_service_role_key", mode="before")
    @classmethod
    def strip_whitespace(cls, v: str) -> str:
        return v.strip()
    frontend_url: str = "http://localhost:3000"
    log_format: str = "text"  # set LOG_FORMAT=json on Cloud Run (Cloud Logging parses it)

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
