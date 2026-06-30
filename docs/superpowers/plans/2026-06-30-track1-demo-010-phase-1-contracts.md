# Phase 1 Campaign Contracts and Fixed Manifest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:executing-plans` and `superpowers:test-driven-development`.
> Execute only the task explicitly assigned by the user, return its evidence,
> and do not continue automatically.

**Goal:** Establish the immutable nine-case OpenClaw campaign manifest plus
strict shared campaign read and ingest contracts that every later phase must
consume unchanged.

**Architecture:** The fixed manifest is the only report oracle and contains
case hashes, expected actions, agent assignments, and attempt limits. Shared
contracts provide exact-key, content-free DTO normalization; policy code is
permanently prohibited from importing the manifest oracle.

**Tech Stack:** Node.js 22.19+, TypeScript ESM with native type stripping,
`node:test`, SHA-256 from `node:crypto`, YAML workspace parsing, exact
`openclaw@2026.6.10`, exact `typebox@1.1.38`.

---

## Phase Entry Gate

Required accepted input:

- master plan;
- approved REQ-010 spec;
- clean Phase 1 ownership paths;
- preflight baseline recorded.

Run:

```powershell
git status --short
npm.cmd run test:shared
npm.cmd run test:repo
```

Do not edit backend, frontend, or sandbox production files in this phase.

## Task DAG

```mermaid
flowchart LR
  T1["P1-T1: Workspace package and fixed manifest"]
  T2["P1-T2: Campaign summary/read contracts"]
  T3["P1-T3: Attempt/detail/evidence contracts"]
  T4["P1-T4: Lifecycle, snapshot, ack, and evidence ingest contracts"]
  T5["P1-T5: Exports, permanent gates, phase docs"]
  T1 --> T2 --> T3 --> T4 --> T5
```

| Task | Deliverable | Commit |
| --- | --- | --- |
| P1-T1 | integration package pin and exact 3-agent/9-case manifest | `feat(track1): add fixed OpenClaw campaign manifest` |
| P1-T2 | IDs, enums, campaign summary/agent/case DTOs | `feat(shared): add campaign supervision summaries` |
| P1-T3 | attempt, session-ref, detail, evidence DTOs | `feat(shared): add campaign supervision evidence` |
| P1-T4 | lifecycle/snapshot/ack/evidence envelopes and canonical hashing | `feat(shared): add campaign ingest contract` |
| P1-T5 | exports, root registrations, anti-oracle repository gate, docs | `test(track1): gate campaign contracts and manifest` |

## P1-T1: Workspace Package and Fixed Manifest

**Files:**

- Create: `integrations/openclaw/package.json`
- Create: `samples/track1/openclaw/campaign.v1.json`
- Create: `samples/track1/openclaw/campaign.schema.json`
- Create: `tests/repository/track1-openclaw-manifest.spec.ts`
- Modify: `pnpm-workspace.yaml`
- Mechanical: `pnpm-lock.yaml`

### Acceptance

- `integrations/openclaw` is a workspace package.
- Runtime dependencies are pinned exactly to OpenClaw `2026.6.10` and TypeBox
  `1.1.38`.
- The manifest has exactly three fixed agents and nine fixed cases.
- Every case file SHA-256 matches the manifest.
- Expected actions are exactly:
  `deny, deny, allow, deny, ask, deny, ask, deny, allow`.
- `max_attempts` is exactly `2`.

- [ ] **Step 1: Write the repository RED**

Create `tests/repository/track1-openclaw-manifest.spec.ts`:

```ts
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import YAML from "yaml";

const ROOT = new URL("../../", import.meta.url);
const readText = (path: string) =>
  readFileSync(new URL(path, ROOT), "utf8");

const EXPECTED = [
  ["agent:track1:prompt-injection", "T1-SC-001", "T1-SC-001-C001", "deny",
    "ff58240ac3ec34c16e3c3f1d3ffe2d182f56df8942d6eba7c8cf1d121da93c27"],
  ["agent:track1:prompt-injection", "T1-SC-001", "T1-SC-001-C002", "deny",
    "91e89954fa073dfd9eedc0023139f03a0d598174fd13529365d40f40ab5be8da"],
  ["agent:track1:prompt-injection", "T1-SC-001", "T1-SC-001-C003", "allow",
    "665ab3c0c155edd33d1da25089fdc71f502139e0b19be0f259d2a56802dc75e3"],
  ["agent:track1:tool-hijack", "T1-SC-002", "T1-SC-002-C001", "deny",
    "4434309a79c9c0fd66a5e375df6b222990025c2d456e2ec1db757a2da7b214ac"],
  ["agent:track1:tool-hijack", "T1-SC-002", "T1-SC-002-C002", "ask",
    "9c621ec7fa7385c3ba3ded37d9e4f9a4c1ea6a0f9b22f23be7a4f09d2d8eac99"],
  ["agent:track1:tool-hijack", "T1-SC-002", "T1-SC-002-C003", "deny",
    "7b954fa3ecb88d99556338bae19171c0da7fdafe2294486bd0213523f663838a"],
  ["agent:track1:memory-poison", "T1-SC-003", "T1-SC-003-C001", "ask",
    "0f855bcc2204b38d306a854bb625138339b904001e15fdf0542fc1ddd8453a32"],
  ["agent:track1:memory-poison", "T1-SC-003", "T1-SC-003-C002", "deny",
    "42d546f705958a954533556c156b1919821f7f4cc9c585ecb328dd971784e2bf"],
  ["agent:track1:memory-poison", "T1-SC-003", "T1-SC-003-C003", "allow",
    "d254cd494bf2d99fdf4af76aa6c3cba834ff23488f0a2b5fbbfcd8e40b18750a"]
] as const;

test("REQ-T1-DEMO-010 manifest pins workspace and runtime versions", () => {
  const workspace = YAML.parse(readText("pnpm-workspace.yaml"));
  assert.ok(workspace.packages.includes("integrations/*"));

  const pkg = JSON.parse(readText("integrations/openclaw/package.json"));
  assert.equal(pkg.name, "@agent-security-platform/openclaw-integration");
  assert.equal(pkg.private, true);
  assert.equal(pkg.dependencies.openclaw, "2026.6.10");
  assert.equal(pkg.dependencies.typebox, "1.1.38");
});

test("REQ-T1-DEMO-010 manifest fixes three agents and nine cases", () => {
  const manifest = JSON.parse(
    readText("samples/track1/openclaw/campaign.v1.json")
  );
  assert.equal(manifest.schema_version, "track1-openclaw-campaign.v1");
  assert.equal(manifest.max_attempts, 2);
  assert.equal(manifest.agents.length, 3);
  assert.equal(manifest.cases.length, 9);
  assert.deepEqual(
    manifest.cases.map((entry: Record<string, unknown>) => [
      entry.agent_id,
      entry.scenario_id,
      entry.case_id,
      entry.expected_action,
      entry.case_sha256
    ]),
    EXPECTED
  );
});

test("REQ-T1-DEMO-010 manifest hashes every canonical case file", () => {
  const manifest = JSON.parse(
    readText("samples/track1/openclaw/campaign.v1.json")
  );
  for (const entry of manifest.cases) {
    const bytes = readText(entry.case_ref);
    const actual = createHash("sha256").update(bytes).digest("hex");
    assert.equal(actual, entry.case_sha256, entry.case_id);
  }
});
```

- [ ] **Step 2: Verify RED**

Run:

```powershell
node --experimental-strip-types --test tests/repository/track1-openclaw-manifest.spec.ts
```

Expected: FAIL because `integrations/openclaw/package.json` and the fixed
manifest do not exist.

- [ ] **Step 3: Add the exact package and workspace entry**

`integrations/openclaw/package.json`:

```json
{
  "name": "@agent-security-platform/openclaw-integration",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "openclaw": "2026.6.10",
    "typebox": "1.1.38"
  }
}
```

Append `integrations/*` to `pnpm-workspace.yaml` without changing existing
members. Run:

```powershell
corepack pnpm install --lockfile-only
```

- [ ] **Step 4: Add the manifest and strict schema**

Use this exact case matrix in `campaign.v1.json`:

```json
{
  "schema_version": "track1-openclaw-campaign.v1",
  "campaign_name": "Track 1 OpenClaw Security Campaign",
  "max_attempts": 2,
  "agents": [
    {"agent_id": "agent:track1:prompt-injection", "scenario_id": "T1-SC-001"},
    {"agent_id": "agent:track1:tool-hijack", "scenario_id": "T1-SC-002"},
    {"agent_id": "agent:track1:memory-poison", "scenario_id": "T1-SC-003"}
  ],
  "cases": [
    {"agent_id":"agent:track1:prompt-injection","scenario_id":"T1-SC-001","case_id":"T1-SC-001-C001","case_ref":"samples/track1/cases/T1-SC-001/T1-SC-001-C001.json","case_sha256":"ff58240ac3ec34c16e3c3f1d3ffe2d182f56df8942d6eba7c8cf1d121da93c27","expected_action":"deny"},
    {"agent_id":"agent:track1:prompt-injection","scenario_id":"T1-SC-001","case_id":"T1-SC-001-C002","case_ref":"samples/track1/cases/T1-SC-001/T1-SC-001-C002.json","case_sha256":"91e89954fa073dfd9eedc0023139f03a0d598174fd13529365d40f40ab5be8da","expected_action":"deny"},
    {"agent_id":"agent:track1:prompt-injection","scenario_id":"T1-SC-001","case_id":"T1-SC-001-C003","case_ref":"samples/track1/cases/T1-SC-001/T1-SC-001-C003.json","case_sha256":"665ab3c0c155edd33d1da25089fdc71f502139e0b19be0f259d2a56802dc75e3","expected_action":"allow"},
    {"agent_id":"agent:track1:tool-hijack","scenario_id":"T1-SC-002","case_id":"T1-SC-002-C001","case_ref":"samples/track1/cases/T1-SC-002/T1-SC-002-C001.json","case_sha256":"4434309a79c9c0fd66a5e375df6b222990025c2d456e2ec1db757a2da7b214ac","expected_action":"deny"},
    {"agent_id":"agent:track1:tool-hijack","scenario_id":"T1-SC-002","case_id":"T1-SC-002-C002","case_ref":"samples/track1/cases/T1-SC-002/T1-SC-002-C002.json","case_sha256":"9c621ec7fa7385c3ba3ded37d9e4f9a4c1ea6a0f9b22f23be7a4f09d2d8eac99","expected_action":"ask"},
    {"agent_id":"agent:track1:tool-hijack","scenario_id":"T1-SC-002","case_id":"T1-SC-002-C003","case_ref":"samples/track1/cases/T1-SC-002/T1-SC-002-C003.json","case_sha256":"7b954fa3ecb88d99556338bae19171c0da7fdafe2294486bd0213523f663838a","expected_action":"deny"},
    {"agent_id":"agent:track1:memory-poison","scenario_id":"T1-SC-003","case_id":"T1-SC-003-C001","case_ref":"samples/track1/cases/T1-SC-003/T1-SC-003-C001.json","case_sha256":"0f855bcc2204b38d306a854bb625138339b904001e15fdf0542fc1ddd8453a32","expected_action":"ask"},
    {"agent_id":"agent:track1:memory-poison","scenario_id":"T1-SC-003","case_id":"T1-SC-003-C002","case_ref":"samples/track1/cases/T1-SC-003/T1-SC-003-C002.json","case_sha256":"42d546f705958a954533556c156b1919821f7f4cc9c585ecb328dd971784e2bf","expected_action":"deny"},
    {"agent_id":"agent:track1:memory-poison","scenario_id":"T1-SC-003","case_id":"T1-SC-003-C003","case_ref":"samples/track1/cases/T1-SC-003/T1-SC-003-C003.json","case_sha256":"d254cd494bf2d99fdf4af76aa6c3cba834ff23488f0a2b5fbbfcd8e40b18750a","expected_action":"allow"}
  ]
}
```

`campaign.schema.json` must set `additionalProperties: false` at every object,
use `minItems` and `maxItems` of 3 and 9, and close all agent/scenario/action
enums to the values above.

- [ ] **Step 5: Verify GREEN**

Run:

```powershell
node --experimental-strip-types --test tests/repository/track1-openclaw-manifest.spec.ts
```

Expected: 3 tests pass.

- [ ] **Step 6: Commit**

```powershell
git add pnpm-workspace.yaml pnpm-lock.yaml integrations/openclaw/package.json samples/track1/openclaw tests/repository/track1-openclaw-manifest.spec.ts
git commit -m "feat(track1): add fixed OpenClaw campaign manifest"
```

## P1-T2: Campaign Summary and Read Contracts

**Files:**

- Create: `shared/types/campaign-supervision.ts`
- Create: `shared/contracts/campaign-supervision.ts`
- Create: `shared/tests/campaign-supervision-contract.spec.ts`

### Acceptance

