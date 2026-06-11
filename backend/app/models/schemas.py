from pydantic import BaseModel
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
    num_tables: int
    seats_per_table: int
    default_round_duration_seconds: int = 300


class EventUpdate(BaseModel):
    status: Optional[Literal["upcoming", "active", "ended"]] = None


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
