#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────
# InterAI — Automated Google Cloud Run Deployment Script
# ─────────────────────────────────────────────────────────────

# Configuration (override via environment or .env file)
PROJECT_ID="${GCP_PROJECT_ID:-geminiliveagentchallenge}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="${CLOUD_RUN_SERVICE:-interai}"
IMAGE="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"
MEMORY="${CLOUD_RUN_MEMORY:-512Mi}"
TIMEOUT="${CLOUD_RUN_TIMEOUT:-300}"
GCS_BUCKET="${GCS_BUCKET_NAME:-interai-reports}"

# Load .env if present (for GOOGLE_API_KEY)
if [ -f .env ]; then
  export $(grep -v '^#' .env | grep GOOGLE_API_KEY | xargs)
fi

if [ -z "${GOOGLE_API_KEY:-}" ]; then
  echo "ERROR: GOOGLE_API_KEY is not set."
  echo "Set it in .env or export GOOGLE_API_KEY=your-key"
  exit 1
fi

echo "==========================================="
echo " InterAI Cloud Run Deployment"
echo "==========================================="
echo " Project:  ${PROJECT_ID}"
echo " Region:   ${REGION}"
echo " Service:  ${SERVICE_NAME}"
echo " Image:    ${IMAGE}"
echo " Memory:   ${MEMORY}"
echo " Bucket:   ${GCS_BUCKET}"
echo "==========================================="

# Step 1: Set the active project
echo ""
echo "[1/6] Setting GCP project..."
gcloud config set project "${PROJECT_ID}" --quiet

# Step 2: Enable required APIs
echo ""
echo "[2/6] Enabling required APIs..."
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  storage.googleapis.com \
  --quiet

# Step 3: Create GCS bucket if it doesn't exist
echo ""
echo "[3/6] Ensuring GCS bucket exists..."
if gsutil ls "gs://${GCS_BUCKET}" &>/dev/null; then
  echo "  Bucket gs://${GCS_BUCKET} already exists."
else
  echo "  Creating bucket gs://${GCS_BUCKET}..."
  gsutil mb -l "${REGION}" "gs://${GCS_BUCKET}"
fi

# Step 4: Build container with Cloud Build
echo ""
echo "[4/6] Building container image..."
gcloud builds submit --tag "${IMAGE}" --quiet

# Step 5: Deploy to Cloud Run
echo ""
echo "[5/6] Deploying to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE}" \
  --platform managed \
  --region "${REGION}" \
  --allow-unauthenticated \
  --set-env-vars "GOOGLE_API_KEY=${GOOGLE_API_KEY},GCS_ENABLED=true,GCS_BUCKET_NAME=${GCS_BUCKET}" \
  --memory "${MEMORY}" \
  --timeout "${TIMEOUT}" \
  --port 8080 \
  --quiet

# Step 6: Get the service URL
echo ""
echo "[6/6] Deployment complete!"
SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" \
  --region "${REGION}" \
  --format "value(status.url)")

echo ""
echo "==========================================="
echo " InterAI is live!"
echo " URL: ${SERVICE_URL}"
echo "==========================================="