- Closed campaign, agent, scenario, action, and status unions.
- Exact summary, agent summary, and case summary normalizers.
- Safe ID and real-calendar timestamp validation.
- Aggregate counters cannot contradict fixed 3-agent/9-case totals.
- Unknown/content-bearing fields are rejected.

- [ ] **Step 1: Write summary RED tests**

Start `shared/tests/campaign-supervision-contract.spec.ts` with:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeTrack1CampaignSummary
} from "../contracts/campaign-supervision.ts";

const VALID_SUMMARY = {
  schema_version: "track1-campaign-read.v1",
  campaign_id: "campaign:t1:0123456789abcdef0123456789abcdef",
  status: "running",
  started_at: "2026-06-30T00:00:00.000Z",
  updated_at: "2026-06-30T00:00:01.000Z",
  agent_count: 3,
  case_count: 9,
  passed_case_count: 1,
  failed_case_count: 0,
  retry_count: 0,
  alert_count: 1,
  blocked_count: 1,
  ask_count: 0,
  evidence_available: false
} as const;

test("REQ-T1-DEMO-010 normalizes a content-free campaign summary", () => {
  const normalized = normalizeTrack1CampaignSummary(VALID_SUMMARY);
  assert.deepEqual(normalized, VALID_SUMMARY);
  assert.notEqual(normalized, VALID_SUMMARY);
});

test("REQ-T1-DEMO-010 rejects unknown summary fields", () => {
  assert.equal(
    normalizeTrack1CampaignSummary({
      ...VALID_SUMMARY,
      raw_prompt: "CAMPAIGN_SUMMARY_SENTINEL"
    }),
    null
  );
});

test("REQ-T1-DEMO-010 rejects impossible counters and calendar dates", () => {
  assert.equal(
    normalizeTrack1CampaignSummary({
      ...VALID_SUMMARY,
      passed_case_count: 10
    }),
    null
  );
  assert.equal(
    normalizeTrack1CampaignSummary({
      ...VALID_SUMMARY,
      updated_at: "2026-02-31T00:00:00.000Z"
    }),
    null
  );
});
```

- [ ] **Step 2: Verify RED**

```powershell
node --experimental-strip-types --test shared/tests/campaign-supervision-contract.spec.ts
```

Expected: FAIL because campaign types and normalizer do not exist.

- [ ] **Step 3: Implement exact types and helpers**

`shared/types/campaign-supervision.ts` must export:

```ts
export const TRACK1_CAMPAIGN_AGENT_IDS = [
  "agent:track1:prompt-injection",
  "agent:track1:tool-hijack",
  "agent:track1:memory-poison"
] as const;

export const TRACK1_CAMPAIGN_STATUSES = [
  "created", "validating", "running", "collecting", "completed", "failed"
] as const;

export const TRACK1_SCENARIO_IDS = [
  "T1-SC-001", "T1-SC-002", "T1-SC-003"
] as const;

export type Track1CampaignAgentId =
  (typeof TRACK1_CAMPAIGN_AGENT_IDS)[number];
export type Track1CampaignStatus =
  (typeof TRACK1_CAMPAIGN_STATUSES)[number];
export type Track1ScenarioId = (typeof TRACK1_SCENARIO_IDS)[number];
export type Track1CaseId =
  | "T1-SC-001-C001" | "T1-SC-001-C002" | "T1-SC-001-C003"
  | "T1-SC-002-C001" | "T1-SC-002-C002" | "T1-SC-002-C003"
  | "T1-SC-003-C001" | "T1-SC-003-C002" | "T1-SC-003-C003";
export type Track1CampaignId = `campaign:t1:${string}`;
export type Track1AttemptId =
  `attempt:${Lowercase<Track1CaseId>}:${1 | 2}`;
export type Track1SessionId = `session:${string}`;
export type Track1TaskId = `task:${string}`;
export type Track1SnapshotId = `snapshot:${string}`;
```

Implement `normalizeTrack1CampaignSummary` field by field. Reuse existing
policy/risk/task unions. Runtime normalizers must enforce exactly 32 lowercase
hex characters for the suffix of campaign/session/task/snapshot IDs, and the
closed case/index grammar for attempt IDs; TypeScript template literals alone
are not validation. IDs are runner-owned and must not contain model/provider
content. Do not spread the input object.

- [ ] **Step 4: Add agent/case summary tests**

Add named tests that reject:

```ts
const makeValidCaseSummary = () => ({
  campaign_id: "campaign:t1:0123456789abcdef0123456789abcdef",
  agent_id: "agent:track1:tool-hijack",
  scenario_id: "T1-SC-002",
  case_id: "T1-SC-002-C002",
  status: "failed",
  expected_action: "ask",
  actual_action: "deny",
  attempt_count: 2,
  current_session_id: "session:0123456789abcdef0123456789abcdef",
  updated_at: "2026-06-30T00:00:01.000Z"
} as const);

