# Backend Deployment - Diagnostic & Fix

## Current Issue
Backend is deployed to Cloud Run but failing with:
```
httpcore.ConnectError: [Errno -2] Name or service not known
```

Occurring when trying to query Supabase from `GET /events`.

## What We Know
- ✅ Supabase project is **NOT paused** (you use it daily)
- ✅ Cloud Run service is running
- ✅ Secrets are created in GCP Secret Manager
- ✅ Environment variables appear to be mounted correctly
- ❌ Connection to Supabase is failing

---

## Let's Diagnose

### Step 1: Verify Secret Values Match

**Local .env file:**
```
SUPABASE_URL=https://vddcyllyjmvaatgvodhj.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_rxXqotFHCtUONZJG2pJK8Q_0JLtnYmR
```

**Run this to check GCP secrets:**
```powershell
gcloud secrets versions access latest --secret="SUPABASE_URL"
gcloud secrets versions access latest --secret="SUPABASE_SERVICE_ROLE_KEY"
```

**They should match exactly.** If not, that's the issue.

---

### Step 2: Check if Service Account Can Access Secrets

```powershell
# List the service account's IAM bindings
gcloud projects get-iam-policy peopld-dev --flatten="bindings[].members" --filter="bindings.members:peopld-backend-sa"

# Should show:
# - roles/secretmanager.secretAccessor
# - roles/logging.logWriter  
# - roles/run.invoker
```

---

### Step 3: Verify Cloud Run Has Network Access

Check if there's a VPC or firewall restricting outbound traffic:

```powershell
gcloud run services describe peopld-backend --region us-east5 --format="value(spec.template.spec.serviceAccountName)"

# Then check the service account's roles:
gcloud iam service-accounts get-iam-policy peopld-backend-sa@peopld-dev.iam.gserviceaccount.com
```

---

### Step 4: Test Backend Health

Check if the backend is even starting up correctly:

```powershell
# Get recent logs
gcloud run services logs read peopld-backend --region us-east5 --limit=100 --follow

# Look for:
# - Application startup message (should appear when service starts)
# - Any import errors
# - Config loading errors
```

---

## Possible Root Causes & Fixes

### Issue 1: Secrets Don't Match

**Symptom:** Supabase URL in secret is different from what's in .env

**Fix:**
```powershell
# Update the secret with the correct value
echo "https://vddcyllyjmvaatgvodhj.supabase.co" | gcloud secrets versions add SUPABASE_URL --data-file=-
echo "sb_secret_rxXqotFHCtUONZJG2pJK8Q_0JLtnYmR" | gcloud secrets versions add SUPABASE_SERVICE_ROLE_KEY --data-file=-

# Redeploy Cloud Run to pick up new secret versions
gcloud run deploy peopld-backend `
  --image us-east5-docker.pkg.dev/peopld-dev/peopld-backend/peopld-backend:latest `
  --region us-east5 `
  --set-secrets "SUPABASE_URL=SUPABASE_URL:latest" `
  --set-secrets "SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest"
```

---

### Issue 2: Service Account Missing Permissions

**Symptom:** Service account can't read secrets

**Fix:**
```powershell
# Grant missing permissions
gcloud projects add-iam-policy-binding peopld-dev `
  --member=serviceAccount:peopld-backend-sa@peopld-dev.iam.gserviceaccount.com `
  --role=roles/secretmanager.secretAccessor

# Restart Cloud Run service
gcloud run services update-traffic peopld-backend --to-latest --region us-east5
```

---

### Issue 3: VPC or Network Issue

**Symptom:** Cloud Run can't reach external URLs

**Check:**
```powershell
# Does the service have a VPC connector?
gcloud run services describe peopld-backend --region us-east5 --format="value(spec.template.spec.vpcAccess)"

# If there's output, that means VPC is configured and may be blocking traffic
# If empty, VPC is not restricting traffic
```

**Fix (if VPC is the issue):**
- Either remove the VPC connector if it's blocking traffic
- Or configure the VPC to allow outbound traffic to external HTTPS endpoints

---

### Issue 4: Wrong Docker Image or Code

**Symptom:** The deployed image doesn't have the latest backend code

**Fix - Rebuild and redeploy:**
```powershell
# From the backend/ directory
cd backend

# Build the Docker image
docker build -t us-east5-docker.pkg.dev/peopld-dev/peopld-backend/peopld-backend:latest .

# Push to GCP
docker push us-east5-docker.pkg.dev/peopld-dev/peopld-backend/peopld-backend:latest

# Redeploy to Cloud Run
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

---

## Quick Test After Each Fix

After making any of the above changes, test with:

```powershell
# Wait 30 seconds for deployment to complete
Start-Sleep -Seconds 30

# Test the endpoint
curl https://peopld-backend-999590420123.us-east5.run.app/events

# Expected: HTTP 200 OK with [] (empty list)
# Actual: Still 500?  Continue to next issue
```

---

## Most Likely Issues (In Order)

1. **Secrets don't match** — You updated .env locally but not in GCP
2. **Image is old** — You didn't rebuild after changing config
3. **VPC is blocking traffic** — Check if VPC connector is enabled
4. **Service account permissions** — Missing `secretmanager.secretAccessor` role

---

## Next Steps

1. Run **Step 1** diagnostic above
2. Compare your local .env with what's in GCP Secrets
3. If they don't match, run the **Issue 1** fix
4. Test with curl
5. If still failing, run **Step 4** and check logs for actual errors

Once the backend is working, deploy frontend and you're done!

---

## If You're Still Stuck

Share the output of these commands (without actual secret values):

```powershell
# Check current secret version
gcloud secrets versions access latest --secret="SUPABASE_URL" | Measure-Object -Line

# Check Cloud Run logs (paste the actual error)
gcloud run services logs read peopld-backend --region us-east5 --limit=50

# Check if VPC is configured
gcloud run services describe peopld-backend --region us-east5 --format="yaml(spec.template.spec)"
```

And I can help pinpoint the exact issue.
