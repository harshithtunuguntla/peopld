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


# --- Round ---

class RoundResponse(BaseModel):
    id: UUID
    event_id: UUID
    round_number: int
    duration_seconds: int
    started_at: Optional[datetime]
    ended_at: Optional[datetime]
    status: Literal["active", "completed"]


# --- Table Assignment ---

class TableAssignmentResponse(BaseModel):
    id: UUID
    round_id: UUID
    event_id: UUID
    attendee_id: UUID
    table_number: int


# --- Icebreaker ---

class IcebreakerResponse(BaseModel):
    id: UUID
    round_id: UUID
    table_number: int
    recipient_attendee_id: UUID
    target_attendee_id: UUID
    question_text: str
    generated_at: datetime


# --- Analytics ---

class EventAnalytics(BaseModel):
    total_attendees: int
    rounds_completed: int
    avg_unique_people_met: float
