# Phase 4 Real OpenClaw Runtime Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:executing-plans` and `superpowers:test-driven-development`.
> Execute only the task explicitly assigned by the user, return its evidence,
> and do not continue automatically.

**Goal:** Add a fixed-manifest campaign runner and pinned Docker Compose
environment that can execute the real OpenClaw runtime without exposing
arbitrary commands, paths, tools, model fallbacks, or host-persisted
transcripts.

**Architecture:** The runner is a deterministic state machine over injected
runtime ports. Production ports invoke fixed Docker/OpenClaw/backend commands
with argument arrays and safe result projections. Unit and offline integration
tests use recording ports; an offline container gate starts the exact
OpenClaw package and native plugin but never calls a cloud model. Credentialed
campaign execution remains a Phase 7 gate.

**Tech Stack:** TypeScript ESM, Node.js 22.17+, `node:test`, Docker Compose v2,
exact `openclaw@2026.6.10`, native `spawn` without a shell, existing Phase 1
manifest/contracts, Phase 2 internal ingest, Phase 3 native plugin.

---

## Phase Entry Gate

Phases 1, 2, and 3 must be accepted:

```powershell
npm.cmd run test:shared
npm.cmd run test:backend
npm.cmd run test:engine:sandbox
npm.cmd run test:integration:openclaw
npm.cmd run test:repo
git status --short
```

Capture the existing REQ-007 and REQ-008 demo SHA-256 values. Record unrelated
dirty files and do not stage them.

## Task DAG

```mermaid
flowchart LR
  T1["P4-T1: Environment and preflight"]
  T2["P4-T2: Input-only prompt compiler"]
  T3["P4-T3: Fixed OpenClaw command port"]
  T4["P4-T4: Campaign execution state machine"]
  T5["P4-T5: One-retry and finalize semantics"]
  T6["P4-T6: Safety configuration and pinned images"]
  T7["P4-T7: Compose topology"]
  T8["P4-T8: Offline runtime gate and docs"]
  T1 --> T4
  T2 --> T3 --> T4 --> T5
  T6 --> T7
  T5 --> T8
  T7 --> T8
```

| Task | Deliverable | Commit |
| --- | --- | --- |
| P4-T1 | strict cloud/runtime configuration and fail-fast preflight | `feat(track1): validate OpenClaw campaign environment` |
| P4-T2 | hash-verified input-only case prompt compiler | `feat(track1): compile oracle-free case prompts` |
| P4-T3 | shell-free fixed OpenClaw CLI command port | `feat(track1): add fixed OpenClaw command port` |
| P4-T4 | three-agent/nine-case campaign state machine | `feat(track1): orchestrate OpenClaw campaign` |
| P4-T5 | one audited retry and strict terminal finalization | `feat(track1): enforce campaign retry semantics` |
| P4-T6 | closed OpenClaw agent config and digest-pinned image | `build(track1): pin OpenClaw safety runtime` |
| P4-T7 | isolated Compose topology and health checks | `build(track1): compose OpenClaw demo runtime` |
| P4-T8 | ordinary offline runtime gate, scripts, and docs | `test(track1): gate offline OpenClaw runtime` |

## Cross-Task Invariants

- The runner accepts no command-line arguments.
- Manifest path, plugin path, report path, agent IDs, case order, tool names,
  backend endpoint, and Compose file are constants.
- Full canonical case files and `expected_outcome` never enter OpenClaw; only
  the hash-verified input-only envelope from P4-T2 is written to tmpfs.
- `OPENCLAW_MODEL_BASE_URL` is HTTPS, credential-free, query-free, and
  fragment-free.
- There is no local, fake, embedded, or automatic fallback model.
- `spawn` is always called with `shell: false` and a fixed executable plus
  argument array.
- OpenClaw session keys and attempt IDs are runner-generated closed IDs.
- Raw stdout/stderr/model output is drained transiently and never logged,
  returned from a production port, stored, or embedded in an exception.
- Every retry uses a new attempt ID, session key, and simulated state.
- At most one retry is possible.
- Phase 4 offline gates make zero cloud-model requests.

## Shared Runner Test Fixture

Create in P4-T1:

```text
tests/track1/fixtures/openclaw-runner.fixture.ts
```

It must export fresh factories:

```ts
makeValidTrack1Environment()
makeCampaignPreflightPorts()
makeCampaignRunnerPorts()
makeSuccessfulAttemptObservation()
makeRetryableAttemptObservation(reason)
makeTerminalAttemptObservation()
makeValidInvocation()
makeCompiledPrompt(attemptId)
makeRecordingProcessPort(options)
makeRecordingEphemeralMessagePort()
makeCliJsonContaining(value)
makeCampaignRunnerPorts(options)
makeOfflineRuntimePorts()
```

Ports expose ordered call records but no raw model payload. Test IDs use the
same fixed grammars as Phase 1 contracts.

## P4-T1: Strict Environment and Preflight

**Files:**

- Create: `scripts/track1/environment.ts`
- Create: `scripts/track1/preflight.ts`
- Create: `tests/track1/fixtures/openclaw-runner.fixture.ts`
- Create: `tests/track1/openclaw-preflight.spec.ts`

### Signatures

```ts
export interface Track1CloudModelConfig {
  base_url: string;
  model_id: string;
  api_key: string;
  ingest_token: string;
}

export function normalizeTrack1CloudModelConfig(
  environment: Readonly<Record<string, string | undefined>>
): Track1CloudModelConfig;

export interface Track1PreflightPorts {
  inspectDocker(): Promise<{ compose_v2: boolean }>;
  inspectOpenClaw(): Promise<{ version: string; integrity: string }>;
  probePlugin(): Promise<Track1PluginProbeResult>;
  checkBackend(): Promise<{ public_ready: boolean; internal_ready: boolean }>;
  loadManifest(): Promise<unknown>;
}

export function runTrack1Preflight(
  environment: Readonly<Record<string, string | undefined>>,
  ports: Track1PreflightPorts
): Promise<Track1PreflightResult>;
```