test("REQ-T1-DEMO-010 rejects an unknown campaign agent", () => {
  const agent = {
    campaign_id: "campaign:t1:0123456789abcdef0123456789abcdef",
    agent_id: "agent:track1:prompt-injection",
    scenario_id: "T1-SC-001",
    status: "running",
    case_count: 3,
    passed_case_count: 1,
    failed_case_count: 0,
    retry_count: 0,
    alert_count: 1,
    blocked_count: 1,
    ask_count: 0,
    updated_at: "2026-06-30T00:00:01.000Z"
  } as const;
  assert.equal(normalizeTrack1CampaignAgentSummary({
    ...agent,
    agent_id: "agent:track1:unknown"
  }), null);
});

test("REQ-T1-DEMO-010 rejects a case with more than two attempts", () => {
  assert.equal(normalizeTrack1CampaignCaseSummary({
    ...makeValidCaseSummary(),
    attempt_count: 3
  }), null);
});

test("REQ-T1-DEMO-010 rejects expected and actual action outside policy enum", () => {
  assert.equal(normalizeTrack1CampaignCaseSummary({
    ...makeValidCaseSummary(),
    expected_action: "block"
  }), null);
});
```

- [ ] **Step 5: Verify GREEN**

```powershell
node --experimental-strip-types --test shared/tests/campaign-supervision-contract.spec.ts
```

Expected: all summary/agent/case tests pass.

- [ ] **Step 6: Commit**

```powershell
git add shared/types/campaign-supervision.ts shared/contracts/campaign-supervision.ts shared/tests/campaign-supervision-contract.spec.ts
git commit -m "feat(shared): add campaign supervision summaries"
```

## P1-T3: Attempt, Detail, and Evidence Contracts

**Files:**

- Modify: `shared/types/campaign-supervision.ts`
- Modify: `shared/contracts/campaign-supervision.ts`
- Modify: `shared/tests/campaign-supervision-contract.spec.ts`

### Acceptance

- Attempt index is `1 | 2`.
- Detail has exactly three agent groups and nine unique cases.
- Every session ref matches campaign, agent, scenario, case, and attempt.
- Evidence export is deterministic and contains only safe refs.
- `evidence_available=true` requires registered evidence refs.

- [ ] **Step 1: Add detail/evidence RED tests**

Add complete fixture factories and these assertions:

```ts
test("REQ-T1-DEMO-010 accepts exactly three ordered agents and nine cases", () => {
  const detail = makeValidCampaignDetail();
  const normalized = normalizeTrack1CampaignDetail(detail);
  assert.ok(normalized);
  assert.equal(normalized.agents.length, 3);
  assert.equal(
    normalized.agents.flatMap((agent) => agent.cases).length,
    9
  );
});

test("REQ-T1-DEMO-010 rejects duplicate case and session identities", () => {
  const detail = makeValidCampaignDetail();
  detail.agents[1].cases[0].case_id = detail.agents[0].cases[0].case_id;
  assert.equal(normalizeTrack1CampaignDetail(detail), null);
});

test("REQ-T1-DEMO-010 rejects cross-agent attempt correlation", () => {
  const detail = makeValidCampaignDetail();
  detail.agents[1].cases[0].attempts[0].agent_id =
    "agent:track1:prompt-injection";
  assert.equal(normalizeTrack1CampaignDetail(detail), null);
});

test("REQ-T1-DEMO-010 rejects evidence with raw runtime content", () => {
  const evidence = makeValidCampaignEvidence();
  assert.equal(normalizeTrack1CampaignEvidenceExport({
    ...evidence,
    model_output: "CAMPAIGN_EVIDENCE_SENTINEL"
  }), null);
});
```

- [ ] **Step 2: Verify RED**

Run the focused shared test. Expected: FAIL because detail/evidence exports are
missing.

- [ ] **Step 3: Implement closed detail and evidence normalizers**

Required types:

```ts
export interface Track1CampaignAttemptSummary {
  campaign_id: string;
  agent_id: Track1CampaignAgentId;
  scenario_id: Track1ScenarioId;
  case_id: Track1CaseId;
  attempt_id: string;
  attempt_index: 1 | 2;
  session_id: string;
  task_id: string;
  status: "running" | "passed" | "failed";
  actual_action: SandboxPolicyAction | null;
  started_at: string;
  updated_at: string;
}

