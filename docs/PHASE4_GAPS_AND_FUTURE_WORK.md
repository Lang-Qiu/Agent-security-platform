# Phase 4 Implementation Gaps and Future Work

**Document Version:** 1.0  
**Date:** 2026-07-03  
**Status:** Technical Debt Documentation

---

## Executive Summary

The current Phase 4 Track 1 runtime implementation is a **minimal viable integration** that demonstrates OpenClaw agent invocation but does not implement the complete campaign supervision pipeline. This document identifies architectural gaps, temporary workarounds, and provides a roadmap for full implementation.

**Key Gap:** The supervision data flow (snapshot ingestion, attempt observation, evidence normalization) is incomplete, requiring manual intervention or stub implementations to make tests pass.

---

## Current Architecture Overview

### What Works
- ✅ OpenClaw agent invocation via CLI (`--local` mode)
- ✅ Campaign runner orchestration (case iteration, retry logic)
- ✅ Minimal backend stub (in-memory storage, basic CRUD)
- ✅ Frontend display of campaign summaries

### What's Missing
- ❌ **Snapshot ingestion pipeline** (OpenClaw → Backend)
- ❌ **Policy decision extraction** from agent execution
- ❌ **Evidence normalization** and terminal state detection
- ❌ **Gateway-mediated agent execution** (plugin-based monitoring)
- ❌ **Real-time attempt observation** via supervision API

---

## Gap 1: OpenClaw Plugin Integration Not Active

### Current State
The campaign runner invokes OpenClaw CLI in **`--local` mode**, which:
- Runs an embedded agent directly in the CLI process
- **Bypasses the OpenClaw Gateway entirely**
- **Does not load or activate the `agent-security-track1` plugin**

**Code Location:**
```typescript
// scripts/track1/openclaw-command.ts:259-260
const args: string[] = [
  "agent",
  "--agent", "main",
  "--session-key", validated.session_key,
  "--message", messageJson,
  "--json",
  "--local"  // ← Bypasses gateway and plugin system
];
```

### Why This Matters
The Track 1 supervision plugin (`integrations/openclaw/src/plugin.ts`) is designed to:
1. Intercept all model I/O (`llm_input`, `llm_output` hooks)
2. Mediate tool call requests/responses
3. Apply policy decisions (allow/alert/ask/deny)
4. **Construct and ingest campaign snapshots** to the backend

Without gateway integration, **none of these hooks fire**, so:
- No snapshots are submitted to backend ingest API
- Backend has no attempt/result data to serve to the runner
- `awaitAttempt()` polling fails with "Case not found"

### Required Changes for Full Implementation

#### 1.1 Remove `--local` Flag
**File:** `scripts/track1/openclaw-command.ts`

Remove the `--local` flag from OpenClaw CLI args. The agent should connect to the gateway:

```typescript
const args: string[] = [
  "agent",
  "--agent", "main",  // Pre-configured agent ID
  "--session-key", validated.session_key,
  "--message", messageJson,
  "--json"
  // NO --local flag
];
```

#### 1.2 Configure Gateway URL
**File:** `deploy/track1/compose.track1.yml`

Ensure campaign-runner container has gateway access:
```yaml
environment:
  - OPENCLAW_GATEWAY_URL=http://openclaw-gateway:19001
  - OPENCLAW_GATEWAY_PASSWORD=${OPENCLAW_GATEWAY_PASSWORD}
```

#### 1.3 Enable Device Pairing or Insecure Auth
**File:** `deploy/track1/config/openclaw.json5`

The gateway requires authentication. For automated testing, enable insecure auth:
```json5
{
  "gateway": {
    "mode": "local",
    "port": 19001,
    "controlUi": {
      "dangerouslyDisableDeviceAuth": true,  // Already set
      "allowInsecureAuth": true               // Already set
    }
  }
}
```

#### 1.4 Verify Plugin Loading
**File:** `integrations/openclaw/openclaw.plugin.json`

Ensure plugin is configured for auto-activation:
```json
{
  "activation": { "onStartup": true }
}
```

Check gateway logs for plugin load confirmation:
```
[gateway] auto-enabled plugins for this runtime without writing config:
- agent-security-track1 tool configured, enabled automatically.
```

