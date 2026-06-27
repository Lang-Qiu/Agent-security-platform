# Track 1 Sandbox Supervision Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared, runtime-validatable sandbox supervision contract with seven typed event variants, four policy actions, typed alerts and blocking records, and consistency-checked terminal sandbox results.

**Architecture:** `shared/types/sandbox.ts` owns serialized cross-module types and enum constants. `shared/contracts/sandbox.ts` owns record-level normalization and supervision-collection invariants; the existing result normalizer composes those functions and `shared/contracts/result.ts` applies terminal-result requirements. No policy evaluator, backend route, engine execution, or frontend behavior is added.

**Tech Stack:** Node.js 22.17+, TypeScript strict mode, `node:test`, existing shared-contract normalizer pattern, npm workspace scripts.

---

## File Map

### New Files

- `shared/types/sandbox.ts`: enum constants and public sandbox event, decision, alert, and blocking-record types.
- `shared/contracts/sandbox.ts`: runtime record normalizers and complete-supervision invariant validation.
- `shared/tests/sandbox-contract.spec.ts`: focused RED/GREEN contract tests for all new runtime boundaries.

### Modified Files

- `shared/types/result.ts`: replace `alerts?: unknown[]` and add typed supervision collections.
- `shared/utils/normalizers.ts`: compose sandbox record normalizers into `SandboxRunResultDetails`.
- `shared/contracts/result.ts`: require complete supervision data for `finished` and `blocked` sandbox results.
- `shared/tests/result-contract.spec.ts`: replace the legacy alert fixture and test terminal consistency.
- `shared/index.ts`: export sandbox constants, types, and normalizers.
- `shared/package.json`: register the focused sandbox contract test.
- `package.json`: register the focused sandbox contract test in the root shared gate.
- `tests/repository/root-test-entry.spec.ts`: guard test registration.
- `tests/repository/track1-case-set.spec.ts`: verify completed REQ-003 history from the progress archive instead of the active sprint file.
- `docs/architecture.md`: record shared ownership and normalization flow.
- `docs/api-contract.md`: replace the placeholder `block` alert schema with the approved contract.
- `docs/progress.md`: record RED/GREEN evidence and final verification.
- `README.md`: inspect only; change only if its capability summary becomes inaccurate.

## Contract Shapes Used By Every Task

The implementation must use these names consistently:

```typescript
export const SANDBOX_EVENT_TYPES = [
  "model_input",
  "model_output",
  "tool_request",
  "tool_result",
  "policy_decision",
  "memory_write",
  "memory_read"
] as const;

export const SANDBOX_EVENT_SOURCES = [
  "model",
  "agent",
  "tool",
  "policy",
  "memory",
  "monitor"
] as const;

export const SANDBOX_POLICY_ACTIONS = ["allow", "deny", "ask", "alert"] as const;
export const SANDBOX_TOOL_RESULT_STATUSES = ["success", "rejected", "failed"] as const;

export type SandboxEventType = (typeof SANDBOX_EVENT_TYPES)[number];
export type SandboxEventSource = (typeof SANDBOX_EVENT_SOURCES)[number];
export type SandboxPolicyAction = (typeof SANDBOX_POLICY_ACTIONS)[number];
export type SandboxToolResultStatus = (typeof SANDBOX_TOOL_RESULT_STATUSES)[number];
```

Public normalizer signatures:

```typescript
export function normalizeSandboxPolicyDecision(value: unknown): SandboxPolicyDecision | null;
export function normalizeSandboxBehaviorEvent(value: unknown): SandboxBehaviorEvent | null;
export function normalizeSandboxAlert(value: unknown): SandboxAlert | null;
export function normalizeSandboxBlockedRecord(value: unknown): SandboxBlockedRecord | null;
export function satisfiesSandboxSupervisionContract(details: SandboxRunResultDetails): boolean;
```

## Task 0: Restore The Requirement-Lifecycle Repository Baseline

**Files:**
- Modify: `tests/repository/track1-case-set.spec.ts`

- [ ] **Step 1: Preserve the observed RED evidence**

Run:

```powershell
npm.cmd run test:repo
```

Observed baseline: 30 tests pass and `REQ-T1-CASESET-003 documents the schema, case index, and safety boundary` fails because it requires the active `docs/sprint-current.md` to still name completed REQ-003.

- [ ] **Step 2: Point the historical requirement assertion at the progress archive**

Replace:

```typescript
const sprintPath = resolve(repoRoot, "docs/sprint-current.md");
```

with:

```typescript
const progressPath = resolve(repoRoot, "docs/progress.md");
```

In the documentation test, replace:

```typescript
const sprint = readFileSync(sprintPath, "utf8");
assert.ok(sprint.includes("REQ-T1-CASESET-003"));
```

with:

