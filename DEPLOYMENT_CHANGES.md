# Required Changes for GCP Deployment

This file tracks all code changes needed to deploy to GCP and make the app production-ready.

## Status: `feat/gcp-deployment` branch

---

## 1. Backend: CORS Configuration (CRITICAL)

**File:** `backend/app/main.py`

**Issue:** CORS only allows `http://localhost:3000`. In production, frontend will be on Vercel or another domain.

**Change Required:**
```python
# OLD (hardcoded localhost only)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],  # = "http://localhost:3000"
    ...
)

# NEW (flexible for dev + production)
ALLOW_ORIGINS = (
    [settings.frontend_url] if settings.frontend_url not in ["http://localhost:3000", "http://127.0.0.1:3000"]
    else ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:5173"]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOW_ORIGINS,
    ...
)
```

**When:** Development + GCP (with `FRONTEND_URL` env var)

---

## 2. Backend: Environment Variables (CRITICAL)

**File:** `backend/app/config.py`

**Issue:** All config values are hardcoded or have no fallbacks.

**Changes Required:**

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- Database ---
    supabase_url: str  # ✅ Already env-driven
    supabase_service_role_key: str  # ✅ Already env-driven

    # --- Frontend ---
    frontend_url: str = "http://localhost:3000"  # ✅ Already flexible

    # --- Logging ---
    log_format: str = "text"  # ✅ Flexible
    
    # --- LLM Provider (NEW: Vertex or Anthropic) ---
    llm_provider: str = "vertex"  # Currently "vertex" (good)
    vertex_project_id: str = ""  # ✅ Needs GCP project ID
    vertex_region: str = "us-east5"  # ✅ Correct region
    
    anthropic_api_key: str = ""  # ✅ Can come from Secret Manager

settings = Settings()  # ✅ Already works with env vars
```

**Current Status:** ✅ Most already configured. Just ensure:
- `SUPABASE_URL` → from Secret Manager
- `SUPABASE_SERVICE_ROLE_KEY` → from Secret Manager
- `VERTEX_PROJECT_ID` → set to `peopld-dev` in Cloud Run

**Verify:** `gcloud run deploy --set-secrets` passes these to the app.

---

## 3. Frontend: API URL (CRITICAL)

**File:** `frontend/.env.local` (git-ignored, per-environment)

**Issue:** Frontend has hardcoded `http://localhost:8000`.

**Current:**
```env
NEXT_PUBLIC_SUPABASE_URL=https://vddcyllyjmvaatgvodhj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_X9WPPTO7tL9UHhPkxmI3wA_oVIN1f5a
NEXT_PUBLIC_API_URL=http://localhost:8000  # ❌ Hardcoded localhost
```

**After Deployment:**
```env
NEXT_PUBLIC_SUPABASE_URL=https://vddcyllyjmvaatgvodhj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_X9WPPTO7tL9UHhPkxmI3wA_oVIN1f5a
NEXT_PUBLIC_API_URL=https://peopld-backend-xxxxx.run.app  # ✅ Cloud Run URL
```

**Note:** `.env.local` is git-ignored, so:
- Local dev: keep `http://localhost:8000`
- Vercel: set `NEXT_PUBLIC_API_URL` in Vercel project settings
- GCP deployment: set in Vercel or build-time env

---

## 4. Frontend: Build Configuration (MINOR)

**File:** `frontend/next.config.js` (if it exists)

**Check:** Does it have any hardcoded URLs? If yes, make them env-driven.

**Action:** Review + no changes likely needed.

---

## 5. Test CORS in Both Environments

**Local Development:**
```bash
# Terminal 1: Backend on 8000
uvicorn app.main:app --reload --port 8000

# Terminal 2: Frontend on 3000 or 5173
npm run dev

# In browser, open DevTools → Network tab
# Make a request → should see 200 (not 400 Bad Request)
```

**Cloud Run:**
After deployment, test from browser:
```javascript
// Browser console
fetch('https://peopld-backend-xxxxx.run.app/health')
  .then(r => r.json())
  .then(console.log)
  .catch(console.error)
```

Should return `{"status":"ok"}` — no CORS errors.

---

## 6. Deployment Documentation (✅ DONE)

- [x] `docs/deployment/GCP_CLOUD_RUN_SETUP.md` — Detailed setup guide
- [x] `docs/deployment/GCP_QUICK_CHECKLIST.md` — Quick checklist
- [x] `scripts/deploy-to-gcp.sh` — Automated deployment script
- [x] `.gcloudignore` — Exclude unnecessary files

---

## Summary of Changes

| Component | Change | Status |
|-----------|--------|--------|
| Backend CORS | Flexible origins (localhost + Vercel) | ⚠️ TODO |
| Backend config | Env vars for Supabase + LLM | ✅ OK |
| Frontend .env | Point to Cloud Run URL | ℹ️ Manual per-env |
| Deployment docs | Guides + scripts | ✅ Done |

**Critical Path:**
1. ⚠️ Fix CORS in `backend/app/main.py` (prevents 400 errors)
2. ℹ️ Update frontend `.env.local` after Cloud Run deployment (manual)
3. ✅ Deploy using guides + script

---

## Next Steps

1. **Review changes** in this PR
2. **Test locally** (CORS fix + env var behavior)
3. **Deploy to GCP** using checklist
4. **Update frontend** `.env.local` with Cloud Run URL
5. **Merge** `feat/gcp-deployment` → `main`