#### 1.5 Pass Campaign Context in Agent Invocation
**Critical:** The plugin extracts campaign metadata (campaign_id, attempt_id, agent_id, case_id) from the **agent's input message envelope**, not from configuration.

**File:** `scripts/track1/campaign-runner.ts`

When compiling the prompt, ensure the message includes the Track 1 plugin context:

```typescript
// The compiled prompt must be a Track1ModelInputEnvelope
const prompt = await ports.compilePrompt({
  schema_version: "track1-model-input.v1",
  campaign_id,
  agent_id,
  scenario_id,
  case_id,
  attempt_id,
  attempt_index,
  session_id,
  // ... other fields
});
```

The plugin's `llm_input` hook will normalize this envelope and extract campaign context.

---

## Gap 2: Snapshot Ingestion and Normalization Missing

### Current State
The minimal backend (`deploy/track1/minimal-backend.js`) has a snapshot endpoint:

```javascript
internal.post("/internal/track1/campaigns/:campaignId/snapshots", ...)
```

This endpoint was added as a **temporary fix** to accept snapshot envelopes and update campaign state. However:
- It directly mutates in-memory campaign objects
- No hash verification or duplicate detection
- No evidence normalization (policy decision aggregation, terminal state detection)
- Snapshot data is **not persisted** beyond the in-memory Map

### Required Changes for Full Implementation

#### 2.1 Replace Minimal Backend with TypeScript Backend
**Action:** Build and deploy the full TypeScript backend instead of the JavaScript stub.

**Key Modules:**
- `backend/src/modules/supervision/campaign-repository.ts` — SQLite/file-based persistence
- `backend/src/modules/supervision/campaign-projector.ts` — Evidence normalization and counter recomputation
- `backend/src/modules/ingest/` — Campaign/snapshot ingest API with schema validation

**Benefits:**
- Proper persistence (survives container restarts)
- Hash-based duplicate detection
- Evidence normalization via `projectTrack1Campaign()`
- Support for full `Track1CampaignDetail` schema

#### 2.2 Implement Evidence Normalization
**File:** `backend/src/modules/supervision/campaign-projector.ts`

The projector already implements evidence normalization logic:
- **Policy Action Aggregation:** Derives highest-precedence action (deny > ask > alert > allow)
- **Terminal State Detection:** Marks cases as passed/failed/skipped based on result status
- **Counter Recomputation:** Calculates attempt counts, case counts, agent-level rollups

**Current Issue:** This projector is **not invoked** in the minimal backend.

**Fix:** Wire up the projector in the supervision controller's `getCampaignDetail` handler.

#### 2.3 Add Snapshot Verification
**File:** `backend/src/modules/ingest/snapshot-ingest.service.ts`

Implement hash verification:
```typescript
const computedHash = calculateTrack1SnapshotSha256(snapshotWithoutHash);
if (computedHash !== envelope.snapshot_sha256) {
  throw new DomainError("Snapshot hash mismatch", "SNAPSHOT_HASH_INVALID", 400);
}
```

Reject duplicate snapshots:
```typescript
if (repository.snapshotExists(campaign_id, attempt_id, sequence)) {
  return { status: "duplicate" }; // Idempotent
}
```

---

## Gap 3: Attempt Observation (awaitAttempt) is Polling-Based

### Current State
The runner polls the backend supervision API every 5 seconds, checking for terminal attempt state:

**File:** `scripts/track1/campaign-runner-ports.ts:333-397`

```typescript
async awaitAttempt(input: Track1AttemptAwaitRequest) {
  const maxAttempts = 120; // 10 minutes
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;
    const response = await fetch(`${apiBaseUrl}/supervision/campaigns/${input.campaign_id}`);
    const campaignDetail = await response.json();

    // Navigate: campaign -> agents -> cases -> attempts
    const agent = campaignDetail.agents?.find(a => a.agent_id === input.agent_id);
    const caseEntry = agent?.cases?.find(c => c.case_id === input.case_id);
    const attempt = caseEntry?.attempts?.find(a => a.attempt_id === input.attempt_id);

    if (attempt && attempt.status !== "running") {
      return { final_action: attempt.policy_action, ... };
    }

    await sleep(5000); // Poll every 5 seconds
  }

  throw new Error("Attempt observation timeout");
}
```