export interface Track1CampaignEvidenceExport {
  schema_version: "track1-campaign-evidence.v1";
  campaign: Track1CampaignDetail;
  session_evidence_refs: string[];
  artifact_manifest_ref: string;
}
```

Use exact evidence refs:

```text
evidence://track1/campaign/<campaign-hex>/session/<session-hex>
artifact://track1/campaign/<campaign-hex>/manifest
```

Sort agents by the fixed agent order, cases by case ID, and attempts by index.
Reject unsorted caller input rather than silently reordering.

- [ ] **Step 4: Verify GREEN and regressions**

```powershell
node --experimental-strip-types --test shared/tests/campaign-supervision-contract.spec.ts
npm.cmd run test:shared
```

- [ ] **Step 5: Commit**

```powershell
git add shared/types/campaign-supervision.ts shared/contracts/campaign-supervision.ts shared/tests/campaign-supervision-contract.spec.ts
git commit -m "feat(shared): add campaign supervision evidence"
```

## P1-T4: Lifecycle, Snapshot, Ack, and Evidence Ingest Contracts

**Files:**

- Create: `shared/types/campaign-ingest.ts`
- Create: `shared/contracts/campaign-ingest.ts`
- Create: `shared/tests/campaign-ingest-contract.spec.ts`
- Create: `shared/tests/fixtures/campaign-ingest.fixture.ts`

### Acceptance

- Exact start, snapshot, snapshot-ack, finalize, and evidence-registration
  envelope keys.
- Start pins the fixed manifest hash, OpenClaw `2026.6.10`, safe model ref,
  package integrity, campaign ID, and start timestamp.
- Canonical hash excludes only `snapshot_sha256`.
- Hash chain and sequence are structurally valid.
- Snapshot acknowledgement repeats the accepted campaign, attempt, sequence,
  and snapshot hash exactly.
- Finalize requests only `completed` or `failed`; backend validates every
  attempt-local sequence/hash head and remains authoritative.
- Evidence registration contains only manifest hash, safe artifact ref, and
  registration timestamp.
- Result must pass `normalizeBaseResult` and sandbox supervision contracts.
- Raw/content-bearing or unknown fields are rejected.

- [ ] **Step 1: Write ingest RED**

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateTrack1SnapshotSha256,
  normalizeTrack1CampaignEvidenceRegistration,
  normalizeTrack1CampaignFinalizeEnvelope,
  normalizeTrack1CampaignSnapshotAck,
  normalizeTrack1CampaignStartEnvelope,
  normalizeTrack1CampaignSnapshotEnvelope
} from "../contracts/campaign-ingest.ts";
import {
  makeCampaignEvidenceRegistration,
  makeCampaignFinalizeEnvelope,
  makeCampaignSnapshotAck,
  makeCampaignStartEnvelope,
  makeFinishedSandboxResult
} from "./fixtures/campaign-ingest.fixture.ts";

function makeEnvelope() {
  const withoutHash = {
    schema_version: "track1-campaign-snapshot.v1",
    campaign_id: "campaign:t1:0123456789abcdef0123456789abcdef",
    campaign_manifest_sha256: "a".repeat(64),
    agent_id: "agent:track1:prompt-injection",
    scenario_id: "T1-SC-001",
    case_id: "T1-SC-001-C001",
    attempt_id: "attempt:t1-sc-001-c001:1",
    attempt_index: 1,
    sequence: 1,
    previous_snapshot_sha256: null,
    observed_at: "2026-06-30T00:00:01.000Z",
    result: makeFinishedSandboxResult()
  } as const;
  return {
    ...withoutHash,
    snapshot_sha256: calculateTrack1SnapshotSha256(withoutHash)
  };
}

test("REQ-T1-DEMO-010 accepts a canonical hashed snapshot", () => {
  assert.ok(normalizeTrack1CampaignSnapshotEnvelope(makeEnvelope()));
});

test("REQ-T1-DEMO-010 accepts exact campaign lifecycle and evidence envelopes", () => {
  assert.ok(normalizeTrack1CampaignStartEnvelope(makeCampaignStartEnvelope()));
  assert.ok(normalizeTrack1CampaignSnapshotAck(makeCampaignSnapshotAck()));
  assert.ok(normalizeTrack1CampaignFinalizeEnvelope(makeCampaignFinalizeEnvelope()));
  assert.ok(
    normalizeTrack1CampaignEvidenceRegistration(
      makeCampaignEvidenceRegistration()
    )
  );
});

test("REQ-T1-DEMO-010 rejects a forged hash", () => {
  assert.equal(normalizeTrack1CampaignSnapshotEnvelope({
    ...makeEnvelope(),
    snapshot_sha256: "b".repeat(64)
  }), null);
});

test("REQ-T1-DEMO-010 rejects raw content in an envelope", () => {
  assert.equal(normalizeTrack1CampaignSnapshotEnvelope({
    ...makeEnvelope(),
    raw_prompt: "SNAPSHOT_RAW_SENTINEL"
  }), null);
});

test("REQ-T1-DEMO-010 rejects sequence zero and invalid previous hash", () => {
  assert.equal(normalizeTrack1CampaignSnapshotEnvelope({
    ...makeEnvelope(),
    sequence: 0
  }), null);
  assert.equal(normalizeTrack1CampaignSnapshotEnvelope({
    ...makeEnvelope(),
    sequence: 2,
    previous_snapshot_sha256: "not-a-sha256"
  }), null);
});

test("REQ-T1-DEMO-010 rejects lifecycle raw content and correlation drift", () => {
  assert.equal(normalizeTrack1CampaignStartEnvelope({
    ...makeCampaignStartEnvelope(),
    api_key: "INGEST_START_SECRET_SENTINEL"
  }), null);
  assert.equal(normalizeTrack1CampaignSnapshotAck({
    ...makeCampaignSnapshotAck(),
    sequence: 0
  }), null);
  assert.equal(normalizeTrack1CampaignFinalizeEnvelope({
    ...makeCampaignFinalizeEnvelope(),
    requested_status: "running"
  }), null);
  assert.equal(normalizeTrack1CampaignEvidenceRegistration({
    ...makeCampaignEvidenceRegistration(),
    report_body: "INGEST_EVIDENCE_RAW_SENTINEL"
  }), null);
});
```