`Track1PreflightResult` contains only package version/integrity, model ref,
manifest hash, and capability booleans. It never contains keys or tokens.

### Acceptance

- All required variables are validated before any model invocation.
- Base URL rejects HTTP, credentials, query, fragment, whitespace, non-default
  unsafe ports, and path traversal.
- Model ID uses the Phase 1 closed grammar.
- API key is non-empty; ingest token has at least 32 bytes.
- Docker Compose v2, exact OpenClaw version, package integrity, complete plugin
  probe, both backend health surfaces, and manifest hash are mandatory.
- Checks execute in the documented deterministic order and stop at first
  failure.
- Errors are stable codes and omit environment/provider values.

- [ ] **Step 1: Write environment RED**

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeTrack1CloudModelConfig,
  runTrack1Preflight
} from "../../scripts/track1/preflight.ts";
import {
  makeCampaignPreflightPorts,
  makeValidTrack1Environment
} from "./fixtures/openclaw-runner.fixture.ts";

test("REQ-T1-DEMO-010 preflight accepts only closed cloud model configuration", () => {
  const config = normalizeTrack1CloudModelConfig(makeValidTrack1Environment());
  assert.equal(config.base_url, "https://model.example.test/v1");
  assert.equal(config.model_id, "provider/model-safe");
});

test("REQ-T1-DEMO-010 preflight rejects unsafe model endpoints", () => {
  for (const baseUrl of [
    "http://model.example.test/v1",
    "https://user:pass@model.example.test/v1",
    "https://model.example.test/v1?token=x",
    "https://model.example.test/v1#fragment",
    "https://model.example.test/../admin"
  ]) {
    assert.throws(
      () => normalizeTrack1CloudModelConfig({
        ...makeValidTrack1Environment(),
        OPENCLAW_MODEL_BASE_URL: baseUrl
      }),
      /track1_environment_invalid/
    );
  }
});
```

- [ ] **Step 2: Write ordered fail-fast RED**

```ts
test("REQ-T1-DEMO-010 preflight completes before any campaign creation", async () => {
  const ports = makeCampaignPreflightPorts();
  const result = await runTrack1Preflight(makeValidTrack1Environment(), ports);

  assert.deepEqual(ports.calls, [
    "docker",
    "openclaw",
    "plugin",
    "backend",
    "manifest"
  ]);
  assert.equal(result.openclaw_version, "2026.6.10");
  assert.equal(JSON.stringify(result).includes("API_KEY_SENTINEL"), false);
});

test("REQ-T1-DEMO-010 failed preflight stops before the next check", async () => {
  const ports = makeCampaignPreflightPorts({ pluginProbeFails: true });
  await assert.rejects(
    () => runTrack1Preflight(makeValidTrack1Environment(), ports),
    /track1_preflight_failed/
  );
  assert.deepEqual(ports.calls, ["docker", "openclaw", "plugin"]);
});
```

Add one mutation test for every required variable and every preflight
capability. Assert API-key/token/error-body sentinels never appear in errors or
serialized results.

- [ ] **Step 3: Prove RED**

```powershell
node.exe --experimental-strip-types --experimental-test-isolation=none --test tests/track1/openclaw-preflight.spec.ts
```

Expected failure: preflight modules do not exist.

- [ ] **Step 4: Implement minimal validation and ordered checks**

Return frozen defensive values. Do not read `process.env` inside normalizers;
the entrypoint supplies a snapshot.

- [ ] **Step 5: Prove GREEN and commit**

```powershell
node.exe --experimental-strip-types --experimental-test-isolation=none --test tests/track1/openclaw-preflight.spec.ts
git add scripts/track1/environment.ts scripts/track1/preflight.ts tests/track1/fixtures/openclaw-runner.fixture.ts tests/track1/openclaw-preflight.spec.ts
git commit -m "feat(track1): validate OpenClaw campaign environment"
```

## P4-T2: Hash-Verified Input-Only Prompt Compiler

**Files:**

- Create: `scripts/track1/case-prompt.ts`
- Create: `tests/track1/case-prompt.spec.ts`
- Modify: `tests/track1/fixtures/openclaw-runner.fixture.ts`

### Signature

```ts
export interface Track1CompiledPrompt {
  case_id: Track1CaseId;
  scenario_id: Track1ScenarioId;
  relative_tmpfs_path: string;
  content_sha256: string;
  utf8: Uint8Array;
}

