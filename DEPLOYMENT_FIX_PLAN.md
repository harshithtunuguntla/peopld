# Deployment Fix Plan — Backend + Frontend

**Date:** 2026-06-16  
**Current Status:** Backend deployed but failing (Supabase connection issue); Frontend ready to deploy  
**Estimated Time:** 20-30 minutes (including testing)

---

## 🚨 Critical Issue: Backend Cannot Reach Supabase

### Symptom
- Backend service is running on Cloud Run
- All requests fail with 500 errors
- Error: `httpcore.ConnectError: [Errno -2] Name or service not known`
- Logs show attempts to connect to Supabase failing at DNS/HTTP level

### Root Cause
**Supabase free-tier project is likely PAUSED** due to 7-day inactivity.
- Free tier auto-pauses after 7 days without use
- A paused project won't respond to HTTP requests (hence the "name or service not known" error)
- This is the most common issue in dev→production deployments

---

## ✅ Step 1: Fix the Supabase Connection (IMMEDIATELY)

### 1.1: Check Supabase Project Status

**Go to:** https://app.supabase.com
1. Log in with: `harshithtunuguntla@gmail.com`
2. Select project: **vddcyllyjmvaatgvodhj**
3. Look for a **"Paused"** indicator (usually banner at the top)

### 1.2: Unpause the Project

**If paused:**
1. Click the **"Unpause"** button (or "Resume")
2. Wait 2-3 minutes for the project to come online
3. Refresh the browser

**If not paused:**
1. Check the project Settings → API to confirm:
   - Project URL: `https://vddcyllyjmvaatgvodhj.supabase.co` ← must match
   - Service Role Key: starts with `sb_secret_...` ← must match the secret in GCP

### 1.3: Test the Connection

Once Supabase is active, test the backend:

```bash
# Option 1: Quick health check
curl https://peopld-backend-999590420123.us-east5.run.app/

# Option 2: List events (should return [] not 500)
curl https://peopld-backend-999590420123.us-east5.run.app/events

# Expected response:
# HTTP/1.1 200 OK
# []
```

**Monitor Cloud Run logs in real-time:**

```powershell
gcloud run services logs read peopld-backend --region us-east5 --limit=20 --follow
```

Watch for:
- ✓ `"GET /events HTTP/1.1" 200 OK` = success
- ✗ `ConnectError: Name or service not known` = Supabase still paused

---

## ✅ Step 2: Update Cloud Run with Correct Frontend URL (Once Verified)

**After frontend is deployed to Vercel**, update the Cloud Run service to allow CORS from the production frontend:

```powershell
# Example: replace with your actual Vercel URL
gcloud run services update peopld-backend `
  --region us-east5 `
  --set-env-vars "FRONTEND_URL=https://<your-vercel-url>.vercel.app"
```

For now, keep the dev default (`http://localhost:3001`).

---

## 🚀 Step 3: Deploy Frontend to Vercel

### 3.1: Prerequisites

- Vercel account: https://vercel.com/signup
- GitHub repo linked to Vercel (or deploy via CLI)
- `.env.local` already configured in `frontend/`

### 3.2: Check Frontend Environment

Current `frontend/.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://vddcyllyjmvaatgvodhj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_X9WPPTO7tL9UHhPkxmI3wA_oVIN1f5a
NEXT_PUBLIC_API_URL=https://peopld-backend-999590420123.us-east5.run.app
```

✅ All three variables are set correctly.

### 3.3: Deploy to Vercel (One of 3 Options)

#### **Option A: GitHub Push (Easiest)**

```bash
# Commit & push
git add frontend/.env.local
git commit -m "feat: configure frontend environment for Cloud Run backend"
git push origin main

# Vercel will auto-deploy from GitHub
# (you can set this up in Vercel dashboard if not already)
```

#### **Option B: Vercel CLI**

```bash
npm install -g vercel
cd frontend
vercel deploy --prod
```

#### **Option C: Vercel Dashboard**

1. Go to https://vercel.com/dashboard
2. Import the `peopld` GitHub repo
3. Configure:
   - **Framework:** Next.js
   - **Root directory:** `./frontend`
   - **Build command:** `npm run build`
   - **Output directory:** `.next`
   - **Environment variables:** Add the three from `.env.local`
4. Click **Deploy**

### 3.4: Verify Frontend Deployment

After Vercel shows **Deployment Ready**:

```
https://<project-name>.vercel.app/
```

Test the landing page:
1. Go to the Vercel URL
2. You should see the landing page with event details
3. Click "Join this event" → it should load (may fail if backend is down, which is OK for now)

---

## 📋 Full Deployment Checklist

### Pre-Event (This Week)

- [ ] **Unpause Supabase project** (app.supabase.com)
- [ ] **Test backend:** `curl https://peopld-backend-.../events` → 200 OK
- [ ] **Deploy frontend** to Vercel
- [ ] **Test attendee flow:**
  - [ ] Landing page loads
  - [ ] Can click "Join"
  - [ ] Registration form appears
  - [ ] Google sign-in works (if configured)
  - [ ] Form submits and creates attendee
