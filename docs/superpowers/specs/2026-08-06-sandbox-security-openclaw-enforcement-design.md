# Spec: REQ-SBX-GENERAL-004 OpenClaw Sandbox Security Enforcement

## Document Status

- Requirement: `REQ-SBX-GENERAL-004`
- Name: OpenClaw sandbox security enforcement
- Date: `2026-08-06`
- Status: `SPEC_DRAFT_PENDING_USER_REVIEW`
- Workflow: `Design -> Test (RED) -> Implement (GREEN) -> Document -> Stop`
- Dependencies: GENERAL-001, GENERAL-002, and GENERAL-003
- Next requirement: GENERAL-005 remains deferred

This is the written specification of the decisions approved during the design
dialogue. It is documentation-only and therefore uses the repository's
document/configuration exception to full TDD. It does not authorize production
implementation, an implementation plan, or a `VERIFIED` status. The user must
review and approve this written specification before the planning skill is
used.

GENERAL-002 remains `PROVISIONAL_ACCEPTED_PENDING_P6_RECAPTURE`. GENERAL-003
has completed its implementation work at
`IMPLEMENTED_PENDING_GLOBAL_P6_GATE`; the unresolved GENERAL-002 global P6 gate
is inherited and is not reopened by this requirement. Neither dependency may
be described as globally `VERIFIED` by GENERAL-004.

## Canonical Inputs

- [`metadata.md`](../../../metadata.md)
- [`AGENTS.md`](../../../AGENTS.md)
- [`docs/sprint-current.md`](../../sprint-current.md)
- [`docs/architecture.md`](../../architecture.md)
- [`docs/api-contract.md`](../../api-contract.md)
- [`2026-07-10-sandbox-general-security-design.md`](2026-07-10-sandbox-general-security-design.md)
- [`2026-07-10-sandbox-security-core-spec.md`](2026-07-10-sandbox-security-core-spec.md)
- [`2026-07-16-sandbox-security-production-detectors-spec.md`](2026-07-16-sandbox-security-production-detectors-spec.md)
- [`2026-08-05-sandbox-security-backend-api-design.md`](2026-08-05-sandbox-security-backend-api-design.md)
- The pinned Track 1 OpenClaw runtime and native plugin contracts under
  `integrations/openclaw/`.

GENERAL-001, GENERAL-002, and GENERAL-003 remain authoritative for the Engine
decision schema, profile IDs, detector semantics, normal work budget, public
backend contracts, capability TTL policy, and durable-audit privacy rules.
This specification composes those public boundaries; it does not duplicate or
redefine their detector, reducer, or acceptance logic.

## Goal

Enforce the sandbox security Engine at the final, awaited OpenClaw side-effect
barriers for one complete agent turn:

1. inspect the current user input before model invocation;
2. inspect the exact final assistant projection before any tool execution or
   assistant delivery;
3. inspect each final tool request immediately before tool execution; and
4. inspect each final outbound assistant message immediately before delivery.

Every evaluation must use an authoritative, content-minimal projection of the
current runtime event. An Engine action must be applied before the associated
side effect. Missing, duplicated, drifting, malformed, unsupported, timed-out,
or otherwise unavailable enforcement fails closed. The integration must never
silently continue without its security plugin and patched barriers.

## Scope

### In Scope

- A separate general-security OpenClaw plugin and runtime under
  `integrations/openclaw/`.
- Exact OpenClaw `2026.6.34` base-package pin and a small audited patch that
  exposes the required final barriers.
- Authority reconstruction for `user_input`, `model_output`, and
  `tool_request` Engine stages.
- A process-level GENERAL-002 production Engine composed through the public
  GENERAL-001 and GENERAL-002 indexes.
- Fixed action mapping, replacement responses, fail-closed behavior, and
  per-run/per-call correlation.
- A dedicated content-free internal audit route using the GENERAL-003
  repository and SQLite schema migration from v1 to v2.