export function compileTrack1CasePrompt(input: unknown): Track1CompiledPrompt;
```

The UTF-8 bytes encode exactly one `Track1ModelInputEnvelope` from Phase 3:

```text
schema_version
campaign_id
agent_id
attempt_id
attempt_index
session_id
case_id
scenario_id
user_prompt
retrieved_content
memory_entries
proposed_tool_call
```

### Acceptance

- Canonical case bytes must match the immutable manifest SHA-256.
- Case/scenario/agent assignments must match the manifest.
- Campaign/attempt/session IDs pass the Phase 1 closed grammars; attempt index,
  attempt ID, case, scenario, and agent correlate.
- Output copies only `input` data and runner-generated safe correlation IDs.
- `expected_outcome`, expected action, prohibited behavior oracle, report
  metadata, safety evaluation, and retry history are absent.
- Prompt path is derived from attempt ID under `/run/track1/messages/`.
- Caller cannot choose a path or arbitrary case.
- Canonical input objects are normalized and output uses canonical JSON plus
  one LF.
- Same case/attempt produces byte-identical output.
- Raw values live only in returned bytes for immediate tmpfs writing.

- [ ] **Step 1: Write oracle-isolation RED**

```ts
test("REQ-T1-DEMO-010 case compiler emits input only and never the oracle", () => {
  const compiled = compileTrack1CasePrompt({
    manifest_entry: makeManifestEntry("T1-SC-002-C002"),
    canonical_case_bytes: readCanonicalCase("T1-SC-002-C002"),
    campaign_id: "campaign:t1:0123456789abcdef0123456789abcdef",
    agent_id: "agent:track1:tool-hijack",
    attempt_id: "attempt:t1-sc-002-c002:1",
    attempt_index: 1,
    session_id: "session:0123456789abcdef0123456789abcdef"
  });
  const value = JSON.parse(Buffer.from(compiled.utf8).toString("utf8"));

  assert.deepEqual(Object.keys(value), [
    "agent_id",
    "attempt_id",
    "attempt_index",
    "campaign_id",
    "case_id",
    "memory_entries",
    "proposed_tool_call",
    "retrieved_content",
    "scenario_id",
    "schema_version",
    "session_id",
    "user_prompt"
  ]);
  assert.equal(JSON.stringify(value).includes("expected_outcome"), false);
  assert.equal(JSON.stringify(value).includes("policy_action"), false);
  assert.equal(
    compiled.relative_tmpfs_path,
    "/run/track1/messages/attempt-t1-sc-002-c002-1.json"
  );
});
```

- [ ] **Step 2: Write hash/path/determinism RED**

```ts
test("REQ-T1-DEMO-010 case compiler rejects tampered bytes and caller paths", () => {
  const bytes = readCanonicalCase("T1-SC-001-C001");
  bytes[0] = bytes[0] ^ 1;
  assert.throws(
    () => compileTrack1CasePrompt({
      ...makeCasePromptInput("T1-SC-001-C001"),
      canonical_case_bytes: bytes
    }),
    /track1_case_prompt_invalid/
  );
  assert.throws(
    () => compileTrack1CasePrompt({
      ...makeCasePromptInput("T1-SC-001-C001"),
      output_path: "../../host.env"
    }),
    /track1_case_prompt_invalid/
  );
});

test("REQ-T1-DEMO-010 case compiler is byte deterministic", () => {
  const input = makeCasePromptInput("T1-SC-003-C002");
  assert.deepEqual(
    compileTrack1CasePrompt(input),
    compileTrack1CasePrompt(input)
  );
});
```

The untyped boundary permits the extra `output_path` only to prove exact-key
rejection; production input type has no such field.

- [ ] **Step 3: Prove RED**

```powershell
node.exe --experimental-strip-types --experimental-test-isolation=none --test tests/track1/case-prompt.spec.ts
```

- [ ] **Step 4: Implement strict compiler**

Reuse the Phase 3 input-envelope normalizer. Parse the canonical case with a
structured JSON parser, never substring manipulation. Do not pass the full
case file to OpenClaw.

- [ ] **Step 5: Prove GREEN and commit**

```powershell
node.exe --experimental-strip-types --experimental-test-isolation=none --test tests/track1/case-prompt.spec.ts
git add scripts/track1/case-prompt.ts tests/track1/case-prompt.spec.ts tests/track1/fixtures/openclaw-runner.fixture.ts
git commit -m "feat(track1): compile oracle-free case prompts"
```

## P4-T3: Shell-Free Fixed OpenClaw Command Port

**Files:**

- Create: `scripts/track1/openclaw-command.ts`
- Create: `tests/track1/openclaw-command.spec.ts`

### Signature

```ts
export interface OpenClawAgentInvocation {
  agent_id: Track1CampaignAgentId;
  session_key: string;
  attempt_id: string;
  prompt: Track1CompiledPrompt;
}

export interface SafeOpenClawInvocationResult {
  exit_code: 0;
  agent_id: Track1CampaignAgentId;
  session_key_sha256: string;
  protocol_valid: true;
}

export interface ProcessPort {
  spawn(
    executable: string,
    args: readonly string[],
    options: Readonly<{
      shell: false;
      env: Readonly<Record<string, string>>;
      stdio: readonly ["ignore", "pipe", "pipe"];
    }>
  ): ProcessHandle;
}

export interface EphemeralMessagePort {
  withFile<T>(
    path: string,
    bytes: Uint8Array,
    run: () => Promise<T>
  ): Promise<T>;
}
```

Production command:

```text
openclaw agent
  --agent <fixed-agent-id>
  --session-key <runner-generated-key>
  --message-file /run/track1/messages/<derived-attempt-id>.json
  --json
