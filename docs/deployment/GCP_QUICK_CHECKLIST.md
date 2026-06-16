# GCP Deployment Quick Checklist

Follow these steps in order to deploy to Cloud Run.

## Pre-Deployment (One-time Setup)

### 1. Install Tools
- [ ] Download & install [gcloud CLI](https://cloud.google.com/sdk/docs/install)
- [ ] Have Docker installed and running locally
- [ ] Have git configured

### 2. Authenticate with GCP
```bash
gcloud auth login
gcloud config set project peopld-dev
```
- [ ] Verify: `gcloud config list` shows `project = peopld-dev`

### 3. Enable APIs (GCP Console or gcloud)

**In GCP Console** (https://console.cloud.google.com):
1. Go to APIs & Services → Enable APIs
2. Search and enable:
   - [ ] **Cloud Run API**
   - [ ] **Artifact Registry API**
   - [ ] **Cloud Build API**

Or via command line:
```bash
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com
```
- [ ] All three enabled

### 4. Create Artifact Registry Repository
```bash
gcloud artifacts repositories create peopld-backend \
  --repository-format=docker \
  --location=us-east5
```
- [ ] Repository created (`peopld-backend`)

### 5. Create Service Account
```bash
gcloud iam service-accounts create peopld-backend-sa \
  --display-name="Peopld Backend Service Account"

gcloud projects add-iam-policy-binding peopld-dev \
  --member=serviceAccount:peopld-backend-sa@peopld-dev.iam.gserviceaccount.com \
  --role=roles/run.invoker

gcloud projects add-iam-policy-binding peopld-dev \
  --member=serviceAccount:peopld-backend-sa@peopld-dev.iam.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor
```
- [ ] Service account created (`peopld-backend-sa`)

### 6. Create Secrets in Secret Manager

**In GCP Console** (https://console.cloud.google.com/security/secret-manager):
1. Click **Create Secret** for each:

| Secret Name | Value |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL (from https://app.supabase.com) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (from Supabase → Settings → API Keys) |
| `ANTHROPIC_API_KEY` | Your Anthropic API key (or skip if using Vertex AI) |

- [ ] `SUPABASE_URL` created
- [ ] `SUPABASE_SERVICE_ROLE_KEY` created
- [ ] `ANTHROPIC_API_KEY` created (or skip)

**Verify:** `gcloud secrets list` shows all three

---

## First-Time Deployment

### 7. Build and Push Docker Image

From the repo root:
```bash
# Set variables
$PROJECT_ID = "peopld-dev"
$REGION = "us-east5"
$REPO = "peopld-backend"
$IMAGE_TAG = "latest"

# Configure Docker auth (one-time)
gcloud auth configure-docker us-east5-docker.pkg.dev

# Build
docker build -t us-east5-docker.pkg.dev/peopld-dev/peopld-backend/peopld-backend:latest ./backend

# Push
docker push us-east5-docker.pkg.dev/peopld-dev/peopld-backend/peopld-backend:latest
```
- [ ] Image successfully pushed (verify: `docker push` shows digest)

### 8. Deploy to Cloud Run

```bash
gcloud run deploy peopld-backend \
  --image us-east5-docker.pkg.dev/peopld-dev/peopld-backend/peopld-backend:latest \
  --region us-east5 \
  --service-account peopld-backend-sa@peopld-dev.iam.gserviceaccount.com \
  --set-env-vars "LOG_FORMAT=json" \
  --set-secrets "SUPABASE_URL=SUPABASE_URL:latest" \
  --set-secrets "SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest" \
  --set-secrets "ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest" \
  --memory=512Mi \
  --cpu=1 \
  --timeout=300 \
  --max-instances=10 \
  --min-instances=1 \
  --allow-unauthenticated
```
- [ ] Deployment successful (check GCP Console or CLI output)

### 9. Get Service URL

```bash
gcloud run services describe peopld-backend --region us-east5 --format='value(status.url)'
```

Copy the URL, e.g., `https://peopld-backend-abc123.run.app`

- [ ] URL obtained

### 10. Test the Service

```bash
# Replace with your actual URL
curl https://peopld-backend-abc123.run.app/health
```
Should return: `{"status":"ok"}`

- [ ] Health check passes

### 11. Update Frontend

Edit **`frontend/.env.local`**:
```
NEXT_PUBLIC_API_URL=https://peopld-backend-abc123.run.app
```

Replace `abc123` with your actual service URL from step 9.

- [ ] Frontend `.env.local` updated

---

## Subsequent Deployments (After Code Changes)

### Quick Deploy Script
```bash
# From repo root
bash scripts/deploy-to-gcp.sh
```

Or manually:
```bash
docker build -t us-east5-docker.pkg.dev/peopld-dev/peopld-backend/peopld-backend:latest ./backend
docker push us-east5-docker.pkg.dev/peopld-dev/peopld-backend/peopld-backend:latest

gcloud run deploy peopld-backend \
  --image us-east5-docker.pkg.dev/peopld-dev/peopld-backend/peopld-backend:latest \
  --region us-east5
```

---

## Monitoring

### View Logs
```bash
gcloud run services logs read peopld-backend --region us-east5 --limit 50
```

### Check Status
```bash
gcloud run services describe peopld-backend --region us-east5
```

### Monitor Cost
- Go to https://console.cloud.google.com/billing
- Set budget alert at $100/month to stay safe
- With `--min-instances=1`, expect ~$30–50/month

---

## Troubleshooting

| Problem | Solution |
|---|---|
| **Docker push fails** | Run `gcloud auth configure-docker us-east5-docker.pkg.dev` again |
| **Cloud Run deployment fails** | Check `gcloud run services describe peopld-backend --region us-east5` for error message |
| **"Permission denied" on secrets** | Verify service account has `roles/secretmanager.secretAccessor` role |
| **Cold start issues** | Already configured with `--min-instances=1` |
| **API returns 500** | Check logs: `gcloud run services logs read peopld-backend --region us-east5` |

---

## Rollback

If deployment fails or you need to revert:
```bash
# Redeploy previous working image
gcloud run deploy peopld-backend \
  --image us-east5-docker.pkg.dev/peopld-dev/peopld-backend/peopld-backend:old-tag \
  --region us-east5
```

Or revert code and redeploy.

---

## Cost Breakdown (Estimates)

| Component | Monthly Cost |
|---|---|
| Cloud Run (1 vCPU, 512 MB, min 1 instance) | $35 |
| Artifact Registry (storage, ~1 GB) | <$1 |
| Secret Manager (4 secrets) | <$1 |
| **Total** | ~$36/month |

With $500 budget, you have **13+ months of runway**. Safe!