- Plugin configuration validation, startup integrity gates, bounded Engine
  concurrency, and non-durable OpenClaw session paths.
- Unit, integration, repository, privacy, patch-integrity, and Track 1
  regression tests described in this document.

### Out of Scope

- Changes to GENERAL-001 profiles, canonicalization, reducer, detector limits,
  Engine result semantics, or Track 1 behavior.
- Changes to GENERAL-002 detector implementations, providers, benchmark
  fixtures, sealed evidence, or P6/P7 acceptance.
- Interactive approval, resume, retry, or human-in-the-loop workflows for an
  `ask` action.
- A frontend component, browser storage contract, public frontend API, or
  audit UI. Those belong to GENERAL-005.
- Public network enforcement routes. OpenClaw calls the dedicated internal
  audit route; Engine evaluation remains in-process.
- A second backend, worker, sidecar, queue, persistent enforcement event
  queue, or distributed concurrency/rate limiter.
- Caller-selected timeout, retry, fallback, provider, model, endpoint, policy
  rules, replacement text, or Engine mode.
- Binary, image, audio, archive, or arbitrary multimodal parsing.
- A guarantee against malicious trusted in-process plugin or Engine code,
  physical-memory inspection, or OS swap/DevTools compromise.

## Success Criteria

The requirement is accepted only when all of the following are demonstrated:

- `before_agent_run`, `before_model_output_delivery`,
  `before_tool_execution`, and `before_message_delivery` are present,
  registered exactly once, awaited, and run after the final host rewrite for
  their event.
- A side effect cannot occur after an Engine `ask` or `deny`, and a required
  failure cannot result in `allow` or ordinary delivery.
- Authority projections contain only the approved current prompt, exact
  assistant projection, matching model output, final tool call, or final
  post-rewrite outbound payload for the relevant barrier.
- Same-session concurrent turns, multiple tool calls, and correlation drift
  cannot cross-contaminate evaluations.
- Startup rejects a missing or duplicated enforcement plugin, a missing
  barrier, an invalid OpenClaw package identity, or a changed patch digest.
- Completed and interrupted enforcement evaluations are audited through the
  dedicated capability, without changing the already selected host action
  when audit is unavailable.
- SQLite v1 data is preserved and upgraded idempotently to v2, and replay or
  event-ID conflict behavior is deterministic.
- Raw or transformed application content is absent from all plugin logs,
  metrics, traces, errors, responses, audit payloads, queues, caches, and
  durable artifacts covered by the tests.
- All existing Track 1 gates remain green and the expected dependency-bounded
  `npm run test:all` result is reported honestly.

## Architecture

```text
Patched OpenClaw 2026.6.34
  -> final awaited enforcement barriers
  -> general-security plugin/runtime
  -> authoritative request builder
  -> one sandbox production Engine (GENERAL-002)
  -> action mapper
     -> continue / replace / stop
     -> content-free audit client
        -> authenticated internal backend route
        -> GENERAL-003 SQLite audit repository
```

Track 1 remains a separate plugin/runtime, keeps OpenClaw `2026.6.10`, its
existing constants and evidence, and is not loaded together with the
general-security plugin in the same acceptance fixture. The new plugin may
share only public shared contracts and public Engine indexes. It must not
import detector, profile, reducer, sanitizer, or backend repository internals.

### Ownership

- The OpenClaw patch owns host ordering, final-value capture, hook awaiting,
  duplicate-registration detection, and side-effect suppression.
- `integrations/openclaw/src/general-security/` owns configuration,
  correlation, authority reconstruction, action mapping, audit invocation, and
  plugin lifecycle.
- `engines/sandbox/src/security/index.ts` and
  `engines/sandbox/src/security-production/index.ts` own Engine creation and
  production composition. Integration code only invokes the public
  `evaluate` contract.
- GENERAL-003's backend route, capability authorizer, content-free projector,
  SQLite repository, and retention policy remain the audit authority.

### Startup and Lifetime

Startup performs these steps in order:

1. verify the exact OpenClaw package version, npm integrity, patch manifest,
   patch digest, and patched-file hashes;
2. load and validate one immutable general-security configuration;
3. create exactly one process-level production Engine and its bounded runtime
   ports;
4. probe all four final barriers and the dedicated audit capability; and
5. register the plugin hooks.

Any failure in steps 1 through 4 aborts startup before hook registration. A
runtime failure after registration fails closed for the current event and
marks plugin health `degraded`; it never unregisters the barrier or bypasses
enforcement. A global Engine concurrency limit of four matches GENERAL-003.
There is no waiting queue: when an Engine slot is unavailable, the current
event uses the appropriate fail-closed action.

## OpenClaw Supply-Chain and Patch Contract

The general-security runtime uses exactly:

```text
openclaw@2026.6.34
sha512-Rm4khBrWn9HYqE99NBryCFgjwlsIuwBqK5jIANn2773CGXJ1JIZkDn5twEHB+8SVFdh0FPNPHRVgZepzNJDfHg==
Node >=22.19.0
```

The official `latest`, `extended-stable`, and beta channels were checked and
none supplies the awaited model-output enforcement gate required here. The
patch therefore remains a minimal, reviewed integration artifact. It must
record the base version and integrity, patch SHA-256, every patched file's
expected pre- and post-patch hash, the patch tool version, and runtime probe
evidence. A changed upstream tarball, patch identity, or file hash is a hard
startup error.

The patch adds or exposes these final hook contracts:

| Barrier | Event observed | Required placement | Required result |
| --- | --- | --- | --- |
| `before_agent_run` | current user prompt | after ordinary input normalization and before model invocation | awaited plugin decision; no model call after stop |
| `before_model_output_delivery` | exact final assistant projection | after model/tool-call post-processing and before tool dispatch or delivery | awaited plugin decision; no original projection after replace/stop |
| `before_tool_execution` | exact final tool name, call ID, and parameters | after tool/payload rewrites and immediately before tool side effect | awaited plugin decision; no tool execution after stop |
| `before_message_delivery` | exact final post-rewrite outbound text/payload | after outbound rewrites and immediately before transport delivery | awaited plugin decision; no original payload after replace/stop |

The patched barriers carry stable `runId`, `sessionKey`, and a call
correlation. They await the plugin Promise and fail closed on timeout, thrown
error, malformed return, missing correlation, or plugin health `degraded`.
The patch must not create a second delivery path that can bypass the barrier.

## Immutable Plugin Configuration

The plugin accepts one validated configuration at startup and never reads
caller-supplied replacements, policy, provider, or timeout values:

```ts
interface OpenClawSandboxSecurityConfig {
  policyProfileId:
    | "sandbox-security-balanced.v1"
    | "sandbox-security-strict.v1";
  productionMode: "rule_only" | "local" | "local_and_judge";
  auditEndpoint: string;
  auditCapabilityToken: string;
}
```

All four fields are required. `auditEndpoint` must be the configured internal
listener route for `POST /internal/sandbox/security/enforcement-events`; it
cannot target a public listener or arbitrary host selected by a request.
`auditCapabilityToken` is a dedicated bearer capability with scope
`sandbox_security:enforcement:audit:write`; it is not the GENERAL-003 bootstrap
administrator secret. The existing GENERAL-003 maximum capability TTL of one
hour remains in force. Automatic token rotation is out of scope. An expired
audit token degrades audit only and does not disable Engine enforcement.

The effective composition binding is fixed to
`sandbox-security-production-composition.v1:<productionMode>`. A process must
not accept a different profile, mode, endpoint, token, or composition binding
after startup.

## Authority Reconstruction

The builder creates an Engine-private
`SandboxSecurityEvaluationRequest` with a public submission and a trusted
authoritative context. Every field is normalized with the existing strict
GENERAL-001 boundary, then cloned/frozen before evaluation. Generic OpenClaw
history and composite prompts are not authority.

### Approved Authority Matrix