```

### Acceptance

- The executable and flag order are exact.
- Agent ID must match the assignment selected by the runner.
- Attempt ID, compiled prompt, and message path must correlate exactly.
- Session key is runner-generated and uses a closed grammar.
- No shell, command interpolation, arbitrary option, `--local`, fallback, or
  caller-provided executable is possible.
- Process environment is an allowlist containing only required model/plugin
  variables and platform minimums.
- Output is parsed transiently to validate protocol, then discarded.
- Safe result includes no stdout, stderr, provider body, prompt, or model text.
- Non-zero, signal, timeout, malformed JSON, oversized output, and protocol
  mismatch map to fixed retry-classified errors.

- [ ] **Step 1: Write exact command RED**

```ts
test("REQ-T1-DEMO-010 OpenClaw port uses a fixed shell-free command", async () => {
  const processPort = makeRecordingProcessPort({ stdout: VALID_SAFE_CLI_JSON });
  const result = await invokeOpenClawAgent(
    {
      agent_id: "agent:track1:prompt-injection",
      session_key: "session-key:0123456789abcdef0123456789abcdef",
      attempt_id: "attempt:t1-sc-001-c001:1",
      prompt: makeCompiledPrompt(
        "attempt:t1-sc-001-c001:1"
      )
    },
    makeValidTrack1Environment(),
    processPort,
    makeRecordingEphemeralMessagePort()
  );

  assert.deepEqual(processPort.calls[0], {
    executable: "openclaw",
    args: [
      "agent",
      "--agent",
      "agent:track1:prompt-injection",
      "--session-key",
      "session-key:0123456789abcdef0123456789abcdef",
      "--message-file",
      "/run/track1/messages/attempt-t1-sc-001-c001-1.json",
      "--json"
    ],
    shell: false
  });
  assert.deepEqual(Object.keys(result).sort(), [
    "agent_id",
    "exit_code",
    "protocol_valid",
    "session_key_sha256"
  ]);
});
```

- [ ] **Step 2: Write injection/content RED**

```ts
test("REQ-T1-DEMO-010 OpenClaw port rejects caller-controlled command surfaces", async () => {
  for (const mutation of [
    { agent_id: "agent:track1:x;whoami" },
    { session_key: "x --local" },
    { message_file: "../../secrets.env" }
  ]) {
    await assert.rejects(
      () => invokeOpenClawAgent(
        { ...makeValidInvocation(), ...mutation },
        makeValidTrack1Environment(),
        makeRecordingProcessPort(),
        makeRecordingEphemeralMessagePort()
      ),
      /track1_invocation_invalid/
    );
  }
});

test("REQ-T1-DEMO-010 OpenClaw port discards raw stdout and stderr", async () => {
  const sentinel = "MODEL_OUTPUT_SENTINEL_36ac";
  const port = makeRecordingProcessPort({
    stdout: makeCliJsonContaining(sentinel),
    stderr: `provider failed ${sentinel}`
  });
  const result = await invokeOpenClawAgent(
    makeValidInvocation(),
    makeValidTrack1Environment(),
    port,
    makeRecordingEphemeralMessagePort()
  );
  assert.equal(JSON.stringify(result).includes(sentinel), false);
});
```

Add RED cases for timeout, oversized output, non-zero exit, signal, malformed
JSON, wrong agent/session protocol metadata, extra protocol keys, and output
mutation after completion.

- [ ] **Step 3: Prove RED**

```powershell
node.exe --experimental-strip-types --experimental-test-isolation=none --test tests/track1/openclaw-command.spec.ts
```

- [ ] **Step 4: Implement fixed command port**

Use `EphemeralMessagePort.withFile` to write the compiled bytes with exclusive
creation under tmpfs, invoke `spawn`, and remove the file in `finally`. Use byte
caps, fixed timeout, and listeners that release output buffers immediately
after validation. Never include captured text in an error.

- [ ] **Step 5: Prove GREEN and commit**

```powershell
node.exe --experimental-strip-types --experimental-test-isolation=none --test tests/track1/openclaw-command.spec.ts
git add scripts/track1/openclaw-command.ts tests/track1/openclaw-command.spec.ts
git commit -m "feat(track1): add fixed OpenClaw command port"
```

## P4-T4: Fixed Three-Agent/Nine-Case Campaign State Machine

**Files:**

- Create: `scripts/track1/campaign-runner.ts`
- Create: `tests/track1/openclaw-campaign-runner.spec.ts`
- Modify: `tests/track1/fixtures/openclaw-runner.fixture.ts`

### Runner Port

```ts
export interface Track1CampaignRunnerPorts {
  preflight(): Promise<Track1PreflightResult>;
  createCampaign(input: Track1CampaignStartEnvelope): Promise<void>;
  compilePrompt(input: {
    campaign_id: Track1CampaignId;
    agent_id: Track1CampaignAgentId;
    scenario_id: Track1ScenarioId;
    case_id: Track1CaseId;
    attempt_id: Track1AttemptId;
    attempt_index: 1 | 2;
    session_id: Track1SessionId;
  }): Promise<Track1CompiledPrompt>;
  invokeAgent(input: OpenClawAgentInvocation): Promise<SafeOpenClawInvocationResult>;
  awaitAttempt(input: Track1AttemptAwaitRequest): Promise<Track1AttemptObservation>;
  finalizeCampaign(input: Track1CampaignFinalizeEnvelope): Promise<void>;
  now(): string;
  randomHex32(): string;
  progress(event: Track1SafeProgressEvent): void;
}

