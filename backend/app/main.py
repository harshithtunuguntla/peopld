import logging
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.logging_config import setup_logging
from app.routers import events, attendees, rounds, icebreakers, connections, live, likes, notes

setup_logging(settings.log_format)
request_logger = logging.getLogger("app.requests")

app = FastAPI(
    title="Peopld API",
    description="Event Networking Platform — Pre-MVP",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
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


@app.get("/health")
async def health():
    return {"status": "ok"}
