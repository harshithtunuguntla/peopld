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