export function runTrack1OpenClawCampaign(
  ports: Track1CampaignRunnerPorts
): Promise<Track1CampaignRunSummary>;
```

### Acceptance

- Preflight completes before campaign creation.
- One campaign ID is generated by the runner.
- Agents run in fixed manifest order; cases run in fixed case-ID order.
- Each invocation uses a fresh attempt ID and session key.
- Each attempt compiles a hash-verified input-only prompt before invocation;
  the complete canonical case and oracle are never passed to OpenClaw.
- After CLI exit, runner waits for backend-normalized terminal attempt
  evidence; it never trusts CLI text as policy outcome.
- Progress events contain only safe IDs, ordinal counts, state, and fixed
  reason codes.
- No execution API or user-selectable subset is added.

- [ ] **Step 1: Write deterministic-order RED**

```ts
test("REQ-T1-DEMO-010 campaign runner executes the fixed three-agent nine-case order", async () => {
  const ports = makeCampaignRunnerPorts();
  const summary = await runTrack1OpenClawCampaign(ports);

  assert.deepEqual(ports.calls.slice(0, 2), ["preflight", "create-campaign"]);
  assert.deepEqual(
    ports.invocations.map(({ agent_id, case_id }) => [agent_id, case_id]),
    [
      ["agent:track1:prompt-injection", "T1-SC-001-C001"],
      ["agent:track1:prompt-injection", "T1-SC-001-C002"],
      ["agent:track1:prompt-injection", "T1-SC-001-C003"],
      ["agent:track1:tool-hijack", "T1-SC-002-C001"],
      ["agent:track1:tool-hijack", "T1-SC-002-C002"],
      ["agent:track1:tool-hijack", "T1-SC-002-C003"],
      ["agent:track1:memory-poison", "T1-SC-003-C001"],
      ["agent:track1:memory-poison", "T1-SC-003-C002"],
      ["agent:track1:memory-poison", "T1-SC-003-C003"]
    ]
  );
  assert.equal(new Set(ports.invocations.map((row) => row.session_key)).size, 9);
  assert.equal(summary.case_count, 9);
  assert.equal(summary.agent_count, 3);
});
```

- [ ] **Step 2: Write backend-evidence authority RED**

```ts
test("REQ-T1-DEMO-010 runner derives action only from normalized backend observation", async () => {
  const ports = makeCampaignRunnerPorts({
    cliClaimedAction: "allow",
    backendActualAction: "deny"
  });
  const summary = await runTrack1OpenClawCampaign(ports);

  assert.equal(summary.final_actions["T1-SC-001-C001"], "deny");
  assert.equal(
    JSON.stringify(ports.progressEvents).includes("cliClaimedAction"),
    false
  );
});
```

Add tests for:

- preflight failure creates no campaign and invokes no agent;
- campaign creation failure invokes no agent;
- unique campaign/attempt/session IDs with exact grammars;
- one await follows every invocation;
- agent/case/attempt correlation mismatch fails campaign;
- progress callback mutation cannot affect state;
- progress and summary omit raw sentinels and secrets;
- finalization happens only after all nine final attempts.

- [ ] **Step 3: Prove RED**

```powershell
node.exe --experimental-strip-types --experimental-test-isolation=none --test tests/track1/openclaw-campaign-runner.spec.ts
```

- [ ] **Step 4: Implement no-retry tracer path**

Implement the all-success path only in this task. Retry belongs to P4-T5.
Normalize the Phase 1 manifest independently inside the runner.

- [ ] **Step 5: Prove GREEN and commit**

```powershell
node.exe --experimental-strip-types --experimental-test-isolation=none --test tests/track1/openclaw-campaign-runner.spec.ts
git add scripts/track1/campaign-runner.ts tests/track1/openclaw-campaign-runner.spec.ts tests/track1/fixtures/openclaw-runner.fixture.ts
git commit -m "feat(track1): orchestrate OpenClaw campaign"
```

## P4-T5: One Audited Retry and Strict Finalization

**Files:**

- Modify: `scripts/track1/campaign-runner.ts`
- Modify: `tests/track1/openclaw-campaign-runner.spec.ts`
- Modify: `tests/track1/fixtures/openclaw-runner.fixture.ts`

### Retry Classification

Retryable:

```text
provider_transport_failed
model_protocol_invalid
expected_tool_request_missing
derived_action_mismatch
```

Non-retryable:

```text
preflight_failed
plugin_probe_failed
ingest_failed
correlation_invalid
real_side_effect_detected
content_boundary_violated
manifest_invalid
```

### Acceptance

- Only the four closed retry reasons can create attempt 2.
- Attempt 1 remains append-only and visible.
- Attempt 2 uses fresh state, session key, and attempt ID.
- A second retryable failure terminates the whole campaign as failed.
- Non-retryable failure never retries.
- Final completion requires all nine final derived actions to equal the
  manifest oracle.
- Finalize envelope lists every attempt and cannot omit failed attempt 1.

- [ ] **Step 1: Write retry matrix RED**

```ts
test("REQ-T1-DEMO-010 runner retries each permitted reason exactly once", async () => {
  for (const reason of [
    "provider_transport_failed",
    "model_protocol_invalid",
    "expected_tool_request_missing",
    "derived_action_mismatch"
  ] as const) {
    const ports = makeCampaignRunnerPorts({
      attempts: {
        "T1-SC-001-C001": [
          makeRetryableAttemptObservation(reason),
          makeSuccessfulAttemptObservation()
        ]
      }
    });
    const summary = await runTrack1OpenClawCampaign(ports);
    assert.equal(summary.retry_count, 1, reason);
    assert.deepEqual(
      ports.attemptsFor("T1-SC-001-C001").map((attempt) => attempt.attempt_index),
      [1, 2]
    );
  }
});

