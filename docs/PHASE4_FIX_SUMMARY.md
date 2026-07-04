# Phase 4 Track 1 Runtime - Fix Summary

**Date:** 2026-07-03  
**Work Stream:** Track 1 Campaign Execution  
**Status:** In Progress - Testing minimal supervision flow

---

## Original Problem

Campaign runner failed with:
```
[track1-campaign] Campaign failed: Error: Case T1-SC-001-C001 not found in agent detail
```

**Root Cause:** Phase 4 uses a minimal architecture that bypasses the complete supervision pipeline:
- OpenClaw runs in `--local` mode (no gateway, no plugin hooks)
- No snapshot ingestion occurs
- Backend has no case/attempt data
- Runner's `awaitAttempt()` polling fails

---

## Architecture Understanding

### Phase 4 Minimal Stack
```
┌─────────────────┐
│ Frontend (React)│  ← Displays campaign summaries
└────────┬────────┘
         │ HTTP
         ▼
┌─────────────────┐
│ Minimal Backend │  ← Express stub with in-memory storage
│ (minimal-backend│     (NOT the TypeScript backend)
│  .js)           │
└────────┬────────┘
         │ Ingest API
         ▼
┌─────────────────┐
│ Campaign Runner │  ← Orchestrates test cases
└────────┬────────┘
         │ --local mode
         ▼
┌─────────────────┐
│ OpenClaw CLI    │  ← Embedded agent (bypasses gateway)
└─────────────────┘

Plugin system: NOT ACTIVE (requires gateway-mediated execution)
```

### Complete Supervision Stack (Future)
```
┌─────────────────┐
│ TypeScript      │  ← Full backend with projectors, repositories
│ Backend         │
└────────┬────────┘
         │ Ingest API
         ▼
┌─────────────────┐
│ OpenClaw Gateway│  ← Plugin hooks active
│ + Track1 Plugin │
└────────┬────────┘
         │ Agent execution
         ▼
┌─────────────────┐
│ Campaign Runner │
└─────────────────┘
```

---

## Changes Made

### 1. Minimal Backend - Hard-code Track 1 Agents
**File:** `deploy/track1/minimal-backend.js`  
**Issue:** Campaign created with empty agents array (runner doesn't pass agent_configs)

**Fix:**
```javascript
// POST /internal/track1/campaigns - Create campaign
const TRACK1_AGENT_IDS = [
  "agent:track1:prompt-injection",
  "agent:track1:tool-hijack",
  "agent:track1:memory-poison"
];

const agents = TRACK1_AGENT_IDS.map(agent_id => ({
  agent_id,
  cases: []
}));

campaigns.set(campaign_id, {
  campaign_id,
  campaign_manifest_sha256,
  agent_configs: TRACK1_AGENT_IDS.map(agent_id => ({ agent_id })),
  total_cases: 9, // Track 1 always has 9 cases
  status: "running",
  agents,
  created_at: new Date().toISOString()
});
```

### 2. Minimal Backend - Handle Attempt Records
**File:** `deploy/track1/minimal-backend.js`  
**Issue:** Attempts endpoint existed but didn't update campaign structure

**Fix:**
```javascript
// POST /internal/track1/campaigns/:campaignId/attempts
internal.post("/internal/track1/campaigns/:campaignId/attempts", verifyToken, (req, res) => {
  const { agent_id, case_id, attempt_id, status, policy_action } = req.body;
  
  // Find or create agent
  let agent = campaign.agents.find(a => a.agent_id === agent_id);
  if (!agent) {
    agent = { agent_id, cases: [] };
    campaign.agents.push(agent);
  }
  
  // Find or create case
  let caseEntry = agent.cases.find(c => c.case_id === case_id);
  if (!caseEntry) {
    caseEntry = { case_id, attempts: [] };
    agent.cases.push(caseEntry);
  }
  
  // Add or update attempt
  const attemptSummary = {
    attempt_id,
    status,
    policy_action,
    recorded_at: new Date().toISOString()
  };
  
  const existingAttemptIndex = caseEntry.attempts.findIndex(a => a.attempt_id === attempt_id);
  if (existingAttemptIndex >= 0) {
    caseEntry.attempts[existingAttemptIndex] = attemptSummary;
  } else {
    caseEntry.attempts.push(attemptSummary);
  }
  
  campaigns.set(campaignId, campaign);
  res.status(201).json({ attempt_id });
});
```

### 3. Campaign Runner - Call recordAttempt() After Invocation
**File:** `scripts/track1/campaign-runner.ts`  
**Issue:** Runner never reported attempt completion to backend

**Fix:**
```typescript
// Invoke OpenClaw agent
const invocationResult = await ports.invokeAgent({
  agent_id: agent_id as Track1CampaignAgentId,
  session_key,
  attempt_id,
  prompt
});

ports.progress({
  event_type: "attempt_invoked",
  agent_id: agent_id as Track1CampaignAgentId,
  case_id: case_id as Track1CaseId,
  attempt_id,
  attempt_index
});

// ✨ NEW: Record attempt to backend (Phase 4 minimal flow)
await ports.recordAttempt({
  campaign_id,
  agent_id: agent_id as Track1CampaignAgentId,
  case_id: case_id as Track1CaseId,
  attempt_id,
  status: "finished",
  policy_action: "allow"  // Placeholder - no real policy decisions
});

// Wait for backend-normalized terminal evidence
const observation = await ports.awaitAttempt({ /* ... */ });
```

### 4. Campaign Runner Ports - Define recordAttempt() Signature
**File:** `scripts/track1/campaign-runner-ports.ts`  
**Issue:** Type `Track1AttemptRecordEnvelope` doesn't exist

**Fix:**
```typescript
async recordAttempt(
  input: {
    campaign_id: string;
    agent_id: string;
    case_id: string;
    attempt_id: string;
    status: string;
    policy_action: string;
  }
): Promise<void> {
  const response = await fetch(
    `${ingestBaseUrl}/campaigns/${input.campaign_id}/attempts`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ingestToken}`
      },
      body: JSON.stringify(input)
    }
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Failed to record attempt: ${response.status} ${response.statusText}${text ? `: ${text}` : ""}`
    );
  }
}
```

