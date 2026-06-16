# Complete Deployment Checklist

Everything you need to deploy Peopld to production.

---

## ✅ FILES PRESENT & READY

### Backend Container
- [x] `backend/Dockerfile` — Builds Python 3.10 image
- [x] `backend/.dockerignore` — Excludes unnecessary files
- [x] `backend/requirements.txt` — Dependencies (FastAPI, Supabase, Anthropic)
- [x] `backend/app/config.py` — Environment-driven configuration
- [x] `backend/.env.example` — **UPDATED** with all required env vars
- [x] `.gcloudignore` — Tells gcloud what to skip during upload

### Backend Code
- [x] `backend/app/main.py` — **FIXED** CORS for dev + production
- [x] `GET /health` endpoint — Health check for Cloud Run
- [x] Structured logging — JSON format for Cloud Logging

### Frontend
- [x] `frontend/package.json` — Build scripts, dependencies
- [x] `frontend/next.config.ts` — No hardcoded URLs ✅
- [x] `frontend/.env.local.example` — Environment template
- [x] `frontend/vercel.json` — **NEW** Vercel deployment config

### Deployment Guides
- [x] `docs/deployment/GCP_CLOUD_RUN_SETUP.md` — Step-by-step 9-step guide
- [x] `docs/deployment/GCP_QUICK_CHECKLIST.md` — Quick reference
- [x] `scripts/deploy-to-gcp.sh` — Automated deployment script
- [x] `DEPLOYMENT_CHANGES.md` — Code changes explained

---

## 📋 DEPLOYMENT SEQUENCE

### Phase 1: GCP Setup (One-time)
```bash
# 1. Install gcloud CLI (Windows/Mac/Linux)
# 2. Authenticate: gcloud auth login
# 3. Set project: gcloud config set project peopld-dev
# 4. Enable APIs (Cloud Run, Artifact Registry, Cloud Build)
# 5. Create service account + IAM roles
# 6. Create secrets in Secret Manager (Supabase + API keys)
# 7. Create Artifact Registry repository
```

**Estimated time:** 15-20 minutes (mostly clicking in console)

**Reference:** `docs/deployment/GCP_QUICK_CHECKLIST.md`

---

### Phase 2: First Deployment
```bash
# 1. Build Docker image locally
docker build -t us-east5-docker.pkg.dev/peopld-dev/peopld-backend/peopld-backend:latest ./backend

# 2. Push to Artifact Registry
docker push us-east5-docker.pkg.dev/peopld-dev/peopld-backend/peopld-backend:latest

# 3. Deploy to Cloud Run
gcloud run deploy peopld-backend \
  --image us-east5-docker.pkg.dev/peopld-dev/peopld-backend/peopld-backend:latest \
  --region us-east5 \
  --service-account peopld-backend-sa@peopld-dev.iam.gserviceaccount.com \
  --set-env-vars "LOG_FORMAT=json" \
  --set-secrets "SUPABASE_URL=SUPABASE_URL:latest" \
  --set-secrets "SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest" \
  --memory=512Mi --cpu=1 --max-instances=10 --min-instances=1

# 4. Get service URL
gcloud run services describe peopld-backend --region us-east5 --format='value(status.url)'

# 5. Deploy frontend to Vercel
cd frontend
vercel --prod --env NEXT_PUBLIC_API_URL=https://peopld-backend-xxxxx.run.app
```

**Estimated time:** 10-15 minutes (building + deployment)

**Or use script:**
```bash
bash scripts/deploy-to-gcp.sh
```

---

### Phase 3: Verify Deployment
```bash
# 1. Test backend health
curl https://peopld-backend-xxxxx.run.app/health

# 2. Test API connectivity
curl -H "Authorization: Bearer DUMMY_TOKEN" \
  https://peopld-backend-xxxxx.run.app/events

# 3. Check logs
gcloud run services logs read peopld-backend --region us-east5 --limit 50

# 4. Test frontend
Open https://your-vercel-domain in browser → should connect to backend
```

---

## 🔐 SECRETS NEEDED IN GCP SECRET MANAGER

Before deploying, create these in Secret Manager:

| Secret | Source | Example |
|---|---|---|
| `SUPABASE_URL` | Supabase project settings | `https://vddcyllyjmvaatgvodhj.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API Keys | `eyJhbGc...` |
| `ANTHROPIC_API_KEY` | Anthropic dashboard (optional) | `sk-...` |

**How to create:**
```bash
gcloud secrets create SUPABASE_URL --data-file=-
echo -n "https://your-url.supabase.co" | gcloud secrets create SUPABASE_URL --data-file=-
```

Or in GCP Console: Security → Secret Manager → Create Secret

---

## 🌍 ENVIRONMENT VARIABLES BY ENVIRONMENT

### Local Development
```env
# backend/.env
SUPABASE_URL=https://your.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
FRONTEND_URL=http://localhost:3000
LOG_FORMAT=text
LLM_PROVIDER=vertex
VERTEX_PROJECT_ID=peopld-dev
```

```env
# frontend/.env.local
NEXT_PUBLIC_SUPABASE_URL=https://your.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_...
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Cloud Run (Production)
```bash
# Via gcloud run deploy --set-env-vars / --set-secrets
LOG_FORMAT=json  # Cloud Logging integrates with JSON
SUPABASE_URL=<from Secret Manager>
SUPABASE_SERVICE_ROLE_KEY=<from Secret Manager>
VERTEX_PROJECT_ID=peopld-dev
LLM_PROVIDER=vertex
```

