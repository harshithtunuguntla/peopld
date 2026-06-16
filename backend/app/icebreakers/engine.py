"""Icebreaker generation: one Claude call per table, batched, async-friendly.

The flow (spec §9):
1. The round is published with its table assignments (rounds.py).
2. publish_round schedules generate_for_round as a FastAPI background task, so the
   organizer's request returns instantly and the room sees tables immediately.
3. For each table we make ONE LLM call returning a question per person; each
   icebreaker INSERT is a Step-5 realtime "doorbell", so phones re-fetch /live and
   the question pops in within seconds.

Reliability over cleverness: any LLM failure (disabled, error, timeout, junk
output, a person the model skipped) falls back per-person to the curated bank —
the room never sees a blank icebreaker. PII (names/roles/looking-for) is sent to
the LLM because personalization requires it, but is NEVER written to logs/audit.
"""

import json
import logging
import re
import time
from datetime import datetime, timezone

from supabase import Client

from app.audit import record_audit
from app.icebreakers import prompts
from app.icebreakers.provider import LLMClient, get_llm_client
from app.config import settings

logger = logging.getLogger("app.icebreakers")

# One generated question, resolved to attendee UUIDs and tagged by source.
# source is "llm" or "fallback" — counts only, used for logging/audit, never PII.

# A question longer than this is almost certainly the model rambling — cap it so a
# phone never has to render a paragraph.
MAX_QUESTION_LEN = 280
# How far back to look when avoiding repeats for a person (across all their rounds).
HISTORY_LOOKBACK = 20


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _sanitize_question(text: str) -> str:
    """Collapse whitespace/newlines to a single line and cap the length, so LLM
    output is always phone-safe. Returns '' if nothing usable remains."""
    cleaned = re.sub(r"\s+", " ", text).strip()
    if len(cleaned) > MAX_QUESTION_LEN:
        cleaned = cleaned[:MAX_QUESTION_LEN].rstrip()
    return cleaned


def _normalize(text: str) -> str:
    """Loose key for duplicate detection — case/space/trailing-punct insensitive."""
    return re.sub(r"\s+", " ", text).strip().lower().rstrip("?.!")


def _recipient_history(db: Client, recipient_id: str) -> list[str]:
    """A recipient's previous question_texts across the whole event, newest first.
    Drives anti-repetition: the model is told them, and fallback skips them."""
    rows = (
        db.table("icebreakers")
        .select("*")
        .eq("recipient_attendee_id", recipient_id)
        .order("generated_at", desc=True)
        .limit(HISTORY_LOOKBACK)
        .execute()
        .data
        or []
    )
    return [r["question_text"] for r in rows if r.get("question_text")]


def _attendees_by_id(db: Client, event_id: str) -> dict[str, dict]:
    rows = db.table("attendees").select("*").eq("event_id", event_id).execute().data or []
    return {str(r["id"]): r for r in rows}


def _tables_for_round(db: Client, round_id: str, by_id: dict[str, dict]) -> dict[int, list[dict]]:
    """{table_number: [attendee rows]} for a round, each table sorted by name
    (matches the tablemate ordering in /live for a stable index mapping)."""
    assignments = (
        db.table("table_assignments").select("*").eq("round_id", round_id).execute().data or []
    )
    tables: dict[int, list[dict]] = {}
    for a in assignments:
        attendee = by_id.get(str(a["attendee_id"]))
        if attendee:
            tables.setdefault(a["table_number"], []).append(attendee)
    for roster in tables.values():
        roster.sort(key=lambda r: (r.get("name") or "").lower())
    return tables


def _parse_llm_array(raw: str, n: int) -> dict[int, tuple[int, str]]:
    """Parse the model's JSON array into {recipient_index: (target_index, question)}.

    Tolerant: skips anything malformed or out of range so a single bad entry can't
    sink the table — those recipients just get a fallback question instead.
    """
    result: dict[int, tuple[int, str]] = {}
    data = json.loads(raw)  # may raise — caller treats that as a total miss
    if not isinstance(data, list):
        return result
    for entry in data:
        if not isinstance(entry, dict):
            continue
        try:
            recipient = int(entry["recipient"])
            target = int(entry["target"])
        except (KeyError, TypeError, ValueError):
            continue
        question = entry.get("question")
        if not isinstance(question, str) or not question.strip():
            continue
        if not (1 <= recipient <= n) or not (1 <= target <= n) or recipient == target:
            continue
        result.setdefault(recipient, (target, question.strip()))
    return result