```typescript
const progress = readFileSync(progressPath, "utf8");
assert.ok(
  progress.includes("REQ-T1-CASESET-003"),
  "completed case-set requirement should remain in the progress archive"
);
```

Do not weaken the schema, case index, safety-boundary, manifest, or package-gate assertions.

- [ ] **Step 3: Run the repository gate and verify GREEN**

```powershell
npm.cmd run test:repo
```

Expected: 31 tests PASS.

- [ ] **Step 4: Commit Task 0**

```powershell
git add tests/repository/track1-case-set.spec.ts
git commit -m "test(track1): read completed case set from progress"
```

## Task 1: Event Stream And Policy Decision Records

**Files:**
- Create: `shared/types/sandbox.ts`
- Create: `shared/contracts/sandbox.ts`
- Create: `shared/tests/sandbox-contract.spec.ts`
- Modify: `shared/index.ts`

- [ ] **Step 1: Write the failing test for enums and all seven event variants**

Create `shared/tests/sandbox-contract.spec.ts` with the shared dynamic-import pattern:

```typescript
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const sharedEntrypointPath = resolve(import.meta.dirname, "../index.ts");

type SharedModule = {
  SANDBOX_EVENT_TYPES?: readonly string[];
  SANDBOX_EVENT_SOURCES?: readonly string[];
  SANDBOX_POLICY_ACTIONS?: readonly string[];
  normalizeSandboxBehaviorEvent?: (value: unknown) => unknown;
  normalizeSandboxPolicyDecision?: (value: unknown) => unknown;
};

async function loadSharedModule(): Promise<SharedModule> {
  return import(pathToFileURL(sharedEntrypointPath).href);
}

const decision = {
  decision_id: "decision_001",
  subject_event_id: "event_tool_001",
  policy_id: "policy_tool_target",
  action: "deny",
  reason_code: "target_not_approved",
  reason: "The requested target is outside the approved fixture set",
  evidence_refs: ["evidence://decision/001"],
  decided_at: "2026-06-27T08:00:07Z"
};

const events = [
  {
    event_id: "event_model_input_001",
    session_id: "session_001",
    sequence: 1,
    event_type: "model_input",
    occurred_at: "2026-06-27T08:00:01Z",
    source: "agent",
    scenario_id: "T1-SC-001",
    case_id: "T1-SC-001-C01",
    evidence_refs: ["evidence://model/input/001"],
    payload: {
      model_ref: "model://base/demo",
      content_ref: "fixture://cases/T1-SC-001-C01/input",
      content_sha256: "a".repeat(64),
      summary: "Controlled adversarial input",
      content: "must be stripped"
    }
  },
  {
    event_id: "event_model_output_001",
    session_id: "session_001",
    sequence: 2,
    event_type: "model_output",
    occurred_at: "2026-06-27T08:00:02Z",
    source: "model",
    evidence_refs: ["evidence://model/output/001"],
    payload: {
      model_ref: "model://base/demo",
      content_ref: "fixture://cases/T1-SC-001-C01/output",
      content_sha256: "b".repeat(64)
    }
  },
  {
    event_id: "event_tool_001",
    session_id: "session_001",
    sequence: 3,
    event_type: "tool_request",
    occurred_at: "2026-06-27T08:00:03Z",
    source: "agent",
    evidence_refs: ["evidence://tool/request/001"],
    payload: {
      call_id: "call_001",
      tool_name: "send_email",
      target_ref: "recipient://reviewer@local.invalid",
      arguments_ref: "fixture://cases/T1-SC-002-C01/tool-request"
    }
  },
  {
    event_id: "event_tool_result_001",
    session_id: "session_001",
    sequence: 4,
    event_type: "tool_result",
    occurred_at: "2026-06-27T08:00:04Z",
    source: "tool",
    evidence_refs: ["evidence://tool/result/001"],
    payload: {
      call_id: "call_001",
      tool_name: "send_email",
      status: "rejected",
      result_ref: "evidence://tool/result/001",
      state_change: "none"
    }
  },
  {
    event_id: "event_memory_write_001",
    session_id: "session_001",
    sequence: 5,
    event_type: "memory_write",
    occurred_at: "2026-06-27T08:00:05Z",
    source: "memory",
    evidence_refs: ["evidence://memory/write/001"],
    payload: {
      memory_entry_id: "memory_001",
      content_ref: "fixture://memory/001",
      content_sha256: "c".repeat(64),
      summary: "Controlled memory write"
    }
  },
  {
    event_id: "event_memory_read_001",
    session_id: "session_001",
    sequence: 6,
    event_type: "memory_read",
    occurred_at: "2026-06-27T08:00:06Z",
    source: "memory",
    evidence_refs: ["evidence://memory/read/001"],
    payload: {
      memory_entry_id: "memory_001",
      content_ref: "fixture://memory/001",
      content_sha256: "c".repeat(64)
    }
  },
  {
    event_id: "event_decision_001",
    session_id: "session_001",
    sequence: 7,
    event_type: "policy_decision",
    occurred_at: "2026-06-27T08:00:07Z",
    source: "policy",
    evidence_refs: ["evidence://decision/001"],
    payload: decision
  }
] as const;

test("REQ-T1-SANDBOX-CONTRACT-005 exports the closed event and action enums", async () => {
  const shared = await loadSharedModule();

  assert.deepEqual(shared.SANDBOX_EVENT_TYPES, [
    "model_input",
    "model_output",
    "tool_request",
    "tool_result",
    "policy_decision",
    "memory_write",
    "memory_read"
  ]);
  assert.deepEqual(shared.SANDBOX_EVENT_SOURCES, [
    "model",
    "agent",
    "tool",
    "policy",
    "memory",
    "monitor"
  ]);
  assert.deepEqual(shared.SANDBOX_POLICY_ACTIONS, ["allow", "deny", "ask", "alert"]);
});

test("REQ-T1-SANDBOX-CONTRACT-005 normalizes all seven typed event variants", async () => {
  const shared = await loadSharedModule();

  const normalized = events.map((event) => shared.normalizeSandboxBehaviorEvent?.(event));

  assert.equal(normalized.length, 7);
  assert.ok(normalized.every((event) => event !== null && event !== undefined));
  assert.equal(
    Object.hasOwn((normalized[0] as { payload: object }).payload, "content"),
    false,
    "raw model content must not cross the shared boundary"
  );
  assert.deepEqual(shared.normalizeSandboxPolicyDecision?.(decision), decision);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --experimental-strip-types --experimental-test-isolation=none --test shared/tests/sandbox-contract.spec.ts
```

