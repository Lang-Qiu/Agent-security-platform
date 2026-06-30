# Spec: Track 1 Model Call-Chain Monitor Plugin

## Objective

`REQ-T1-MONITOR-PLUGIN-007` adds an engine-private model call-chain monitoring plugin to the sandbox engine. The plugin sits around model and simulated-tool calls, captures safe supervision events, obtains policy actions through an injected decision provider, and intercepts tool execution before any side effect.

The primary user is a security researcher or evaluator running controlled Track 1 scenarios. Success means the repository can demonstrate that model inputs, model outputs, tool requests, decisions, tool outcomes, alerts, and blocking records are correlated inside one monitored session while raw content remains outside serialized results.

This requirement delivers the monitoring boundary only. `REQ-T1-BASE-FILTER-008` will implement the first real decision provider, `REQ-T1-SUPERVISION-UI-009` will present the results, and `REQ-T1-DEMO-010` will connect the plugin to OpenClaw or an approved equivalent.

## Approved Decisions

1. The plugin lives inside `engines/sandbox`; it is not a backend service or a fourth engine.
2. The plugin is a session-level middleware with `invokeModel`, `invokeTool`, and `finalize` operations.
3. Policy actions come from an injected `MonitorDecisionProvider`; REQ-007 does not implement detection rules.
4. `allow` and `alert` execute a validated simulated tool. `deny` and `ask` intercept before execution.
5. `alert` executes the simulated tool and materializes a typed alert.
6. `deny` materializes a typed blocked record.
7. `ask` is terminal for the current session, emits a rejected tool result when a tool was requested, and has no resume workflow.
8. Provider failure or invalid provider output fails closed as a synthetic `deny`, with no tool execution and no raw exception leakage.
9. A session can contain multiple sequential model and tool calls. One monitor session corresponds to one agent session.
10. Agent-cluster aggregation, cross-agent trace topology, approval resumption, backend persistence, UI, and OpenClaw integration are deferred.
11. Raw prompt, model output, tool arguments, and tool results may be visible only to the current invocation and injected callback. The monitor never retains them after a method returns.
12. `finalize` returns a complete normalized `BaseResult<SandboxRunResultDetails>`.
13. The nine existing Track 1 cases are exercised through an engine-private replay-to-monitor adapter. Existing REQ-006 scripts and byte-level output remain unchanged.
14. No shared contract is added or changed.

## Existing Assets Reused

- `shared/types/sandbox.ts`: event, decision, alert, and blocked-record types.
- `shared/contracts/sandbox.ts`: record normalization and cross-record invariants.
- `shared/contracts/result.ts`: final `BaseResult` normalization.
- `engines/sandbox/src/simulated-tools/`: validated local-only tool requests, executor, and in-memory state.
- `engines/sandbox/src/replay/`: fixed Track 1 case and scenario loader plus deterministic replay utilities.
- `samples/track1/cases/`: nine controlled adversarial and negative-control cases.
- `samples/track1/scenarios/track1-scenarios.v1.json`: scenario and event requirements.

## Architecture

```text
controlled caller or future OpenClaw adapter
  -> MonitoredSession.invokeModel()
       -> model callback
       -> safe model_input/model_output events
       -> MonitorDecisionProvider(stage=model_output)
  -> MonitoredSession.invokeTool()
       -> validated SimulatedToolRequest
       -> MonitorDecisionProvider(stage=tool_request)
       -> allow/alert: simulated tool callback executes
       -> deny/ask: callback is not called
       -> safe tool_result event
  -> MonitoredSession.finalize()
       -> complete SandboxRunResultDetails
       -> normalizeBaseResult()
       -> BaseResult<SandboxRunResultDetails>
```

### Planned Module Structure

```text
engines/sandbox/src/monitoring/
  contract.ts
  content-boundary.ts
  session.ts
  result-builder.ts
  replay-adapter.ts
  index.ts
```

- `contract.ts`: engine-private inputs, outputs, provider contract, lifecycle state, runtime ports, metadata, and stable errors.
- `content-boundary.ts`: SHA-256 calculation, canonical serialization for tool arguments, safe references, and fixed summaries.
- `session.ts`: model/tool middleware, event ordering, decision handling, execution gating, and session lifecycle.
- `result-builder.ts`: terminal status/risk aggregation and shared result normalization.
- `replay-adapter.ts`: deterministic fixture model/provider ports and nine-case monitor integration.
- `index.ts`: the minimal supported monitoring export surface.

The plugin does not import a model SDK, HTTP client, backend module, frontend module, or external process API.

## Tech Stack

