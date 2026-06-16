#!/bin/bash
# Deploy Peopld backend to Google Cloud Run

set -e

# Configuration
PROJECT_ID="peopld-dev"
REGION="us-east5"
REPO="peopld-backend"
IMAGE_NAME="peopld-backend"
IMAGE_TAG="${1:-latest}"
SERVICE_NAME="peopld-backend"
SERVICE_ACCOUNT="peopld-backend-sa@${PROJECT_ID}.iam.gserviceaccount.com"

IMAGE_URL="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${IMAGE_NAME}:${IMAGE_TAG}"

echo "🚀 Deploying Peopld Backend to Cloud Run"
echo "   Project: $PROJECT_ID"
echo "   Region: $REGION"
echo "   Image: $IMAGE_URL"
echo ""

# Step 1: Configure Docker auth
echo "1️⃣  Configuring Docker authentication..."
gcloud auth configure-docker "${REGION}-docker.pkg.dev"

# Step 2: Build Docker image
echo "2️⃣  Building Docker image..."
docker build -t "$IMAGE_URL" ./backend
if [ $? -ne 0 ]; then
  echo "❌ Docker build failed"
  exit 1
fi

# Step 3: Push to Artifact Registry
echo "3️⃣  Pushing image to Artifact Registry..."
docker push "$IMAGE_URL"
if [ $? -ne 0 ]; then
  echo "❌ Docker push failed"
  exit 1
fi

# Step 4: Deploy to Cloud Run
echo "4️⃣  Deploying to Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE_URL" \
  --region "$REGION" \
  --service-account "$SERVICE_ACCOUNT" \
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

if [ $? -ne 0 ]; then
  echo "❌ Cloud Run deployment failed"
  exit 1
fi

# Step 5: Get service URL
echo ""
echo "✅ Deployment successful!"
echo ""
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --format='value(status.url)')
echo "🔗 Service URL: $SERVICE_URL"
echo ""
echo "📝 Next steps:"
echo "   1. Update frontend NEXT_PUBLIC_API_URL=$SERVICE_URL"
echo "   2. Verify health: curl $SERVICE_URL/health"
echo "   3. Check logs: gcloud run services logs read $SERVICE_NAME --region $REGION --limit 50"
