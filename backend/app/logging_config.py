"""Structured logging — JSON lines in production, human-readable in dev.

Cloud Run forwards stdout to Cloud Logging, which parses the "severity"
and "message" keys from JSON lines automatically (set LOG_FORMAT=json there).

GOLDEN RULE: never log PII. Log UUIDs (user_id, attendee_id, event_id),
never names, emails, or phone numbers.
"""

import json
import logging
import sys
from datetime import datetime, timezone

# Context attributes our code attaches via logger.info(..., extra={...}).
CONTEXT_FIELDS = (
    "method",
    "path",
    "status",
    "duration_ms",
    "actor_user_id",
    "event_id",
    "entity_id",
    "action",
    "round_id",
    "source",  # icebreaker source: "llm" | "fallback"
    "count",
)


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "severity": record.levelname,
            "message": record.getMessage(),
            "logger": record.name,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        for field in CONTEXT_FIELDS:
            value = getattr(record, field, None)
            if value is not None:
                payload[field] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


class TextFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        base = super().format(record)
        context = " ".join(
            f"{field}={getattr(record, field)}"
            for field in CONTEXT_FIELDS
            if getattr(record, field, None) is not None
        )
        return f"{base} {context}".rstrip()


def setup_logging(log_format: str = "text") -> None:
    handler = logging.StreamHandler(sys.stdout)
    if log_format == "json":
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(TextFormatter("%(levelname)s %(name)s: %(message)s"))
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(logging.INFO)
