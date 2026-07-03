#!/bin/bash
# Integration test script for Track 1 Phase 4 runtime fixes
# Tests P0-P1 fixes without requiring Docker

set -euo pipefail

echo "=== Track 1 Phase 4 Integration Test ==="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

FAILED=0

# Test 1: Syntax validation
echo "Test 1: Syntax validation..."
if node --experimental-strip-types --check scripts/track1/campaign-runner-ports.ts 2>&1 && \
   node --experimental-strip-types --check integrations/openclaw/src/campaign-context.ts 2>&1 && \
   node --experimental-strip-types --check scripts/track1/run-openclaw-campaign.ts 2>&1; then
    echo -e "${GREEN}✓${NC} All TypeScript files pass syntax check"
else
    echo -e "${RED}✗${NC} Syntax check failed"
    FAILED=$((FAILED + 1))
fi
echo ""

# Test 2: Production ports unit tests
echo "Test 2: Production ports unit tests..."
if npx vitest run tests/track1/campaign-runner-ports.spec.ts --reporter=basic 2>&1 | grep -q "11 passed"; then
    echo -e "${GREEN}✓${NC} All 11 production ports tests passed"
else
    echo -e "${RED}✗${NC} Production ports tests failed"
    FAILED=$((FAILED + 1))
fi
echo ""

# Test 3: Campaign runner tests
echo "Test 3: Campaign runner logic tests..."
if node --experimental-strip-types --test tests/track1/openclaw-campaign-runner.spec.ts 2>&1 | grep -q "# pass 14"; then
    echo -e "${GREEN}✓${NC} All 14 campaign runner tests passed"
else
    echo -e "${RED}✗${NC} Campaign runner tests failed"
    FAILED=$((FAILED + 1))
fi
echo ""

# Test 4: OpenClaw plugin build
echo "Test 4: OpenClaw plugin build..."
cd integrations/openclaw
if npm run build 2>&1 | grep -q "Built:"; then
    echo -e "${GREEN}✓${NC} OpenClaw plugin builds successfully"
    cd ../..
else
    echo -e "${RED}✗${NC} OpenClaw plugin build failed"
    cd ../..
    FAILED=$((FAILED + 1))
fi
echo ""

# Test 5: Docker Compose configuration
echo "Test 5: Docker Compose configuration syntax..."
if docker compose -f deploy/track1/compose.track1.yml config --quiet 2>&1; then
    echo -e "${GREEN}✓${NC} Compose configuration is valid"
else
    echo -e "${RED}✗${NC} Compose configuration syntax error"
    FAILED=$((FAILED + 1))
fi
echo ""

# Test 6: Environment variable alignment
echo "Test 6: Environment variable alignment..."
COMPOSE_VARS=$(grep -E "TRACK1.*URL|OPENCLAW_CONFIG" deploy/track1/compose.track1.yml | grep -v "^#" | wc -l)
if [ "$COMPOSE_VARS" -ge 4 ]; then
    echo -e "${GREEN}✓${NC} All required environment variables present in Compose"
else
    echo -e "${RED}✗${NC} Missing environment variables in Compose"
    FAILED=$((FAILED + 1))
fi
echo ""

# Test 7: SHA-256 hash verification
echo "Test 7: Content hash verification logic..."
if grep -q "createHash" integrations/openclaw/src/campaign-context.ts && \
   grep -q "computedHash === value.content_sha256" integrations/openclaw/src/campaign-context.ts; then
    echo -e "${GREEN}✓${NC} SHA-256 verification implemented"
else
    echo -e "${RED}✗${NC} SHA-256 verification missing"
    FAILED=$((FAILED + 1))
fi
echo ""

# Test 8: API endpoint migration
echo "Test 8: Supervision API endpoint usage..."
if grep -q "/api/supervision/campaigns/" scripts/track1/campaign-runner-ports.ts && \
   ! grep -q "/attempts/:id" scripts/track1/campaign-runner-ports.ts; then
    echo -e "${GREEN}✓${NC} Correct API endpoints in use"
else
    echo -e "${RED}✗${NC} Still using deprecated endpoints"
    FAILED=$((FAILED + 1))
fi
echo ""

# Summary
echo "=== Integration Test Summary ==="
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All integration tests passed (8/8)${NC}"
    exit 0
else
    echo -e "${RED}✗ $FAILED integration test(s) failed${NC}"
    exit 1
fi