| Barrier | Engine stage | Allowed authoritative projection |
| --- | --- | --- |
| `before_agent_run` | `user_input` | the current prompt only, as `user_input` |
| `before_model_output_delivery` | `model_output` | the current prompt plus the exact assistant projection |
| `before_tool_execution` | `tool_request` | the current prompt, the matching assistant projection, and final tool name/call ID/arguments |
| `before_message_delivery` | `model_output` | the current prompt plus the final post-rewrite assistant text/payload |

The current prompt is the prompt belonging to the same `runId` and turn. The
model barrier uses the exact final projection after all ordinary host rewrites;
it must not use an earlier streaming chunk. The tool barrier uses the exact
final request after all tool argument or target rewrites. The outbound barrier
uses the final payload after all message rewrites. The builder never guesses a
tool target: it omits `target` unless the patched host exposes a strict,
provenance-tagged parser for it.

The builder must not trust or include composite `systemPrompt`, generic
history, workspace, memory, retrieval, hidden metadata, provider traces, or
unattributed transcript segments. A future host may add a segment only when it
supplies an explicit provenance-tagged source observation and a reviewed
adapter contract.

### Assistant Projection

The projection is integration-private and closed:

```ts
interface OpenClawSecurityAssistantProjection {
  schema_version: "openclaw-security-assistant-projection.v1";
  text_parts: string[];
  tool_calls: Array<{
    call_id: string;
    tool_name: string;
    arguments: SandboxSecurityJsonValue;
  }>;
}
```

Only known text and tool-call blocks are admitted. Unknown blocks, malformed
arguments, duplicate call IDs, prototype/accessor properties, cyclic values,
sparse arrays, non-finite numbers, and unsupported binary or multimodal values
fail closed with `ask` at user/model/outbound points and `deny` at tool points.
The projection is not returned to the host as an audit payload.

### Correlation and Concurrency

Each evaluation carries an immutable `runId`, `sessionKey`, `requestId`, and,
when applicable, `callId`. Correlation is checked at entry and immediately
before applying the result. A result for a different run, session, call, stage,
profile, or final-value digest is invalid and fails closed. Same-session turns
are independent; multiple tool calls in one turn are distinct evaluations.
Correlation state is ephemeral and is deleted after a terminal pass, replace,
stop, or interruption. Raw values must not be kept in instance fields after
the evaluation returns.

## Engine Composition and Barrier API

The runtime constructs one Engine before hook registration using only:

```text
engines/sandbox/src/security/index.ts
engines/sandbox/src/security-production/index.ts
```

The integration does not call profile resolvers, detector registries, policy
reducers, sanitizer internals, or private adapters. The Engine's existing
normal work budget and semantic fail-closed behavior remain authoritative. A
fixed host barrier deadline is implementation-owned and immutable; it may not
be supplied by a caller or config file. The planned default is 10,000 ms, with
the Engine retaining its own internal budget and caller abort signal.

The plugin's internal hook result is deliberately smaller than the public
Engine decision:

```ts
type OpenClawSecurityBarrierResult =
  | { outcome: "pass" }
  | {
      outcome: "replace";
      replacement_code:
        | "security_review_required"
        | "sandbox_security_policy_blocked"
        | "sandbox_security_evaluation_unavailable";
      replacement_text: string;
    };
```

The mapper may return `pass` only for Engine `allow` or `alert`. It may return
`replace` for `ask`, `deny`, or a required failure. It never exposes raw
findings, locators, detector output, provider data, or the original content to
OpenClaw's hook result.

## Action Semantics

The Engine action is selected first and is immutable before audit begins.

| Engine action | User/model/outbound barrier | Tool barrier |
| --- | --- | --- |
| `allow` | continue original event | execute tool |
| `alert` | continue original event and audit | execute tool and audit |
| `ask` | stop current action/turn and replace with review copy | do not execute; stop current turn and replace with review copy |
| `deny` | stop current action/turn and replace with blocked copy | do not execute; stop current turn and replace with blocked copy |

