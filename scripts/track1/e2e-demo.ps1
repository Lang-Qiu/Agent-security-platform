# E2E Demo: Track 1 OpenClaw Campaign
# This script starts the full stack and runs a campaign

$ErrorActionPreference = "Stop"

$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$PROJECT_ROOT = Split-Path -Parent (Split-Path -Parent $SCRIPT_DIR)
$COMPOSE_FILE = Join-Path $PROJECT_ROOT "deploy\track1\compose.track1.yml"

Set-Location $PROJECT_ROOT

Write-Host "======================================================================"
Write-Host "Track 1 OpenClaw Campaign - End-to-End Demo"
Write-Host "======================================================================"
Write-Host ""

# Check required environment variables
$REQUIRED_VARS = @(
  "OPENCLAW_MODEL_BASE_URL",
  "OPENCLAW_MODEL_API_KEY",
  "OPENCLAW_MODEL_ID",
  "TRACK1_INGEST_TOKEN"
)

$missing = @()
foreach ($var in $REQUIRED_VARS) {
  if (-not (Test-Path "Env:$var")) {
    $missing += $var
  }
}

if ($missing.Count -gt 0) {
  Write-Host "❌ Missing required environment variables:" -ForegroundColor Red
  foreach ($var in $missing) {
    Write-Host "   - $var"
  }
  Write-Host ""
  Write-Host "Please set these variables and try again."
  exit 1
}

Write-Host "✓ Environment variables validated"
Write-Host ""

# Step 1: Start infrastructure
Write-Host "Step 1: Starting infrastructure..."
docker-compose -f $COMPOSE_FILE --profile track1 up -d backend frontend openclaw

Write-Host "Waiting for services to be ready..."
Start-Sleep -Seconds 10

# Check backend health
Write-Host -NoNewline "Checking backend health... "
try {
  $response = Invoke-WebRequest -Uri "http://localhost:3001/health" -UseBasicParsing -TimeoutSec 5
  if ($response.StatusCode -eq 200) {
    Write-Host "✓" -ForegroundColor Green
  } else {
    throw "Unexpected status: $($response.StatusCode)"
  }
} catch {
  Write-Host "❌" -ForegroundColor Red
  Write-Host "Backend health check failed. Check logs:"
  Write-Host "  docker-compose -f $COMPOSE_FILE logs backend"
  exit 1
}

# Check OpenClaw health
Write-Host -NoNewline "Checking OpenClaw health... "
try {
  $response = Invoke-WebRequest -Uri "http://localhost:3002/health" -UseBasicParsing -TimeoutSec 5
  if ($response.StatusCode -eq 200) {
    Write-Host "✓" -ForegroundColor Green
  } else {
    throw "Unexpected status: $($response.StatusCode)"
  }
} catch {
  Write-Host "❌" -ForegroundColor Red
  Write-Host "OpenClaw health check failed. Check logs:"
  Write-Host "  docker-compose -f $COMPOSE_FILE logs openclaw"
  exit 1
}

Write-Host ""
Write-Host "✓ Infrastructure is ready"
Write-Host ""

# Step 2: Run campaign
Write-Host "Step 2: Running Track 1 campaign..."
Write-Host "======================================================================"
docker-compose -f $COMPOSE_FILE --profile track1 run --rm runner
$RUNNER_EXIT = $LASTEXITCODE

Write-Host "======================================================================"
Write-Host ""

# Step 3: Show results
if ($RUNNER_EXIT -eq 0) {
  Write-Host "✅ Campaign completed successfully!" -ForegroundColor Green
  Write-Host ""
  Write-Host "View results:"
  Write-Host "  - Frontend: http://localhost:3000"
  Write-Host "  - Backend API: http://localhost:3001/api/campaigns"
  Write-Host ""
  Write-Host "Stop services:"
  Write-Host "  docker-compose -f $COMPOSE_FILE --profile track1 down"
} else {
  Write-Host "❌ Campaign failed (exit code: $RUNNER_EXIT)" -ForegroundColor Red
  Write-Host ""
  Write-Host "Check logs:"
  Write-Host "  docker-compose -f $COMPOSE_FILE logs runner"
  Write-Host "  docker-compose -f $COMPOSE_FILE logs backend"
  Write-Host "  docker-compose -f $COMPOSE_FILE logs openclaw"
  exit 1
}
