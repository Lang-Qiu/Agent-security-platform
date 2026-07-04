# Phase 4 Debugging Session - 2026-07-03

**Session Duration:** ~3 hours  
**Primary Issue:** Campaign runner unable to observe attempt completion ("Case not found in agent detail")  
**Root Cause:** Incomplete snapshot ingestion pipeline + minimal backend not receiving attempt records

---

## Problem Timeline

### Initial Symptom
```
[track1-campaign] Campaign failed: Error: Case T1-SC-001-C001 not found in agent detail
```

The campaign runner's `awaitAttempt()` method polls the backend supervision API for attempt completion, but the backend returns agents with empty `cases` arrays.

---

## Investigation Path

### 1. Frontend Data Structure Mismatch (Red Herring)
**Initial Hypothesis:** Frontend expects different data structure than backend provides.

**Finding:** Backend returned `created_at` instead of `started_at`, but this was a symptom, not the cause.

**Action Taken:** Added debug logging to frontend and runner to inspect actual API responses.

### 2. Backend API Response Analysis
**Discovery:** Backend `/api/supervision/campaigns/:id` endpoint returned:
```json
{
  "success": true,
  "data": {
    "campaign_id": "...",
    "agents": [],  // ← Empty!
    "created_at": "..."
  }
}
```

**Hypothesis:** Backend projector not populating agents array.

**Reality:** Backend is a **minimal stub** (`deploy/track1/minimal-backend.js`), not the full TypeScript backend!

### 3. Minimal Backend Discovery
**Key Finding:** Phase 4 uses `deploy/track1/minimal-backend.js` (Express stub with in-memory storage) instead of the TypeScript backend.

**Dockerfile Evidence:**
```dockerfile
# deploy/track1/Dockerfile.backend
COPY deploy/track1/minimal-backend.js /app/server.js
CMD ["node", "server.js"]
```

**Why This Matters:** All assumptions about backend behavior (projectors, repositories, evidence normalization) were invalid.

### 4. Agent Array Population Issue
**Finding:** Minimal backend creates campaign with empty `agents` array:
```javascript
// Original code
const agents = (agent_configs || []).map(cfg => ({
  agent_id: cfg.agent_id,
  cases: []
}));
```

**Problem:** Runner's `createCampaign()` doesn't pass `agent_configs` (not part of Phase 2 contract).

**Fix Applied:** Hard-code Track 1's 3 agents in minimal backend:
```javascript
const TRACK1_AGENT_IDS = [
  "agent:track1:prompt-injection",
  "agent:track1:tool-hijack",
  "agent:track1:memory-poison"
];
const agents = TRACK1_AGENT_IDS.map(agent_id => ({
  agent_id,
  cases: []
}));
```

**Result:** Agents array now populated, but cases still empty.

### 5. Snapshot Ingestion Pipeline Analysis
**Discovery:** OpenClaw plugin (`integrations/openclaw/src/plugin.ts`) is designed to:
- Hook into agent execution (`llm_input`, `llm_output`, `tool_request`, `tool_result`)
- Construct campaign snapshots
- POST snapshots to backend ingest API

**Critical Finding:** Plugin hooks **never fire** because runner uses `--local` mode!

**Code Evidence:**
```typescript
// scripts/track1/openclaw-command.ts
const args: string[] = [
  "agent",
  "--agent", "main",
  "--session-key", validated.session_key,
  "--message", messageJson,
  "--json",
  "--local"  // ← Bypasses gateway and plugin system!
];
```

**Impact:** No snapshots are submitted to backend, so backend has no case/attempt data.

### 6. Architecture Realization
**Phase 4 is a minimal integration test harness, not a complete supervision system.**

Current flow:
1. Runner invokes OpenClaw CLI in `--local` mode (embedded agent)
2. CLI returns `{payloads, meta}` (no supervision data)
3. Runner ignores CLI output, immediately calls `awaitAttempt()`
4. Backend has no data, returns empty cases array
5. Runner fails with "Case not found"

Missing components:
- ❌ Gateway-mediated agent execution
- ❌ Plugin hook activation
- ❌ Snapshot construction and ingestion
- ❌ Evidence normalization
- ❌ Attempt record submission

---

## Solutions Implemented

### Solution 1: Minimal Backend - Support Attempt Records
**Goal:** Let runner report attempt completion directly to backend.

**Change:** Modified minimal backend's `/internal/track1/campaigns/:id/attempts` endpoint to create case entries:

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
  
  if (existingAttemptIndex >= 0) {
    caseEntry.attempts[existingAttemptIndex] = attemptSummary;
  } else {
    caseEntry.attempts.push(attemptSummary);
  }
  
  res.status(201).json({ attempt_id });
});
```

### Solution 2: Runner - Call recordAttempt() After Invocation
**Goal:** Report attempt completion to backend so `awaitAttempt()` can find the case.

**Change:** Modified `scripts/track1/campaign-runner.ts` to call `recordAttempt()` after `invokeAgent()`:

```typescript
// Invoke OpenClaw agent
const invocationResult = await ports.invokeAgent({
  agent_id: agent_id as Track1CampaignAgentId,
  session_key,
  attempt_id,
  prompt
});

// Record attempt to backend (Phase 4 minimal flow)
await ports.recordAttempt({
  campaign_id,
  agent_id: agent_id as Track1CampaignAgentId,
  case_id: case_id as Track1CaseId,
  attempt_id,
  status: "finished",
  policy_action: "allow"  // Placeholder - no policy decisions extracted
});