**Problems:**
- High latency (up to 5s delay per attempt)
- Backend load (120 requests per attempt worst-case)
- No real-time notification

### Required Changes for Full Implementation

#### 3.1 Option A: WebSocket-Based Observation
**Recommended for production.**

**Backend:** Emit campaign update events over WebSocket:
```typescript
// backend/src/modules/supervision/campaign-events.service.ts
export class CampaignEventService {
  private connections = new Map<string, WebSocket>();

  subscribe(campaignId: string, ws: WebSocket) {
    this.connections.set(campaignId, ws);
  }

  notifyAttemptUpdate(campaignId: string, attemptId: string, status: string) {
    const ws = this.connections.get(campaignId);
    if (ws) {
      ws.send(JSON.stringify({
        type: "attempt_update",
        campaign_id: campaignId,
        attempt_id: attemptId,
        status
      }));
    }
  }
}
```

**Runner:** Subscribe to campaign events:
```typescript
async awaitAttempt(input: Track1AttemptAwaitRequest) {
  const ws = new WebSocket(`${wsBaseUrl}/supervision/campaigns/${input.campaign_id}/watch`);

  return new Promise((resolve, reject) => {
    ws.on("message", (data) => {
      const event = JSON.parse(data.toString());
      if (event.attempt_id === input.attempt_id && event.status !== "running") {
        resolve({ final_action: event.policy_action, ... });
        ws.close();
      }
    });

    setTimeout(() => {
      reject(new Error("Attempt observation timeout"));
      ws.close();
    }, 600_000); // 10 minutes
  });
}
```

#### 3.2 Option B: Server-Sent Events (SSE)
**Simpler than WebSocket, one-way communication.**

**Backend:** SSE endpoint:
```typescript
app.get("/api/supervision/campaigns/:campaignId/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");

  const listener = (event: CampaignEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  eventService.on(req.params.campaignId, listener);

  req.on("close", () => {
    eventService.off(req.params.campaignId, listener);
  });
});
```

**Runner:** Use EventSource:
```typescript
const eventSource = new EventSource(`${apiBaseUrl}/supervision/campaigns/${input.campaign_id}/events`);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.attempt_id === input.attempt_id && data.status !== "running") {
    resolve({ final_action: data.policy_action });
    eventSource.close();
  }
};
```

#### 3.3 Option C: Long Polling with ETag
**Lower latency than fixed-interval polling.**

**Backend:** Support conditional GET with ETag:
```typescript
app.get("/api/supervision/campaigns/:campaignId", (req, res) => {
  const campaign = repository.findById(req.params.campaignId);
  const etag = `"${campaign.updated_at}"`;

  if (req.headers["if-none-match"] === etag) {
    // No change yet, hold connection for 30s
    setTimeout(() => res.status(304).send(), 30000);
  } else {
    res.setHeader("ETag", etag);
    res.json(campaign);
  }
});
```

**Runner:** Send ETag in polling loop:
```typescript
let etag: string | null = null;

while (attempts < maxAttempts) {
  const headers: Record<string, string> = {};
  if (etag) headers["If-None-Match"] = etag;

  const response = await fetch(url, { headers });

  if (response.status === 304) {
    // No update, continue polling
    continue;
  }

  etag = response.headers.get("ETag");
  const campaign = await response.json();
  // Check for terminal state...
}
```

---

## Gap 4: Policy Decision Extraction Not Implemented

### Current State
The minimal backend's attempt record accepts a `policy_action` field but does **not derive it** from agent execution results. The runner currently submits a hardcoded placeholder:

**File:** `scripts/track1/campaign-runner.ts:257-263`

```typescript
await ports.recordAttempt({
  // ...
  status: "finished",
  policy_action: "allow" // ← Placeholder, not real data
});
```

### Why This Matters
The policy action determines:
- Whether a test case passed (expected action matched)
- Campaign success/failure
- Evidence for RED phase documentation
- Compliance with sandbox policy requirements

### Required Changes for Full Implementation

#### 4.1 Parse OpenClaw CLI Output
**File:** `scripts/track1/openclaw-command.ts`