- Node.js `>=22.19.0`.
- TypeScript ESM executed with Node native type stripping.
- Existing `node:test` and `node:assert/strict` test style.
- Existing shared sandbox/result normalizers.
- Existing simulated-tool contracts and in-memory executor.
- Node.js built-ins for SHA-256, runtime timestamps, and default IDs.
- No new runtime or development dependency.

## Engine-Private Contract

### Session Context

```typescript
export interface MonitorSessionContext {
  task_id: string;
  session_id: string;
  model_ref: string;
  scenario_id?: string;
  case_id?: string;
}

export interface MonitorRuntimePorts {
  now(): string;
  nextId(kind: string): string;
}
```

The default runtime ports may use the local clock and UUID generation. Tests, the replay adapter, and the demo inject deterministic ports. IDs and timestamps are allocated by the monitor, not by the provider.

### Model Middleware

```typescript
export interface MonitorModelRequest {
  content: string;
  content_ref: string;
}

export interface MonitorModelResponse {
  content: string;
  content_ref: string;
}

export interface MonitoredModelOutcome {
  response: MonitorModelResponse;
  decision: SandboxPolicyDecision;
  can_continue: boolean;
}

export type MonitorModelNext = (
  request: MonitorModelRequest
) => MonitorModelResponse | Promise<MonitorModelResponse>;
```

`invokeModel(request, next)`:

1. validates the request;
2. emits a safe `model_input` event;
3. calls `next` exactly once;
4. validates and hashes the response;
5. emits a safe `model_output` event;
6. asks the provider to decide on the model-output stage;
7. materializes the decision and any alert or blocked record;
8. clears all raw request/response references held by the monitor before returning.

The returned response remains the caller's ephemeral value. The session retains only event IDs, content references, hashes, fixed summaries, and decision records.

### Tool Middleware

```typescript
export interface MonitorToolDecisionContext {
  model_input: MonitorModelRequest;
  model_output: MonitorModelResponse;
}

export type MonitorToolNext = (
  request: SimulatedToolRequest
) => SimulatedToolResult | Promise<SimulatedToolResult>;

export type MonitoredToolOutcome =
  | {
      disposition: "executed";
      action: "allow" | "alert";
      decision: SandboxPolicyDecision;
      result: SimulatedToolResult;
    }
  | {
      disposition: "intercepted";
      action: "deny" | "ask";
      decision: SandboxPolicyDecision;
      result: SandboxToolResultPayload;
    };
```

`invokeTool(request, context, next)`:

1. requires a successful preceding model call in the same session;
2. validates the request with `normalizeSimulatedToolRequest`;
3. verifies that the supplied model context hashes match the latest safe model events;
4. emits `tool_request` without raw argument values;
5. asks the provider to decide on the tool-request stage;
6. calls `next` exactly once only for `allow` or `alert`;
7. emits a safe tool result for every accepted request;
8. returns the raw simulated result only to the caller on executed paths;
9. clears all raw decision input and tool result references before returning.

Tool `arguments_ref` includes the canonical argument SHA-256 digest. Tool-result events retain only tool name, call ID, status, result reference, and state-change classification.

### Decision Provider

```typescript
export type MonitorDecisionStage = "model_output" | "tool_request";

export interface MonitorDecisionInput {
  stage: MonitorDecisionStage;
  session: Readonly<MonitorSessionContext>;
  subject_event_id: string;
  model_input: Readonly<MonitorModelRequest>;
  model_output: Readonly<MonitorModelResponse>;
  tool_request?: Readonly<SimulatedToolRequest>;
}

export interface MonitorDecisionProposal {
  policy_id: string;
  action: SandboxPolicyAction;
  reason_code: string;
  reason: string;
  evidence_refs: string[];
}

export interface MonitorDecisionProvider {
  decide(
    input: Readonly<MonitorDecisionInput>
  ): MonitorDecisionProposal | Promise<MonitorDecisionProposal>;
}
```

The provider receives raw values only during `decide`. Provider input is never copied into session state, metadata, events, errors, or logs. Provider output is runtime-normalized as a closed object before it becomes a shared `SandboxPolicyDecision`.

The monitor passes a recursively frozen, defensive snapshot to the provider. It executes tools with its own normalized request copy, so provider mutation cannot change the approved tool name, target, nested arguments, or correlation IDs. An uncaught mutation error follows the provider fail-closed path.

REQ-008 can implement this port without changing session orchestration.

## Decision And Execution Semantics

### Model-Output Stage