test("REQ-T1-DEMO-010 non-retryable failure invokes no second attempt", async () => {
  for (const reason of [
    "ingest_failed",
    "correlation_invalid",
    "real_side_effect_detected",
    "content_boundary_violated"
  ] as const) {
    const ports = makeCampaignRunnerPorts({
      attempts: {
        "T1-SC-001-C001": [makeTerminalAttemptObservation(reason)]
      }
    });
    await assert.rejects(
      () => runTrack1OpenClawCampaign(ports),
      /track1_campaign_failed/
    );
    assert.equal(ports.attemptsFor("T1-SC-001-C001").length, 1);
  }
});
```

- [ ] **Step 2: Write audit/finalization RED**

```ts
test("REQ-T1-DEMO-010 retry keeps both attempts in finalization evidence", async () => {
  const ports = makeCampaignRunnerPorts({
    attempts: {
      "T1-SC-001-C001": [
        makeRetryableAttemptObservation("derived_action_mismatch"),
        makeSuccessfulAttemptObservation()
      ]
    }
  });
  await runTrack1OpenClawCampaign(ports);

  const finalized = ports.finalizeInputs[0];
  const attempts = finalized?.attempts.filter(
    (attempt) => attempt.case_id === "T1-SC-001-C001"
  );
  assert.deepEqual(attempts?.map((attempt) => attempt.attempt_index), [1, 2]);
  assert.deepEqual(attempts?.map((attempt) => attempt.final), [false, true]);
});

test("REQ-T1-DEMO-010 second failed attempt is terminal and cannot retry again", async () => {
  const ports = makeCampaignRunnerPorts({
    attempts: {
      "T1-SC-001-C001": [
        makeRetryableAttemptObservation("provider_transport_failed"),
        makeRetryableAttemptObservation("provider_transport_failed")
      ]
    }
  });
  await assert.rejects(
    () => runTrack1OpenClawCampaign(ports),
    /track1_campaign_failed/
  );
  assert.equal(ports.attemptsFor("T1-SC-001-C001").length, 2);
  assert.equal(ports.finalizeInputs[0]?.status, "failed");
});
```

Add mutation tests for unknown retry reason, forged expected action, missing
attempt 1, duplicate attempt index, stale session, and 9/9 oracle mismatch.

- [ ] **Step 3: Prove RED**

```powershell
node.exe --experimental-strip-types --experimental-test-isolation=none --test tests/track1/openclaw-campaign-runner.spec.ts
```

- [ ] **Step 4: Implement the closed retry state machine**

Do not use recursive retry. Use an explicit `for (attemptIndex of [1, 2])`
state transition with one classifier.

- [ ] **Step 5: Prove GREEN and commit**

```powershell
node.exe --experimental-strip-types --experimental-test-isolation=none --test tests/track1/openclaw-campaign-runner.spec.ts
git add scripts/track1/campaign-runner.ts tests/track1/openclaw-campaign-runner.spec.ts tests/track1/fixtures/openclaw-runner.fixture.ts
git commit -m "feat(track1): enforce campaign retry semantics"
```

## P4-T6: Closed OpenClaw Agent Configuration and Digest-Pinned Image

**Files:**

- Create: `integrations/openclaw/config/agents.json5`
- Create: `integrations/openclaw/config/openclaw.json5`
- Create: `deploy/track1/Dockerfile.openclaw`
- Create: `tests/repository/track1-openclaw-runtime-config.spec.ts`

### Acceptance

- Exactly three agents exist with the Phase 1 fixed IDs and assignments.
- Only the four native plugin tools are permitted.
- Shell, process, host filesystem write, browser, node, messaging, network,
  MCP, channels, skills, marketplace, and third-party plugins are disabled.
- Debug transcript persistence is disabled; sensitive tool logs are redacted.
- Workspace and session directories point to tmpfs mount paths.
- Model provider comes only from validated environment.
- Docker base uses `node:22.19.0-bookworm-slim` with an immutable digest.
- Image installs exact lockfile dependencies and verifies
  `openclaw --version` equals `2026.6.10`.
- No credential is accepted through a Docker build argument or image layer.

- [ ] **Step 1: Write runtime-config repository RED**

```ts
test("REQ-T1-DEMO-010 OpenClaw config exposes only three agents and four tools", async () => {
  const config = await loadJson5("integrations/openclaw/config/openclaw.json5");
  const agents = await loadJson5("integrations/openclaw/config/agents.json5");

  assert.deepEqual(
    agents.agents.map((agent: { id: string }) => agent.id),
    [
      "agent:track1:prompt-injection",
      "agent:track1:tool-hijack",
      "agent:track1:memory-poison"
    ]
  );
  assert.deepEqual(config.tools.allow.slice().sort(), [
    "call_api",
    "read_file",
    "send_email",
    "write_file"
  ]);
  assert.equal(config.skills.enabled, false);
  assert.equal(config.marketplace.enabled, false);
  assert.equal(config.logging.persistTranscripts, false);
  assert.equal(config.logging.redactSensitiveToolData, true);
});

