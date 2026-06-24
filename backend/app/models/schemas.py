from pydantic import BaseModel, Field, field_validator
from typing import Optional, Literal, List
from datetime import date, time, datetime
from datetime import date as DateType, time as TimeType  # aliases for models that also have date/time FIELDS (avoids name shadowing)
from uuid import UUID


# --- Event ---

# Round-agenda guardrails: a theme is a short label, and the agenda is a handful
# of rounds — not free-form storage. Keep both bounded.
ROUND_TOPIC_MAX_LEN = 80
ROUND_TOPICS_MAX = 24


def normalize_round_topics(value: Optional[List[str]]) -> Optional[List[str]]:
    """Trim each theme, cap length/count, and drop trailing blanks.

    Positions matter (index i = round i+1), so an interior "" is preserved as
    "use the default name for this round" — only trailing blanks are dropped so a
    fully-default agenda stores cleanly as []. None passes through unchanged so
    EventUpdate can leave the agenda untouched (exclude_none).
    """
    if value is None:
        return None
    cleaned = [(t or "").strip()[:ROUND_TOPIC_MAX_LEN] for t in value[:ROUND_TOPICS_MAX]]
    while cleaned and not cleaned[-1]:
        cleaned.pop()
    return cleaned

class EventCreate(BaseModel):
    name: str
    date: date
    time: time
    location: str
    description: Optional[str] = None
    num_tables: int = Field(ge=1)
    seats_per_table: int = Field(ge=3)  # the comfortable size = default ceiling (max) when max_per_table is unset
    min_per_table: Optional[int] = Field(default=None, ge=2)  # size the algorithm packs toward (else 3); 2 allowed, never a lonely 1
    max_per_table: Optional[int] = Field(default=None, ge=2)  # hard ceiling (else seats_per_table); tables overfill past it only when the room is over capacity
    default_round_duration_seconds: int = Field(default=300, gt=0)
    auto_arrive_on_register: bool = False  # OFF by default: registering ≠ arrived. The organizer checks people in (or they self-arrive with the room code) so the door is deliberate.
    auto_advance: bool = True  # when a round's timer runs out, end it automatically (the organizer console drives this on its poll). The manual "End round" tap always works too.
    target_rounds: Optional[int] = Field(default=None, ge=1)  # intended round count (planning horizon)
    round_topics: List[str] = Field(default_factory=list)  # organizer-authored agenda; index i = round i+1's theme
    logo_url: Optional[str] = None          # event/host brand logo (image URL); shown when show_event_logo
    show_event_logo: bool = True            # organizer toggle: co-brand vs sponsors-only
    cover_image_url: Optional[str] = None   # event card hero image (URL only, like logo_url — no upload). Empty = deterministic color.
    access_code: Optional[str] = None  # secret registration gate; None = open event. Stored in event_access_codes, never echoed back.

    @field_validator("round_topics")
    @classmethod
    def _clean_topics(cls, v: List[str]) -> List[str]:
        return normalize_round_topics(v) or []


