"""Server-sent Realtime doorbell (Supabase Broadcast).

WHY THIS EXISTS — the scaling fix for "publishes don't reach all phones":
Attendee phones used to learn about changes via Supabase `postgres_changes`, which
tails the WAL and evaluates RLS *per changed row, per subscriber*. One publish for
40 people writes ~41 rows; fanned out to 40 phones that's ~1,640 messages in a
sub-second burst, which overruns Realtime's throughput cap and drops messages —
sometimes for a few phones, sometimes for all. (See docs/design/realtime.md.)

Instead we send ONE lightweight Broadcast message per state change from the
backend (which already performs the change authoritatively). Fan-out becomes one
message per phone — ~40, not ~1,640 — with no WAL tailing and no per-subscriber
RLS work. Phones listen for this single `resync` signal and re-fetch the
authoritative snapshot from GET /events/:id/live. Realtime stays a DOORBELL; REST
stays the source of truth.

SECURITY:
- The payload is signal-only — NO names, NO seating, NO ids of people. Nothing
  sensitive ever crosses the channel; the snapshot behind it is JWT-protected.
- Sent with the service-role key from the server only. App clients never send a
  broadcast (the organizer "Re-sync" button calls an owner-only endpoint that
  routes here), so there is no client-side send path to abuse.
- Best-effort: a failed/blocked broadcast never raises into the request path. If
  a doorbell is missed, the attendee's connection-health recovery poll
  (frontend use-live-state.ts) is the backstop, so correctness never depends on
  delivery — only latency does.

FUTURE HARDENING (needs a live Supabase project to verify, so intentionally not
shipped blind): switch the topic to a PRIVATE channel with Realtime Authorization
(RLS on realtime.messages) so only authenticated attendees of the event may
receive, and only the service role may send. This module already centralises the
send, so that becomes a localized change here + client setAuth.
"""

import logging

import httpx

from app.config import settings

logger = logging.getLogger("app.realtime")

# Must match the channel name the clients subscribe to (frontend uses
# `live:${eventId}` in use-live-state.ts and the organizer console).
def _topic(event_id: str) -> str:
    return f"live:{event_id}"


def broadcast_event_changed(event_id: str, kind: str = "") -> None:
    """Ring the doorbell for one event: tell every connected client to re-fetch.

    `kind` is a free-text tag ("publish", "begin", "end", "manual", …) used only
    for server logging/debugging — it is NOT relied on by clients (they always
    re-fetch the full snapshot, so the doorbell is idempotent and order doesn't
    matter). Never raises; safe to run as a FastAPI BackgroundTask.
    """
    url = f"{settings.supabase_url.rstrip('/')}/realtime/v1/api/broadcast"
    key = settings.supabase_service_role_key
    body = {
        "messages": [
            {
                "topic": _topic(event_id),
                "event": "resync",
                # signal-only — deliberately no PII / seating / person ids
                "payload": {"kind": kind},
                "private": False,
            }
        ]
    }
    try:
        resp = httpx.post(
            url,
            json=body,
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            timeout=5.0,
        )
        if resp.status_code >= 300:
            logger.warning(
                "realtime broadcast non-2xx",
                extra={"event_id": event_id, "kind": kind, "status": resp.status_code},
            )
    except Exception:
        # Doorbell is best-effort; the client recovery poll is the real backstop.
        logger.warning(
            "realtime broadcast failed", extra={"event_id": event_id, "kind": kind}, exc_info=True
        )