The fixture must construct a real normalized `BaseResult<SandboxRunResultDetails>`
using existing shared contracts. It may not cast an arbitrary object.

- [ ] **Step 2: Verify RED**

```powershell
node --experimental-strip-types --test shared/tests/campaign-ingest-contract.spec.ts
```

Expected: FAIL because ingest contracts do not exist.

- [ ] **Step 3: Implement canonical hashing and normalization**

Required public types:

```ts
export interface Track1CampaignStartEnvelope {
  schema_version: "track1-campaign-start.v1";
  campaign_id: string;
  campaign_manifest_sha256: string;
  openclaw_version: "2026.6.10";
  openclaw_package_integrity: string;
  model_ref: string;
  started_at: string;
}

export interface Track1CampaignSnapshotAck {
  schema_version: "track1-campaign-snapshot-ack.v1";
  campaign_id: string;
  attempt_id: string;
  sequence: number;
  snapshot_sha256: string;
  accepted_at: string;
}

export interface Track1CampaignFinalizeEnvelope {
  schema_version: "track1-campaign-finalize.v1";
  campaign_id: string;
  requested_status: "completed" | "failed";
  completed_at: string;
}

export interface Track1CampaignEvidenceRegistration {
  schema_version: "track1-campaign-evidence-registration.v1";
  campaign_id: string;
  artifact_manifest_sha256: string;
  artifact_manifest_ref: string;
  registered_at: string;
}
```

Every normalizer enforces exact keys, closed ID/reference/hash/integrity
grammars, real calendar timestamps, and defensive copies. The snapshot-ack
normalizer validates shape; the plugin must additionally compare every
correlation value with its request before treating it as acknowledged.

Canonical hashing:

```ts
export function calculateTrack1SnapshotSha256(
  input: Track1CampaignSnapshotWithoutHash
): string {
  return createHash("sha256")
    .update(`${stableCanonicalJson(input)}\n`, "utf8")
    .digest("hex");
}
```

`stableCanonicalJson` must recursively sort object keys, preserve array order,
reject non-JSON values, and never mutate input. The normalizer recomputes the
hash after every field and nested result validates.

- [ ] **Step 4: Add body-limit metadata constants**

Export:

