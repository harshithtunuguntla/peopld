"""THE single source of all icebreaker prompt text.

If you want to change how icebreakers sound — tone, guardrails, the fallback
questions — change it here and nowhere else. The engine and the provider import
from this module; no prompt strings live anywhere else in the codebase.

Design notes:
- People are referenced to the model by a stable 1-based INDEX, never by UUID, so
  a model that fumbles an identifier can't corrupt a database row — the engine maps
  index -> attendee_id itself.
- The model returns a JSON array (one object per person). We prefill the assistant
  turn with "[" to force valid JSON and skip any preamble.
- The fallback bank is curated professional questions used whenever the LLM is
  disabled, errors, times out, or returns something we can't trust.
"""

# Forced-JSON prefill: the provider seeds the assistant turn with this so the
# response is a bare JSON array (no prose, no markdown fence).
JSON_PREFILL = "["

# Guardrails live entirely in the system prompt (spec §9 / Backend-3).
SYSTEM_PROMPT = (
    "You write short, warm, professional networking icebreakers for people meeting "
    "at an in-person founder/startup event. For each person at a table, you write ONE "
    "question they can ask a specific other person at that table.\n\n"
    "Rules — follow every one:\n"
    "1. Keep it professional and work-focused. Draw on each person's role and what "
    "they are looking for.\n"
    "2. One sentence, ends with a question mark, easy to say out loud, under 30 words.\n"
    "3. Strictly avoid personal, emotional, political, religious, health, or romantic "
    "topics. No small talk about weather or weekends.\n"
    "4. The question must be directed FROM one person TO a different person — never "
    "address someone to themselves.\n"
    "5. Choose each person's target as the tablemate they would most benefit from "
    "talking to, given roles and goals.\n"
    "6. Output ONLY a JSON array, one object per person, no prose, no markdown."
)


def _format_person(index: int, name: str, role: str, looking_for: str) -> str:
    role = role or "—"
    looking_for = looking_for or "—"
    return f"{index}. {name} — {role}; looking for: {looking_for}"


# How many of a person's previous questions to show the model, so it can avoid
# repeating itself across rounds (the whole point: people get bored).
PROMPT_HISTORY_LIMIT = 3


def build_user_prompt(roster: list[dict], histories: dict[int, list[str]] | None = None) -> str:
    """roster: ordered list of {name, role, looking_for}. Index is position+1.
    histories: {person index -> their recent question_texts, newest first} so the
    model can deliberately ask about something different this round.

    The numbered roster lines are also what the StubClient parses, so keep the
    leading "<n>. " format stable (history lines never start with "<n>.").
    """
    histories = histories or {}
    blocks = []
    for i, p in enumerate(roster):
        index = i + 1
        blocks.append(_format_person(index, p.get("name", ""), p.get("role", ""), p.get("looking_for", "")))
        recent = histories.get(index, [])[:PROMPT_HISTORY_LIMIT]
        if recent:
            asked = "; ".join(f'"{q}"' for q in recent)
            blocks.append(f"   (already asked this person: {asked} — ask about something different)")
    people_block = "\n".join(blocks)
    schema = (
        '[{"recipient": <person number>, "target": <a DIFFERENT person number>, '
        '"question": "<the icebreaker>"}]'
    )
    return (
        f"People at this table:\n{people_block}\n\n"
        f"Write one icebreaker for every person (numbers 1 to {len(roster)}). "
        f"Each person's target must be a different person at this table. "
        f"Make every question fresh — never reuse the wording or topic of a "
        f"question that person was already asked.\n"
        f"Return a JSON array exactly in this shape:\n{schema}"
    )


# Curated professional fallback questions. {target} is filled with the tablemate's
# first name. Used whenever the LLM path is unavailable or untrusted.
FALLBACK_BANK = (
    "What's the most interesting problem {target} is working on right now?",
    "What kind of people is {target} hoping to meet at an event like this?",
    "What's something {target} has changed their mind about in their work lately?",
    "What's a decision {target} is wrestling with that you might have a view on?",
    "What does a great week look like for {target} right now?",
    "What's one thing {target} wishes more people understood about their space?",
    "What's a recent win {target} is proud of, and what made it work?",
    "Where could someone in this room be most useful to {target} this quarter?",
    "What's a skill {target} is trying to build right now?",
    "What's the best piece of advice {target} has gotten about their work?",
    "What would make this event a win for {target}?",
    "What's something {target} is surprisingly good at that doesn't show on a profile?",
)


def fallback_question(target_name: str, *, used: set[str] = frozenset(), offset: int = 0) -> str:
    """A safe, professional question about `target_name` from the curated bank.

    Anti-boredom: rotates the bank by `offset` (use the count of questions this
    person has already had) and skips anything in `used` (their past questions),
    so the same person doesn't get the same wording twice until the bank is
    exhausted. Falls back to the rotated head only if every option was used.
    """
    first_name = (target_name or "them").split()[0]
    n = len(FALLBACK_BANK)
    rotated = [FALLBACK_BANK[(offset + k) % n].format(target=first_name) for k in range(n)]
    for q in rotated:
        if q not in used:
            return q
    return rotated[0]