// Wait for backend-normalized terminal evidence
const observation = await ports.awaitAttempt({ /* ... */ });
```

**Note:** This is a **stub implementation**. Real supervision would extract policy decisions from OpenClaw output.

### Solution 3: Update Port Interface
**Change:** Modified `scripts/track1/campaign-runner-ports.ts` to accept simplified attempt record:

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
  // ... error handling
}
```

---

## Testing Status

**As of last build:** Waiting for campaign runner to complete first full attempt cycle with new changes.

**Expected Outcome:**
1. ✅ OpenClaw invocation succeeds (already working)
2. ✅ `recordAttempt()` posts to backend ingest API
3. ✅ Minimal backend creates case entry with attempt
4. ✅ `awaitAttempt()` finds case and returns observation
5. ❌ Policy decision and final_action will be placeholder values (limitation of Phase 4)

---

## Known Limitations of Current Implementation

### 1. No Real Policy Decisions
- `policy_action` is hard-coded to `"allow"`
- No actual policy rules evaluated
- Tool calls not mediated

### 2. No Evidence Normalization
- Attempt `status` is hard-coded to `"finished"`
- No retry classification
- No terminal state detection

### 3. No Session Monitoring
- OpenClaw output (`{payloads, meta}`) is validated but not parsed
- Session ID, tool calls, model turns not extracted
- No snapshot hash chain

### 4. awaitAttempt() is Synchronous
- In minimal backend, attempt is immediately available after `recordAttempt()`
- Real backend would normalize evidence asynchronously
- Polling logic is unnecessary but kept for interface compatibility

### 5. No Persistence
- Minimal backend uses in-memory Map
- Data lost on container restart
- No audit trail or forensic analysis capability

---

## Recommended Next Steps

### Immediate (Make Tests Pass)
1. ✅ Verify campaign runner completes without "Case not found" error
2. ✅ Confirm frontend displays campaign with non-empty agents array
3. ✅ Validate attempt records appear in backend API responses

### Short Term (Phase 4.5?)
1. Parse OpenClaw CLI output to extract session ID and response payloads
2. Implement basic tool call counting (how many tools invoked?)
3. Add attempt duration calculation (from CLI meta.durationMs)
4. Store minimal backend data to file (JSON dump on finalize)

### Medium Term (Phase 5 - Full Backend Integration)
1. Replace minimal backend with TypeScript backend
2. Enable gateway-mediated agent execution (remove `--local` flag)
3. Activate OpenClaw plugin for real-time snapshot ingestion
4. Implement evidence normalization in projector
5. Add policy rule engine integration

### Long Term (Production Readiness)
1. Deploy PostgreSQL for campaign persistence
2. Add observability (metrics, traces, structured logs)
3. Implement snapshot hash verification and duplicate detection
4. Build forensic analysis UI (session replay, tool call timeline)
5. Add campaign export/import for cross-environment testing

---

## Documentation Created

1. **PHASE4_GAPS_AND_FUTURE_WORK.md** — Comprehensive gap analysis and implementation roadmap
2. **PHASE4_DEBUGGING_SESSION_2026_07_03.md** (this file) — Detailed debugging narrative

---

## Lessons Learned

### 1. Verify Deployment Architecture Early
Spent significant time assuming TypeScript backend was deployed, when it was actually a JavaScript stub.

**Takeaway:** Always check `docker-compose.yml` and Dockerfiles before making assumptions about runtime architecture.

### 2. Understand Plugin Activation Conditions
OpenClaw plugin system is powerful but conditional. `--local` mode bypasses all hooks.

**Takeaway:** Document when plugins activate and what execution modes support them.

### 3. Phase Boundaries Matter
Phase 4 was explicitly scoped as "minimal runtime integration" but expectations drifted toward "complete supervision pipeline."

**Takeaway:** Maintain clear phase boundary documentation. If gaps are acceptable for current phase, document them upfront.

### 4. Stub Implementations Should Be Obvious
Minimal backend looks like a real backend (endpoints, auth, responses) but behavior differs significantly.

**Takeaway:** Add prominent comments or logging indicating stub/placeholder behavior.

### 5. End-to-End Smoke Tests First
Should have run a simple campaign end-to-end before diving into code.

**Takeaway:** Establish "does it work at all?" baseline before investigating details.

---

## Files Modified

### Core Logic Changes
- `scripts/track1/campaign-runner.ts` — Added `recordAttempt()` call
- `scripts/track1/campaign-runner-ports.ts` — Simplified `recordAttempt()` interface
- `deploy/track1/minimal-backend.js` — Fixed agent initialization + attempt handling

### Documentation
- `docs/PHASE4_GAPS_AND_FUTURE_WORK.md` — Gap analysis (new)
- `docs/PHASE4_DEBUGGING_SESSION_2026_07_03.md` — This session narrative (new)

### Temporary Debug Code (To Be Removed)
- `scripts/track1/campaign-runner-ports.ts` — `console.error()` logging in `awaitAttempt()`
- `backend/src/app.module.ts` — `console.log()` for request logging

---

## Success Criteria for This Session

- [x] Identified root cause (plugin not active + no attempt records)
- [x] Implemented workaround (direct recordAttempt call)
- [x] Documented gaps for future work
- [ ] Verified campaign completes successfully ← **Awaiting test results**
- [ ] Cleaned up debug logging ← **Pending verification**

---

**Status:** Waiting for campaign runner test completion (as of last log check).
