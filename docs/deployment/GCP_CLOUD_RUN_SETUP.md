# GCP Cloud Run Deployment Guide

> Deploy the Peopld backend to Google Cloud Run with Supabase + Claude API integration.

## Prerequisites

- [ ] GCP project created (`peopld-dev`)
- [ ] Billing account linked ($500 budget)
- [ ] gcloud CLI installed locally ([install](https://cloud.google.com/sdk/docs/install))
- [ ] Docker installed locally
- [ ] Supabase credentials (URL, service role key)
- [ ] Anthropic API key (if not using Vertex AI)

## Step 1: Install & Configure gcloud CLI

### Windows
```powershell
# Download installer from https://cloud.google.com/sdk/docs/install
# Or use Chocolatey:
choco install google-cloud-sdk

# Verify
gcloud --version
```

### macOS/Linux
```bash
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
gcloud --version
```

### Authenticate
```bash
gcloud auth login
gcloud config set project peopld-dev
```

## Step 2: Enable Required APIs

In the **Google Cloud Console** (https://console.cloud.google.com), enable:

1. **Cloud Run API** → Search "Cloud Run" → Enable
2. **Artifact Registry API** → Search "Artifact Registry" → Enable
3. **Cloud Build API** → Search "Cloud Build" → Enable
4. **Cloud Logging API** → Search "Cloud Logging" → Enable (optional, for logs)

Or via gcloud:
```bash
gcloud services enable run.googleapis.com
gcloud services enable artifactregistry.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable logging.googleapis.com
```

## Step 3: Create an Artifact Registry Repository

Store Docker images here (better than Docker Hub for private GCP deployments).

```bash
gcloud artifacts repositories create peopld-backend \
  --repository-format=docker \
  --location=us-east5 \
  --description="Peopld backend images"
```

Verify:
```bash
gcloud artifacts repositories list
```

## Step 4: Create a Service Account

Cloud Run needs a dedicated identity to access secrets and logs.

```bash
# Create service account
gcloud iam service-accounts create peopld-backend-sa \
  --display-name="Peopld Backend Service Account"

# Grant Cloud Run permissions
gcloud projects add-iam-policy-binding peopld-dev \
  --member=serviceAccount:peopld-backend-sa@peopld-dev.iam.gserviceaccount.com \
  --role=roles/run.invoker

# Grant Secret Manager access
gcloud projects add-iam-policy-binding peopld-dev \
  --member=serviceAccount:peopld-backend-sa@peopld-dev.iam.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor
```

## Step 5: Create Secrets in Secret Manager

Store sensitive values (Supabase keys, API keys) in GCP Secret Manager.

### Option A: gcloud CLI
```bash
# Supabase URL
echo -n "https://your-project.supabase.co" | \
  gcloud secrets create SUPABASE_URL --data-file=-

# Supabase Service Role Key
echo -n "your-service-role-key-here" | \
  gcloud secrets create SUPABASE_SERVICE_ROLE_KEY --data-file=-

# Anthropic API Key (if not using Vertex AI)
echo -n "your-api-key-here" | \
  gcloud secrets create ANTHROPIC_API_KEY --data-file=-
```

### Option B: Google Cloud Console
1. Go to **Security → Secret Manager** ([link](https://console.cloud.google.com/security/secret-manager))
2. Click **Create Secret**
3. Name: `SUPABASE_URL` → Next → Paste value → Create
4. Repeat for `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`

Verify:
```bash
gcloud secrets list
```

## Step 6: Build & Push Docker Image

### Build locally and push to Artifact Registry

```bash
# Set variables
$PROJECT_ID = "peopld-dev"
$REGION = "us-east5"
$REPO = "peopld-backend"
$IMAGE_NAME = "peopld-backend"
$IMAGE_TAG = "latest"
$IMAGE_URL = "${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${IMAGE_NAME}:${IMAGE_TAG}"

# Configure Docker auth (one-time)
gcloud auth configure-docker ${REGION}-docker.pkg.dev

# Build and push
docker build -t $IMAGE_URL ./backend
docker push $IMAGE_URL

# Verify
gcloud artifacts docker images list ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}
```

**On Windows (PowerShell):**
```powershell
$PROJECT_ID = "peopld-dev"
$REGION = "us-east5"
$REPO = "peopld-backend"
$IMAGE_NAME = "peopld-backend"
$IMAGE_TAG = "latest"
$IMAGE_URL = "${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${IMAGE_NAME}:${IMAGE_TAG}"

gcloud auth configure-docker "${REGION}-docker.pkg.dev"
docker build -t $IMAGE_URL ./backend
docker push $IMAGE_URL
```

## Step 7: Deploy to Cloud Run

### Deploy with environment variables and secrets

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

**Key flags explained:**
- `--min-instances=1` → Prevent cold starts (uses 1 instance even when idle)
- `--max-instances=10` → Cap at 10 concurrent instances
- `--memory=512Mi` → 512 MB RAM (sufficient for FastAPI)
- `--cpu=1` → 1 CPU core
- `--timeout=300` → 5-minute request timeout
- `--allow-unauthenticated` → API is public (no API key required for attendees)

### After deployment
```bash
# Get the service URL
gcloud run services describe peopld-backend --region us-east5 --format='value(status.url)'

# View logs
gcloud run services logs read peopld-backend --region us-east5 --limit 50
```

## Step 8: Update Frontend Environment Variables

Update the frontend to point to the Cloud Run service:

**`frontend/.env.local`:**
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_API_URL=https://peopld-backend-xxxxx.run.app
```

Replace `https://peopld-backend-xxxxx.run.app` with your actual Cloud Run URL (from Step 7).

## Step 9: Deploy Frontend to Vercel (Optional)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
cd frontend
vercel --prod
```

## Monitoring & Troubleshooting

### Check service status
```bash
gcloud run services list --region us-east5
gcloud run services describe peopld-backend --region us-east5
```

### View recent logs
```bash
gcloud run services logs read peopld-backend --region us-east5 --limit 100 --format json
```

### Debug a failed deployment
```bash
gcloud run services describe peopld-backend --region us-east5
gcloud beta run services describe peopld-backend --region us-east5 --show-managed
```

### Check service account permissions
```bash
gcloud iam service-accounts list --filter="email:peopld-backend-sa*"
gcloud projects get-iam-policy peopld-dev --flatten="bindings[].members" --filter="members:peopld-backend-sa*"
```

## Cost Optimization

Cloud Run with `--min-instances=1` costs ~$30–50/month at $0.00002400 per vCPU-second. To reduce:

- **Reduce min instances** to 0 (allow cold starts): `--min-instances=0`
- **Reduce memory** to 256 MB (but verify app still works): `--memory=256Mi`
- **Reduce max instances** if traffic is predictable

For the pilot, keep `--min-instances=1` to ensure no cold starts during the live event.

## Redeploy After Code Changes

1. **Update code** and push to `main`
2. **Rebuild Docker image** (Step 6)
3. **Redeploy to Cloud Run** (Step 7)

Or use Cloud Build to automate (trigger builds on git push): https://cloud.google.com/build/docs/quickstart-deploy-run

---

## Useful Links

- [Cloud Run Pricing](https://cloud.google.com/run/pricing)
- [Secret Manager Guide](https://cloud.google.com/secret-manager/docs)
- [Cloud Run Troubleshooting](https://cloud.google.com/run/docs/troubleshooting/general-questions)
- [12-factor app environment](https://12factor.net/config) (how we manage config)