Expected: FAIL because `SANDBOX_EVENT_TYPES`, `SANDBOX_POLICY_ACTIONS`, and the normalizer exports do not exist.

- [ ] **Step 3: Add the minimal public type contract**

Create `shared/types/sandbox.ts` with:

```typescript
import type { RiskLevel } from "./task.ts";

export const SANDBOX_EVENT_TYPES = [
  "model_input",
  "model_output",
  "tool_request",
  "tool_result",
  "policy_decision",
  "memory_write",
  "memory_read"
] as const;

export const SANDBOX_EVENT_SOURCES = ["model", "agent", "tool", "policy", "memory", "monitor"] as const;
export const SANDBOX_POLICY_ACTIONS = ["allow", "deny", "ask", "alert"] as const;
export const SANDBOX_TOOL_RESULT_STATUSES = ["success", "rejected", "failed"] as const;

export type SandboxEventType = (typeof SANDBOX_EVENT_TYPES)[number];
export type SandboxEventSource = (typeof SANDBOX_EVENT_SOURCES)[number];
export type SandboxPolicyAction = (typeof SANDBOX_POLICY_ACTIONS)[number];
export type SandboxToolResultStatus = (typeof SANDBOX_TOOL_RESULT_STATUSES)[number];

export interface SandboxPolicyDecision {
  decision_id: string;
  subject_event_id: string;
  policy_id: string;
  action: SandboxPolicyAction;
  reason_code: string;
  reason: string;
  evidence_refs: string[];
  decided_at: string;
}

export interface SandboxModelContentPayload {
  model_ref: string;
  content_ref: string;
  content_sha256: string;
  summary?: string;
}

export interface SandboxToolRequestPayload {
  call_id: string;
  tool_name: string;
  target_ref: string;
  arguments_ref: string;
}

export interface SandboxToolResultPayload {
  call_id: string;
  tool_name: string;
  status: SandboxToolResultStatus;
  result_ref: string;
  state_change: string;
}

export interface SandboxMemoryPayload {
  memory_entry_id: string;
  content_ref: string;
  content_sha256: string;
  summary?: string;
}

export interface SandboxEventEnvelope<TType extends SandboxEventType, TPayload> {
  event_id: string;
  session_id: string;
  sequence: number;
  event_type: TType;
  occurred_at: string;
  source: SandboxEventSource;
  scenario_id?: string;
  case_id?: string;
  evidence_refs: string[];
  payload: TPayload;
}

export type SandboxBehaviorEvent =
  | SandboxEventEnvelope<"model_input", SandboxModelContentPayload>
  | SandboxEventEnvelope<"model_output", SandboxModelContentPayload>
  | SandboxEventEnvelope<"tool_request", SandboxToolRequestPayload>
  | SandboxEventEnvelope<"tool_result", SandboxToolResultPayload>
  | SandboxEventEnvelope<"policy_decision", SandboxPolicyDecision>
  | SandboxEventEnvelope<"memory_write", SandboxMemoryPayload>
  | SandboxEventEnvelope<"memory_read", SandboxMemoryPayload>;

export interface SandboxAlert {
  alert_id: string;
  subject_event_id: string;
  decision_id: string;
  risk_level: RiskLevel;
  category: string;
  title: string;
  reason: string;
  evidence_refs: string[];
  occurred_at: string;
}

export interface SandboxBlockedRecord {
  blocked_record_id: string;
  subject_event_id: string;
  decision_id: string;
  resource_ref?: string;
  reason: string;
  evidence_refs: string[];
  occurred_at: string;
}
```

