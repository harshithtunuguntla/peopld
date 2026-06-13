from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str
    supabase_service_role_key: str
    anthropic_api_key: str = ""  # only needed from Step 6 (icebreaker engine)
    anthropic_model: str = "claude-sonnet-4-6"  # override via env to swap models
    frontend_url: str = "http://localhost:3000"
    log_format: str = "text"  # set LOG_FORMAT=json on Cloud Run (Cloud Logging parses it)


settings = Settings()  # type: ignore[call-arg]