def _questions_for_table(
    roster: list[dict], client: LLMClient, histories: dict[int, list[str]] | None = None,
    theme: str | None = None,
) -> list[tuple[int, int, str, str]]:
    """Return (recipient_idx, target_idx, question, source) for every person.

    Calls the LLM once (told each person's recent questions so it varies them);
    rejects any LLM answer that repeats a person's past question or sanitizes to
    empty, and fills every gap from the curated bank — which itself rotates and
    skips that person's past questions. Never raises.
    """
    n = len(roster)
    histories = histories or {}
    parsed: dict[int, tuple[int, str]] = {}
    if settings.icebreaker_enabled:
        try:
            raw = client.complete(
                system=prompts.SYSTEM_PROMPT,
                user=prompts.build_user_prompt(roster, histories, theme),
                prefill=prompts.JSON_PREFILL,
                max_tokens=settings.icebreaker_max_tokens,
                temperature=settings.icebreaker_temperature,
                timeout=settings.icebreaker_timeout_seconds,
            )
            parsed = _parse_llm_array(raw, n)
        except Exception:
            logger.warning("icebreaker LLM call failed — using fallback bank", exc_info=True)

    out: list[tuple[int, int, str, str]] = []
    for i in range(1, n + 1):
        history = histories.get(i, [])
        seen = {_normalize(q) for q in history}
        if i in parsed:
            target_idx, raw_question = parsed[i]
            question = _sanitize_question(raw_question)
            # Reject empties and literal repeats — those route to the fresh fallback.
            if question and _normalize(question) not in seen:
                out.append((i, target_idx, question, "llm"))
                continue
        target_idx = (i % n) + 1  # round-robin neighbour
        target_name = roster[target_idx - 1].get("name", "")
        question = prompts.fallback_question(
            target_name, used=set(history), offset=len(history)
        )
        out.append((i, target_idx, question, "fallback"))
    return out


def _histories_for_roster(db: Client, roster: list[dict]) -> dict[int, list[str]]:
    """{person index -> their prior question_texts} for anti-repetition."""
    return {i + 1: _recipient_history(db, p["id"]) for i, p in enumerate(roster)}


def _round_theme(db: Client, event_id: str, round_id: str) -> str | None:
    """The organizer-authored topic for this round, or None.

    Maps the round's number (1-based) onto the event's round_topics array
    (index i = round i+1). Best-effort: any missing/blank entry means "no theme",
    and the icebreakers fall back to their normal role-and-goal questions.
    """
    rounds = (
        db.table("rounds").select("*").eq("id", round_id).limit(1).execute().data or []
    )
    if not rounds:
        return None
    number = rounds[0].get("round_number")
    events = (
        db.table("events").select("*").eq("id", event_id).limit(1).execute().data or []
    )
    topics = (events[0].get("round_topics") if events else None) or []
    if not isinstance(number, int) or not (1 <= number <= len(topics)):
        return None
    theme = (topics[number - 1] or "").strip()
    return theme or None


def _rows_for_table(
    event_id: str, round_id: str, table_number: int, roster: list[dict],
    questions: list[tuple[int, int, str, str]], generated_at: str,
) -> list[dict]:
    return [
        {
            "event_id": event_id,
            "round_id": round_id,
            "table_number": table_number,
            "recipient_attendee_id": roster[recipient_idx - 1]["id"],
            "target_attendee_id": roster[target_idx - 1]["id"],
            "question_text": question,
            "generated_at": generated_at,
        }
        for recipient_idx, target_idx, question, _source in questions
    ]