test("REQ-T1-DEMO-010 OpenClaw image pins base digest and exact package", async () => {
  const dockerfile = await readFile("deploy/track1/Dockerfile.openclaw", "utf8");
  assert.match(
    dockerfile,
    /^FROM node:22\.17\.0-bookworm-slim@sha256:[a-f0-9]{64}$/m
  );
  assert.equal(dockerfile.includes("openclaw@2026.6.10"), true);
  assert.equal(/ARG .*KEY|ARG .*TOKEN/i.test(dockerfile), false);
});
```

Add exact assertions for every denied capability and tmpfs path. Reject unknown
config keys through a schema-aware load test or real runtime inspection.

- [ ] **Step 2: Prove RED**

```powershell
node.exe --experimental-strip-types --experimental-test-isolation=none --test tests/repository/track1-openclaw-runtime-config.spec.ts
```

- [ ] **Step 3: Resolve and record the immutable base digest**

```powershell
docker buildx imagetools inspect node:22.19.0-bookworm-slim
```

Copy the reported manifest-list digest into `FROM`. Do not use a locally
invented digest, tag-only base, `latest`, or floating package range.

- [ ] **Step 4: Implement closed config and image**

Validate config keys against OpenClaw `2026.6.10` documentation and runtime.
If a required safety control is unsupported, stop and report instead of
approximating it.

- [ ] **Step 5: Prove GREEN and commit**

```powershell
node.exe --experimental-strip-types --experimental-test-isolation=none --test tests/repository/track1-openclaw-runtime-config.spec.ts
docker build -f deploy/track1/Dockerfile.openclaw -t agent-security-track1-openclaw:2026.6.10 .
docker run --rm agent-security-track1-openclaw:2026.6.10 openclaw --version
git add integrations/openclaw/config/agents.json5 integrations/openclaw/config/openclaw.json5 deploy/track1/Dockerfile.openclaw tests/repository/track1-openclaw-runtime-config.spec.ts
git commit -m "build(track1): pin OpenClaw safety runtime"
```

Expected version output: exactly `2026.6.10`.

## P4-T7: Isolated Compose Topology

**Files:**

- Create: `deploy/track1/compose.track1.yml`
- Create: `deploy/track1/README.md`
- Create: `tests/repository/track1-compose.spec.ts`
- Modify: `.gitignore`

### Acceptance

- `track1` profile has `openclaw-gateway`, `campaign-runner`, `backend`, and
  `frontend`.
- Backend publishes public `3000` only; internal `3001` is `expose`-only.
- OpenClaw publishes no host port.
- Workspace, session, and transient message locations are tmpfs.
- Cases/config/plugin mounts are read-only.
- Generated artifacts and OpenClaw state are ignored.
- Secrets enter at runtime environment only and are absent from rendered
  Compose config.
- Health checks use safe endpoints and fixed commands.
- Runner depends on healthy backend and OpenClaw.
- Network membership prevents frontend from reaching the internal ingest
  network and prevents OpenClaw from reaching unrelated project services.

- [ ] **Step 1: Write Compose RED**

```ts
test("REQ-T1-DEMO-010 Compose never publishes internal ingest or OpenClaw ports", async () => {
  const compose = await loadCompose("deploy/track1/compose.track1.yml");
  assert.deepEqual(compose.services.backend.ports, ["3000:3000"]);
  assert.deepEqual(compose.services.backend.expose, ["3001"]);
  assert.equal("ports" in compose.services["openclaw-gateway"], false);
  assert.deepEqual(
    Object.keys(compose.services).sort(),
    ["backend", "campaign-runner", "frontend", "openclaw-gateway"]
  );
});

