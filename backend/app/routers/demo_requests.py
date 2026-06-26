"""Book-a-demo lead capture — the marketing site's only write endpoint.

Public and unauthenticated (it's on the anonymous landing page). The lead is
stored in `demo_requests` (service-role only — never client-readable) and an
optional best-effort notification email is sent after the response, so the form
never waits on SMTP and a mail failure can't lose the lead.
"""

import logging

from fastapi import APIRouter, BackgroundTasks, Depends
from supabase import Client

from app.database import get_supabase
from app.email import send_demo_notification
from app.models.schemas import DemoRequestCreate, DemoRequestResponse

logger = logging.getLogger("app.demo_requests")

router = APIRouter(prefix="/demo-requests", tags=["demo-requests"])


@router.post("", response_model=DemoRequestResponse, status_code=201)
def create_demo_request(
    payload: DemoRequestCreate,
    background_tasks: BackgroundTasks,
    db: Client = Depends(get_supabase),
):
    """Capture a demo request. Stores first (source of truth), then notifies."""
    lead = {
        "name": payload.name,
        "email": payload.email,
        "company": payload.company,
        "message": payload.message,
    }
    db.table("demo_requests").insert(lead).execute()
    # Notify out-of-band so the caller never blocks on SMTP.
    background_tasks.add_task(send_demo_notification, lead)
    return DemoRequestResponse(ok=True)
