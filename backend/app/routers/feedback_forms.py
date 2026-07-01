"""Customizable post-event feedback forms (Google-Forms-style) + recap gating.

Three audiences, one form per event:
  - Organizer (owner-only): build the form (any mix of question types), toggle
    whether it gates the recap, publish it, and read aggregated results.
  - Attendee: fetch the published form, submit answers (resubmitting replaces).
  - Recap gating: the attendee recap checks `fill` — if the form is published and
    `gate_recap` is on and they haven't submitted, the recap stays locked.

Storage notes: a question's `options` JSONB holds `{"choices": [...], "scale": n}`
so one column covers choice lists and rating scales. An answer's `value` JSONB is
a string, number, or list of strings depending on the question type.
"""

from fastapi import APIRouter, Depends, HTTPException
from supabase import Client

from app.audit import record_audit
from app.database import get_supabase
from app.deps import (
    AdminContext,
    AuthUser,
    get_current_admin_ctx,
    require_event_admin,
    fetch_event_or_404,
    fetch_my_attendee,
)
from app.models.schemas import (
    CHOICE_TYPES,
    AttendeeFormResponse,
    FormConfigResponse,
    FormConfigUpdate,
    FormQuestion,
    FormResults,
    FormSubmission,
    IndividualResponse,
    PublishUpdate,
    QuestionResult,
    ResponseAnswer,
)

router = APIRouter(prefix="/events/{event_id}/feedback-form", tags=["feedback-form"])

_admin_ctx = get_current_admin_ctx


# --- A sensible default an organizer can ship as-is or edit ----------------------
DEFAULT_QUESTIONS: list[dict] = [
    {"type": "rating", "label": "How would you rate the event overall?", "required": True, "scale": 5},
    {"type": "nps", "label": "How likely are you to recommend this event to a friend or colleague?", "required": True},
    {"type": "long_text", "label": "What did you enjoy most?", "required": False},
    {"type": "long_text", "label": "What could we do better next time?", "required": False},
    {
        "type": "single_choice",
        "label": "Would you come to another event like this?",
        "required": False,
        "options": ["Definitely", "Maybe", "Probably not"],
    },
]


def _default_form(event_id: str) -> FormConfigResponse:
    return FormConfigResponse(
        event_id=event_id,
        title="Event feedback",
        description="A few quick questions — it helps us make the next one even better.",
        is_published=False,
        gate_recap=False,
        collect_identity=True,
        questions=[FormQuestion(**q) for q in DEFAULT_QUESTIONS],
    )


# --- (de)serialisation helpers ---------------------------------------------------
def _pack_options(q: FormQuestion) -> dict:
    """Builder question → the single `options` JSONB column."""
    return {"choices": q.options, "scale": q.scale}


def _unpack_question(row: dict) -> FormQuestion:
    raw = row.get("options")
    if isinstance(raw, dict):
        choices = [str(c) for c in raw.get("choices", [])]
        scale = int(raw.get("scale", 5) or 5)
    elif isinstance(raw, list):  # tolerate a bare choices array
        choices, scale = [str(c) for c in raw], 5
    else:
        choices, scale = [], 5
    return FormQuestion(
        id=row["id"],
        type=row["type"],
        label=row["label"],
        help_text=row.get("help_text"),
        required=bool(row.get("required")),
        options=choices,
        scale=scale,
    )


def _get_form_row(db: Client, event_id: str) -> dict | None:
    rows = (
        db.table("feedback_forms").select("*").eq("event_id", event_id).limit(1).execute().data or []
    )
    return rows[0] if rows else None


def _ordered_questions(db: Client, form_id: str) -> list[dict]:
    rows = (
        db.table("feedback_questions").select("*").eq("form_id", form_id).execute().data or []
    )
    return sorted(rows, key=lambda r: r.get("position", 0))


def _count_submissions(db: Client, form_id: str) -> int:
    rows = (
        db.table("feedback_submissions").select("id").eq("form_id", form_id).execute().data or []
    )
    return len(rows)


def _form_response(db: Client, event_id: str, form_row: dict) -> FormConfigResponse:
    questions = [_unpack_question(r) for r in _ordered_questions(db, form_row["id"])]
    return FormConfigResponse(
        id=form_row["id"],
        event_id=event_id,
        title=form_row.get("title") or "Event feedback",
        description=form_row.get("description"),
        is_published=bool(form_row.get("is_published")),
        gate_recap=bool(form_row.get("gate_recap")),
        collect_identity=bool(form_row.get("collect_identity", True)),
        questions=questions,
        response_count=_count_submissions(db, form_row["id"]),
    )