def generate_for_round(db: Client, event_id: str, round_id: str, *, client: LLMClient | None = None) -> dict:
    """Generate icebreakers for every table in a round, ONE table at a time.

    Idempotent PER TABLE: a table that already has icebreakers is skipped, so a
    retried publish (REQ-RT-03) — or a generation that died half-way through the
    room — self-heals by finishing only the tables that are still missing,
    instead of skipping the whole round and leaving tables permanently blank.

    Designed to run as a background task — returns a small summary for tests/logs
    and never raises out (a failed icebreaker batch must not crash anything)."""
    client = client or get_llm_client()
    summary = {"tables": 0, "llm": 0, "fallback": 0, "skipped": False}
    try:
        done_tables = {
            r["table_number"]
            for r in (
                db.table("icebreakers").select("*").eq("round_id", round_id).execute().data or []
            )
        }
        by_id = _attendees_by_id(db, event_id)
        tables = _tables_for_round(db, round_id, by_id)
        theme = _round_theme(db, event_id, round_id)
        pending = {t: roster for t, roster in tables.items() if t not in done_tables}
        if not pending:
            logger.info("icebreakers already generated — skipping", extra={"event_id": event_id})
            summary["skipped"] = True
            return summary

        generated_at = _now_iso()
        for table_number, roster in sorted(pending.items()):
            if len(roster) < 2:
                # A question is always FROM one person TO another — a lone seat
                # has no target. Leave it blank rather than invent a self-question.
                logger.info("skipping single-person table", extra={"event_id": event_id})
                continue
            started = time.monotonic()
            histories = _histories_for_roster(db, roster)
            questions = _questions_for_table(roster, client, histories, theme)
            rows = _rows_for_table(event_id, round_id, table_number, roster, questions, generated_at)
            db.table("icebreakers").insert(rows).execute()

            llm = sum(1 for q in questions if q[3] == "llm")
            fallback = len(questions) - llm
            summary["tables"] += 1
            summary["llm"] += llm
            summary["fallback"] += fallback
            logger.info(
                "icebreakers generated for table",
                extra={
                    "event_id": event_id,
                    "duration_ms": round((time.monotonic() - started) * 1000),
                    "source": "fallback" if fallback and not llm else "llm",
                    "count": len(rows),
                },
            )

        record_audit(
            db,
            action="icebreaker.generated",
            entity_type="round",
            actor_user_id=None,  # system/background action, not a user
            event_id=event_id,
            entity_id=round_id,
            metadata={
                "table_count": summary["tables"],
                "llm_count": summary["llm"],
                "fallback_count": summary["fallback"],
            },
        )
    except Exception:
        # Background task: log and swallow. Phones keep showing the table; the
        # organizer can hit refresh, and /live simply reports icebreaker=null.
        logger.exception("icebreaker round generation failed", extra={"event_id": event_id})
    return summary


def refresh_for_attendee(
    db: Client, event_id: str, round_id: str, attendee_id: str, *, client: LLMClient | None = None
) -> dict | None:
    """One fresh question for a single attendee ("Generate Another" button).

    Re-reads the attendee's current table, generates, and inserts a NEW row (newer
    generated_at) — /live and GET icebreaker already return the latest. Returns the
    new icebreaker row, or None if the attendee isn't seated in this round.
    """
    client = client or get_llm_client()
    seat = (
        db.table("table_assignments")
        .select("*")
        .eq("round_id", round_id)
        .eq("attendee_id", attendee_id)
        .limit(1)
        .execute()
    ).data
    if not seat:
        return None
    table_number = seat[0]["table_number"]

    by_id = _attendees_by_id(db, event_id)
    roster = _tables_for_round(db, round_id, by_id).get(table_number, [])
    if len(roster) < 2:
        return None

    # History (incl. the question being refreshed) makes the new one differ.
    histories = _histories_for_roster(db, roster)
    theme = _round_theme(db, event_id, round_id)
    questions = _questions_for_table(roster, client, histories, theme)
    rows = _rows_for_table(event_id, round_id, table_number, roster, questions, _now_iso())
    mine = next((r for r in rows if str(r["recipient_attendee_id"]) == str(attendee_id)), None)
    if mine is None:
        return None

    stored = db.table("icebreakers").insert(mine).execute().data[0]
    record_audit(
        db,
        action="icebreaker.refreshed",
        entity_type="icebreaker",
        actor_user_id=None,
        event_id=event_id,
        entity_id=stored["id"],
        metadata={"table_number": table_number},
    )
    return stored
