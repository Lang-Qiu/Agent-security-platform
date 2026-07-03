#!/usr/bin/env bash
# E2E Demo: Track 1 OpenClaw Campaign
# This script starts the full stack and runs a campaign

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
COMPOSE_FILE="$PROJECT_ROOT/deploy/track1/compose.track1.yml"

cd "$PROJECT_ROOT"

echo "======================================================================"
echo "Track 1 OpenClaw Campaign - End-to-End Demo"
echo "======================================================================"
echo

# Check required environment variables
REQUIRED_VARS=(
  "OPENCLAW_MODEL_BASE_URL"
  "OPENCLAW_MODEL_API_KEY"
  "OPENCLAW_MODEL_ID"
  "TRACK1_INGEST_TOKEN"
)

missing=()
for var in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    missing+=("$var")
  fi
done

if [[ ${#missing[@]} -gt 0 ]]; then
  echo "❌ Missing required environment variables:"
  for var in "${missing[@]}"; do
    echo "   - $var"
  done
  echo
  echo "Please set these variables and try again."
  exit 1
fi

echo "✓ Environment variables validated"
echo

# Step 1: Start infrastructure (backend, frontend, OpenClaw)
echo "Step 1: Starting infrastructure..."
docker-compose -f "$COMPOSE_FILE" --profile track1 up -d backend frontend openclaw

echo "Waiting for services to be ready..."
sleep 10

# Check backend health
echo -n "Checking backend health... "
if curl -sf http://localhost:3001/health > /dev/null 2>&1; then
  echo "✓"
else
  echo "❌"
  echo "Backend health check failed. Check logs:"
  echo "  docker-compose -f $COMPOSE_FILE logs backend"
  exit 1
fi

# Check OpenClaw health
echo -n "Checking OpenClaw health... "
if curl -sf http://localhost:3002/health > /dev/null 2>&1; then
  echo "✓"
else
  echo "❌"
  echo "OpenClaw health check failed. Check logs:"
  echo "  docker-compose -f $COMPOSE_FILE logs openclaw"
  exit 1
fi

echo
echo "✓ Infrastructure is ready"
echo

# Step 2: Run campaign in runner container
echo "Step 2: Running Track 1 campaign..."
echo "======================================================================"
docker-compose -f "$COMPOSE_FILE" --profile track1 run --rm runner

RUNNER_EXIT=$?

echo "======================================================================"
echo

# Step 3: Show results
if [[ $RUNNER_EXIT -eq 0 ]]; then
  echo "✅ Campaign completed successfully!"
  echo
  echo "View results:"
  echo "  - Frontend: http://localhost:3000"
  echo "  - Backend API: http://localhost:3001/api/campaigns"
  echo
  echo "Stop services:"
  echo "  docker-compose -f $COMPOSE_FILE --profile track1 down"
else
  echo "❌ Campaign failed (exit code: $RUNNER_EXIT)"
  echo
  echo "Check logs:"
  echo "  docker-compose -f $COMPOSE_FILE logs runner"
  echo "  docker-compose -f $COMPOSE_FILE logs backend"
  echo "  docker-compose -f $COMPOSE_FILE logs openclaw"
  exit 1
fi