# ================================ Organizer =====================================
@router.get("", response_model=FormConfigResponse)
def get_form(
    event_id: str,
    ctx: AdminContext = Depends(_admin_ctx),
    db: Client = Depends(get_supabase),
):
    """Owner-only. Returns the saved form, or an editable default scaffold (no id,
    unpublished) when none exists yet so the builder is never blank."""
    event = fetch_event_or_404(db, event_id)
    require_event_admin(event, ctx)
    form = _get_form_row(db, event_id)
    if not form:
        return _default_form(event_id)
    return _form_response(db, event_id, form)


@router.put("", response_model=FormConfigResponse)
def save_form(
    event_id: str,
    body: FormConfigUpdate,
    ctx: AdminContext = Depends(_admin_ctx),
    db: Client = Depends(get_supabase),
):
    """Owner-only whole-form upsert: persists title/description/gating and REPLACES
    the question set (positions follow the submitted order). Does not change the
    published flag — that's an explicit separate action."""
    event = fetch_event_or_404(db, event_id)
    require_event_admin(event, ctx)

    for q in body.questions:
        if q.type in CHOICE_TYPES and len(q.options) < 2:
            raise HTTPException(status_code=400, detail=f"“{q.label}” needs at least two options.")

    existing = _get_form_row(db, event_id)
    fields = {
        "title": body.title,
        "description": body.description,
        "gate_recap": body.gate_recap,
        "collect_identity": body.collect_identity,
    }
    if existing:
        form_id = existing["id"]
        db.table("feedback_forms").update(fields).eq("id", form_id).execute()
    else:
        created = db.table("feedback_forms").insert({"event_id": event_id, **fields}).execute()
        form_id = created.data[0]["id"]

    # Reconcile questions by id INSTEAD of delete-all + reinsert. Re-creating rows
    # would mint new question ids, and feedback_answers.question_id is ON DELETE
    # CASCADE — so a published form with responses would lose every collected
    # answer the moment the organizer saved an edit. Here we update questions that
    # still exist (preserving their id, so answers stay linked), insert genuinely
    # new ones, and delete only the questions the organizer actually removed
    # (cascading just those answers, which is the intended behaviour).
    prior_ids = {str(r["id"]) for r in _ordered_questions(db, form_id)}
    kept_ids: set[str] = set()
    for i, q in enumerate(body.questions):
        payload = {
            "position": i,
            "type": q.type,
            "label": q.label,
            "help_text": q.help_text,
            "required": q.required,
            "options": _pack_options(q),
        }
        qid = str(q.id) if q.id else None
        if qid and qid in prior_ids:
            db.table("feedback_questions").update(payload).eq("id", qid).execute()
            kept_ids.add(qid)
        else:
            db.table("feedback_questions").insert({"form_id": form_id, **payload}).execute()
    for removed in prior_ids - kept_ids:
        db.table("feedback_questions").delete().eq("id", removed).execute()

    record_audit(
        db,
        action="feedback_form.saved",
        entity_type="feedback_form",
        actor_user_id=ctx.user_id,
        event_id=event_id,
        entity_id=str(form_id),
        metadata={"questions": len(body.questions), "gate_recap": body.gate_recap},
    )
    form = _get_form_row(db, event_id)
    return _form_response(db, event_id, form)


@router.post("/publish", response_model=FormConfigResponse)
def set_published(
    event_id: str,
    body: PublishUpdate,
    ctx: AdminContext = Depends(_admin_ctx),
    db: Client = Depends(get_supabase),
):
    """Owner-only. Flip the form live (or back to draft). Publishing requires at
    least one question."""
    event = fetch_event_or_404(db, event_id)
    require_event_admin(event, ctx)
    form = _get_form_row(db, event_id)
    if not form:
        raise HTTPException(status_code=404, detail="Build and save the form before publishing it.")
    if body.is_published and not _ordered_questions(db, form["id"]):
        raise HTTPException(status_code=400, detail="Add at least one question before publishing.")

    db.table("feedback_forms").update({"is_published": body.is_published}).eq("id", form["id"]).execute()
    record_audit(
        db,
        action="feedback_form.published" if body.is_published else "feedback_form.unpublished",
        entity_type="feedback_form",
        actor_user_id=ctx.user_id,
        event_id=event_id,
        entity_id=str(form["id"]),
    )
    return _form_response(db, event_id, _get_form_row(db, event_id))