`ask` never opens an interactive approval request and never resumes the blocked
action. The exact replacement strings are:

```text
Security review required. This action was not completed.
Blocked by sandbox security policy.
Security evaluation unavailable. This action was not completed.
```

The first is used for `ask`, the second for `deny`, and the third for a
required evaluation failure. A failure floor is `ask` for user input, model
output, and outbound delivery, and `deny` for tool execution. Unknown or
malformed Engine decisions are failures. A replacement must be the only
outbound result for the stopped event; the original blocked content is not
persisted.

## Failure and Interruption Rules

The following all fail closed:

- missing, duplicated, unawaited, or drifting barrier registration;
- missing run/session/call correlation or final-value mismatch;
- authority builder rejection, unknown content block, unsupported media, or
  strict JSON normalization failure;
- Engine throw, timeout, invalid decision, unavailable slot, or composition
  mismatch;
- missing, duplicated, or invalidly configured enforcement plugin;
- invalid OpenClaw package, patch manifest, patch digest, or runtime probe;
- an audit client request that violates the dedicated content-free contract
  (the preselected Engine action still remains in effect).

An interruption is audited as `enforcement_interrupted` with a stable closed
interruption code and the applied fail-closed action. An Engine failure is not
converted to `alert` or `allow`. Host cancellation aborts the current
evaluation and converges to the same failure floor. There is no background
retry or resume path in v1.

## Audit Integration

### Internal Route

The plugin uses this backend route only:

```http
POST /internal/sandbox/security/enforcement-events
Authorization: Bearer <dedicated-capability>
Content-Type: application/json
```

The capability must have exactly the new scope:

```text
sandbox_security:enforcement:audit:write
```

The route is internal-listener-only and must not reuse bootstrap administrator
credentials. The backend authenticates the capability, injects the
authenticated `subject_id`, capability ID, authorization scope, and server
time, then passes a strict content-free projection to the GENERAL-003 audit
repository.

### Request and Acknowledgement

The request contains only the following fields:

```ts
interface OpenClawEnforcementAuditRequest {
  schema_version: "sandbox-security-enforcement-audit-request.v1";
  event_id: string;
  request_id: string;
  enforcement_point:
    | "before_agent_run"
    | "before_model_output_delivery"
    | "before_tool_execution"
    | "before_message_delivery";
  stage: "user_input" | "model_output" | "tool_request";
  policy_profile_id:
    | "sandbox-security-balanced.v1"
    | "sandbox-security-strict.v1";
  composition_binding:
    | "sandbox-security-production-composition.v1:rule_only"
    | "sandbox-security-production-composition.v1:local"
    | "sandbox-security-production-composition.v1:local_and_judge";
  elapsed_ms: number;
  outcome: "enforcement_completed" | "enforcement_interrupted";
  verdict?: "no_detected_risk" | "risk_detected" | "indeterminate";
  action?: "allow" | "alert" | "ask" | "deny";
  risk_level?: "info" | "low" | "medium" | "high" | "critical";
  category_counts?: Record<string, number>;
  detector_run_status_counts?: Record<string, number>;
  host_outcome?: "continued" | "replaced";
  interruption_code?: string;
  applied_fail_closed_action?: "ask" | "deny";
}
```

The implementation must use closed catalogs and exact-key normalization; the
`Record<string, number>` notation above is shorthand for the existing
GENERAL-003 risk-category and detector-status catalogs. Completed events carry
the decision projection and `host_outcome`; interrupted events carry only a
stable interruption code and `applied_fail_closed_action`.

The request must reject and never accept: subject, authorization scope or
capability ID, occurred-at, a full Decision, findings, locator or evidence
references, provider data, free text, raw or sanitized content, ordinary
content hashes, session history, run IDs, call IDs, or replacement text. No
OpenClaw transcript field is copied into this request.

The route acknowledges with:

```ts
interface OpenClawEnforcementAuditAck {
  schema_version: "sandbox-security-enforcement-audit-ack.v1";
  event_id: string;
  status: "accepted" | "replayed";
  occurred_at: string;
}
```

