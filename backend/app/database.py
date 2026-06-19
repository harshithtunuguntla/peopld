import httpx
from supabase import Client, create_client
from supabase.lib.client_options import SyncClientOptions

from app.config import settings


def get_supabase() -> Client:
    """FastAPI dependency providing the Supabase client.

    Create a fresh sync client per request. The Supabase/PostgREST sync client
    owns an httpx connection pool; sharing one singleton across concurrent
    FastAPI worker threads can leave the underlying HTTP/2 connection in a bad
    state (`RemoteProtocolError: Server disconnected`). We also force HTTP/1.1
    for PostgREST calls because the observed failure is in httpcore's HTTP/2
    stream handling.
    """
    return create_client(
        settings.supabase_url,
        settings.supabase_service_role_key,
        options=SyncClientOptions(
            httpx_client=httpx.Client(http2=False, timeout=120),
        ),
    )