The CLI returns `{ payloads, meta }`. Extract session data from payloads:

```typescript
export async function invokeOpenClawAgent(...): Promise<DetailedInvocationResult> {
  // ... existing spawn logic ...

  const parsed = JSON.parse(result.stdout);

  // Extract final response payload
  const finalPayload = parsed.payloads[parsed.payloads.length - 1];
  if (!finalPayload) {
    throw new Track1InvocationError("track1_invocation_no_payloads");
  }

  // Meta contains session_id
  const sessionId = parsed.meta?.session_id;

  return {
    exit_code: 0,
    agent_id: validated.agent_id,
    session_id: sessionId,
    session_key_sha256: validated.session_key_sha256,
    final_message: finalPayload.content,
    protocol_valid: true
  };
}
```

#### 4.2 Fetch Session Data from Gateway
**Alternative:** If `--local` mode is replaced with gateway mode, the plugin will automatically ingest snapshots. The runner can then:

```typescript
// After invocation completes
const sessionData = await fetch(`${gatewayUrl}/sessions/${sessionId}/summary`);
const summary = await sessionData.json();

await ports.recordAttempt({
  // ...
  status: summary.terminal_status,
  policy_action: summary.policy_action_highest_precedence
});
```

#### 4.3 Derive Policy Action from Tool Decisions
**If session API is unavailable**, parse the OpenClaw output for tool mediation events:

```typescript
const policyDecisions = parsed.payloads
  .filter(p => p.type === "tool_request_mediated")
  .map(p => p.policy_action);

const finalAction = derivePolicyAction(policyDecisions); // deny > ask > alert > allow
```

---

## Gap 5: No Persistence Layer (In-Memory Only)

### Current State
The minimal backend stores all data in JavaScript `Map` objects:

```javascript
const campaigns = new Map();
const snapshots = new Map();
```

**Consequences:**
- All data lost on container restart
- Cannot scale horizontally
- No historical analysis or audit trail

### Required Changes for Full Implementation

#### 5.1 Use SQLite for Local Development
**File:** `backend/src/modules/supervision/campaign-repository.ts`

Already implemented! The TypeScript backend uses `better-sqlite3`:

```typescript
export class CampaignRepository {
  private db: Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initSchema();
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS campaigns (
        campaign_id TEXT PRIMARY KEY,
        manifest_sha256 TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS attempts (
        attempt_id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        case_id TEXT NOT NULL,
        attempt_index INTEGER NOT NULL,
        status TEXT NOT NULL,
        policy_action TEXT,
        FOREIGN KEY (campaign_id) REFERENCES campaigns(campaign_id)
      );

      CREATE TABLE IF NOT EXISTS snapshots (
        snapshot_id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL,
        attempt_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        snapshot_data TEXT NOT NULL,
        FOREIGN KEY (campaign_id) REFERENCES campaigns(campaign_id)
      );
    `);
  }
}
```

**Action:** Replace minimal backend with TypeScript backend and mount SQLite DB volume.

#### 5.2 Use PostgreSQL for Production
**File:** `deploy/prod/compose.track1-prod.yml`

Add PostgreSQL service:
```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: track1
      POSTGRES_USER: track1_user
      POSTGRES_PASSWORD: ${TRACK1_DB_PASSWORD}
    volumes:
      - track1_postgres_data:/var/lib/postgresql/data
    networks:
      - track1-internal

volumes:
  track1_postgres_data:
```

Update backend to use PostgreSQL adapter:
```typescript
import { Pool } from "pg";

export class PostgresCampaignRepository implements CampaignRepository {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  // Implement interface methods using parameterized queries
}
```

---

## Gap 6: Frontend Does Not Display Attempt-Level Details

### Current State
The frontend displays campaign summaries but does **not drill down** into:
- Individual attempt results
- Policy decisions per attempt
- Tool call sequences
- Evidence snapshots

**File:** `frontend/src/components/CampaignDetailView.tsx` (hypothetical)

Currently only shows:
```tsx
<div>
  <h2>{campaign.campaign_id}</h2>
  <p>Status: {campaign.status}</p>
  <p>Total Cases: {campaign.total_cases}</p>
