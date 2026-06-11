from functools import lru_cache
from supabase import create_client, Client
from app.config import settings


@lru_cache(maxsize=1)
def get_supabase() -> Client:
    """FastAPI dependency providing the Supabase client.

    Lazy singleton — created on first request, not at import time,
    so tests can override via app.dependency_overrides without env vars.
    """
    return create_client(
        settings.supabase_url,
        settings.supabase_service_role_key,
    )
