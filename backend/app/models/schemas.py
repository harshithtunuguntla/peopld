from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import date, time, datetime
from uuid import UUID


# --- Event ---

class EventCreate(BaseModel):
    name: str
    date: date
    time: time
    location: str
    description: Optional[str] = None
    num_tables: int = Field(ge=1)
    seats_per_table: int = Field(ge=3)  # algorithm minimum table size is 3
    default_round_duration_seconds: int = Field(default=300, gt=0)
    auto_arrive_on_register: bool = True  # on-site registration marks people arrived
    target_rounds: Optional[int] = Field(default=None, ge=1)  # intended round count (planning horizon)


class EventUpdate(BaseModel):
    """Organizer-editable config — capacity is never hardcoded (design doc §3)."""
    status: Optional[Literal["upcoming", "active", "ended"]] = None
    num_tables: Optional[int] = Field(default=None, ge=1)
    seats_per_table: Optional[int] = Field(default=None, ge=3)
    default_round_duration_seconds: Optional[int] = Field(default=None, gt=0)
    auto_arrive_on_register: Optional[bool] = None
    target_rounds: Optional[int] = Field(default=None, ge=1)


class EventResponse(BaseModel):
    id: UUID
    name: str
    date: date
    time: time
    location: str
    description: Optional[str]
    num_tables: int
    seats_per_table: int
    default_round_duration_seconds: int
    auto_arrive_on_register: bool
    target_rounds: Optional[int] = None
    organizer_id: UUID
    status: Literal["upcoming", "active", "ended"]
    created_at: datetime


# --- Attendee ---

class AttendeeCreate(BaseModel):
    name: str
    role: str
    looking_for: Optional[str] = None
    linkedin_url: Optional[str] = None
    whatsapp_number: Optional[str] = None


class AttendeeUpdate(BaseModel):
    status: Optional[Literal["registered", "arrived", "left"]] = None


class AttendeeResponse(BaseModel):
    id: UUID
    event_id: UUID
    user_id: Optional[UUID]
    name: str
    role: str
    looking_for: Optional[str]
    linkedin_url: Optional[str]
    whatsapp_number: Optional[str]
    status: Literal["registered", "arrived", "left"]
    created_at: datetime


class AttendeeWithAssignmentResponse(AttendeeResponse):
    """Used by GET /events/:eventId/attendees/:attendeeId — includes live table info."""
    current_table_number: Optional[int] = None
    current_round_id: Optional[UUID] = None
    current_round_number: Optional[int] = None


# --- Table Assignment ---

class TableAssignmentResponse(BaseModel):
    id: UUID
    round_id: UUID
    event_id: UUID
    attendee_id: UUID
    table_number: int


# --- Round ---

class RoundResponse(BaseModel):
    id: UUID
    event_id: UUID
    round_number: int
    duration_seconds: int
    started_at: Optional[datetime]
    ended_at: Optional[datetime]
    status: Literal["active", "completed"]


class RoundWithAssignmentsResponse(RoundResponse):
    """Used by GET /rounds/current — organizer grid view needs all assignments in one call."""
    assignments: list[TableAssignmentResponse] = []


class RoundCancelResponse(BaseModel):
    """Result of cancelling a published round (REQ-RT-02). The round + its
    assignments are deleted so they leave no trace in pairing history."""
    event_id: UUID
    round_number: int
    cancelled: bool = True


# --- Round draft (seating preview, organizer-only) ---

class DraftAssignment(BaseModel):
    attendee_id: UUID
    name: str  # joined at read time so the preview is renderable in one call
    table_number: int


class RoundDraftResponse(BaseModel):
    """Seating preview. Lives in round_drafts (no client RLS access) — attendee
    phones learn nothing until the organizer publishes."""
    id: UUID
    event_id: UUID
    round_number: int
    duration_seconds: int
    arrived_count: int
    table_count: int
    repeat_pairings: int  # pairs in this draft who already met — organizer trust signal
    assignments: list[DraftAssignment]
    created_at: datetime


# --- Live state (Step 5 — Realtime / REQ-RT-01 recovery snapshot) ---

class Tablemate(BaseModel):
    """A person at your table this round. Name + role ONLY — contact details
    (WhatsApp/LinkedIn) belong to the post-event rolodex, never the live path."""
    attendee_id: UUID
    name: str
    role: str


class LiveRound(BaseModel):
    round_id: UUID
    round_number: int
    status: Literal["active", "completed"]
    started_at: Optional[datetime]
    duration_seconds: int
    ends_at: Optional[datetime] = None  # started_at + duration; phone derives the countdown from this + server_time


class LiveSeat(BaseModel):
    table_number: int
    tablemates: list[Tablemate]


class LiveIcebreaker(BaseModel):
    question_text: str
    target_attendee_id: UUID


class LiveStateResponse(BaseModel):
    """The single authoritative snapshot that powers the attendee Live Dashboard.

    REQ-RT-01: the phone fetches this on load, on websocket reconnect, on wake
    from sleep, and on every realtime 'doorbell' ping. Realtime is best-effort;
    THIS endpoint is the source of truth. Everything the dashboard renders is
    here in one round-trip, so recovery is a single network call.
    """
    server_time: datetime  # so the phone can correct clock skew when counting down
    event_status: Literal["upcoming", "active", "ended"]
    phase: Literal["not_started", "in_round", "between_rounds", "ended"]
    attendee_id: UUID
    attendee_status: Literal["registered", "arrived", "left"]
    seated: bool  # false during a round = no table for you (arrived late / not arrived)
    round: Optional[LiveRound] = None
    seat: Optional[LiveSeat] = None
    icebreaker: Optional[LiveIcebreaker] = None


# --- Icebreaker ---

class IcebreakerResponse(BaseModel):
    id: UUID
    round_id: UUID
    table_number: int
    recipient_attendee_id: UUID
    target_attendee_id: UUID
    question_text: str
    generated_at: datetime


# --- Connections (Digital Rolodex) ---

class ConnectionEntry(BaseModel):
    attendee_id: UUID
    name: str
    role: str
    whatsapp_number: Optional[str]
    round_number: int
    table_number: int


class ConnectionsResponse(BaseModel):
    total_people_met: int
    rounds_count: int
    connections: list[ConnectionEntry]


# --- Analytics ---

class EventAnalytics(BaseModel):
    total_attendees: int
    rounds_completed: int
    avg_unique_people_met: float
