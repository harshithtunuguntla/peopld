from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str
    supabase_service_role_key: str
    anthropic_api_key: str
    anthropic_model: str = "claude-sonnet-4-6"  # override via env to swap models
    frontend_url: str = "http://localhost:3000"


settings = Settings()  # type: ignore[call-arg]