### Vercel (Frontend Production)
```
NEXT_PUBLIC_SUPABASE_URL = https://your.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = sb_...
NEXT_PUBLIC_API_URL = https://peopld-backend-xxxxx.run.app
```

Set these in **Vercel Project Settings → Environment Variables**

---

## 🚀 SUBSEQUENT DEPLOYMENTS

After the first deployment, to update the backend:

### Option A: Automated Script (recommended)
```bash
# From repo root
bash scripts/deploy-to-gcp.sh [optional-tag]

# Example:
bash scripts/deploy-to-gcp.sh v1.2.0
```

### Option B: Manual
```bash
git pull origin main  # Get latest code
docker build -t us-east5-docker.pkg.dev/peopld-dev/peopld-backend/peopld-backend:latest ./backend
docker push us-east5-docker.pkg.dev/peopld-dev/peopld-backend/peopld-backend:latest
gcloud run deploy peopld-backend --image us-east5-docker.pkg.dev/peopld-dev/peopld-backend/peopld-backend:latest --region us-east5
```

**Time:** ~5-10 minutes (Docker build + push)

---

## 📊 COST ESTIMATES

| Component | Size | Monthly Cost |
|---|---|---|
| Cloud Run (512 MB, 1 vCPU, min 1 instance) | — | ~$35 |
| Artifact Registry (image storage, ~500 MB) | — | <$1 |
| Secret Manager (4 secrets) | — | <$1 |
| Cloud Logging (JSON logs) | — | <$1 |
| **Total** | — | **~$37/month** |

**Budget:** $500 × 12 months = **13+ months of runway** ✅

---

## 🔍 MONITORING & DEBUGGING

### View Real-Time Logs
```bash
gcloud run services logs read peopld-backend --region us-east5 --limit 100 --follow
```

### Check Service Status
```bash
gcloud run services describe peopld-backend --region us-east5
```

### Test API Endpoints
```bash
# Health check
curl https://peopld-backend-xxxxx.run.app/health

# Create event (requires Supabase session)
curl -X POST https://peopld-backend-xxxxx.run.app/events \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Event","date":"2026-07-01",...}'
```

### Troubleshoot CORS Errors
If frontend gets CORS 400:
1. Check frontend origin: Dev tools → Network tab → check request `Origin` header
2. Verify `FRONTEND_URL` env var matches origin
3. Restart Cloud Run service: `gcloud run services update peopld-backend --region us-east5` (requires no args, just a restart)

---

## ✨ PRE-DEPLOYMENT CHECKLIST

Before merging `feat/gcp-deployment` to `main`:

- [ ] Read `GCP_QUICK_CHECKLIST.md` — understand the 9-step setup
- [ ] Have GCP project created (`peopld-dev`) with billing enabled
- [ ] Have gcloud CLI installed locally
- [ ] Have Docker installed and running
- [ ] Have Supabase project credentials ready
- [ ] Reviewed `.env.example` — all vars explained

Before first production deployment:

- [ ] Created GCP service account + IAM roles
- [ ] Created 3+ secrets in Secret Manager
- [ ] Created Artifact Registry repository
- [ ] Built and pushed Docker image successfully
- [ ] Verified `GET /health` returns 200
- [ ] Updated `frontend/.env.local` with Cloud Run URL
- [ ] Tested frontend → backend connection in browser

---

## 🎯 WHAT HAPPENS NEXT (After Deployment)

1. **Merge `feat/gcp-deployment` → `main`** (after verifying all above)
2. **Notify other developers** to rebase their branches on new main
3. **Set up GitHub Actions** (optional) for automated deployments on `main` push
4. **Configure monitoring** (optional) Sentry, DataDog, or Cloud Logging dashboards
5. **Plan scaling** based on event size (adjust `--max-instances` if needed)

---

## 📞 SUPPORT & TROUBLESHOOTING

See `docs/deployment/GCP_CLOUD_RUN_SETUP.md` for detailed troubleshooting.

**Common issues:**
- **400 Bad Request on OPTIONS** → CORS mismatch (fixed in this PR)
- **Docker push fails** → Re-run `gcloud auth configure-docker`
- **Cloud Run deployment fails** → Check service account permissions
- **"Secrets not found"** → Verify secret names match exactly (case-sensitive)
- **Cold start issues** → Already configured with `--min-instances=1`

---

## 🎉 SUCCESS CRITERIA

You're ready when:
1. ✅ `GET https://peopld-backend-xxxxx.run.app/health` → `{"status":"ok"}`
2. ✅ Frontend loads on Vercel
3. ✅ Frontend connects to backend (no CORS errors)
4. ✅ Can sign in as organizer
5. ✅ Can create event
6. ✅ Can join event as attendee
7. ✅ Logs show in Cloud Logging (if JSON format enabled)

---