test("REQ-T1-DEMO-010 Compose keeps OpenClaw state ephemeral", async () => {
  const compose = await loadCompose("deploy/track1/compose.track1.yml");
  const service = compose.services["openclaw-gateway"];
  assert.deepEqual(service.tmpfs.slice().sort(), [
    "/run/track1",
    "/tmp/openclaw",
    "/workspace"
  ]);
  for (const volume of service.volumes) {
    assert.match(volume, /:ro$/);
  }
});
```

Add tests for profile, health dependencies, network membership, no secret
literal, no `${...:-fallback}` credential default, image/build pins, read-only
mounts, and `.gitignore` coverage.

- [ ] **Step 2: Prove RED**

```powershell
node.exe --experimental-strip-types --experimental-test-isolation=none --test tests/repository/track1-compose.spec.ts
```

- [ ] **Step 3: Implement topology**

Use separate `track1-public`, `track1-ingest`, and `track1-model-egress`
networks. Docker Compose alone cannot enforce hostname-level egress; document
that external model endpoint restriction requires the validated URL plus
deployment firewall policy. Do not claim a stronger guarantee.

- [ ] **Step 4: Validate rendered config**

Use dummy test-only values in the current process:

```powershell
$env:OPENCLAW_MODEL_BASE_URL='https://model.example.test/v1'
$env:OPENCLAW_MODEL_API_KEY='test-only-key'
$env:OPENCLAW_MODEL_ID='provider/model-safe'
$env:TRACK1_INGEST_TOKEN='0123456789abcdef0123456789abcdef'
docker compose -f deploy/track1/compose.track1.yml --profile track1 config
```

Inspect output for unexpected published ports and secret persistence.

- [ ] **Step 5: Prove GREEN and commit**

```powershell
node.exe --experimental-strip-types --experimental-test-isolation=none --test tests/repository/track1-compose.spec.ts
git add deploy/track1/compose.track1.yml deploy/track1/README.md tests/repository/track1-compose.spec.ts .gitignore
git commit -m "build(track1): compose OpenClaw demo runtime"
```

## P4-T8: Ordinary Offline Runtime Gate, Entrypoint, and Docs

**Files:**

- Create: `scripts/track1/run-openclaw-campaign.ts`
- Create: `tests/track1/openclaw-offline-runtime.spec.ts`
- Modify: `package.json`
- Modify: `pnpm-workspace.yaml`
- Modify: `docs/architecture.md`
- Modify: `docs/api-contract.md`
- Modify: `docs/progress.md`

### Entrypoint Rules

`run-openclaw-campaign.ts` accepts no arguments. It composes production ports,
runs preflight, runs the campaign, and prints only:

```text
campaign_id=<safe-id>
status=<completed|failed>
artifact_ref=<safe-ref, only after Phase 6 is wired>
```

Before Phase 6, a completed campaign still exits non-zero with fixed
`track1_evidence_unavailable`; Phase 7 will wire the artifact pipeline.

### Acceptance

- Root `demo:track1:openclaw` points only to the fixed entrypoint.
- Root `test:track1:openclaw` runs Phase 3 integration tests, runner tests,
  repository topology/config gates, image build, runtime version check, and
  real plugin inspect/probe without model invocation.
- Offline gate asserts zero agent/model invocation.
- OpenClaw integration is added to workspace membership without removing
  existing packages.
- `test:repo` explicitly includes new repository tests.
- Existing demos remain byte-identical.

- [ ] **Step 1: Write offline runtime RED**

```ts
test("REQ-T1-DEMO-010 ordinary runtime gate inspects real plugin without model calls", async () => {
  const ports = makeOfflineRuntimePorts();
  const result = await runTrack1OfflineRuntimeGate(ports);

  assert.deepEqual(ports.calls, [
    "compose-build-openclaw",
    "openclaw-version",
    "plugin-runtime-inspect",
    "plugin-capability-probe"
  ]);
  assert.equal(ports.agentInvocations, 0);
  assert.equal(result.runtime_version, "2026.6.10");
  assert.equal(result.plugin_id, "agent-security-track1");
});
```

Add tests that any wrong version, non-empty diagnostic, missing hook/tool,
probe failure, or attempted model call fails the gate.

- [ ] **Step 2: Prove RED**

```powershell
node.exe --experimental-strip-types --experimental-test-isolation=none --test tests/track1/openclaw-offline-runtime.spec.ts
```

- [ ] **Step 3: Implement entrypoint, gate, scripts, workspace, and docs**

Root scripts:

```json
"demo:track1:openclaw": "node --experimental-strip-types scripts/track1/run-openclaw-campaign.ts",
"test:track1:openclaw:unit": "node --experimental-strip-types --experimental-test-isolation=none --test tests/track1/openclaw-preflight.spec.ts tests/track1/case-prompt.spec.ts tests/track1/openclaw-command.spec.ts tests/track1/openclaw-campaign-runner.spec.ts tests/track1/openclaw-offline-runtime.spec.ts",
"test:track1:openclaw": "npm run test:integration:openclaw && npm run test:track1:openclaw:unit"
```

Keep Docker build/probe as an explicit second command in CI/documentation if
the repository's default test gate must remain Docker-independent. The offline
runtime spec tests the orchestration using ports; the documented real offline
probe must also be run before Phase 4 acceptance.

- [ ] **Step 4: Run real offline inspect**

With dummy non-routable model configuration:

```powershell
docker compose -f deploy/track1/compose.track1.yml --profile track1 build openclaw-gateway
docker compose -f deploy/track1/compose.track1.yml --profile track1 run --rm openclaw-gateway openclaw --version
docker compose -f deploy/track1/compose.track1.yml --profile track1 run --rm openclaw-gateway openclaw plugins inspect agent-security-track1 --runtime --json
```

No agent command is permitted in this task.

- [ ] **Step 5: Run complete Phase 4 GREEN**

```powershell
npm.cmd run test:track1:openclaw
npm.cmd run test:repo
npm.cmd run test:shared
npm.cmd run test:engine:sandbox
npm.cmd run test:backend
npm.cmd run test:frontend
git diff --check
git status --short
```

- [ ] **Step 6: Commit P4-T8**

```powershell
git add scripts/track1/run-openclaw-campaign.ts tests/track1/openclaw-offline-runtime.spec.ts package.json pnpm-workspace.yaml docs/architecture.md docs/api-contract.md docs/progress.md
git commit -m "test(track1): gate offline OpenClaw runtime"
```

## Phase Exit Gate

Phase 4 is complete only when:

1. all eight task commits exist in order;
2. each behavior task has recorded RED before implementation;
3. unit tests prove fixed 3-agent/9-case order and one-retry maximum;
4. repository tests prove digest pins, closed tools, tmpfs, and no published
   internal/OpenClaw port;
5. the real image reports OpenClaw `2026.6.10`;
6. real `plugins inspect --runtime --json` passes without a model call;
7. no raw sentinel or credential appears in logs/results;
8. all ordinary gates and byte-stability checks are recorded;
9. docs label the credentialed cloud run as Phase 7 pending;
10. the worker stops and reports.

## Worker Compressed Report

```text
REQ-T1-DEMO-010 / Phase 4
Commits:
- <hash> P4-T1 ...
- <hash> P4-T2 ...
- <hash> P4-T3 ...
- <hash> P4-T4 ...
- <hash> P4-T5 ...
- <hash> P4-T6 ...
- <hash> P4-T7 ...
- <hash> P4-T8 ...

RED evidence:
- P4-T1: <command> -> <expected behavior failure>
- P4-T2: <command> -> <expected behavior failure>
- P4-T3: <command> -> <expected behavior failure>
- P4-T4: <command> -> <expected behavior failure>
- P4-T5: <command> -> <expected behavior failure>
- P4-T6: <command> -> <expected behavior failure>
- P4-T7: <command> -> <expected behavior failure>
- P4-T8: <command> -> <expected behavior failure>

GREEN gates:
- test:track1:openclaw: <actual pass/fail>
- test:repo: <actual pass/fail>
- test:shared: <actual pass/fail>
- test:engine:sandbox: <actual pass/fail>
- test:backend: <actual pass/fail>
- test:frontend: <actual pass/fail>
- image version: <actual output>
- real plugin inspect: <pass/fail and safe diagnostics>
- git diff --check: <actual result>

Runtime checks:
- base image digest: <actual digest>
- fixed invocation count/order: <actual>
- retry count maximum: <actual>
- offline model calls: <must be 0>
- published ports: <actual>
- sentinel scan: <pass/fail>

Files changed:
- <exact paths>

Residual risks:
- <none or exact issue>

Status:
- PHASE_4_COMPLETE_PENDING_REVIEW
```

Stop after reporting. Do not start Phase 5.
