# Deployment Readiness Audit

Complete checklist of files and configurations needed for GCP deployment.

---

## 1. Backend Containerization ✅ COMPLETE

| File | Purpose | Status | Notes |
|---|---|---|---|
| `backend/Dockerfile` | Container image definition | ✅ EXISTS | Python 3.10-slim, proper ports |
| `backend/.dockerignore` | Exclude files from build | ✅ EXISTS | Keeps image size down |
| `backend/requirements.txt` | Python dependencies | ✅ EXISTS | FastAPI, Supabase, Anthropic |
| `backend/requirements-dev.txt` | Dev dependencies | ✅ EXISTS | pytest, etc. |
| `.gcloudignore` | Exclude files in GCP uploads | ✅ NEW | Exclude node_modules, .git, etc. |

---

## 2. Backend Environment Configuration ⚠️ NEEDS UPDATE

| File | Purpose | Status | Action |
|---|---|---|---|
| `backend/app/config.py` | Environment variable definitions | ✅ OK | Already uses pydantic BaseSettings |
| `backend/.env.example` | Template for developers | ⚠️ OUTDATED | **NEEDS UPDATE** — missing LLM + logging vars |
| `backend/.env` | Local development (git-ignored) | ✅ OK | Not tracked, per-dev |

### ⚠️ ACTION REQUIRED: Update `backend/.env.example`

**Current (outdated):**
```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
ANTHROPIC_API_KEY=your_anthropic_api_key
ANTHROPIC_MODEL=claude-sonnet-4-6
FRONTEND_URL=http://localhost:3000
```

**Should be (reflecting actual config.py):**
```env
# --- Database ---
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# --- Frontend ---
FRONTEND_URL=http://localhost:3000

# --- Logging ---
LOG_FORMAT=text  # or "json" for Cloud Logging

# --- LLM Provider (choose one) ---
# Option 1: Vertex AI on GCP (recommended for production)
LLM_PROVIDER=vertex
VERTEX_PROJECT_ID=peopld-dev
VERTEX_REGION=us-east5
VERTEX_MODEL=claude-sonnet-4-6

# Option 2: Anthropic API (fallback)
# LLM_PROVIDER=anthropic
# ANTHROPIC_API_KEY=sk-...
# ANTHROPIC_MODEL=claude-sonnet-4-6

# --- Icebreaker Tuning (optional) ---
ICEBREAKER_ENABLED=true
ICEBREAKER_MAX_TOKENS=1024
ICEBREAKER_TEMPERATURE=0.7
ICEBREAKER_TIMEOUT_SECONDS=8.0
```

---

## 3. Backend CORS & Networking ✅ FIXED

| Item | Status | Notes |
|---|---|---|
| CORS config in `main.py` | ✅ FIXED (feat/gcp-deployment) | Allows localhost variants + custom frontend_url |
| Health check endpoint | ✅ EXISTS | `GET /health` returns `{"status":"ok"}` |
| Request logging | ✅ EXISTS | Structured logs, JSON in production |

---

## 4. Frontend Configuration ⚠️ PARTIALLY READY

| File | Purpose | Status | Action |
|---|---|---|---|
| `frontend/package.json` | Dependencies + build scripts | ✅ OK | |
| `frontend/next.config.ts` | Next.js build config | ✅ OK | Check for hardcoded URLs |
| `frontend/.env.local.example` | Dev environment template | ✅ EXISTS | Already has `NEXT_PUBLIC_API_URL` |
| `frontend/.env.local` | Local dev (git-ignored) | ✅ OK | Needs update post-deployment |
| `vercel.json` | Vercel deployment config | ❌ MISSING | Optional but recommended |

### Check `frontend/next.config.ts` for hardcoded URLs:

<function_calls>
<invoke name="Read">
<parameter name="file_path">d:\peopld-repo\peopld\frontend\next.config.ts