HTTP behavior is fixed: `201` for an accepted event, `200` for an identical
event-ID replay, and `409` when an event ID is reused with a different
content-free projection. Authentication, normalization, and storage failures
are returned without raw request values.

### Audit Ordering and Health

For every completed or interrupted evaluation:

1. freeze the content-free projection;
2. select the immutable Engine action and host replacement/continue outcome;
3. attempt the audit request with a fixed 1,000 ms timeout; and
4. return the already selected host outcome regardless of audit success.

On timeout, authentication failure, storage failure, or malformed
acknowledgement, the plugin records only an internal error code, bounded count,
and elapsed time, then marks health `degraded`. Audit failure never changes an
already selected Engine action and never causes an original blocked event to be
released. There is no persistent queue or background retry in v1.

## SQLite v2 Migration

GENERAL-003's SQLite v1 schema remains the base. GENERAL-004 adds an explicit,
transactional v2 migration that:

- preserves all existing rows, foreign keys, retention indexes, subject SQL
  predicate, 90-day retention, 64 KiB event cap, and purge semantics;
- extends the capability-scope catalog with
  `sandbox_security:enforcement:audit:write`;
- extends the audit-event catalog with `enforcement_completed` and
  `enforcement_interrupted`;
- records the migration in the schema-migrations table and rejects an unknown,
  skipped, or partially applied version;
- validates the v1 object definitions before migration and the v2 object
  definitions after migration; and
- implements idempotent append, identical replay, and event-ID payload
  conflict behavior for enforcement events.

The migration must not rewrite event JSON, recalculate identities, drop
indexes, change capability TTL limits, or broaden audit visibility. Existing
GENERAL-003 capability policy is unchanged; only the new dedicated audit scope
is added.

## Privacy and Runtime Storage

Raw values are transient in the current OpenClaw call only. The plugin must not
retain them in instance fields after evaluation and must not include them in
logs, metrics, traces, thrown errors, HTTP responses, audit requests, queues,
caches, snapshots, crash artifacts, or durable files. Raw-stream and debug
capture are disabled for this runtime.

OpenClaw session, transcript, and plugin scratch paths use non-durable tmpfs in
the deployment. Blocked original content is discarded; only one of the fixed
replacement strings may be emitted or recorded. Track 1's existing storage
and evidence rules remain unchanged and are tested separately.

Content-free audit projections may retain only the approved category and
detector status counts, verdict/action/risk, timing, stage/profile/composition,
enforcement point, host outcome, or stable interruption code. No ordinary
content hash is an acceptable substitute for this rule.

## Planned Implementation Surface

New integration files:

```text
integrations/openclaw/src/general-security/
  config.ts
  authority-builder.ts
  action-mapper.ts
  audit-client.ts
  plugin.ts
  runtime.ts
  index.ts

integrations/openclaw/tests/general-security-authority.spec.ts
integrations/openclaw/tests/general-security-action-mapper.spec.ts
integrations/openclaw/tests/general-security-plugin.spec.ts
integrations/openclaw/tests/general-security-audit-client.spec.ts
integrations/openclaw/tests/general-security-runtime.spec.ts
integrations/openclaw/openclaw-security.plugin.json
integrations/openclaw/config/openclaw-security.json5
integrations/openclaw/patches/openclaw-2026.6.34-general-security.patch
integrations/openclaw/patches/openclaw-2026.6.34-general-security.manifest.json
integrations/openclaw/scripts/apply-general-security-patch.mjs
```

New backend and repository tests/surfaces:

```text
backend/src/modules/sandbox-security/enforcement-audit.service.ts
backend/src/modules/sandbox-security/sandbox-security-enforcement-audit.controller.ts
tests/integration/openclaw-sandbox-security.runtime.spec.ts
tests/repository/sandbox-security-openclaw-enforcement.spec.ts
deploy/sandbox-security/Dockerfile.openclaw
deploy/sandbox-security/compose.openclaw-security.yml
deploy/sandbox-security/README.md
```

