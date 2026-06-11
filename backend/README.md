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
- **Auth** is a swappable dependency (`app/deps.py`). Currently a dev-only
  `X-Organizer-Id` header; Step 3 replaces the function body with Supabase JWT
  verification — no endpoint changes needed.
- **Config** lives in `app/config.py` (pydantic-settings). Every external value —
  Supabase keys, Claude model, frontend URL — is an env var.
- **Not implemented yet (on purpose):**
  - `POST /rounds/start` → Step 4 (rotation algorithm)
  - `POST /icebreaker/:id/refresh` → Step 6 (Claude engine)
