# Track 1 Phase 4 Runtime - End-to-End Testing

## Quick Start

### Prerequisites

1. Docker and docker-compose installed
2. Required environment variables set:
   ```bash
   export OPENCLAW_MODEL_BASE_URL="https://api.anthropic.com/v1"
   export OPENCLAW_MODEL_API_KEY="your-api-key"
   export OPENCLAW_MODEL_ID="anthropic/claude-sonnet-5"
   export TRACK1_INGEST_TOKEN="your-backend-token"
   ```

### Run Full Campaign

**Option 1: Using demo script (recommended)**

```bash
# Bash
./scripts/track1/e2e-demo.sh

# PowerShell
.\scripts\track1\e2e-demo.ps1
```

**Option 2: Manual steps**

```bash
cd E:\LQiu\Agent-security-platform\.worktrees\track1-phase4-runtime

# 1. Start infrastructure
docker-compose -f deploy/track1/compose.track1.yml --profile track1 up -d backend frontend openclaw

# 2. Wait for services (check health)
curl http://localhost:3001/health
curl http://localhost:3002/health

# 3. Run campaign
docker-compose -f deploy/track1/compose.track1.yml --profile track1 run --rm runner

# 4. View results
open http://localhost:3000

# 5. Clean up
docker-compose -f deploy/track1/compose.track1.yml --profile track1 down
```

## What to Expect

The campaign will execute 9 attempts (3 agents × 3 scenarios):

| Agent | Scenario | Cases | Expected Behavior |
|-------|----------|-------|-------------------|
| prompt-injection | T1-SC-001 | C001-C003 | Tool call verification against prompt injection |
| tool-hijack | T1-SC-002 | C001-C003 | Parameter validation against malicious inputs |
| memory-poison | T1-SC-003 | C001-C003 | Memory integrity checks |

Each attempt:
1. ✅ Compiles case-specific prompt (oracle-free)
2. ✅ Sends to OpenClaw agent with gateway control
3. ✅ Observes tool call decision (allow/deny/error)
4. ✅ Reports outcome to backend
5. ✅ Retries once on ERROR/UNKNOWN (max 2 attempts)

## Troubleshooting

### Backend not healthy
```bash
docker-compose -f deploy/track1/compose.track1.yml logs backend
```

### OpenClaw connection failed
Check gateway token configuration:
```bash
docker-compose -f deploy/track1/compose.track1.yml logs openclaw
grep OPENCLAW_GATEWAY_TOKEN deploy/track1/compose.track1.yml
```

### Runner campaign failed
```bash
docker-compose -f deploy/track1/compose.track1.yml logs runner
```

Check environment variables passed to runner:
```bash
docker-compose -f deploy/track1/compose.track1.yml config | grep -A 20 runner
```

## Success Criteria (P1-3)

✅ All 9 attempts complete without errors  
✅ Backend receives all attempt observations  
✅ Frontend displays campaign results  
✅ Final actions match expected_action from cases  
✅ No manual intervention required

## Test Status

| Test Type | Status | Count |
|-----------|--------|-------|
| Integration | ✅ PASS | 67/67 |
| Unit | ✅ PASS | 61/61 |
| **Total** | **✅ 128/128** | |

Last updated: 2025-01-XX