- [ ] **Step 4: Implement only decision and event normalization**

Create `shared/contracts/sandbox.ts`. Use `isPlainObject`, `isOneOf`, `isString`, and `isStringArray` from `shared/utils/guards.ts`. Implement these private checks:

```typescript
const ISO_8601_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.trim().length > 0;
}

function isIso8601(value: unknown): value is string {
  return isString(value) && ISO_8601_PATTERN.test(value) && Number.isFinite(Date.parse(value));
}

function hasOptionalNonEmptyString(value: Record<string, unknown>, key: string): boolean {
  return !(key in value) || isNonEmptyString(value[key]);
}
```

`normalizeSandboxPolicyDecision` must require every declared field, restrict `action` with `SANDBOX_POLICY_ACTIONS`, validate `decided_at`, clone `evidence_refs`, and strip undeclared fields.

`normalizeSandboxBehaviorEvent` must:

1. Validate the common envelope and optional scenario/case IDs.
2. Require a positive integer `sequence`.
3. Select one payload normalizer through an exhaustive `switch (value.event_type)`.
4. Validate `content_sha256` with `SHA256_PATTERN`.
5. Restrict tool-result status with `SANDBOX_TOOL_RESULT_STATUSES`.
6. Return only declared envelope and payload fields.

Add to `shared/index.ts`:

```typescript
export * from "./contracts/sandbox.ts";
export * from "./types/sandbox.ts";
```

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```powershell
node --experimental-strip-types --experimental-test-isolation=none --test shared/tests/sandbox-contract.spec.ts
```

Expected: 2 tests PASS.

- [ ] **Step 6: Commit Task 1**

```powershell
git add shared/types/sandbox.ts shared/contracts/sandbox.ts shared/tests/sandbox-contract.spec.ts shared/index.ts
git commit -m "feat(shared): add sandbox behavior event contract"
```

## Task 2: Alerts, Blocking Records, And Invalid Record Rejection

**Files:**
- Modify: `shared/contracts/sandbox.ts`
- Modify: `shared/tests/sandbox-contract.spec.ts`

- [ ] **Step 1: Add failing tests for all policy actions and typed outcome records**

Extend `SharedModule` with:

```typescript
normalizeSandboxAlert?: (value: unknown) => unknown;
normalizeSandboxBlockedRecord?: (value: unknown) => unknown;
```

Add:

```typescript
test("REQ-T1-SANDBOX-CONTRACT-005 accepts only the four approved policy actions", async () => {
  const shared = await loadSharedModule();

  for (const action of ["allow", "deny", "ask", "alert"]) {
    assert.equal(
      (shared.normalizeSandboxPolicyDecision?.({ ...decision, action }) as { action?: string })?.action,
      action
    );
  }

  assert.equal(shared.normalizeSandboxPolicyDecision?.({ ...decision, action: "block" }), null);
});

test("REQ-T1-SANDBOX-CONTRACT-005 normalizes typed alert and blocking records", async () => {
  const shared = await loadSharedModule();

  assert.deepEqual(
    shared.normalizeSandboxAlert?.({
      alert_id: "alert_001",
      subject_event_id: "event_tool_001",
      decision_id: "decision_alert_001",
      risk_level: "high",
      category: "tool_target",
      title: "Tool target requires attention",
      reason: "Target differs from the approved case fixture",
      evidence_refs: ["evidence://alert/001"],
      occurred_at: "2026-06-27T08:00:08Z",
      raw_prompt: "must be stripped"
    }),
    {
      alert_id: "alert_001",
      subject_event_id: "event_tool_001",
      decision_id: "decision_alert_001",
      risk_level: "high",
      category: "tool_target",
      title: "Tool target requires attention",
      reason: "Target differs from the approved case fixture",
      evidence_refs: ["evidence://alert/001"],
      occurred_at: "2026-06-27T08:00:08Z"
    }
  );

  assert.deepEqual(
    shared.normalizeSandboxBlockedRecord?.({
      blocked_record_id: "blocked_001",
      subject_event_id: "event_tool_001",
      decision_id: "decision_001",
      resource_ref: "recipient://reviewer@local.invalid",
      reason: "Policy denied the target",
      evidence_refs: ["evidence://blocked/001"],
      occurred_at: "2026-06-27T08:00:08Z"
    }),
    {
      blocked_record_id: "blocked_001",
      subject_event_id: "event_tool_001",
      decision_id: "decision_001",
      resource_ref: "recipient://reviewer@local.invalid",
      reason: "Policy denied the target",
      evidence_refs: ["evidence://blocked/001"],
      occurred_at: "2026-06-27T08:00:08Z"
    }
  );
});
```