</div>
```

### Required Changes for Full Implementation

#### 6.1 Add Attempt Detail View
**File:** `frontend/src/components/AttemptDetailView.tsx`

```tsx
export function AttemptDetailView({ attemptId }: { attemptId: string }) {
  const { data: attempt } = useAttempt(attemptId);

  return (
    <div>
      <h3>Attempt {attempt.attempt_id}</h3>
      <p>Status: {attempt.status}</p>
      <p>Policy Action: {attempt.policy_action}</p>

      <h4>Policy Decisions</h4>
      <ul>
        {attempt.policy_decisions.map(d => (
          <li key={d.decision_id}>
            {d.tool_name}: {d.action} — {d.rule_id}
          </li>
        ))}
      </ul>

      <h4>Timeline</h4>
      <Timeline events={attempt.events} />
    </div>
  );
}
```

#### 6.2 Add Evidence Export
**File:** `frontend/src/pages/CampaignEvidencePage.tsx`

```tsx
export function CampaignEvidencePage({ campaignId }: { campaignId: string }) {
  const { data: evidence } = useCampaignEvidence(campaignId);

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(evidence, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `evidence-${campaignId}.json`;
    a.click();
  };

  return (
    <div>
      <h2>Campaign Evidence</h2>
      <button onClick={handleExport}>Export Evidence JSON</button>
      <pre>{JSON.stringify(evidence, null, 2)}</pre>
    </div>
  );
}
```

---

## Gap 7: No Error Recovery or Retry Backoff

### Current State
The runner retries failed attempts but uses:
- **Fixed retry logic:** Attempt 1 fails → Attempt 2 (no backoff)
- **No exponential backoff** for transient errors
- **No circuit breaker** for persistent backend failures

### Required Changes for Full Implementation

#### 7.1 Add Exponential Backoff
**File:** `scripts/track1/campaign-runner.ts`

```typescript
async function invokeWithBackoff(
  fn: () => Promise<void>,
  maxRetries: number = 3
): Promise<void> {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      if (attempt >= maxRetries) throw error;

      const backoffMs = Math.min(1000 * 2 ** attempt, 30000); // Cap at 30s
      console.warn(`Retry ${attempt}/${maxRetries} after ${backoffMs}ms`);
      await sleep(backoffMs);
    }
  }
}
```

#### 7.2 Implement Circuit Breaker
**File:** `scripts/track1/campaign-runner-ports.ts`

```typescript
class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: "closed" | "open" | "half-open" = "closed";

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (Date.now() - this.lastFailureTime > 60000) {
        this.state = "half-open";
      } else {
        throw new Error("Circuit breaker open");
      }
    }

    try {
      const result = await fn();
      this.failures = 0;
      this.state = "closed";
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailureTime = Date.now();

      if (this.failures >= 5) {
        this.state = "open";
      }

      throw error;
    }
  }
}
```

---

## Gap 8: No Observability (Logs, Metrics, Traces)

### Current State
- **Logs:** Console output only, no structured logging
- **Metrics:** None
- **Traces:** None

### Required Changes for Full Implementation

#### 8.1 Add Structured Logging
**File:** `backend/src/common/logger.ts`

```typescript
import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: {
    target: "pino-pretty",
    options: { colorize: true }
  }
});

// Usage
logger.info({ campaignId, attemptId }, "Recording attempt");
```

#### 8.2 Add Prometheus Metrics
**File:** `backend/src/common/metrics.ts`

```typescript
import { Counter, Histogram, register } from "prom-client";

export const campaignCounter = new Counter({
  name: "track1_campaigns_total",
  help: "Total number of campaigns created",
  labelNames: ["status"]
});

export const attemptDuration = new Histogram({
  name: "track1_attempt_duration_seconds",
  help: "Attempt execution duration",
  labelNames: ["agent_id", "case_id", "status"]
});

// Expose /metrics endpoint
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});
```

#### 8.3 Add OpenTelemetry Tracing
**File:** `backend/src/common/tracing.ts`

```typescript
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { JaegerExporter } from "@opentelemetry/exporter-jaeger";

const provider = new NodeTracerProvider();
provider.addSpanProcessor(new BatchSpanProcessor(new JaegerExporter()));
provider.register();

// Usage
import { trace } from "@opentelemetry/api";

