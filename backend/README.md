# Peopld Backend — FastAPI

## Setup

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements-dev.txt
copy .env.example .env          # then fill in your real keys
```

## Run the API

```bash
uvicorn app.main:app --reload
```

Swagger docs: http://localhost:8000/docs

## Run the tests

No Supabase project or network needed — the suite uses an in-memory fake DB.

```bash
pytest
```

## Architecture notes

- **DB access** is injected via `Depends(get_supabase)` (`app/database.py`).
  Tests override it with `tests/fake_supabase.py`. Never import a client directly.
- **Auth** (`app/deps.py`): Supabase JWT via `Authorization: Bearer <token>`,
  verified with `auth.get_user()`. Organizer endpoints additionally require
  `app_metadata.role == "organizer"` — tag the account with
  `python scripts/tag_organizer.py <email>` after creating it in the dashboard.
  Attendee registration links `attendees.user_id` to the JWT identity and
  dedupes (re-registering returns the existing record with 200).
- **Live smoke test** (`scripts/smoke_live.py`): start uvicorn, then run it —
  creates throwaway auth users, signs in for real JWTs, exercises every
  endpoint + permission path against the real Supabase, cleans up after itself.
- **Config** lives in `app/config.py` (pydantic-settings). Every external value —
  Supabase keys, Claude model, frontend URL — is an env var.
- **Not implemented yet (on purpose):**
  - `POST /rounds/start` → Step 4 (rotation algorithm)
  - `POST /icebreaker/:id/refresh` → Step 6 (Claude engine)