| Action | Record | Continue session |
| --- | --- | --- |
| `allow` | decision only | yes |
| `alert` | decision plus alert | yes |
| `ask` | decision only | no |
| `deny` | decision plus blocked record | no |

### Tool-Request Stage

| Action | Tool callback | Tool result | Record | Continue session |
| --- | --- | --- | --- | --- |
| `allow` | execute once | executor-derived safe event | decision only | yes |
| `alert` | execute once | executor-derived safe event | decision plus alert | yes |
| `ask` | never execute | `rejected`, `state_change: none` | decision only | no |
| `deny` | never execute | `rejected`, `state_change: none` | decision plus blocked record | no |

An alert or blocked record uses the same `subject_event_id` as its linked decision.

### Provider Failure

The following conditions use the same fail-closed path:

- provider throws or rejects;
- provider returns a non-object;
- provider returns unknown or missing keys;
- provider returns an unsupported action;
- provider returns empty identifiers, reasons, or evidence references.

The monitor creates a safe synthetic decision:

```typescript
{
  policy_id: "policy://track1/monitor-fail-closed",
  action: "deny",
  reason_code: "decision_provider_failed",
  reason: "Decision provider failed closed",
  evidence_refs: ["evidence://track1/monitor/provider-failure"]
}
```

The raw provider exception is discarded. If the failure occurs at the tool stage, the tool callback is not invoked and a rejected no-state-change tool result is emitted.

## Session Lifecycle

```text
open
  -> model call(s)
  -> optional tool call(s)
  -> finalized

open
  -> ask / deny / provider failure / callback failure
  -> sealed
  -> finalized
```

Rules:

- `allow` and `alert` preserve an open session.
- `ask`, `deny`, and provider failure seal the session.
- Model or tool callback failure seals the session as failed.
- Calls after sealing or finalization raise `monitor_state_invalid` and do not mutate the event stream.
- `finalize` is idempotent and returns the same cached normalized value after the first call.
- Finalizing a session with no model call raises `monitor_session_empty`.
- A tool call before a successful model call raises `monitor_state_invalid`.
- Only sequential calls are supported. Concurrent method calls on one session are rejected.
- A cluster uses one monitor session per agent. Cluster IDs and cross-agent spans are deferred to REQ-010.

## Event Construction

Events use the existing shared types without extension:

- `model_input`: source `agent`;
- `model_output`: source `model`;
- `tool_request`: source `agent`;
- `policy_decision`: source `policy`;
- `tool_result`: source `tool`.

Memory events are not created by the monitor plugin. Existing memory replay remains owned by REQ-006 until a real memory adapter is introduced.

Every event:

- uses the session context's `session_id`, optional `scenario_id`, and optional `case_id`;
- receives a unique positive sequence in strict order;
- uses a monitor-generated event ID and timestamp;
- includes at least one safe evidence reference;
- excludes raw content and raw exception values.

Content summaries are fixed labels such as `Monitored model input` and `Monitored model output`; they are not derived from raw content.

## Final Result

`finalize` builds:

```typescript
BaseResult<SandboxRunResultDetails>
```

The details always include:

- `session_id`;
- ordered `events`;
- materialized `policy_decisions`;
- `alerts`;
- `blocked_records`;
- `blocked`;
- `event_count`.

Terminal aggregation:

1. callback or internal monitor failure -> `status: "failed"`, `risk_level: "high"`;
2. any `deny` decision -> `status: "blocked"`, `risk_level: "high"`;
3. otherwise any `alert` -> `status: "finished"`, `risk_level: "high"`;
4. otherwise any `ask` -> `status: "finished"`, `risk_level: "medium"`;
5. otherwise -> `status: "finished"`, `risk_level: "info"`.

`blocked` remains derived only from `blocked_records.length > 0`.

The result includes safe engine-private metadata:

```typescript
interface Track1MonitorMetadata {
  schema_version: "track1-monitor.v1";
  model_call_count: number;
  tool_call_count: number;
  decision_count: number;
  executed_tool_count: number;
  intercepted_tool_count: number;
  provider_failure_count: number;
}
```

No raw content, tool output, stack trace, or provider exception appears in metadata.

The candidate is passed to `normalizeBaseResult`. A null result raises `monitor_result_invalid`; an unnormalized terminal result is never returned.

## Code Style

Serialized engine boundaries use explicit snake_case fields and closed runtime normalization. Internal helpers remain small and single-purpose. Runtime validators construct new objects instead of returning caller-owned values.

Example:

```typescript
export function normalizeMonitorDecisionProposal(
  value: unknown
): MonitorDecisionProposal | null {
  if (
    !isPlainObject(value) ||
    !hasExactKeys(value, [
      "policy_id",
      "action",
      "reason_code",
      "reason",
      "evidence_refs"
    ]) ||
    !isNonEmptyString(value.policy_id) ||
    !isOneOf(SANDBOX_POLICY_ACTIONS, value.action) ||
    !isNonEmptyString(value.reason_code) ||
    !isNonEmptyString(value.reason) ||
    !isNonEmptyStringArray(value.evidence_refs)
  ) {
    return null;
  }

  return {
    policy_id: value.policy_id,
    action: value.action,
    reason_code: value.reason_code,
    reason: value.reason,
    evidence_refs: [...value.evidence_refs]
  };
}
```

The helper guards follow the repository's existing normalizer pattern. `isNonEmptyStringArray` also requires at least one entry.

## Replay-To-Monitor Adapter

`replay-adapter.ts` consumes `loadTrack1ReplayScenario` and runs every existing case through the real monitor API:

- fixture model callback returns `expected_outcome.model_behavior`;
- fixture provider returns `allow` at the model stage when a tool call follows;
- fixture provider returns the expected action at the tool stage;
- a tool-free case receives its expected action at the model stage;
- deterministic runtime ports derive IDs and timestamps from scenario/case inputs;
- all current tool-bearing cases are `deny` or `ask`, so the simulated executor is never called;
- every result passes `normalizeBaseResult`;
- all nine case IDs appear exactly once.

Existing `samples/track1/attack-scripts/T1-SC-NNN/replay.ts` files, REQ-006 compiler behavior, and byte-identical stdout are unchanged.

## Controlled Demo

Add one fixed demo entrypoint:

```text
samples/track1/monitor-plugin/demo.ts
```

The demo:

- runs all three fixed scenarios through the replay-to-monitor adapter;
- emits one JSON array containing nine normalized results;
- accepts no CLI path, model name, URL, token, or output destination;
- writes JSON only to stdout on success;
- writes a stable safe error to stderr and exits nonzero on failure;
- never calls a real model or network service;
- produces byte-identical output through deterministic adapter ports.

Command:

```powershell
node --experimental-strip-types samples/track1/monitor-plugin/demo.ts
```

Synthetic engine tests, separate from the nine-case demo, prove the `allow` and `alert` simulated execution paths.

## Stable Errors

```typescript
export type Track1MonitorErrorCode =
  | "monitor_context_invalid"
  | "monitor_model_request_invalid"
  | "monitor_model_response_invalid"
  | "monitor_tool_request_invalid"
  | "monitor_decision_invalid"
  | "monitor_model_failed"
  | "monitor_tool_failed"
  | "monitor_state_invalid"
  | "monitor_session_empty"
  | "monitor_result_invalid";
```

Errors contain a stable code and safe message only. They never contain prompt text, model output, tool arguments, tool output, provider output, stack trace, credentials, or tokens.

## Commands

Focused tests:

```powershell
node --experimental-strip-types --experimental-test-isolation=none --test engines/sandbox/tests/attack-monitor-contract.spec.ts
node --experimental-strip-types --experimental-test-isolation=none --test engines/sandbox/tests/attack-monitor-session.spec.ts
node --experimental-strip-types --experimental-test-isolation=none --test engines/sandbox/tests/attack-monitor-replay-adapter.spec.ts
node --experimental-strip-types --experimental-test-isolation=none --test engines/sandbox/tests/attack-monitor-demo.spec.ts
```

Quality gates:

```powershell
npm.cmd run test:engine:sandbox
npm.cmd run test:repo
npm.cmd run test:shared
npm.cmd run test:backend
npm.cmd run test:frontend
npm.cmd run test
```

No dependency is added.

## Testing Strategy

Implementation follows strict RED -> GREEN increments.

### Contract And Content Boundary

- reject malformed contexts, requests, responses, runtime ports, and provider proposals;
- accept only the four shared policy actions;
- canonicalize nested tool arguments before hashing;
- prove that hashes and references are stable;
- prove that provider input is deep-frozen and cannot alter the normalized tool request used by the executor;
- prove that raw values do not appear in safe events, metadata, errors, or serialized results.

### Model Middleware

- call the model callback exactly once;
- emit model input, model output, then policy decision in strict order;
- target the model-output event;
- cover all four model-stage actions;
- seal on ask, deny, provider failure, invalid output, and callback failure;
- clear monitor-held raw references after success and failure.

### Tool Middleware