@router.get("/results", response_model=FormResults)
def get_results(
    event_id: str,
    ctx: AdminContext = Depends(_admin_ctx),
    db: Client = Depends(get_supabase),
):
    """Owner-only aggregated results. Response rate is over CHECKED-IN attendees
    (the realistic denominator — registrants who never came can't respond)."""
    event = fetch_event_or_404(db, event_id)
    require_event_admin(event, ctx)
    form = _get_form_row(db, event_id)
    if not form:
        return FormResults()

    collect_identity = bool(form.get("collect_identity", True))
    questions = _ordered_questions(db, form["id"])
    attendees = db.table("attendees").select("*").eq("event_id", event_id).execute().data or []
    recipients = sum(1 for a in attendees if a.get("status") in ("arrived", "left"))
    profiles = {str(a["id"]): a for a in attendees}

    subs = (
        db.table("feedback_submissions").select("*").eq("form_id", form["id"]).execute().data or []
    )
    sub_ids = [str(s["id"]) for s in subs]
    answers: list[dict] = []
    if sub_ids:
        answers = (
            db.table("feedback_answers").select("*").in_("submission_id", sub_ids).execute().data or []
        )
    by_question: dict[str, list] = {}
    by_submission: dict[str, dict[str, object]] = {}
    for a in answers:
        by_question.setdefault(str(a["question_id"]), []).append(a["value"])
        by_submission.setdefault(str(a["submission_id"]), {})[str(a["question_id"])] = a["value"]

    results: list[QuestionResult] = []
    for q in questions:
        qid = str(q["id"])
        vals = by_question.get(qid, [])
        qm = _unpack_question(q)
        res = QuestionResult(question_id=qid, label=qm.label, type=qm.type, answered=len(vals))
        if qm.type in ("short_text", "long_text"):
            res.text_answers = [str(v) for v in vals if str(v).strip()]
        elif qm.type == "multi_choice":
            for v in vals:
                for choice in v if isinstance(v, list) else [v]:
                    res.option_counts[str(choice)] = res.option_counts.get(str(choice), 0) + 1
        elif qm.type in ("single_choice", "yes_no"):
            for v in vals:
                res.option_counts[str(v)] = res.option_counts.get(str(v), 0) + 1
        elif qm.type in ("rating", "nps"):
            nums = [float(v) for v in vals if isinstance(v, (int, float))]
            if nums:
                res.average = round(sum(nums) / len(nums), 2)
            for v in nums:
                res.option_counts[str(int(v))] = res.option_counts.get(str(int(v)), 0) + 1
        results.append(res)

    # Per-respondent responses (the "Individual" view). Answers follow the form's
    # question order; identity is attached only when collect_identity is on.
    q_order = [str(q["id"]) for q in questions]
    responses: list[IndividualResponse] = []
    for s in subs:
        sid = str(s["id"])
        ans_map = by_submission.get(sid, {})
        ordered = [
            ResponseAnswer(question_id=qid, value=ans_map[qid]) for qid in q_order if qid in ans_map
        ]
        profile = profiles.get(str(s.get("attendee_id"))) if collect_identity else None
        responses.append(
            IndividualResponse(
                submission_id=sid,
                respondent_name=(profile or {}).get("name") if profile else None,
                respondent_company=(profile or {}).get("company") if profile else None,
                respondent_avatar_url=(profile or {}).get("avatar_url") if profile else None,
                submitted_at=s.get("created_at"),
                answers=ordered,
            )
        )
    # Newest first when timestamps exist, else keep insertion order.
    responses.sort(key=lambda r: r.submitted_at or "", reverse=True)

    response_count = len(sub_ids)
    return FormResults(
        form_id=form["id"],
        title=form.get("title") or "Event feedback",
        is_published=bool(form.get("is_published")),
        gate_recap=bool(form.get("gate_recap")),
        collect_identity=collect_identity,
        total_recipients=recipients,
        response_count=response_count,
        response_rate=round(response_count / recipients * 100) if recipients else 0,
        questions=results,
        responses=responses,
    )


# ================================ Attendee ======================================
def _my_attendee_or_404(db: Client, event_id: str, user: AuthUser) -> dict:
    fetch_event_or_404(db, event_id)
    me = fetch_my_attendee(db, event_id, user.id)
    if me is None:
        raise HTTPException(status_code=404, detail="Not registered for this event")
    return me


