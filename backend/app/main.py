from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.routers import events, attendees, rounds, icebreakers, connections

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

app.include_router(events.router)
app.include_router(attendees.router)
app.include_router(rounds.router)
app.include_router(icebreakers.router)
app.include_router(connections.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
