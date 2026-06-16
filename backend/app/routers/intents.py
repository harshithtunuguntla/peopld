"""Meeting intents — pre-event "I want to meet X" picks (Phase 3a).

Browsing the directory, an attendee marks the people they most want to meet. The
picks are private signals in the service-role-only `meeting_intents` table:

  * You can only ever pick *as yourself* (liker resolved from the JWT).
  * You can see only YOUR OWN picks (GET /me) — never who picked you. The one
    exception is GET /matches, which after the event reveals MUTUAL picks only
    ("you both wanted to meet"). Unrequited interest is never disclosed.
  * Picks are capped (≈ planned rounds) so they stay meaningful, and editable
    right up to and during the event (Phase 3b re-plans around late changes).

Phase 3a only captures + surfaces intent; it does NOT change seating yet. The
at-table nudge (live state) and the post-event mutual reveal are the only places
intent becomes visible, and always one-sided/safe.
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
from app.models.schemas import (
    IntentMatch,
    IntentMatchesResponse,
    IntentRequest,
    IntentResponse,
    MyIntentsResponse,
)

router = APIRouter(prefix="/events/{event_id}/intents", tags=["intents"])


def _my_intent_count(db: Client, event_id: str, liker_id: str) -> int:
    rows = (
        db.table("meeting_intents")
        .select("id")
        .eq("event_id", event_id)
        .eq("liker_attendee_id", liker_id)
        .execute()
        .data
        or []
    )
    return len(rows)


def _fetch_target(db: Client, event_id: str, target_id: str) -> dict | None:
    res = (
        db.table("attendees")
        .select("*")
        .eq("id", target_id)
        .eq("event_id", event_id)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


@router.post("", response_model=IntentResponse, status_code=201)
async def set_intent(
    event_id: str,
    body: IntentRequest,
    user: AuthUser = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    """Pick someone to meet. Idempotent — picking again is a no-op (still 201)."""
    event = fetch_event_or_404(db, event_id)
    if event["status"] == "ended":
        raise HTTPException(status_code=409, detail="This event has already ended")

    me = fetch_my_attendee(db, event_id, user.id)
    if me is None:
        raise HTTPException(status_code=404, detail="Register for this event first")

    target_id = str(body.target_attendee_id)
    if target_id == str(me["id"]):
        raise HTTPException(status_code=400, detail="You can't pick yourself")

    target = _fetch_target(db, event_id, target_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Attendee not found")
    if (target.get("tag") or "attendee") != "attendee":
        # Speakers/hosts are guests, not seated in the rotation, so seating can't
        # bring you together — picking them would be a promise we can't keep.
        raise HTTPException(
            status_code=400,
            detail="Speakers and hosts aren't part of the seating rotation",
        )

    cap = intent_cap(event)
    existing = (
        db.table("meeting_intents")
        .select("id")
        .eq("event_id", event_id)
        .eq("liker_attendee_id", str(me["id"]))
        .eq("liked_attendee_id", target_id)
        .limit(1)
        .execute()
    )
    if existing.data:
        # Already picked — idempotent, don't double-count against the cap.
        return IntentResponse(wants=True, used=_my_intent_count(db, event_id, str(me["id"])), cap=cap)

    if _my_intent_count(db, event_id, str(me["id"])) >= cap:
        raise HTTPException(
            status_code=409,
            detail=f"You've used all {cap} of your meeting picks — remove one to add another",
        )

    db.table("meeting_intents").insert(
        {
            "event_id": event_id,
            "liker_attendee_id": str(me["id"]),
            "liked_attendee_id": target_id,
        }
    ).execute()
    return IntentResponse(wants=True, used=_my_intent_count(db, event_id, str(me["id"])), cap=cap)


@router.delete("/{target_attendee_id}", response_model=IntentResponse)
async def clear_intent(
    event_id: str,
    target_attendee_id: str,
    user: AuthUser = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    """Un-pick someone. Idempotent — clearing a pick you never made is fine."""
    event = fetch_event_or_404(db, event_id)
    me = fetch_my_attendee(db, event_id, user.id)
    if me is None:
        raise HTTPException(status_code=404, detail="Register for this event first")

    db.table("meeting_intents").delete().eq("event_id", event_id).eq(
        "liker_attendee_id", str(me["id"])
    ).eq("liked_attendee_id", target_attendee_id).execute()
    return IntentResponse(
        wants=False,
        used=_my_intent_count(db, event_id, str(me["id"])),
        cap=intent_cap(event),
    )


@router.get("/me", response_model=MyIntentsResponse)
async def my_intents(
    event_id: str,
    user: AuthUser = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    """The viewer's own picks. Never exposes anyone else's intent (privacy)."""
    event = fetch_event_or_404(db, event_id)
    me = fetch_my_attendee(db, event_id, user.id)
    if me is None:
        raise HTTPException(status_code=404, detail="Register for this event first")

    rows = (
        db.table("meeting_intents")
        .select("liked_attendee_id")
        .eq("event_id", event_id)
        .eq("liker_attendee_id", str(me["id"]))
        .execute()
        .data
        or []
    )
    target_ids = [str(r["liked_attendee_id"]) for r in rows]
    return MyIntentsResponse(used=len(target_ids), cap=intent_cap(event), target_ids=target_ids)


@router.get("/matches", response_model=IntentMatchesResponse)
async def my_matches(
    event_id: str,
    user: AuthUser = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    """MUTUAL picks, revealed only AFTER the event. A pure one-sided like is never
    disclosed — only "you both wanted to meet" becomes visible, and only once the
    event has ended."""
    event = fetch_event_or_404(db, event_id)
    if event["status"] != "ended":
        raise HTTPException(status_code=409, detail="Matches are revealed after the event")

    me = fetch_my_attendee(db, event_id, user.id)
    if me is None:
        raise HTTPException(status_code=404, detail="Register for this event first")
    my_id = str(me["id"])

    rows = db.table("meeting_intents").select("*").eq("event_id", event_id).execute().data or []
    i_picked = {str(r["liked_attendee_id"]) for r in rows if str(r["liker_attendee_id"]) == my_id}
    picked_me = {str(r["liker_attendee_id"]) for r in rows if str(r["liked_attendee_id"]) == my_id}
    mutual_ids = i_picked & picked_me
    if not mutual_ids:
        return IntentMatchesResponse(count=0, matches=[])

    people = db.table("attendees").select("*").eq("event_id", event_id).execute().data or []
    by_id = {str(a["id"]): a for a in people}
    matches: list[IntentMatch] = []
    for mid in mutual_ids:
        info = by_id.get(mid)
        if not info:
            continue
        matches.append(
            IntentMatch(
                attendee_id=mid,
                name=info["name"],
                role=info["role"],
                company=info.get("company"),
                avatar_url=info.get("avatar_url"),
                linkedin_url=info.get("linkedin_url"),
                website_url=info.get("website_url"),
            )
        )
    matches.sort(key=lambda m: m.name.lower())
    return IntentMatchesResponse(count=len(matches), matches=matches)