const tracer = trace.getTracer("track1-backend");

const span = tracer.startSpan("processSnapshot");
span.setAttribute("campaign_id", campaignId);
span.setAttribute("attempt_id", attemptId);
// ... processing ...
span.end();
```

---

## Implementation Roadmap

### Phase 4.1: Gateway Integration (Weeks 1-2)
- [ ] Remove `--local` flag from OpenClaw CLI invocation
- [ ] Configure gateway authentication for automated testing
- [ ] Verify plugin loads and hooks fire
- [ ] Test end-to-end snapshot ingestion

**Success Criteria:** Plugin logs show `ingestSnapshot()` calls with valid envelopes.

### Phase 4.2: Backend Migration (Weeks 3-4)
- [ ] Replace minimal backend with TypeScript backend
- [ ] Wire up campaign projector in supervision controller
- [ ] Add SQLite persistence layer
- [ ] Migrate from in-memory Maps to repository pattern

**Success Criteria:** Backend survives restarts without data loss.

### Phase 4.3: Real-Time Observation (Week 5)
- [ ] Implement WebSocket or SSE for campaign events
- [ ] Replace polling with event-driven `awaitAttempt()`
- [ ] Add event service to backend

**Success Criteria:** Attempts complete with <1s latency from terminal state to observation.

### Phase 4.4: Evidence Normalization (Week 6)
- [ ] Parse OpenClaw CLI output or session API
- [ ] Extract policy decisions from agent execution
- [ ] Compute final action and terminal status
- [ ] Update `recordAttempt()` with real data

**Success Criteria:** Campaign evidence export contains valid policy decisions for all attempts.

### Phase 4.5: Frontend Enhancements (Weeks 7-8)
- [ ] Add attempt detail view with policy decisions
- [ ] Add evidence export UI
- [ ] Add real-time campaign status updates

**Success Criteria:** RED phase documentation can be generated from frontend UI.

### Phase 4.6: Production Hardening (Weeks 9-10)
- [ ] Add exponential backoff and circuit breaker
- [ ] Implement structured logging
- [ ] Add Prometheus metrics
- [ ] Add OpenTelemetry tracing
- [ ] Migrate to PostgreSQL

**Success Criteria:** System handles 100+ concurrent campaigns with <1% error rate.

---

## Testing Strategy for Full Implementation

### Unit Tests
- [ ] Campaign projector logic (policy aggregation, terminal state)
- [ ] Snapshot hash calculation and verification
- [ ] Evidence normalization rules
- [ ] Circuit breaker state transitions

### Integration Tests
- [ ] OpenClaw plugin → Backend ingest pipeline
- [ ] Gateway-mediated agent invocation
- [ ] WebSocket/SSE event delivery
- [ ] Database persistence (SQLite and PostgreSQL)

### End-to-End Tests
- [ ] Full campaign execution (9 cases, 2 attempts each)
- [ ] Campaign failure handling
- [ ] Evidence export and validation
- [ ] Frontend display of campaign results

### Performance Tests
- [ ] 100 concurrent campaigns
- [ ] 1000 snapshots/minute ingestion rate
- [ ] <1s latency for attempt observation
- [ ] <100ms p99 latency for supervision API

---

## Conclusion

The current Phase 4 implementation achieves its goal of **demonstrating OpenClaw integration** but leaves significant work for a production-ready supervision platform. The gaps documented here are **not bugs** but **intentional simplifications** made to accelerate initial delivery.

The roadmap above provides a structured path to:
1. **Close architectural gaps** (plugin integration, snapshot ingestion)
2. **Add production requirements** (persistence, observability, error recovery)
3. **Enhance user experience** (real-time updates, evidence export)

**Estimated Effort:** 10 engineering-weeks for full implementation.

**Priority:** High — Required for Phase 5 (RED evidence collection) and beyond.

---

**Document Owner:** AI Agent (Kiro)  
**Review Cadence:** Update after each phase completion  
**Related Documents:**
- `PHASE4_ARCHITECTURE.md` (overview of current implementation)
- `PHASE5_REQUIREMENTS.md` (RED evidence collection requirements)
- `PLUGIN_INTEGRATION_GUIDE.md` (OpenClaw plugin development guide)