class EventUpdate(BaseModel):
    """Organizer-editable config — capacity is never hardcoded (design doc §3)."""
    name: Optional[str] = Field(default=None, min_length=1)
    description: Optional[str] = None
    location: Optional[str] = Field(default=None, min_length=1)
    date: Optional[DateType] = None
    time: Optional[TimeType] = None
    status: Optional[Literal["upcoming", "active", "ended"]] = None
    num_tables: Optional[int] = Field(default=None, ge=1)
    seats_per_table: Optional[int] = Field(default=None, ge=3)
    min_per_table: Optional[int] = Field(default=None, ge=2)  # None = leave untouched
    max_per_table: Optional[int] = Field(default=None, ge=2)  # None = leave untouched
    default_round_duration_seconds: Optional[int] = Field(default=None, gt=0)
    auto_arrive_on_register: Optional[bool] = None
    auto_advance: Optional[bool] = None  # None = leave untouched
    target_rounds: Optional[int] = Field(default=None, ge=1)
    round_topics: Optional[List[str]] = None  # None = leave the agenda untouched; [] clears it to defaults
    logo_url: Optional[str] = None            # None = leave untouched; "" clears the logo
    show_event_logo: Optional[bool] = None    # None = leave untouched
    cover_image_url: Optional[str] = None     # None = leave untouched; "" clears it (back to color)
    access_code: Optional[str] = None  # set "" to clear the gate, a value to (re)set it

    @field_validator("round_topics")
    @classmethod
    def _clean_topics(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        return normalize_round_topics(v)


class EventResponse(BaseModel):
    id: UUID
    name: str
    date: date
    time: time
    location: str
    description: Optional[str]
    num_tables: int
    seats_per_table: int
    min_per_table: Optional[int] = None
    max_per_table: Optional[int] = None
    default_round_duration_seconds: int
    auto_arrive_on_register: bool
    auto_advance: bool = True
    target_rounds: Optional[int] = None
    round_topics: List[str] = Field(default_factory=list)  # organizer-authored agenda (empty = canonical defaults)
    logo_url: Optional[str] = None
    show_event_logo: bool = True
    cover_image_url: Optional[str] = None
    organizer_id: UUID
    status: Literal["upcoming", "active", "ended"]
    created_at: datetime
    requires_code: bool = False  # derived: does this event have an access code? (the code itself is never sent)
    is_archived: bool = False  # derived: organizer soft-archived it (hidden from the dashboard by default)


class EventStats(BaseModel):
    """Public, non-PII social-proof counts for the registration page."""
    attendee_count: int


class EventBrowseItem(BaseModel):
    """A card on the attendee home dashboard. Public-safe fields only — no
    organizer-internal config (capacity, durations) and no PII. `registered` is
    set only when the request carries a valid token (it's that caller's own
    state); anonymous browsers always see false.
    """
    id: UUID
    name: str
    date: date
    time: time
    location: str
    status: Literal["upcoming", "active", "ended"]
    requires_code: bool = False
    attendee_count: int = 0
    registered: bool = False  # does the signed-in caller already have a registration here?
    cover_image_url: str | None = None  # event branding (public); attendee card mirrors the organizer's


class VerifyCodeRequest(BaseModel):
    code: str


class VerifyCodeResponse(BaseModel):
    valid: bool


class JoinRequest(BaseModel):
    code: str


class JoinResponse(BaseModel):
    """Reverse code -> event lookup result for the join hub."""
    event_id: UUID
    name: str
    requires_code: bool = True


class AccessCodeResponse(BaseModel):
    """The event's secret code — returned ONLY to the owning organizer."""
    code: Optional[str] = None


class RoomCodeResponse(BaseModel):
    """The event's secret ROOM code (day-of check-in) — returned ONLY to the
    owning organizer so they can reveal it in the room. None = check-in not open."""
    code: Optional[str] = None


class ArriveRequest(BaseModel):
    """An attendee checks themselves in by typing the room code shown at the venue."""
    room_code: str


# --- Attendee ---

class AttendeeCreate(BaseModel):
    name: str
    role: str
    company: Optional[str] = None  # where they work / what they're building
    description: Optional[str] = None  # short "what are you doing right now" line
    looking_for: Optional[str] = None
    linkedin_url: Optional[str] = None
    website_url: Optional[str] = None  # personal site / product link
    interests: list[str] = []  # conversation-seed tags; shared ones highlight on cards
    avatar_url: Optional[str] = None  # OAuth profile photo, captured client-side at registration
    access_code: Optional[str] = None  # required iff the event has one; verified server-side, not stored on the attendee


class AttendeeProfileDefaults(BaseModel):
    """The caller's latest reusable profile fields, used to prefill the next
    event registration. Derived from their own prior attendee rows; not a new
    global profile store."""
    name: Optional[str] = None
    role: Optional[str] = None
    company: Optional[str] = None
    description: Optional[str] = None
    looking_for: Optional[str] = None
    linkedin_url: Optional[str] = None
    website_url: Optional[str] = None
    interests: list[str] = []


class WalkInCreate(BaseModel):
    """Organizer-added attendee (a walk-in with no app account). No access code,
    no avatar — just enough to seat them."""
    name: str
    role: str
    company: Optional[str] = None
    description: Optional[str] = None
    looking_for: Optional[str] = None
    linkedin_url: Optional[str] = None
    website_url: Optional[str] = None
    interests: list[str] = []


class AttendeeUpdate(BaseModel):
    """Organizer control-panel edits: move someone arrived/left, tag them
    (attendee/speaker/host) for the directory filters, or fix their identity
    details (typos from hurried walk-in entry or self-registration)."""
    status: Optional[Literal["registered", "arrived", "left"]] = None
    tag: Optional[Literal["attendee", "speaker", "host"]] = None
    name: Optional[str] = Field(default=None, min_length=1)
    role: Optional[str] = Field(default=None, min_length=1)
    company: Optional[str] = None
    looking_for: Optional[str] = None


class AttendeeSelfUpdate(BaseModel):
    """An attendee editing their OWN profile (PATCH /attendees/me). Status is not
    here on purpose — only the organizer moves people between arrived/left."""
    name: Optional[str] = None
    role: Optional[str] = None
    company: Optional[str] = None
    description: Optional[str] = None
    looking_for: Optional[str] = None
    linkedin_url: Optional[str] = None
    website_url: Optional[str] = None
    interests: Optional[list[str]] = None
    show_in_directory: Optional[bool] = None  # opt in/out of the public pre-event list


class AttendeeResponse(BaseModel):
    id: UUID
    event_id: UUID
    user_id: Optional[UUID]
    name: str
    role: str
    company: Optional[str] = None
    description: Optional[str] = None
    looking_for: Optional[str]
    linkedin_url: Optional[str]
    website_url: Optional[str] = None
    interests: list[str] = []
    avatar_url: Optional[str] = None
    show_in_directory: bool = True
    tag: Literal["attendee", "speaker", "host"] = "attendee"
    status: Literal["registered", "arrived", "left"]
    created_at: datetime


class AttendeeWithAssignmentResponse(AttendeeResponse):
    """Used by GET /events/:eventId/attendees/:attendeeId — includes live table info."""
    current_table_number: Optional[int] = None
    current_round_id: Optional[UUID] = None
    current_round_number: Optional[int] = None


class BulkCheckInResponse(BaseModel):
    """Result of the organizer's one-tap 'mark everyone arrived' door action."""
    arrived: int  # how many registered attendees were moved to arrived


# --- Pre-event directory ("who's coming") ---

class DirectoryEntry(BaseModel):
    """One person on the public attendee directory. Public profile fields only —
    no status, no internal flags, and contact is professional links (LinkedIn /
    website), never a phone number. `shared_interests` are tags the viewer and
    this person both picked, surfaced so people have an instant opener."""
    attendee_id: UUID
    name: str
    role: str
    company: Optional[str] = None
    description: Optional[str] = None
    looking_for: Optional[str] = None
    linkedin_url: Optional[str] = None
    website_url: Optional[str] = None
    interests: list[str] = []
    shared_interests: list[str] = []
    avatar_url: Optional[str] = None
    tag: Literal["attendee", "speaker", "host"] = "attendee"
    wanted_by_me: bool = False  # has the viewer picked this person to meet?


class DirectoryResponse(BaseModel):
    """The 'who's coming' list for an event, visible to registered attendees and
    the organizer. Only opted-in people appear; the viewer is excluded."""
    count: int
    speakers: int  # how many of the listed people are tagged 'speaker' (UI chip)
    my_intents_used: int = 0  # how many meeting picks the viewer has made
    my_intents_cap: int = 0   # the viewer's pick cap (= planned rounds)
    attendees: list[DirectoryEntry]


# --- Meeting intents (Phase 3a — pre-event "I want to meet X") ---

class IntentRequest(BaseModel):
    target_attendee_id: UUID


class IntentResponse(BaseModel):
    """State after a set/clear. `used`/`cap` let the UI show "3 of 5 picks"."""
    wants: bool   # does the viewer now intend to meet this person?
    used: int     # picks the viewer has made
    cap: int      # max picks allowed (= planned rounds)


class MyIntentsResponse(BaseModel):
    """The viewer's own picks (never anyone else's — privacy)."""
    used: int
    cap: int
    target_ids: list[UUID] = []  # who the viewer wants to meet


class IntentMatch(BaseModel):
    """A mutual pick, revealed only AFTER the event (mutual-only reveal). Contact
    links are included because a match is a confirmed two-way interest."""
    attendee_id: UUID
    name: str
    role: str
    company: Optional[str] = None
    avatar_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    website_url: Optional[str] = None


class IntentMatchesResponse(BaseModel):
    count: int
    matches: list[IntentMatch] = []


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
    paused_at: Optional[datetime] = None  # set while paused; null when running
    total_paused_seconds: int = 0  # accumulated paused time — shifts the effective end


class RoundWithAssignmentsResponse(RoundResponse):
    """Used by GET /rounds/current — organizer grid view needs all assignments in one call."""
    assignments: list[TableAssignmentResponse] = []


class RoundExtendRequest(BaseModel):
    """Add time to the running round (the organizer's "+ Add time" control)."""
    seconds: int = Field(gt=0, le=3600)  # 1s–1h; the UI offers +1/+2/+5 min and a custom field


class RoundMoveRequest(BaseModel):
    """Move one person to another (existing) table in the pending draft — the
    organizer's manual override before publishing."""
    attendee_id: UUID
    table_number: int = Field(ge=1)


class RunSheetTable(BaseModel):
    table_number: int
    people: list[str]  # names, sorted — the printable list for this table


class RunSheetRound(BaseModel):
    round_number: int
    theme: Optional[str] = None  # organizer agenda name for this round, if set
    tables: list[RunSheetTable]


class RunSheet(BaseModel):
    """A pre-generated, printable seating plan for the whole event — the event-day
    backup. If the app falls over, the organizer hands these tables out (or reads
    them aloud) and the night continues. `basis` says whether it was built over the
    people already arrived or the full registered list (pre-doors insurance)."""
    event_name: str
    basis: Literal["arrived", "registered"]
    num_tables: int
    seats_per_table: int
    total_people: int
    rounds: list[RunSheetRound]


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


class CapacityWarning(BaseModel):
    """Set on a draft when the room can't seat everyone under the max table size, so
    the plan overfills some tables. The organizer decides: add a table, or accept the
    squeeze. Nobody is ever left unseated — this is a heads-up, not a failure."""
    seated: int  # people in this draft
    capacity: int  # comfortable seats = tables x max-per-table
    num_tables: int
    max_per_table: int  # the ceiling that's being exceeded
    biggest_table: int  # the fullest table in the overfilled plan
    overfilled_tables: int  # how many tables sit above the ceiling


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
    capacity_warning: Optional[CapacityWarning] = None  # set when the plan overfills past max
    created_at: datetime


# --- Live state (Step 5 — Realtime / REQ-RT-01 recovery snapshot) ---

class Tablemate(BaseModel):
    """A person at your table this round. Name + role + avatar + conversation
    seeds (interests / looking_for) — but NO contact details (LinkedIn/website),
    which belong to the post-event rolodex, never the live path. `liked` is
    whether *I* (the caller) have liked this person; `shared_interests` are tags
    we both picked, to break the ice."""
    attendee_id: UUID
    name: str
    role: str
    company: Optional[str] = None
    looking_for: Optional[str] = None
    interests: list[str] = []
    shared_interests: list[str] = []
    avatar_url: Optional[str] = None
    liked: bool = False
    wanted: bool = False  # the caller picked (pre-event) to meet this tablemate → nudge
    note: Optional[str] = None  # the caller's OWN private note about this person, so it pre-fills at the table


class LiveRound(BaseModel):
    round_id: UUID
    round_number: int
    status: Literal["active", "completed"]
    started_at: Optional[datetime]
    duration_seconds: int
    ends_at: Optional[datetime] = None  # started_at + duration + total_paused; phone derives the countdown from this + server_time
    paused_at: Optional[datetime] = None  # set while paused — phone freezes the countdown at (ends_at - paused_at)


class LiveSeat(BaseModel):
    table_number: int
    tablemates: list[Tablemate]


class RosterPerson(BaseModel):
    """A face in the waiting room. Name + avatar only — no role/contact/PII.
    `attendee_id` is the stable seed for the gradient avatar, not an IDOR handle
    (the live snapshot is always scoped to the caller's own event)."""
    attendee_id: UUID
    name: str
    avatar_url: Optional[str] = None


class WaitingRoster(BaseModel):
    """Who's already here, for the waiting-room social proof. `count` is everyone
    in the room; `preview` is a capped sample of faces to render (the UI shows
    a `+N` for the remainder)."""
    count: int
    preview: list[RosterPerson] = []


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
    event_name: str  # for the waiting-room header / "Tonight" agenda card
    attendee_id: UUID
    attendee_name: str  # so the waiting room can greet "Hi, <first name>"
    attendee_status: Literal["registered", "arrived", "left"]
    attendee_tag: Literal["attendee", "speaker", "host"] = "attendee"  # guests (speaker/host) are never seated → the "not seated" screen must say so honestly
    target_rounds: Optional[int] = None  # planned rounds → drives the agenda preview
    round_seconds: int  # default round duration → "N rounds · M min"
    round_topics: List[str] = Field(default_factory=list)  # organizer-authored agenda; index i = round i+1's theme
    seated: bool  # false during a round = no table for you (arrived late / not arrived)
    rounds_completed: int = 0  # finished rounds → "Round X of N complete · next up Round X+1"
    roster: WaitingRoster  # who's already in the room (waiting-room social proof)
    round: Optional[LiveRound] = None
    seat: Optional[LiveSeat] = None
    icebreaker: Optional[LiveIcebreaker] = None
    recent_seat: Optional[LiveSeat] = None  # between rounds: the table you JUST left, so you can still ❤️/note the people you met before the next round
    recent_round_number: Optional[int] = None  # which round recent_seat is from


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
    company: Optional[str] = None
    looking_for: Optional[str] = None
    linkedin_url: Optional[str] = None
    website_url: Optional[str] = None
    avatar_url: Optional[str] = None
    interests: list[str] = []
    shared_interests: list[str] = []  # tags the caller and this person both picked
    note: Optional[str] = None        # the caller's private note about this person
    round_number: int = 0  # 0 = never shared a table (a pick / co-attendee, not "met")
    table_number: int = 0
    met: bool = True      # we actually shared a table (the classic rolodex meaning)
    wanted: bool = False  # I picked them pre-event ("want to meet") — may or may not be met yet
    wants_me: bool = False  # they picked me
    liked: bool = False   # I liked them
    mutual: bool = False  # ...and they liked me back → a match
    saved: bool = False   # I explicitly bookmarked them (my saved-contacts shortlist)


class ConnectionsResponse(BaseModel):
    total_people_met: int
    rounds_count: int
    matches_count: int = 0  # mutual likes
    connections: list[ConnectionEntry]


class MyConnectionEntry(ConnectionEntry):
    """A connection annotated with which event it came from (cross-event rolodex)."""
    event_id: UUID
    event_name: str
    event_date: date


class MyConnectionsResponse(BaseModel):
    """Everyone the caller has met, aggregated across all of their events."""
    total_people_met: int
    events_count: int
    matches_count: int = 0
    connections: list[MyConnectionEntry]


# --- Likes ---

class LikeRequest(BaseModel):
    target_attendee_id: UUID


class LikeResponse(BaseModel):
    liked: bool


# --- Connection notes (private memory jogger about someone you met) ---

class NoteRequest(BaseModel):
    note: str


class NoteResponse(BaseModel):
    target_attendee_id: UUID
    note: Optional[str] = None  # null after a delete / when cleared


# --- Saved contacts (explicit bookmark shortlist) ---

class BookmarkResponse(BaseModel):
    target_attendee_id: UUID
    saved: bool


# --- Sponsors & event branding (shown between rounds + in the lobby) ---

class SponsorInput(BaseModel):
    """One sponsor as authored by the organizer. Logo is a hosted image URL."""
    name: str = ""
    image_url: Optional[str] = None
    tagline: Optional[str] = None
    url: Optional[str] = None


class SponsorsPutRequest(BaseModel):
    """Whole-list replace — the organizer saves the full sponsor set at once."""
    sponsors: List[SponsorInput] = Field(default_factory=list)


class SponsorItem(BaseModel):
    """A sponsor as sent to attendees."""
    id: UUID
    name: str
    image_url: Optional[str] = None
    tagline: Optional[str] = None
    url: Optional[str] = None


class SponsorsResponse(BaseModel):
    """Everything the between-rounds / lobby branding needs in one call."""
    event_name: str
    logo_url: Optional[str] = None
    show_event_logo: bool = True
    sponsors: List[SponsorItem] = Field(default_factory=list)


# --- Analytics ---

class RoundPerf(BaseModel):
    """Per-round stats for the recap bar chart."""
    round_number: int
    seated: int            # people seated that round
    introductions: int     # NEW unique pairs created that round (not seen before)


class TopConnector(BaseModel):
    attendee_id: UUID
    name: str
    count: int             # unique distinct people this person met across the event


class GraphNode(BaseModel):
    """A person in the connection web (recap visual). Owner-only endpoint."""
    attendee_id: UUID
    name: str
    met: int = 0           # how many distinct people they met (node weight)
    company: Optional[str] = None   # profile context for the relationship panel
    role: Optional[str] = None
    rounds_present: int = 0  # distinct rounds this person was actually seated
    mutual_likes: int = 0    # mutual matches involving this person


class GraphEdge(BaseModel):
    """A line in the connection web: two people who shared a table. Carries the
    full repeat-interaction history so the graph can encode relationship strength
    (a pair seated together twice is a stronger tie than a one-time intro)."""
    a: UUID
    b: UUID
    matched: bool = False  # this pair also became a mutual match → highlight it
    liked: bool = False    # ≥1 like in either direction (funnel "interest" stage)
    weight: int = 1        # rounds this pair shared a table (repeat strength)
    rounds: List[int] = Field(default_factory=list)  # the round numbers they met in


class EventAnalytics(BaseModel):
    total_attendees: int
    rounds_completed: int
    avg_unique_people_met: float
    total_likes: int = 0          # one-directional likes cast across the whole event
    total_matches: int = 0        # mutual likes (counted once per pair)
    liked_pairs: int = 0          # unique pairs where ≥1 person liked the other (funnel middle stage)
    total_introductions: int = 0  # unique pairs of people who shared a table at least once
    pct_room_met: int = 0         # avg % of the rest of the room each person met
    seated_attendees: int = 0     # people seated at least once (graph nodes; coverage denominator base)
    possible_introductions: int = 0  # n·(n-1)/2 over seated people — the coverage ceiling
    min_people_met: int = 0       # fewest distinct people any seated person met ("nobody left behind")
    round_performance: List["RoundPerf"] = Field(default_factory=list)
    top_connectors: List["TopConnector"] = Field(default_factory=list)
    graph_nodes: List["GraphNode"] = Field(default_factory=list)  # the connection web
    graph_edges: List["GraphEdge"] = Field(default_factory=list)


class DashboardSummary(BaseModel):
    """Organizer dashboard bento — honest aggregates across all of my events."""
    events_total: int
    events_live: int
    events_upcoming: int
    events_completed: int
    guests_total: int          # attendees across all my events
    connections_total: int     # mutual matches across all my events (per pair)
    introductions_total: int   # unique table-pairings across all my events


# --- Live stats (organizer "room pulse" during the event) ---

class LiveStats(BaseModel):
    registered: int
    arrived: int
    seated_now: int       # people with a seat in the active round (0 if none active)
    not_seated: int       # arrived but without a seat this round
    likes_count: int      # likes cast so far
    matches_count: int    # mutual likes so far (per pair)
    active_round_number: Optional[int] = None
    rounds_completed: int = 0  # finished rounds → drives the between-rounds "Round X of N" status