```ts
export const TRACK1_SNAPSHOT_MAX_BYTES = 2 * 1024 * 1024;
export const TRACK1_LIFECYCLE_MAX_BYTES = 256 * 1024;
```

Add tests for exact boundary and boundary-plus-one byte counts using UTF-8 byte
length, not string length.

- [ ] **Step 5: Verify GREEN**

```powershell
node --experimental-strip-types --test shared/tests/campaign-ingest-contract.spec.ts
npm.cmd run test:shared
```

- [ ] **Step 6: Commit**

```powershell
git add shared/types/campaign-ingest.ts shared/contracts/campaign-ingest.ts shared/tests/campaign-ingest-contract.spec.ts shared/tests/fixtures/campaign-ingest.fixture.ts
git commit -m "feat(shared): add campaign ingest contract"
```

## P1-T5: Exports, Permanent Gates, and Phase Documentation

**Files:**

- Modify: `shared/index.ts`
- Modify: `shared/package.json`
- Modify: `package.json`
- Modify: `tests/repository/root-test-entry.spec.ts`
- Modify: `tests/repository/track1-openclaw-manifest.spec.ts`
- Modify: `docs/progress.md`

### Acceptance

- Shared package and root gates run both new contract suites.
- Root repository gate runs the manifest test.
- Anti-oracle scan prohibits engine/provider/plugin policy files from importing
  the campaign manifest or reading `expected_action`.
- Existing gates remain registered.

- [ ] **Step 1: Add registration and anti-oracle RED**

Add:

```ts
test("REQ-T1-DEMO-010 policy sources cannot import the campaign oracle", () => {
  const forbiddenFiles = [
    "engines/sandbox/src/base-filter/evaluator.ts",
    "engines/sandbox/src/base-filter/provider.ts"
  ];
  for (const file of forbiddenFiles) {
    const source = readText(file);
    assert.doesNotMatch(source, /campaign\.v1|expected_action/);
  }
  const rootPackage = JSON.parse(readText("package.json"));
  assert.match(rootPackage.scripts["test:shared"], /campaign-supervision-contract/);
  assert.match(rootPackage.scripts["test:shared"], /campaign-ingest-contract/);
  assert.match(rootPackage.scripts["test:repo"], /track1-openclaw-manifest/);
});
```

Add root-entry assertions for the same scripts.

- [ ] **Step 2: Verify RED**

Run `npm.cmd run test:repo`. Expected: FAIL because scripts and exports are not
registered.

- [ ] **Step 3: Register exports and scripts**

Export every public constant, type, and normalizer explicitly from
`shared/index.ts`. Append both new shared test files and the repository manifest
test to existing scripts without replacing existing entries.

- [ ] **Step 4: Update progress**

Record actual commit hashes and actual pass counts. Do not claim Phase 1
accepted; use `PHASE_1_COMPLETE_PENDING_REVIEW`.

- [ ] **Step 5: Run phase gate**

```powershell
npm.cmd run test:shared
npm.cmd run test:repo
npm.cmd run test:engine:sandbox
git diff --check
```

Expected: all pass; existing REQ-006/007/008 deterministic demos remain green.

- [ ] **Step 6: Commit**

```powershell
git add shared/index.ts shared/package.json package.json tests/repository/root-test-entry.spec.ts tests/repository/track1-openclaw-manifest.spec.ts docs/progress.md
git commit -m "test(track1): gate campaign contracts and manifest"
```

## Phase 1 Review Checklist

- [ ] Exact OpenClaw and TypeBox pins are locked.
- [ ] Manifest has 3 agents, 9 cases, correct actions, and current case hashes.
- [ ] Public normalizers reject unknown/content fields.
- [ ] Lifecycle, snapshot, acknowledgement, and evidence envelopes are closed.
- [ ] Snapshot self-hash semantics are unambiguous.
- [ ] Policy code cannot read the oracle.
- [ ] Shared/repository/sandbox gates pass.
- [ ] No backend, frontend, or engine behavior was changed.

## Phase 1 Worker Report

Use the master compressed report template and add:

```text
PHASE: 1 Contracts and fixed manifest
MANIFEST:
- agents: 3
- cases: 9
- case hashes: 9/9 verified
- OpenClaw: 2026.6.10 exact
- TypeBox: 1.1.38 exact
CONTRACT TESTS:
- campaign supervision: <actual pass count>
- campaign ingest: <actual pass count>
STATUS: PHASE_1_COMPLETE_PENDING_REVIEW
```
