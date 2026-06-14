"""LLM provider abstraction for the icebreaker engine.

One tiny interface, swappable by the LLM_PROVIDER env var, so the engine and the
router never know which model they're talking to:

    vertex   -> Claude on GCP Vertex AI (uses GCP credits + Application Default
                Credentials; no API key). The production default.
    stub     -> deterministic, offline, no network. Powers the test suite and
                lets the whole app run with zero GCP setup.
    disabled -> always raises; the engine then serves the curated fallback bank.

A misconfigured Vertex (provider=vertex but no project id) degrades to `disabled`
— i.e. real fallback-bank questions, never stub gibberish in production.
"""

import json
import logging
import re
from typing import Protocol, runtime_checkable

from app.config import settings

logger = logging.getLogger("app.icebreakers.provider")


@runtime_checkable
class LLMClient(Protocol):
    def complete(
        self,
        *,
        system: str,
        user: str,
        prefill: str = "",
        max_tokens: int,
        temperature: float,
        timeout: float,
    ) -> str:
        """Return the model's text completion. If `prefill` is given, the returned
        string INCLUDES it, so the caller can json.loads(result) directly."""
        ...


class VertexClaudeClient:
    """Claude via GCP Vertex AI. Auth is Application Default Credentials
    (`gcloud auth application-default login` locally; the service account on
    Cloud Run) — there is no Anthropic API key in this path."""

    def __init__(self, project_id: str, region: str, model: str):
        from anthropic import AnthropicVertex  # imported lazily so tests need no SDK extra

        self._client = AnthropicVertex(project_id=project_id, region=region)
        self._model = model

    def complete(self, *, system, user, prefill="", max_tokens, temperature, timeout) -> str:
        messages: list[dict] = [{"role": "user", "content": user}]
        if prefill:
            messages.append({"role": "assistant", "content": prefill})
        message = self._client.messages.create(
            model=self._model,
            system=system,
            max_tokens=max_tokens,
            temperature=temperature,
            messages=messages,
            timeout=timeout,
        )
        text = "".join(block.text for block in message.content if block.type == "text")
        return prefill + text  # prefill is not echoed by the API — re-attach it


class StubClient:
    """Deterministic offline client (LLM_PROVIDER=stub).

    Parses the numbered roster out of the prompt and returns valid JSON, so the
    engine's real parse -> validate -> index-map path is exercised without a
    network call. Targets are assigned round-robin to the next person."""

    def complete(self, *, system, user, prefill="", max_tokens=0, temperature=0.0, timeout=0.0) -> str:
        indices = [int(m) for m in re.findall(r"(?m)^\s*(\d+)\.", user)]
        n = max(indices) if indices else 0
        items = [
            {
                "recipient": i,
                "target": (i % n) + 1 if n > 1 else i,
                "question": f"What is person {i} most focused on this quarter?",
            }
            for i in range(1, n + 1)
        ]
        return json.dumps(items)


class DisabledClient:
    """Always fails — the engine catches this and uses the curated fallback bank."""

    def complete(self, *, system, user, prefill="", max_tokens=0, temperature=0.0, timeout=0.0) -> str:
        raise RuntimeError("LLM provider is disabled")


def get_llm_client() -> LLMClient:
    """The configured client. Never raises for ordinary misconfiguration — it
    degrades to DisabledClient so the room still gets fallback-bank questions."""
    provider = (settings.llm_provider or "").lower()
    if provider == "stub":
        return StubClient()
    if provider == "disabled":
        return DisabledClient()
    if provider == "vertex":
        if not settings.vertex_project_id:
            logger.error("LLM_PROVIDER=vertex but VERTEX_PROJECT_ID is unset — "
                         "serving fallback-bank icebreakers")
            return DisabledClient()
        return VertexClaudeClient(
            settings.vertex_project_id, settings.vertex_region, settings.vertex_model
        )
    logger.error("Unknown LLM_PROVIDER %r — serving fallback-bank icebreakers", provider)
    return DisabledClient()