- [ ] **Step 2: Add a table-driven failing test for malformed records**

```typescript
test("REQ-T1-SANDBOX-CONTRACT-005 rejects malformed event and outcome records", async () => {
  const shared = await loadSharedModule();
  const invalidEvents = [
    { ...events[0], sequence: 0 },
    { ...events[0], sequence: 1.5 },
    { ...events[0], occurred_at: "not-a-timestamp" },
    { ...events[0], event_type: "command_execution" },
    { ...events[0], source: "unknown" },
    { ...events[0], payload: { ...events[0].payload, content_sha256: "not-sha256" } }
  ];

  for (const event of invalidEvents) {
    assert.equal(shared.normalizeSandboxBehaviorEvent?.(event), null);
  }

  assert.equal(
    shared.normalizeSandboxAlert?.({
      alert_id: "legacy_alert",
      event_type: "command_execution",
      action: "block",
      resource: "powershell",
      timestamp: "2026-06-27T08:00:08Z",
      reason: "legacy",
      risk_level: "critical"
    }),
    null
  );
  assert.equal(
    shared.normalizeSandboxBlockedRecord?.({
      blocked_record_id: "blocked_001",
      subject_event_id: "event_tool_001",
      decision_id: "decision_001",
      reason: "Policy denied the target",
      evidence_refs: [],
      occurred_at: "invalid"
    }),
    null
  );
});
```

- [ ] **Step 3: Run the focused test and verify RED**

Run the same direct test command.

Expected: the alert/block test FAILS because both new normalizers are still undefined.

- [ ] **Step 4: Implement minimal alert and blocking-record normalizers**

In `shared/contracts/sandbox.ts`:

- Validate alert `risk_level` with `RISK_LEVELS`.
- Require all alert fields and clone `evidence_refs`.
- Require all blocking-record fields except `resource_ref`.
- Reject a present but empty/invalid `resource_ref`.
- Validate both timestamps with `isIso8601`.
- Return newly constructed objects so legacy and raw fields are stripped.

The implementations must have these exact result shapes:

```typescript
const normalizedAlert: SandboxAlert = {
  alert_id: value.alert_id,
  subject_event_id: value.subject_event_id,
  decision_id: value.decision_id,
  risk_level: value.risk_level,
  category: value.category,
  title: value.title,
  reason: value.reason,
  evidence_refs: [...value.evidence_refs],
  occurred_at: value.occurred_at
};

const normalizedBlockedRecord: SandboxBlockedRecord = {
  blocked_record_id: value.blocked_record_id,
  subject_event_id: value.subject_event_id,
  decision_id: value.decision_id,
  reason: value.reason,
  evidence_refs: [...value.evidence_refs],
  occurred_at: value.occurred_at
};
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Expected: 5 tests PASS.

- [ ] **Step 6: Commit Task 2**

```powershell
git add shared/contracts/sandbox.ts shared/tests/sandbox-contract.spec.ts
git commit -m "feat(shared): add sandbox policy outcome records"
```

## Task 3: Complete Sandbox Result Projection And Invariants

**Files:**
- Modify: `shared/types/result.ts`
- Modify: `shared/contracts/sandbox.ts`
- Modify: `shared/utils/normalizers.ts`
- Modify: `shared/contracts/result.ts`
- Modify: `shared/tests/result-contract.spec.ts`
- Modify: `shared/tests/sandbox-contract.spec.ts`

- [ ] **Step 1: Replace the legacy positive sandbox result test with a complete typed fixture**

In `shared/tests/result-contract.spec.ts`, replace the existing sandbox test input with a `blocked` result containing:

```typescript
details: {
  session_id: "session_001",
  events: [
    {
      event_id: "event_tool_001",
      session_id: "session_001",
      sequence: 1,
      event_type: "tool_request",
      occurred_at: "2026-06-27T08:00:01Z",
      source: "agent",
      evidence_refs: ["evidence://tool/request/001"],
      payload: {
        call_id: "call_001",
        tool_name: "send_email",
        target_ref: "recipient://outside.example",
        arguments_ref: "fixture://cases/T1-SC-002-C01/tool-request"
      }
    },
    {
      event_id: "event_decision_001",
      session_id: "session_001",
      sequence: 2,
      event_type: "policy_decision",
      occurred_at: "2026-06-27T08:00:02Z",
      source: "policy",
      evidence_refs: ["evidence://decision/001"],
      payload: {
        decision_id: "decision_001",
        subject_event_id: "event_tool_001",
        policy_id: "policy_tool_target",
        action: "deny",
        reason_code: "target_not_approved",
        reason: "Target is outside the approved fixture set",
        evidence_refs: ["evidence://decision/001"],
        decided_at: "2026-06-27T08:00:02Z"
      }
    }
  ],
  policy_decisions: [
    {
      decision_id: "decision_001",
      subject_event_id: "event_tool_001",
      policy_id: "policy_tool_target",
      action: "deny",
      reason_code: "target_not_approved",
      reason: "Target is outside the approved fixture set",
      evidence_refs: ["evidence://decision/001"],
      decided_at: "2026-06-27T08:00:02Z"
    }
  ],
  alerts: [],
  blocked_records: [
    {
      blocked_record_id: "blocked_001",
      subject_event_id: "event_tool_001",
      decision_id: "decision_001",
      resource_ref: "recipient://outside.example",
      reason: "Policy denied the target",
      evidence_refs: ["evidence://blocked/001"],
      occurred_at: "2026-06-27T08:00:02Z"
    }
  ],
  blocked: true,
  event_count: 2,
  engine_private_event_stream: ["must be stripped"]
}
```

Assert the normalized result contains every declared field and omits `engine_private_event_stream`.

- [ ] **Step 2: Add failing terminal-result invariant tests**

Add one table-driven test that starts from the valid fixture and verifies `normalizeBaseResult` returns `null` for:

```typescript
const invalidDetailOverrides = [
  { event_count: 3 },
  { blocked: false },
  { events: validDetails.events.map((event, index) => ({ ...event, sequence: index === 1 ? 1 : event.sequence })) },
  { events: validDetails.events.map((event, index) => ({ ...event, event_id: index === 1 ? "event_tool_001" : event.event_id })) },
  { events: validDetails.events.map((event, index) => ({ ...event, session_id: index === 0 ? "other_session" : event.session_id })) },
  { policy_decisions: [{ ...validDetails.policy_decisions[0], subject_event_id: "missing_event" }] },
  { policy_decisions: [{ ...validDetails.policy_decisions[0], action: "alert" }] },
  { blocked_records: [{ ...validDetails.blocked_records[0], decision_id: "missing_decision" }] },
  { blocked_records: [] }
];
```

Add explicit tests that a terminal result missing `events`, `policy_decisions`, `alerts`, or `blocked_records` is rejected, while the existing pending backend shell remains accepted:

```typescript
assert.notEqual(
  sharedModule.normalizeBaseResult?.({
    task_id: "task_pending_001",
    task_type: "sandbox_run",
    engine_type: "sandbox",
    status: "pending",
    risk_level: "info",
    summary: "Sandbox task pending",
    details: { session_id: "session_pending", alerts: [], blocked: false },
    created_at: "2026-06-27T08:00:00Z",
    updated_at: "2026-06-27T08:00:00Z"
  }),
  null
);
```

Add one complete `alert` fixture whose policy event and materialized decision both use `action: "alert"`, then assert the result is rejected when `alerts: []`:

```typescript
const alertDecision = {
  ...validDetails.policy_decisions[0],
  decision_id: "decision_alert_001",
  action: "alert"
};
const alertEvents = validDetails.events.map((event) =>
  event.event_type === "policy_decision"
    ? {
        ...event,
        payload: alertDecision
      }
    : event
);

assert.equal(
  sharedModule.normalizeBaseResult?.({
    ...validSandboxResult,
    status: "finished",
    details: {
      ...validDetails,
      events: alertEvents,
      policy_decisions: [alertDecision],
      alerts: [],
      blocked_records: [],
      blocked: false
    }
  }),
  null
);
```

This directly proves that an alert action cannot pass through merely because its event/decision views agree.

- [ ] **Step 3: Run result tests and verify RED**

Run:

```powershell
node --experimental-strip-types --experimental-test-isolation=none --test shared/tests/result-contract.spec.ts
```

Expected: FAIL because the new fields are stripped and invalid terminal relationships are not rejected.

- [ ] **Step 4: Add typed result fields and array normalization**

Update `shared/types/result.ts`:

```typescript
import type {
  SandboxAlert,
  SandboxBehaviorEvent,
  SandboxBlockedRecord,
  SandboxPolicyDecision
} from "./sandbox.ts";