Event and route types belong in the existing shared/backend sandbox-security
module boundary. Event normalization must be added to the canonical shared
contract rather than duplicated inside the plugin. Event repositories and
SQLite adapters remain backend-owned. Root package scripts, lockfiles,
OpenClaw package/build files, and required durable documentation are modified
only during implementation after the plan is approved.

No frontend file is planned for GENERAL-004.

## Test-First Execution Plan

This document does not add tests because it is a specification-only change.
When implementation is authorized, RED must be observed before any production
logic is added. The required order is:

1. **Runtime barriers:** tests fail when any required barrier is missing,
   duplicated, unawaited, or placed after a side effect.
2. **Authority builder:** tests fail for wrong stage, stale prompt, generic
   history, composite system prompt, guessed target, unknown blocks,
   malformed JSON, correlation drift, and unsupported binary/multimodal input.
3. **Action mapping and hooks:** tests fail for all four actions at every
   enforcement point, fixed replacement text, no approval/resume, and failure
   floors (`ask` for user/model/outbound, `deny` for tools).
4. **Shared/backend audit contract:** tests fail for extra fields, wrong scope,
   wrong route/listener, bad acknowledgement, replay, and conflict.
5. **SQLite migration:** tests fail against v1 fixtures before the v2 migration
   exists, then verify preservation, catalog changes, idempotency, and
   retention.
6. **Patched runtime ordering:** tests fail when post-hook rewrites are not
   evaluated at the final barriers or when duplicate tool calls share state.
7. **Permanent privacy and regression gates:** tests fail on raw-content and
   transformed-content leakage, patch-integrity drift, missing startup probes,
   and any Track 1 regression.

The matrix must cover:

- every barrier x `allow`, `alert`, `ask`, and `deny`;
- Engine throw, timeout, invalid decision, unavailable slot, and authority
  mismatch;
- missing/duplicate/drifting run IDs, session keys, request IDs, and call IDs;
- same-session concurrent turns and multi-call turns;
- malformed objects, prototype/accessor/cyclic/sparse/non-finite JSON;
- existing Engine size, depth, candidate, detector, and time boundaries;
- unsupported binary/multimodal payloads;
- audit authentication, storage, timeout, replay, and conflict;
- missing plugin/barriers and incorrect package, patch, or file digests; and
- raw and transformed content scans across application-managed output surfaces.

The focused commands are:

```text
npm run test:integration:openclaw:security
npm run test:repo
npm run test:shared
npm run test:backend
npm run test:engine:sandbox
npm run test:engine:sandbox:production
npm run test:all
```

`npm run test:all` must be attempted. Its expected failure while GENERAL-002
lacks the signed P6 recapture and hermetic replay is a dependency gate, not a
reason to weaken this requirement's fail-closed behavior or to claim global
verification.

## Acceptance and Documentation Boundary

Acceptance evidence must include the exact package integrity, patch manifest,
patched-file hashes, startup probe output, barrier ordering traces without raw
values, action matrix results, audit replay/conflict results, v1-to-v2 migration
results, privacy scan output, and Track 1 regression results. Evidence may use
opaque IDs and counts only.

After implementation, update `README.md`, `docs/architecture.md`,
`docs/api-contract.md`, and `docs/progress.md` only to describe behavior that
is actually implemented and tested. During this specification-only phase,
those documents must not be updated as implemented state. The active sprint is
the sole status document changed now.

## Review Questions Before Planning

The user review must confirm:

- the exact OpenClaw version/integrity and the four barrier names/order;
- the authority matrix and private assistant projection;
- action, replacement, failure-floor, and audit independence semantics;
- the dedicated capability scope and SQLite v2 catalog changes;
- the no-raw-retention and tmpfs requirements; and
- the listed implementation/test surface and explicit GENERAL-005 deferral.

No implementation plan should be written until this specification receives
explicit user approval.