- reject a tool call before a model call;
- reject malformed or cross-session simulated-tool requests;
- verify model-context hashes;
- call the tool callback exactly once for allow and alert;
- never call it for deny, ask, or provider failure;
- emit rejected no-state-change results for intercepted requests;
- strip raw read-file content and API response bodies from events and results;
- link alert and blocked records to the same subject as their decisions.

### Session And Result

- support multiple sequential model/tool rounds;
- reject concurrent operations;
- reject operations after sealing/finalization;
- make finalize idempotent;
- exercise every status/risk aggregation branch;
- validate event IDs, sequence order, counts, sessions, and record references;
- require every candidate result to pass `normalizeBaseResult`.

### Replay Adapter And Demo

- exercise all nine cases exactly once;
- preserve scenario/case/session correlation;
- prove current `must_not_execute` cases never invoke the executor;
- produce byte-identical output across repeated runs;
- prove existing REQ-006 entrypoint output remains unchanged;
- verify the demo emits nine results, empty stderr, and exit code zero;
- verify controlled failures emit no partial JSON.

### Repository Safety Gate

- register all four monitor tests in `test:engine:sandbox`;
- register a Track 1 monitor repository test in `test:repo`;
- scan monitoring and demo source for model SDKs, network imports, external process APIs, credentials, arbitrary path input, output-file APIs, and raw-content logging;
- preserve all existing test registrations.

## Planned Project Structure

```text
engines/sandbox/
  src/monitoring/
    contract.ts
    content-boundary.ts
    session.ts
    result-builder.ts
    replay-adapter.ts
    index.ts
  tests/
    attack-monitor-contract.spec.ts
    attack-monitor-session.spec.ts
    attack-monitor-replay-adapter.spec.ts
    attack-monitor-demo.spec.ts
  README.md

samples/track1/monitor-plugin/
  README.md
  demo.ts

tests/repository/
  track1-monitor-plugin.spec.ts

docs/
  sprint-current.md
  architecture.md
  progress.md
```

Implementation updates root package test registration. `README.md` and `docs/api-contract.md` are inspected and remain unchanged unless their existing capability or contract description becomes inaccurate.

## Boundaries

Always:

- validate every engine-private input at runtime;
- intercept before a tool callback;
- use the injected decision provider at both model-output and tool-request stages;
- fail closed on provider failure;
- normalize every terminal result through the shared contract;
- keep raw values ephemeral and out of monitor state;
- use only simulated tools in REQ-007 tests and demo;
- preserve REQ-006 script output.

Ask first:

- changing a shared event or result contract;
- adding backend routes, persistence, frontend behavior, or streaming transport;
- adding cluster IDs, agent IDs, or trace/span fields;
- adding a model SDK, network client, external service, or dependency;
- integrating OpenClaw;
- implementing approval resumption;
- changing existing case fixtures, scenario manifests, or replay scripts.

Never:

- execute a real external tool or network request;
- send email or touch host files;
- call a real model provider;
- retain raw prompt, model output, tool argument, or tool result values in session fields;
- serialize raw values or exceptions;
- call a tool callback after deny, ask, or provider failure;
- convert provider failure into allow or alert;
- accept arbitrary caller paths or output destinations;
- begin REQ-008 filtering rules in this requirement.

## Out Of Scope

- Rule-based or model-based detection logic.
- OpenClaw or other agent-framework adapters.
- Cross-agent cluster aggregation.
- Backend task dispatch or result persistence.
- Public REST API changes.
- Frontend supervision views.
- Human approval and resume workflow.
- SSE, WebSocket, or polling.
- Real model, email, filesystem, API, or memory services.
- Shared contract changes.
- Report generation.

## Success Criteria

- A reusable session-level monitor wraps model and simulated-tool calls.
- The monitor evaluates both model-output and tool-request stages through an injected provider.
- All four policy actions produce the approved execution and record semantics.
- Provider failure fails closed and never invokes the tool callback.
- Ask and deny seal the session; allow and alert can continue.
- Multiple sequential rounds preserve strict event ordering and correlation.
- Finalization returns a complete normalized shared sandbox result.
- No raw model or tool content survives in monitor state or serialized output.
- All nine existing Track 1 cases run through the monitor adapter exactly once.
- Current unsafe tool cases are intercepted before executor invocation.
- Synthetic allow and alert tests prove safe simulated-tool execution.
- The fixed demo emits nine deterministic normalized results.
- Existing REQ-006 scripts remain byte-identical and all earlier gates remain green.
- Focused monitor, sandbox-engine, repository, and shared gates pass.
- Architecture, sandbox README, sprint, and progress docs describe the verified plugin boundary.

## Open Questions

None. Product, architecture, safety, and integration decisions required for REQ-007 are approved.