export interface SandboxRunResultDetails {
  session_id?: string;
  target?: TaskTarget;
  events?: SandboxBehaviorEvent[];
  policy_decisions?: SandboxPolicyDecision[];
  alerts?: SandboxAlert[];
  blocked_records?: SandboxBlockedRecord[];
  blocked?: boolean;
  event_count?: number;
}
```

In `shared/utils/normalizers.ts`, import the four record normalizers. For each present collection:

1. Require an array.
2. Normalize every member.
3. Return `null` when any member is invalid.
4. Assign the fully normalized array, including empty arrays.

Retain pending-shell compatibility by allowing collections to be absent. Do not convert malformed fields into empty collections.

- [ ] **Step 5: Implement complete-supervision invariants**

In `shared/contracts/sandbox.ts`, add `satisfiesSandboxSupervisionContract`. It must return `false` unless all complete-supervision fields exist, then verify:

```typescript
const eventIds = new Set(details.events.map((event) => event.event_id));
const decisionById = new Map(details.policy_decisions.map((decision) => [decision.decision_id, decision]));
const policyEventByDecisionId = new Map(
  details.events
    .filter((event) => event.event_type === "policy_decision")
    .map((event) => [event.payload.decision_id, event.payload])
);

const hasUniqueEventIds = eventIds.size === details.events.length;
const hasUniqueSequences =
  new Set(details.events.map((event) => event.sequence)).size === details.events.length;
const hasStrictOrder = details.events.every(
  (event, index) => index === 0 || event.sequence > details.events[index - 1].sequence
);
```

Also verify:

- every event session equals `details.session_id`;
- decision IDs, alert IDs, and blocking-record IDs are unique;
- every decision subject exists;
- policy decision events and `policy_decisions` are one-to-one and field-equal;
- every alert resolves to an `alert` decision and the same subject event;
- every blocking record resolves to a `deny` decision and the same subject event;
- every `alert` decision has at least one alert;
- every `deny` decision has at least one blocking record;
- `event_count === events.length`;
- `blocked === (blocked_records.length > 0)`.

Use a field-by-field decision equality helper rather than JSON stringification.

- [ ] **Step 6: Enforce terminal completeness in the outer result contract**

In `shared/contracts/result.ts`:

```typescript
import { satisfiesSandboxSupervisionContract } from "./sandbox.ts";
import type {
  BaseResult,
  ResultDetails,
  SandboxRunResultDetails,
  StaticAnalysisResultDetails
} from "../types/result.ts";

function isTerminalSandboxStatus(status: string): boolean {
  return status === "finished" || status === "blocked";
}
```

After details normalization:

```typescript
if (
  value.task_type === "sandbox_run" &&
  isTerminalSandboxStatus(value.status) &&
  !satisfiesSandboxSupervisionContract(normalizedDetails as SandboxRunResultDetails)
) {
  return null;
}
```

When all supervision collections are present on a non-terminal result, also reject them if `satisfiesSandboxSupervisionContract` returns false. Keep the existing partial pending shell valid.

- [ ] **Step 7: Run focused shared tests and verify GREEN**

Run:

```powershell
node --experimental-strip-types --experimental-test-isolation=none --test shared/tests/sandbox-contract.spec.ts shared/tests/result-contract.spec.ts
```

Expected: all sandbox and result contract tests PASS.

- [ ] **Step 8: Run backend integration tests for pending-shell compatibility**

Run:

```powershell
npm.cmd run test:backend
```

Expected: sandbox task integration tests remain green. The pre-existing unrelated asset-scan expectation in `backend/tests/task-engine.service.spec.ts` may remain the only failure; do not change it in this requirement.

- [ ] **Step 9: Commit Task 3**

```powershell
git add shared/types/result.ts shared/contracts/sandbox.ts shared/utils/normalizers.ts shared/contracts/result.ts shared/tests/result-contract.spec.ts shared/tests/sandbox-contract.spec.ts
git commit -m "feat(shared): validate sandbox supervision results"
```

## Task 4: Register The Shared Contract Quality Gate

**Files:**
- Modify: `tests/repository/root-test-entry.spec.ts`
- Modify: `package.json`
- Modify: `shared/package.json`

- [ ] **Step 1: Write the failing repository gate test**

Extend `tests/repository/root-test-entry.spec.ts` to read both package files and assert:

```typescript
assert.match(
  scripts["test:shared"] ?? "",
  /\bshared\/tests\/sandbox-contract\.spec\.ts\b/,
  "test:shared should include sandbox supervision contract coverage"
);

const sharedPackageJson = JSON.parse(
  readFileSync(new URL("../../shared/package.json", import.meta.url), "utf8")
) as { scripts?: Record<string, string> };

assert.match(
  sharedPackageJson.scripts?.test ?? "",
  /\btests\/sandbox-contract\.spec\.ts\b/,
  "the shared package test should include sandbox supervision contract coverage"
);
```

- [ ] **Step 2: Run the repository test and verify RED**

Run:

```powershell
node --experimental-strip-types --experimental-test-isolation=none --test tests/repository/root-test-entry.spec.ts
```

Expected: FAIL because neither script includes `sandbox-contract.spec.ts`.

- [ ] **Step 3: Register the test in both package scripts**

Append `shared/tests/sandbox-contract.spec.ts` to root `test:shared` and `tests/sandbox-contract.spec.ts` to `shared/package.json`'s `test`, preserving the existing test order.

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
node --experimental-strip-types --experimental-test-isolation=none --test tests/repository/root-test-entry.spec.ts
npm.cmd run test:shared
npm.cmd run test:repo
```