- [ ] **Test organizer flow:**
  - [ ] `/organizer/login` page loads
  - [ ] Can sign in with organizer email/password
  - [ ] Dashboard shows the created event
  - [ ] Can see attendee in the list

### Day Before Event

- [ ] **Backup Supabase** (Settings → Backups → Manual backup)
- [ ] **Monitor Cloud Run** logs for errors
- [ ] **Test real-time updates** (Supabase WebSockets)
- [ ] **Run load test** with ~40 simulated attendees

### Event Day

- [ ] **Cloud Run min-instances=1** is active (should be, already set)
- [ ] **Supabase is NOT paused** (critical!)
- [ ] **Frontend is accessible** from venue WiFi
- [ ] **Monitor logs during event** in real-time

---

## 🔧 Troubleshooting

### Backend Still Shows 500 Errors

**Immediate steps:**

```powershell
# 1. Check latest logs
gcloud run services logs read peopld-backend --region us-east5 --limit=50

# 2. Verify secrets are correctly mounted
gcloud run services describe peopld-backend --region us-east5 --format=yaml > service.yaml
# Look for spec.template.spec.containers[0].env

# 3. Verify Supabase is actually unpaused
# Go to https://app.supabase.com and check the project status

# 4. Verify the URL in the secret matches
gcloud secrets versions access latest --secret="SUPABASE_URL"
# Should be: https://vddcyllyjmvaatgvodhj.supabase.co

# 5. If URL is wrong, update it
echo "https://vddcyllyjmvaatgvodhj.supabase.co" | gcloud secrets versions add SUPABASE_URL --data-file=-
# Then redeploy Cloud Run with the new secret version
```

### Frontend Can't Connect to Backend

**Check:**

```bash
# 1. Backend is actually responding
curl https://peopld-backend-999590420123.us-east5.run.app/

# 2. CORS is configured correctly
# Backend logs should show CORS headers if enabled

# 3. Check frontend network tab for errors
# Browser DevTools → Network → see the actual error response
```

### Supabase WebSockets Not Working (Realtime)

**Check:**

```bash
# Supabase has a built-in test for Realtime
# Go to: https://app.supabase.com → SQL Editor → "Realtime" tab
# (or use the Supabase dashboard)
```

---

## 📊 Services & URLs

### Production (Cloud Run + Supabase)

| Service | URL | Status |
|---------|-----|--------|
| Backend API | `https://peopld-backend-999590420123.us-east5.run.app` | ✅ Running (waiting for Supabase) |
| Frontend | TBD (Vercel) | ⏳ Ready to deploy |
| Database | `https://vddcyllyjmvaatgvodhj.supabase.co` | ❌ Paused → needs unpause |

### Local Dev (for reference)

| Service | URL |
|---------|-----|
| Backend | `http://localhost:8000` |
| Frontend | `http://localhost:3000` or `http://localhost:3001` |

---

## 💰 Cost Recap

| Service | Cost | Notes |
|---------|------|-------|
| Cloud Run | ~$30/month | 512MB, 1 vCPU, min=1 |
| Artifact Registry | ~$0.30/month | Docker images |
| Secret Manager | ~$0.18/month | 3 secrets |
| Supabase (free tier) | FREE | Must unpause weekly |
| Vercel (next.js) | FREE or $20/mo | Free tier sufficient for 40 attendees |
| **TOTAL** | ~**$50/month** | Well under $500 budget |

---

## 🎯 Success Criteria

After completing all steps, you should see:

1. ✅ Backend responding to API calls (200 OK)
2. ✅ Frontend accessible from Vercel URL
3. ✅ Attendee can register via landing page
4. ✅ Organizer can log in and see dashboard
5. ✅ Realtime updates work (Supabase WebSockets)
6. ✅ Cloud Run logs show no errors

---

## 📞 Next Steps

1. **Immediately:** Unpause Supabase project
2. **Within 5 minutes:** Verify backend with `curl` command
3. **Within 15 minutes:** Deploy frontend to Vercel
4. **Within 30 minutes:** Test the full attendee + organizer flows
5. **Share:** The Vercel URL with stakeholders

---

## 📝 Log Files to Watch

### Cloud Run Logs

```powershell
gcloud run services logs read peopld-backend --region us-east5 --follow
```

Look for:
- ✓ `"GET /events HTTP/1.1" 200 OK` = database is accessible
- ✓ `"POST /attendees HTTP/1.1" 201 Created` = registration works
- ✗ `ConnectError` = Supabase unreachable (paused)

### Frontend (Vercel)

- Vercel dashboard: Deployments → check build logs
- Browser Console: `F12` → Console tab → look for network errors
- Browser Network: See actual API requests to backend

---

**Questions?** Check `GETTING_STARTED.md` for local dev setup, or `PRODUCT.md` for project context.
