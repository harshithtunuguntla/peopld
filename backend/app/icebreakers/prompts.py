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


def build_user_prompt(
    roster: list[dict],
    histories: dict[int, list[str]] | None = None,
    theme: str | None = None,
) -> str:
    """roster: ordered list of {name, role, looking_for}. Index is position+1.
    histories: {person index -> their recent question_texts, newest first} so the
    model can deliberately ask about something different this round.
    theme: the organizer-authored topic for THIS round (e.g. "What you're
    building"). When set, questions are steered toward it so the round's agenda
    actually shapes the conversation, not just the label on the screen.

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
    theme = (theme or "").strip()
    theme_line = (
        f"This round's theme is \"{theme}\". Lean every question toward this theme "
        f"while still grounding it in the two people's roles and goals.\n"
        if theme
        else ""
    )
    return (
        f"People at this table:\n{people_block}\n\n"
        f"{theme_line}"
        f"Write one icebreaker for every person (numbers 1 to {len(roster)}). "
        f"Each person's target must be a different person at this table. "
        f"Make every question fresh — never reuse the wording or topic of a "
        f"question that person was already asked.\n"
        f"Return a JSON array exactly in this shape:\n{schema}"
    )


# Curated fallback questions, grouped by intent. {target} is filled with the
# tablemate's first name. Used whenever the LLM path is unavailable or untrusted —
# which, until the LLM provider is configured, is EVERY icebreaker, so these carry
# the whole live experience. Warm and casual, but still work-focused (the system
# prompt's guardrails apply to the human authoring these too: no personal/political/
# religious/health/romantic topics).
#
# Each entry has exactly one {target} slot so it drops straight into the engine's
# index->name mapping. `bucket_for_theme` routes the organizer's round topic to one
# of these buckets so a NAMED round actually steers the fallback (not just the LLM);
# an unthemed or unrecognised round uses "general".
FALLBACK_BANKS: dict[str, tuple[str, ...]] = {
    # Universal openers — safe for any pairing, any round. A light thread of local
    # (Hyderabad/India) flavour lives here so the room feels grounded by default.
    "general": (
        "What's {target} most fired up about building right now?",
        "What's been the best part of {target}'s week so far?",
        "Where could someone in this room actually be useful to {target}?",
        "What's something {target} can't stop thinking about lately?",
        "What made {target} want to come along tonight?",
        "What's a problem {target} would love a fresh pair of eyes on?",
        "What's something {target} is surprisingly good at that won't show up on a profile?",
        "What's {target} hoping to walk away from tonight with?",
        "What's the most fun {target} has had at work recently?",
        "What's something {target} believes about their space that most people don't?",
        "What kind of people is {target} hoping to bump into at events like this?",
        "What's {target} quietly proud of right now?",
        "If {target} had a free extra hour every day, where would it go?",
        "What's a rabbit hole {target} has happily gone down lately?",
        "What's one thing {target} wishes more people asked them about?",
        "What pulled {target} into the Hyderabad startup scene?",  # local
        "What's {target}'s favourite spot in the city to actually get work done?",  # local
        "Who's someone in the local scene {target} thinks everyone should know?",  # local
        "What's a small win {target} had this week that felt bigger than it looks?",
        "How did {target} end up doing what they do here?",  # local-ish
        "What's something {target} has changed their mind about this year?",
        "What's {target} loving about building from India right now?",  # local
    ),
    # Product / vision / what they're making.
    "building": (
        "What part of what {target} is building has them most excited this month?",
        "What's the trickiest product call {target} has made this year?",
        "What does {target} want to be true about their product a year from now?",
        "What's something {target} shipped recently that they're proud of?",
        "What's the one feature {target} wishes they could build tomorrow?",
        "What's the problem {target} is really trying to solve underneath it all?",
        "What's surprised {target} most about their users lately?",
        "How did {target} land on this idea in the first place?",
        "What's something {target} cut from the product that turned out to be the right call?",
        "What does a great day of building look like for {target}?",
        "What's the part of the product {target} is itching to make better?",
        "What would {target} build next if resources weren't a worry?",
    ),
    # Capital / investors / runway.
    "fundraising": (
        "What kind of investor is {target} actually hoping to find?",
        "What's one number {target} thinks tells their story better than revenue?",
        "What did {target} learn the last time they pitched?",
        "What's the part of fundraising {target} wishes someone had warned them about?",
        "What's {target} most focused on proving out before the next raise?",
        "What's a bit of fundraising advice {target} would pass on?",
        "How is {target} thinking about runway versus growth right now?",
        "What's the best question an investor ever asked {target}?",
        "What would make {target} say yes to a particular investor?",
        "What's {target} doing differently this round than the last one?",
        "What's one thing {target} wishes more investors understood about their space?",
    ),
    # First customers / growth / distribution.
    "gtm": (
        "How did {target} land their first handful of customers?",
        "What channel is {target} most curious to try next?",
        "What's {target}'s sharpest read on who actually buys their product?",
        "What's a growth experiment that surprised {target} recently?",
        "What's the hardest part of getting in front of the right people for {target}?",
        "What's working better than expected in how {target} reaches customers?",
        "What's one thing {target} learned the hard way about selling?",
        "How does {target} know when a customer really gets it?",
        "What's {target}'s favourite story of winning a customer they probably shouldn't have?",
        "What's the next market {target} is itching to crack?",
        "What makes someone the perfect first customer for {target}?",
        "What's a distribution idea {target} keeps coming back to?",
    ),
    # Hiring / co-founders / culture.
    "team": (
        "What's the most important role {target} is hiring for right now?",
        "What does {target} look for in a first engineer or co-founder?",
        "What's one thing {target} does to keep a small team pulling together?",
        "What's the best hire {target} ever made, and what made them great?",
        "What's something {target} has gotten better at as a leader lately?",
        "How does {target} keep the team excited on a hard week?",
        "What kind of person really thrives on {target}'s team?",
        "What's a hiring mistake {target} won't make again?",
        "What does {target} wish they'd learned about managing people sooner?",
        "How did {target} meet their co-founder?",
        "What's the one culture thing {target} cares most about protecting?",
    ),
    # Mistakes / changed-my-mind / hard-won advice.
    "lessons": (
        "What's something {target} has completely changed their mind about lately?",
        "What's a mistake {target} would steer another founder away from?",
        "What's the best advice {target} got that they almost ignored?",
        "What's something {target} believed a year ago that makes them laugh now?",
        "What's the hardest lesson {target} learned the expensive way?",
        "What would {target} tell themselves on day one if they could?",
        "What's a risk {target} took that totally paid off?",
        "What's something {target} wishes more founders were honest about?",
        "What's a habit that's quietly made {target} better at this?",
        "What's the bravest call {target} has made so far?",
        "What's something {target} had to unlearn to get where they are?",
    ),
    # The ask — what they need from the room tonight.
    "ask": (
        "What would make tonight a real win for {target}?",
        "What kind of intro would actually move the needle for {target}?",
        "What's something {target} needs that's just easier to ask for in person?",
        "Who is {target} hoping to meet that you might know?",
        "What's one thing the right person here could unlock for {target}?",
        "What's {target} stuck on that a fresh perspective might crack?",
        "What's the ask {target} is a little shy to make out loud?",
        "If you could hand {target} one introduction, who would it be?",
        "What kind of help does {target} wish more people offered?",
        "What's {target} looking for that's been surprisingly hard to find?",
        "What's something small you could do tonight that would help {target}?",
    ),
    # Explicit Hyderabad / India ecosystem (for a round themed on the local scene).
    "local": (
        "How has building in Hyderabad shaped the way {target} runs their company?",
        "What does {target} wish more people understood about the India market?",
        "Who in the local ecosystem has {target} learned the most from?",
        "What's {target}'s favourite thing about the Hyderabad startup scene right now?",
        "What's something about building from India that {target} thinks is underrated?",
        "What brought {target} to Hyderabad to build this?",
        "What's one way the local scene has helped {target} more than they expected?",
        "What does {target} think Hyderabad needs more of to help founders?",
        "How is {target} thinking about going global from India?",
        "What's a local connection that genuinely changed things for {target}?",
    ),
}

# Backward-compatible alias: the original flat bank was the general pool.
FALLBACK_BANK = FALLBACK_BANKS["general"]

# Free-text round topic -> bucket. First bucket whose keywords appear in the topic
# wins, so order matters: the most specific intents are listed before the broadest.
# Anything unmatched (or no topic) falls through to "general".
_THEME_KEYWORDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("local", ("hyderabad", "india", "ecosystem", "t-hub", "thub", "local")),
    ("fundraising", ("fund", "raise", "invest", "capital", "runway", "cap table", "pitch", "vc", "angel")),
    ("gtm", ("go-to-market", "gtm", "customer", "growth", "sales", "distribution", "market", "users", "traction")),
    ("team", ("team", "hir", "co-found", "cofound", "culture", "talent")),
    ("lessons", ("lesson", "mistake", "learn", "fail", "advice", "changed")),
    ("ask", ("ask", "help", "need", "looking for", "intro", "connect")),
    ("building", ("build", "product", "vision", "ship", "making", "what you're")),
)


def bucket_for_theme(theme: str | None) -> str:
    """Map an organizer's free-text round topic to a fallback bucket key.

    Best-effort keyword match — an unrecognised or empty theme returns "general",
    which is always a safe, on-topic pool. Pure function, no I/O."""
    t = (theme or "").lower()
    if not t.strip():
        return "general"
    for bucket, keywords in _THEME_KEYWORDS:
        if any(k in t for k in keywords):
            return bucket
    return "general"


def fallback_question(
    target_name: str, *, used: set[str] = frozenset(), offset: int = 0, theme: str | None = None
) -> str:
    """A safe, casual question about `target_name` from the curated banks.

    Theme-aware: `theme` (the round's topic) selects a bucket via
    `bucket_for_theme`, and the pool is that bucket PLUS "general" — so a themed
    round leans into its topic while still having ~30+ options, and the rotation
    never starves even across many same-theme rounds.

    Anti-boredom: rotates the pool by `offset` (the count of questions this person
    has already had) and skips anything in `used` (their past questions), so the
    same person doesn't get the same wording twice until the pool is exhausted.
    Falls back to the rotated head only if every option was already used.
    """
    first_name = (target_name or "them").split()[0]
    bucket = bucket_for_theme(theme)
    raw_pool = FALLBACK_BANKS[bucket] + (() if bucket == "general" else FALLBACK_BANKS["general"])
    pool = tuple(dict.fromkeys(raw_pool))  # dedup, preserve order (bucket first)
    n = len(pool)
    rotated = [pool[(offset + k) % n].format(target=first_name) for k in range(n)]
    for q in rotated:
        if q not in used:
            return q
    return rotated[0]
