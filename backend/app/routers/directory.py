"""Pre-event attendee directory — the "who's coming" list (Phase 1).

People register ahead of the event and can browse everyone else who's coming.
Visibility rules:
  * Only people who haven't opted out (`show_in_directory`) appear.
  * The list is visible to anyone *registered for this event* or the organizer —
    not the public. The viewer is resolved from the JWT (no id in the URL), so
    there's no IDOR surface, and the viewer never sees themselves in the list.
  * Public profile fields only: name, role, company, what they're doing,
    interests, and professional links (LinkedIn / website). No phone numbers, no
    status, no internal flags. `shared_interests` highlights what the viewer and
    each person have in common — an instant opener.
"""

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.database import get_supabase
from app.deps import (
    AuthUser,
    fetch_event_or_404,
    fetch_my_attendee,
    get_current_user,
    intent_cap,
)
from app.models.schemas import DirectoryEntry, DirectoryResponse

router = APIRouter(prefix="/events/{event_id}/directory", tags=["directory"])


@router.get("", response_model=DirectoryResponse)
async def get_directory(
    event_id: str,
    user: AuthUser = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    """The 'who's coming' list. Caller must be a registered attendee or the owner."""
    event = fetch_event_or_404(db, event_id)

    me = fetch_my_attendee(db, event_id, user.id)
    is_owner = str(event["organizer_id"]) == user.id
    if me is None and not is_owner:
        # You can only see the guest list of an event you're part of.
        raise HTTPException(status_code=403, detail="Register for this event to see who's coming")

    my_id = str(me["id"]) if me else None
    my_interest_set = {str(t).casefold() for t in (me.get("interests") or [])} if me else set()

    # Which people has the viewer already picked to meet? (one query, private —
    # only the viewer's own picks are ever read here.)
    wanted_ids: set[str] = set()
    if my_id:
        my_intents = (
            db.table("meeting_intents")
            .select("liked_attendee_id")
            .eq("event_id", event_id)
            .eq("liker_attendee_id", my_id)
            .execute()
            .data
            or []
        )
        wanted_ids = {str(r["liked_attendee_id"]) for r in my_intents}

    rows = (
        db.table("attendees")
        .select("*")
        .eq("event_id", event_id)
        .neq("status", "left")
        .execute()
        .data
        or []
    )

    entries: list[DirectoryEntry] = []
    speakers = 0
    for a in rows:
        if str(a["id"]) == my_id:
            continue  # don't show the viewer their own card
        if not a.get("show_in_directory", True):
            continue  # opted out
        their_interests = [str(t) for t in (a.get("interests") or [])]
        shared = [t for t in their_interests if t.casefold() in my_interest_set]
        tag = a.get("tag") or "attendee"
        if tag == "speaker":
            speakers += 1
        entries.append(
            DirectoryEntry(
                attendee_id=a["id"],
                name=a["name"],
                role=a["role"],
                company=a.get("company"),
                description=a.get("description"),
                looking_for=a.get("looking_for"),
                linkedin_url=a.get("linkedin_url"),
                website_url=a.get("website_url"),
                interests=their_interests,
                shared_interests=shared,
                avatar_url=a.get("avatar_url"),
                tag=tag,
                wanted_by_me=str(a["id"]) in wanted_ids,
            )
        )

    # Speakers first, then people who share interests with you, then by name —
    # the most interesting faces float to the top.
    entries.sort(
        key=lambda e: (
            0 if e.tag == "speaker" else 1,
            -len(e.shared_interests),
            e.name.lower(),
        )
    )

    return DirectoryResponse(
        count=len(entries),
        speakers=speakers,
        my_intents_used=len(wanted_ids),
        # Only registered attendees can make picks; an organizer previewing the
        # list gets cap 0 so the UI hides the pick controls for them.
        my_intents_cap=intent_cap(event) if me is not None else 0,
        attendees=entries,
    )
