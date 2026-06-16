# GCP Setup Plan — What We're Creating & Costs

**Project:** peopld-dev  
**Account:** harshithtunuguntla@gmail.com  
**Region:** us-east5 (closest to India, Claude Sonnet available)  
**Budget:** $500/month (13+ months runway)

---

## 📋 Phase 1: Enable Google Cloud APIs

**What:** Turn on the services your app needs  
**Why:** GCP requires you to explicitly enable each service before using it  
**Cost:** FREE (enabling APIs costs nothing; using them costs money)

### APIs We'll Enable

| API | Service | Cost | Why We Need It |
|-----|---------|------|---|
| Cloud Run API | Serverless container execution | $0.00002400/vCPU-sec | Run FastAPI backend |
| Artifact Registry API | Docker image storage | $0.10/GB/month | Store backend Docker images |
| Cloud Build API | Build Docker images on GCP | FREE tier: 120 min/day | (We'll build locally, but nice to have) |
| Cloud Logging API | Log aggregation | FREE tier: 50 GB/month | Store backend JSON logs |
| Secret Manager API | Secure credential storage | $0.06/secret/month | Store Supabase keys + API keys |

**Total API Cost:** ~$0.50/month (mostly Secret Manager)

### How We'll Do It

```powershell
gcloud services enable run.googleapis.com
gcloud services enable artifactregistry.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable logging.googleapis.com
gcloud services enable secretmanager.googleapis.com
```

**Status:** Takes 1-2 minutes. We'll see "Operation completed successfully."

---

## 🔐 Phase 2: Create Service Account

**What:** A special GCP identity for your backend to use  
**Why:** Cloud Run needs credentials to access secrets and write logs. Service accounts are more secure than using your personal credentials  
**Cost:** FREE (service accounts don't cost money)

### Service Account Details

```
Name: peopld-backend-sa
Display Name: Peopld Backend Service Account
Purpose: Allows Cloud Run to pull secrets from Secret Manager + write to Cloud Logging
```

### How We'll Do It

```powershell
gcloud iam service-accounts create peopld-backend-sa `
  --display-name="Peopld Backend Service Account"
```

**Status:** Takes 10 seconds. Service account will be: `peopld-backend-sa@peopld-dev.iam.gserviceaccount.com`

---

## 🔑 Phase 3: Grant IAM Permissions

**What:** Give the service account permission to access secrets and logs  
**Why:** By default, the service account has no permissions. We explicitly grant only what it needs (principle of least privilege)  
**Cost:** FREE (permissions cost nothing)

### Permissions We'll Grant

| Role | Permissions | Why |
|------|-------------|-----|
| `roles/secretmanager.secretAccessor` | Read secrets from Secret Manager | Backend needs Supabase keys + API keys |
| `roles/logging.logWriter` | Write logs to Cloud Logging | Backend needs to write structured JSON logs |
| `roles/run.invoker` | Can be invoked as a Cloud Run service | Standard Cloud Run permission |

### How We'll Do It

```powershell
# Grant secret access
gcloud projects add-iam-policy-binding peopld-dev `
  --member=serviceAccount:peopld-backend-sa@peopld-dev.iam.gserviceaccount.com `
  --role=roles/secretmanager.secretAccessor

# Grant logging
gcloud projects add-iam-policy-binding peopld-dev `
  --member=serviceAccount:peopld-backend-sa@peopld-dev.iam.gserviceaccount.com `
  --role=roles/logging.logWriter

# Grant Cloud Run invoke
gcloud projects add-iam-policy-binding peopld-dev `
  --member=serviceAccount:peopld-backend-sa@peopld-dev.iam.gserviceaccount.com `
  --role=roles/run.invoker
```

**Status:** Takes 30 seconds per role. You'll see "Updated IAM policy..."

---

## 🔒 Phase 4: Create Secrets in Secret Manager

**What:** Securely store sensitive values (Supabase keys, API keys)  
**Why:** Never put secrets in code, Docker images, or environment files. Secret Manager encrypts them and only gives access to authenticated services  
**Cost:** $0.06 per secret per month × 3 = ~$0.18/month

### Secrets We'll Create

| Secret Name | Value | Source | Why |
|---|---|---|---|
| `SUPABASE_URL` | https://vddcyllyjmvaatgvodhj.supabase.co | Your Supabase project → Settings → API | Backend needs to connect to database |
| `SUPABASE_SERVICE_ROLE_KEY` | eyJ... (long key) | Supabase → Settings → API Keys → Service Role | Backend needs full database access |
| `ANTHROPIC_API_KEY` | sk-... (or leave empty if using Vertex) | Anthropic console (optional) | For icebreaker LLM (can use Vertex instead) |

### How We'll Do It

```powershell
# We'll do this interactively:

# 1. Supabase URL
Write-Host "Enter SUPABASE_URL: "
$url = Read-Host
gcloud secrets create SUPABASE_URL --data-file=- 

# 2. Service Role Key
Write-Host "Enter SUPABASE_SERVICE_ROLE_KEY: "
$key = Read-Host
gcloud secrets create SUPABASE_SERVICE_ROLE_KEY --data-file=-

# 3. Anthropic API Key (optional)
Write-Host "Enter ANTHROPIC_API_KEY (or leave blank for Vertex): "
$api_key = Read-Host
if ($api_key) {
    gcloud secrets create ANTHROPIC_API_KEY --data-file=-
}
```

**Or via GCP Console:** Security → Secret Manager → Create Secret (easier to paste long values)

**Status:** Takes 1 minute. Each secret gets a version (you can rotate later).

**Important:** These secrets never leave GCP. Cloud Run fetches them at runtime.

---

## 📦 Phase 5: Create Artifact Registry Repository

**What:** Docker image storage on GCP (like Docker Hub, but private to your project)  
**Why:** Cloud Run pulls Docker images from here. Keeps your images in the same region as your service  
**Cost:** $0.10/GB/month. At ~300 MB per image × 10 versions = ~$0.30/month

### Repository Details

```
Name: peopld-backend
Location: us-east5 (same as Cloud Run)
Format: Docker
```

### How We'll Do It

```powershell
gcloud artifacts repositories create peopld-backend `
  --repository-format=docker `
  --location=us-east5 `
  --description="Peopld backend images"
```

**Status:** Takes 10 seconds. Repository URL will be: `us-east5-docker.pkg.dev/peopld-dev/peopld-backend`

---

## 🚀 Phase 6: Deploy to Cloud Run

**What:** Create and run your backend service on Google's serverless platform  
**Why:** No servers to manage. Auto-scales from 0 to 10 instances. Pay only for compute time  
**Cost:** ~$35/month (with min-instances=1 to avoid cold starts)

### Cloud Run Configuration

```yaml
Service Name: peopld-backend
Region: us-east5
Image: us-east5-docker.pkg.dev/peopld-dev/peopld-backend/peopld-backend:latest
Memory: 512 MB (sufficient for FastAPI + Supabase)
CPU: 1 vCPU
Min Instances: 1 (prevents cold starts on event day)
Max Instances: 10 (scales up if needed)
Timeout: 300 seconds (5 minutes for long requests)
Service Account: peopld-backend-sa@peopld-dev.iam.gserviceaccount.com
Allow Unauthenticated: Yes (public API)
```

### How We'll Do It

```powershell
# We'll use a single gcloud command with all flags:

gcloud run deploy peopld-backend `
  --image us-east5-docker.pkg.dev/peopld-dev/peopld-backend/peopld-backend:latest `
  --region us-east5 `
  --service-account peopld-backend-sa@peopld-dev.iam.gserviceaccount.com `
  --set-env-vars "LOG_FORMAT=json" `
  --set-secrets "SUPABASE_URL=SUPABASE_URL:latest" `
  --set-secrets "SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest" `
  --set-secrets "ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest" `
  --memory=512Mi `
  --cpu=1 `
  --timeout=300 `
  --max-instances=10 `
  --min-instances=1 `
  --allow-unauthenticated
```

**Status:** Takes 2-3 minutes. Returns: `Service URL: https://peopld-backend-xxxxx.run.app`

---

## 📊 Complete Cost Breakdown

| Service | Monthly Cost | Justification |
|---------|--------------|---|
| **Cloud Run** | $35.00 | 512 MB RAM, 1 vCPU, min-instances=1 |
| **Artifact Registry** | $0.30 | 300 MB storage (10 image versions) |
| **Secret Manager** | $0.18 | 3 secrets × $0.06/month |
| **Cloud Logging** | FREE | Under 50 GB/month free tier |
| **Cloud Build** | FREE | Under 120 min/day free tier |
| **Cloud Run API** | FREE | API calls free |
| **Artifact Registry API** | FREE | API calls free |
| **Secret Manager API** | FREE | API calls free |
| **Supabase** | $0 | You already have it |
| **Anthropic/Vertex** | $0-15 | Depends on icebreaker usage (Vertex cheaper) |
| **---** | **---** | **---** |
| **TOTAL** | **~$35-50/month** | Scales with usage |

**Your Budget:** $500/month = **10+ months of free tier included**

---

## 🔄 Complete Setup Sequence

```
Step 1: Enable APIs ........................... 2 min
Step 2: Create service account ............... 1 min
Step 3: Grant permissions (3 roles) .......... 2 min
Step 4: Create secrets (3 secrets) ........... 3 min
Step 5: Create Artifact Registry ............ 1 min
Step 6: Build Docker image locally .......... 3 min
Step 7: Push Docker image to Artifact Registry  2 min
Step 8: Deploy to Cloud Run ................. 3 min
Step 9: Test + verify ........................ 2 min
---
TOTAL TIME: ~20 minutes
```

---

## ✅ Before We Start

I need from you:

1. **Supabase URL** — Get from https://app.supabase.com → Project Settings → API
   ```
   Example: https://vddcyllyjmvaatgvodhj.supabase.co
   ```

2. **Supabase Service Role Key** — Get from Supabase → Settings → API Keys → Service Role
   ```
   Example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

3. **Anthropic API Key** (optional) — Get from https://console.anthropic.com/account/keys
   ```
   Example: sk-ant-v4-...
   (If you don't have this, we'll use Vertex AI instead)
   ```

Have these ready, and I'll proceed step-by-step.

---

## 🎯 What Happens After Setup

1. ✅ Backend runs on Cloud Run (auto-scaling, no servers to manage)
2. ✅ All secrets are encrypted in Secret Manager
3. ✅ Logs go to Cloud Logging (structured JSON)
4. ✅ Attendees access at: `https://peopld-backend-xxxxx.run.app`
5. ✅ Can monitor, scale, and update without downtime

---

## 🚨 Important Notes

- **Min-instances=1**: With this setting, you're always paying ~$30/month baseline. If you want to save money: `--min-instances=0` (but cold starts ~15s on first request after idle)
- **Secrets are immutable**: Once created, you can't edit them. You must create a new version. `gcloud secrets versions add SECRET_NAME --data-file=-`
- **Image storage**: Docker images are ~300 MB each. If you deploy 10 times, that's ~3 GB = $0.30/month
- **Logs**: JSON logs are automatically sent to Cloud Logging. View with: `gcloud run services logs read peopld-backend --region us-east5`

---

## 📝 Ready?

Reply with:
1. ✅ Approval to proceed
2. Your Supabase URL
3. Your Supabase Service Role Key
4. Anthropic API Key (or "use Vertex" if you don't have it)

Then I'll run all commands and show you each step.
