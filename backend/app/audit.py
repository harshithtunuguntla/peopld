"""Audit trail — one row per state-changing action (who did what, to what, when).

Rules:
- metadata holds UUIDs, enum values, and counts only — NEVER PII.
- An audit failure must never break the user-facing request: log and continue.
- The audit_log table has no client RLS access (service-role only).

Actions in use: event.created/updated/ended, attendee.registered/status_changed,
round.draft_created/draft_regenerated/published/ended/cancelled,
icebreaker.generated/refreshed.
"""

import logging

from supabase import Client

logger = logging.getLogger("app.audit")


def record_audit(
    db: Client,
    *,
    action: str,
    entity_type: str,
    actor_user_id: str | None,
    event_id: str | None = None,
    entity_id: str | None = None,
    metadata: dict | None = None,
) -> None:
    row = {
        "event_id": event_id,
        "actor_user_id": actor_user_id,
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "metadata": metadata or {},
    }
    try:
        db.table("audit_log").insert(row).execute()
    except Exception:
        logger.exception(
            "audit write failed",
            extra={"action": action, "event_id": event_id, "actor_user_id": actor_user_id},
        )
        return
    logger.info(
        "audit",
        extra={
            "action": action,
            "event_id": event_id,
            "actor_user_id": actor_user_id,
            "entity_id": entity_id,
        },
    )