@router.get("/fill", response_model=AttendeeFormResponse)
def get_fillable_form(
    event_id: str,
    user: AuthUser = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    """The published form for an attendee to fill, plus whether they've already
    submitted and whether their recap is gated behind it. Unpublished / missing
    form → `available: false` (the recap just shows normally)."""
    me = _my_attendee_or_404(db, event_id, user)
    form = _get_form_row(db, event_id)
    if not form or not form.get("is_published"):
        return AttendeeFormResponse(available=False)

    submitted = bool(
        db.table("feedback_submissions")
        .select("id")
        .eq("form_id", form["id"])
        .eq("attendee_id", str(me["id"]))
        .limit(1)
        .execute()
        .data
    )
    questions = [_unpack_question(r) for r in _ordered_questions(db, form["id"])]
    return AttendeeFormResponse(
        available=True,
        submitted=submitted,
        gate_recap=bool(form.get("gate_recap")),
        collect_identity=bool(form.get("collect_identity", True)),
        title=form.get("title") or "Event feedback",
        description=form.get("description"),
        questions=questions,
    )


def _validate_answer(q: FormQuestion, value) -> object:
    """Coerce/validate one answer against its question; returns the value to store.
    Returns None for an empty (unanswered) optional question."""
    empty = value is None or (isinstance(value, str) and not value.strip()) or (isinstance(value, list) and not value)
    if empty:
        if q.required:
            raise HTTPException(status_code=400, detail=f"“{q.label}” is required.")
        return None

    if q.type in ("short_text", "long_text"):
        return str(value).strip()[:2000]
    if q.type == "yes_no":
        s = str(value).strip().capitalize()
        if s not in ("Yes", "No"):
            raise HTTPException(status_code=400, detail=f"“{q.label}” must be Yes or No.")
        return s
    if q.type == "single_choice":
        if str(value) not in q.options:
            raise HTTPException(status_code=400, detail=f"Invalid choice for “{q.label}”.")
        return str(value)
    if q.type == "multi_choice":
        items = value if isinstance(value, list) else [value]
        cleaned = [str(v) for v in items]
        if any(v not in q.options for v in cleaned):
            raise HTTPException(status_code=400, detail=f"Invalid choice for “{q.label}”.")
        return cleaned
    if q.type == "rating":
        try:
            n = int(value)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail=f"“{q.label}” must be a number.")
        if not (1 <= n <= q.scale):
            raise HTTPException(status_code=400, detail=f"“{q.label}” must be between 1 and {q.scale}.")
        return n
    if q.type == "nps":
        try:
            n = int(value)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail=f"“{q.label}” must be a number.")
        if not (0 <= n <= 10):
            raise HTTPException(status_code=400, detail=f"“{q.label}” must be between 0 and 10.")
        return n
    raise HTTPException(status_code=400, detail="Unsupported question type.")


@router.post("/submit", response_model=AttendeeFormResponse)
def submit_form(
    event_id: str,
    body: FormSubmission,
    user: AuthUser = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    """Submit (or resubmit) answers. Validates required + types against the live
    form, then replaces any prior submission for this attendee."""
    me = _my_attendee_or_404(db, event_id, user)
    form = _get_form_row(db, event_id)
    if not form or not form.get("is_published"):
        raise HTTPException(status_code=404, detail="No feedback form is open for this event.")

    questions = [_unpack_question(r) for r in _ordered_questions(db, form["id"])]
    answered = {str(a.question_id): a.value for a in body.answers}

    to_store: list[tuple[str, object]] = []
    for q in questions:
        stored = _validate_answer(q, answered.get(str(q.id)))
        if stored is not None:
            to_store.append((str(q.id), stored))

    # Replace any prior submission (cascade clears its answers).
    prior = (
        db.table("feedback_submissions")
        .select("id")
        .eq("form_id", form["id"])
        .eq("attendee_id", str(me["id"]))
        .limit(1)
        .execute()
        .data
    )
    if prior:
        db.table("feedback_submissions").delete().eq("id", prior[0]["id"]).execute()

    sub = (
        db.table("feedback_submissions")
        .insert({"form_id": form["id"], "event_id": event_id, "attendee_id": str(me["id"])})
        .execute()
    )
    submission_id = sub.data[0]["id"]
    for qid, value in to_store:
        db.table("feedback_answers").insert(
            {"submission_id": submission_id, "question_id": qid, "value": value}
        ).execute()

    record_audit(
        db,
        action="feedback_form.submitted",
        entity_type="feedback_submission",
        actor_user_id=user.id,
        event_id=event_id,
        entity_id=str(submission_id),
        metadata={"answers": len(to_store)},  # count only — never the answer content
    )
    return AttendeeFormResponse(
        available=True,
        submitted=True,
        gate_recap=bool(form.get("gate_recap")),
        collect_identity=bool(form.get("collect_identity", True)),
        title=form.get("title") or "Event feedback",
        description=form.get("description"),
        questions=questions,
    )