### 5. Campaign Runner Ports - Remove Debug Logs
**File:** `scripts/track1/campaign-runner-ports.ts`  
**Cleanup:** Removed verbose console.error() statements from `awaitAttempt()` method.

---

## Expected Behavior After Fix

1. Runner creates campaign → Backend initializes with 3 agents (empty cases)
2. Runner invokes OpenClaw for case T1-SC-001-C001
3. OpenClaw CLI completes, returns response
4. **Runner calls `recordAttempt()`** → Backend creates case + attempt entry
5. Runner calls `awaitAttempt()` → Backend returns case with attempt
6. Runner extracts final_action from attempt.policy_action
7. Runner validates action matches expectation, continues to next case

---

## Limitations of Phase 4 Minimal Flow

### What's Missing
1. **No real policy decisions** - All attempts marked as `allow`
2. **No evidence normalization** - Status always `finished`, no failure detection
3. **No snapshot chain** - No hash verification or sequence tracking
4. **No tool monitoring** - Can't detect tool hijacking or prompt injection
5. **No retry classification** - All attempts treated as success

### What's Stubbed
- `final_action`: Derived from placeholder `policy_action: "allow"`
- `retry_classification`: Always `null` (treated as success)
- `observation.status`: Always assumes CLI success = attempt success

### Why This Works for Basic Testing
- Can verify runner orchestration (case iteration, attempt retry logic)
- Can verify frontend display of campaign summaries
- Can verify Docker compose setup and networking
- **Cannot** verify security monitoring or policy enforcement

---

## Next Steps (Phase 5 Full Implementation)

See `docs/PHASE4_GAPS_AND_FUTURE_WORK.md` for complete roadmap.

**Priority 1: Enable Gateway-Mediated Execution**
- Remove `--local` flag from OpenClaw CLI invocation
- Configure runner to connect to gateway
- Verify plugin loads and hooks fire

**Priority 2: Replace Minimal Backend**
- Deploy TypeScript backend with projector/repository
- Implement evidence normalization
- Add snapshot hash verification

**Priority 3: Extract Real Policy Decisions**
- Parse OpenClaw plugin's snapshot payloads
- Extract policy decisions from tool mediation
- Map decisions to final_action (deny/ask/alert/allow)

---

## Testing Status

**Current:** Waiting for runner execution with recordAttempt() fix.

**Expected Result:**
```
[2026-07-03T15:XX:XX.XXXZ] attempt_invoked { attempt_id: 'attempt:t1-sc-001-c001:1', ... }
[backend] Received POST /attempts for campaign: campaign:...
[backend] Processing attempt: { agent_id: '...', case_id: 'T1-SC-001-C001', ... }
[2026-07-03T15:XX:XX.XXXZ] attempt_observed { final_action: 'allow', ... }
[2026-07-03T15:XX:XX.XXXZ] attempt_finalized { ... }
[2026-07-03T15:XX:XX.XXXZ] case_finalized { ... }
... (repeat for 9 cases)
[2026-07-03T15:XX:XX.XXXZ] campaign_finalized { ... }
```

**Actual Result:** [To be filled after test completes]

---

## Files Modified

1. `deploy/track1/minimal-backend.js`
   - Hard-code Track 1 agent IDs
   - Implement attempt record handling
   - Add debug logging

2. `scripts/track1/campaign-runner.ts`
   - Add `recordAttempt()` call after `invokeAgent()`

3. `scripts/track1/campaign-runner-ports.ts`
   - Define `recordAttempt()` signature (inline type)
   - Remove debug console.error() statements from `awaitAttempt()`

4. `docs/PHASE4_GAPS_AND_FUTURE_WORK.md` (NEW)
   - Document architectural gaps
   - Provide roadmap for full implementation

5. `docs/PHASE4_DEBUGGING_SESSION_2026_07_03.md` (NEW)
   - Detailed investigation timeline
   - Code snippets and evidence
   - Decision rationale

---

## Commit Message Template

```
fix(phase4): implement minimal attempt recording for supervision flow

Root cause: OpenClaw runs in --local mode (no plugin hooks), so backend
never receives snapshot/attempt data. Runner's awaitAttempt() polling
fails with "Case not found".

Changes:
- Minimal backend: hard-code 3 Track 1 agents on campaign creation
- Minimal backend: implement POST /attempts to create case entries
- Runner: call recordAttempt() after invokeAgent() completes
- Runner ports: define recordAttempt() inline type (no envelope)

This enables basic end-to-end testing of Phase 4 runtime, but does NOT
implement complete supervision (no policy decisions, no evidence
normalization, no snapshot chain).

See docs/PHASE4_GAPS_AND_FUTURE_WORK.md for Phase 5 roadmap.

Refs: Track 1 Phase 4 Runtime, Issue #[TBD]
```

---

## Documentation Created

- **PHASE4_GAPS_AND_FUTURE_WORK.md** - Technical debt and implementation roadmap
- **PHASE4_DEBUGGING_SESSION_2026_07_03.md** - Detailed investigation log
- **THIS_FILE.md** - Executive summary and change catalog

---

**Status:** Awaiting test results (as of 15:10 UTC 2026-07-03)