Expected: all three commands PASS.

- [ ] **Step 5: Commit Task 4**

```powershell
git add tests/repository/root-test-entry.spec.ts package.json shared/package.json
git commit -m "test(shared): gate sandbox supervision contract"
```

## Task 5: Document The Contract And Verify The Requirement

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/api-contract.md`
- Modify: `docs/progress.md`
- Inspect: `README.md`

- [ ] **Step 1: Run the complete requirement verification set**

Run each command separately:

```powershell
npm.cmd run test:shared
npm.cmd run test:repo
npm.cmd run test:engine:sandbox
npm.cmd run test:backend
npm.cmd run test:frontend
npm.cmd run test
```

Expected:

- shared, repository, sandbox-engine, and frontend suites PASS;
- backend sandbox coverage remains green;
- the known unrelated asset-scan expectation drift may remain the only backend/full-gate failure;
- no REQ-005 test fails.

- [ ] **Step 2: Update architecture ownership and flow**

Add a `Track 1 sandbox supervision contract` subsection to `docs/architecture.md` stating:

- `shared/types/sandbox.ts` is the cross-module source of truth;
- `shared/contracts/sandbox.ts` strips private/raw values and validates record relationships;
- sandbox engines produce decisions but shared code never chooses policy actions;
- the canonical event stream feeds replay, monitoring, backend normalization, UI, and reports;
- simulated-tool safety rejection is not a policy decision.

- [ ] **Step 3: Replace the public sandbox placeholder contract**

Update `docs/api-contract.md` sections describing sandbox details and `SandboxAlert`:

- list `events`, `policy_decisions`, `alerts`, and `blocked_records`;
- document all seven event types and common envelope fields;
- document the four action semantics;
- replace `action: "block"` with a `deny` decision plus linked blocking record;
- state that terminal `finished`/`blocked` results require complete collections;
- state that raw content is represented through references, summaries, and SHA-256 digests;
- include one compact JSON example matching the positive test fixture.

- [ ] **Step 4: Record progress and README decision**

Prepend a REQ-005 entry to `docs/progress.md` with:

- requirement ID and completed scope;
- files added and modified;
- RED evidence from focused event, result, and gate tests;
- GREEN verification commands and outcomes;
- the known unrelated backend baseline failure, if still present;
- explicit exclusions: policy evaluator, replay, monitoring plugin, backend route, frontend UI.

Inspect `README.md`. Leave it unchanged if it does not promise a sandbox contract shape; record that check in the progress entry.

- [ ] **Step 5: Review documentation consistency**

Run:

```powershell
rg -n 'action.*block|command_execution|alerts\\?: unknown\\[\\]' docs/api-contract.md shared
git diff --check
```

Expected: no legacy sandbox contract matches and no whitespace errors.

- [ ] **Step 6: Commit Task 5**

```powershell
git add docs/architecture.md docs/api-contract.md docs/progress.md
git commit -m "docs(track1): document sandbox supervision contract"
```

## Task 6: Closing Review And Stop

**Files:**
- Review only: all REQ-005 commits and changed files

- [ ] **Step 1: Run a requirement-focused code review**

Use `$code-reviewer` against the diff from commit `43c7fea` through `HEAD`. Check:

- correctness of cross-record validation;
- no raw sensitive content survives normalization;
- no policy evaluator or engine behavior slipped into scope;
- terminal versus pending compatibility;
- public exports and test-gate registration;
- test quality and missing edge cases;
- API documentation matches the implementation.

- [ ] **Step 2: Address only verified REQ-005 findings with TDD**

For any behavioral finding, add a focused failing test, observe RED, make the smallest fix, and rerun the focused suite. Do not fix the unrelated asset-scan baseline in this requirement.

- [ ] **Step 3: Re-run final evidence commands**

```powershell
npm.cmd run test:shared
npm.cmd run test:repo
npm.cmd run test:engine:sandbox
git status --short
```

Expected: all focused gates PASS and the worktree is clean after the final commit.

- [ ] **Step 4: Stop and report**

Report:

1. modified files;
2. tests added;
3. RED and GREEN evidence;
4. full-gate result including any unrelated baseline failure;
5. whether `REQ-T1-SANDBOX-CONTRACT-005` is complete;
6. suggested commit message or the commits already created.

Do not begin `REQ-T1-ATTACK-REPLAY-006`.
