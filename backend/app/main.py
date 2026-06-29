import logging
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.logging_config import setup_logging
from app.routers import events, attendees, rounds, icebreakers, connections, live, likes, notes, me, directory, intents, bookmarks, sponsors, demo_requests, feedback, feedback_forms

setup_logging(settings.log_format)
request_logger = logging.getLogger("app.requests")

app = FastAPI(
    title="Peopld API",
    description="Event Networking Platform — Pre-MVP",
    version="0.1.0",
)

# CORS: allow frontend origin (dev and production)
# In development: allow localhost variants (localhost + 127.0.0.1 on any port)
# In production: allow only frontend_url (e.g. Vercel domain)
ALLOW_ORIGINS = (
    ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001", "http://localhost:5173"]
    if settings.frontend_url in ["http://localhost:3000", "http://127.0.0.1:3000"]
    else [settings.frontend_url]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOW_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """One structured log line per request. UUIDs only — never PII."""
    start = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        request_logger.exception(
            "request failed",
            extra={
                "method": request.method,
                "path": request.url.path,
                "status": 500,
                "duration_ms": round((time.perf_counter() - start) * 1000, 1),
                "actor_user_id": getattr(request.state, "user_id", None),
            },
        )
        raise
    request_logger.info(
        "request",
        extra={
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "duration_ms": round((time.perf_counter() - start) * 1000, 1),
            "actor_user_id": getattr(request.state, "user_id", None),
        },
    )
    return response


app.include_router(events.router)
app.include_router(attendees.router)
app.include_router(rounds.router)
app.include_router(icebreakers.router)
app.include_router(connections.router)
app.include_router(live.router)
app.include_router(likes.router)
app.include_router(notes.router)
app.include_router(me.router)
app.include_router(directory.router)
app.include_router(intents.router)
app.include_router(bookmarks.router)
app.include_router(sponsors.router)
app.include_router(demo_requests.router)
app.include_router(feedback.router)
app.include_router(feedback_forms.router)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/health/config")
async def health_config():
    """Debug endpoint: shows loaded config (secrets redacted)."""
    return {
        "supabase_url": settings.supabase_url if settings.supabase_url else "❌ NOT SET",
        "supabase_key_set": bool(settings.supabase_service_role_key),
        "frontend_url": settings.frontend_url,
        "llm_provider": settings.llm_provider,
        "vertex_project_id": settings.vertex_project_id,
        "vertex_region": settings.vertex_region,
    }
