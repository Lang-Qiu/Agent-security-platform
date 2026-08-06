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

## Independent Review Record

- Final verdict: `PASS`
- Critical findings: `0`
- Important findings: `0`
- Minor findings: `0`
- Review mode: independent read-only subagent review
- Closed areas: enforcement/audit health separation, exact audit unions,
  versioned private capability provisioning, public v1 compatibility,
  `event_schema` repository filtering, replay timestamp identity, response
  envelope relations, internal HTTP admission, package/image isolation,
  replacement provenance, privacy, and implementation signatures

The final independent re-review was performed after all earlier Critical,
Important, and Minor findings were corrected. It does not authorize
implementation; explicit user approval of this written specification remains
the next gate.

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
- A versioned internal provisioning variant on the existing capability-issue
  route for the dedicated audit token; existing GENERAL-003 v1 capability
  request/types remain unchanged.
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
- Every completed and interrupted enforcement evaluation attempts the
  dedicated content-free audit write. Successful writes are persisted; an
  unavailable audit service is recorded only in audit health/counters and
  never changes the already selected host action.
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

### Package and Image Isolation

The existing `integrations/openclaw/` package root is the Track 1 package. Its
`package.json`, dependency resolution, build output, plugin manifest, and
runtime image remain pinned to `openclaw@2026.6.10` and are not reused for
GENERAL-004. The general-security runtime is a second standalone package root
at `integrations/openclaw/general-security/` with its own `package.json`,
lockfile, `node_modules`, plugin entry, build output, and exact
`openclaw@2026.6.34` dependency. The nested package is deliberately not
implicitly merged into the current Track 1 workspace package.

The general-security Docker image installs only that nested package with its
own frozen lockfile and copies only its plugin/configuration plus the public
Engine/shared build inputs. The Track 1 image and compose service retain their
existing build context and dependency tree. A startup probe rejects a plugin
loaded from the other package root, a duplicate OpenClaw package identity, or
an image containing both plugin manifests in one runtime.

### Ownership

- The OpenClaw patch owns host ordering, final-value capture, hook awaiting,
  duplicate-registration detection, and side-effect suppression.
- `integrations/openclaw/general-security/src/general-security/` owns
  configuration,
  correlation, authority reconstruction, action mapping, audit invocation, and
  plugin lifecycle.
- `engines/sandbox/src/security/index.ts` and
  `engines/sandbox/src/security-production/index.ts` own Engine creation and
  production composition. Integration code only invokes the public
  `evaluate` contract.
- GENERAL-003's backend route, capability authorizer, content-free projector,
  SQLite repository, and retention policy remain the audit authority.

### UI Component Skeleton

GENERAL-004 has no frontend component or public frontend API. The backend and
OpenClaw runtime are the complete user-facing enforcement boundary for this
requirement. GENERAL-005 owns the future workbench, audit view, and frontend
presentation of any compatible audit contract.

### Backend Function Signatures

The implementation must keep these explicit backend boundaries (names may be
adapted only without changing their parameter/return semantics):

```ts
interface OpenClawEnforcementAuditIdentity {
  subject_id: string;
  capability_id: string;
  authorization_scope_id: string;
}

interface SandboxSecurityEnforcementAuditService {
  appendEnforcementEvent(
    request: Readonly<OpenClawEnforcementAuditRequest>,
    identity: Readonly<OpenClawEnforcementAuditIdentity>
  ): Promise<Readonly<OpenClawEnforcementAuditAck>>;
}

interface SandboxSecurityEnforcementAuditRepository {
  append(input: Readonly<{
    candidate: Readonly<SandboxSecurityEnforcementAuditEventCandidate>;
    occurred_at: string;
  }>): Readonly<{
    event_id: string;
    status: "accepted" | "replayed";
    occurred_at: string;
  }>;
}

interface SandboxSecurityEnforcementAuditCapabilityService {
  issueEnforcementAudit(
    request: Readonly<
      SandboxSecurityEnforcementAuditCapabilityIssueRequest
    >
  ): Readonly<SandboxSecurityEnforcementAuditCapabilityIssueResult>;
}

interface SandboxSecurityEnforcementAuditController {
  enforcementAudit(
    request: IncomingMessage,
    request_id: string
  ): Promise<HttpResponse>;
}

interface SandboxSecurityAdminController {
  issue(
    request: IncomingMessage,
    request_id: string
  ): Promise<HttpResponse>; // exact schema dispatch, including new branch
}
```

The controller owns listener/method/authentication/body admission and invokes
the service only after exact normalization. The service injects authenticated
identity, obtains server time from its runtime port, maps to a candidate that
excludes `occurred_at`, and delegates idempotency to the dual-union repository.
Neither service nor repository accepts raw content, a client-supplied identity,
or a caller-selected action.

The existing administrator controller keeps its `issue` route/method and
dispatches to `issueEnforcementAudit` only after the new exact schema has been
normalized. The legacy schema continues to call the unchanged GENERAL-003
capability service method. Both branches share admission and administrator
authentication but have disjoint normalized DTOs and result schemas.

`SandboxSecurityEnforcementAuditEventCandidate` is the exact dedicated durable
union with `occurred_at` omitted independently from each variant; it is not a
loose partial type. Every other backend-injected identity and variant field is
required before repository append.

### Startup and Lifetime

Startup performs these steps in order:

1. verify the exact OpenClaw package version, npm integrity, patch manifest,
   patch digest, and patched-file hashes;
2. load and validate one immutable general-security configuration;
3. create exactly one process-level production Engine and its bounded runtime
   ports;
4. probe all four final barriers and the dedicated audit route/configuration;
   a missing or malformed capability fails startup, while a valid-form but
   expired/rejected audit token only marks audit health degraded; and
5. register the plugin hooks.

Any failure in steps 1 through 3, or a failed barrier probe in step 4, aborts
startup before hook registration. A valid-form audit token rejection during
the step-4 connectivity probe does not abort enforcement startup; it records
audit degradation and continues with the barriers enabled. The
runtime has two independent health states:

```ts
interface OpenClawSecurityHealth {
  enforcement: "healthy" | "failed";
  audit: "healthy" | "degraded";
}
```

The patched barriers inspect `enforcement`, not `audit`. A fatal runtime
failure after registration sets `enforcement: "failed"` and fails closed for
the current event; it never unregisters the barrier or bypasses enforcement.
An audit timeout, expired audit token, audit authentication/storage failure, or
malformed audit acknowledgement sets only `audit: "degraded"`. A global Engine
concurrency limit of four matches GENERAL-003. There is no waiting queue: when
an Engine slot is unavailable, the current event uses the appropriate
fail-closed action.

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
error, malformed return, missing correlation, or `enforcement: "failed"`.
They do not fail closed merely because `audit` is `"degraded"`. The patch must
not create a second delivery path that can bypass the barrier.

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

The dedicated capability grant contains exactly the configured
`policyProfileId`, all three Engine stages (`user_input`, `model_output`, and
`tool_request`), and an authorization-scope identity bound by GENERAL-003 to
the backend's current production composition. The plugin copies profile and
composition binding only from its frozen startup configuration; neither may be
derived from an OpenClaw event. Startup verifies that the capability grant and
backend composition match the plugin configuration. A valid-form token that
is expired or rejected follows the audit-only degradation rule above.

### Dedicated Capability Provisioning

GENERAL-003's `SandboxSecurityCapabilityScope` v1 union and capability issue
request remain closed and unchanged. The database storage scope catalog gains
the internal literal `sandbox_security:enforcement:audit:write`, represented by
a separate `SandboxSecurityEnforcementAuditCapabilityScope` type. The existing
internal route `POST /internal/sandbox/security/capabilities` dispatches by
`schema_version` after its unchanged administrator authentication/body
admission. Its existing GENERAL-003 v1 branch is byte- and behavior-compatible;
the new exact branch accepts only:

```ts
interface SandboxSecurityEnforcementAuditCapabilityIssueRequest {
  schema_version:
    "sandbox-security-enforcement-audit-capability-issue-request.v1";
  subject_id: string;
  policy_profile_id:
    | "sandbox-security-balanced.v1"
    | "sandbox-security-strict.v1";
  ttl_seconds: number;
}

interface SandboxSecurityEnforcementAuditCapabilityIssueResult {
  schema_version:
    "sandbox-security-enforcement-audit-capability-issue-result.v1";
  capability_id: string;
  subject_id: string;
  scopes: ["sandbox_security:enforcement:audit:write"];
  allowed_stages: ["user_input", "model_output", "tool_request"];
  allowed_policy_profile_ids: [
    "sandbox-security-balanced.v1" | "sandbox-security-strict.v1"
  ];
  composition_binding:
    | "sandbox-security-production-composition.v1:rule_only"
    | "sandbox-security-production-composition.v1:local"
    | "sandbox-security-production-composition.v1:local_and_judge";
  bearer_token: string;
  issued_at: string;
  expires_at: string;
  revoked_at: null;
}
```

`subject_id` uses the existing strict subject grammar and `ttl_seconds` is a
safe integer in `[60, 3600]`. No scope, stage, production mode, endpoint, or
authorization-scope ID is accepted from the request. The backend fixes the
scope to the dedicated literal, stages to all three Engine stages, and
composition to its immutable process configuration. The profile tuple contains
exactly the normalized request profile. `bearer_token` matches the existing
`sbxcap_v1.*` grammar and is returned exactly once. All IDs and timestamps use
the existing GENERAL-003 grammars, and `expires_at` is exactly `issued_at +
ttl_seconds`. The controller wraps this result in the existing exact
`ApiResponse<T>` success envelope with HTTP `201`. The OpenClaw configuration
receives only this minted token, never the bootstrap administrator credential
used to authorize issuance.

Storage uses a private union of the unchanged public v1 scope type and the new
internal scope. Existing evaluation/audit-read authenticators explicitly
reject a capability whose only scope is the enforcement-audit literal; only
the enforcement-audit authenticator accepts it, and it requires that exact
single-scope grant. No union widening is exported through GENERAL-003's public
v1 capability types.

Issuance emits a backend-owned
`SandboxSecurityEnforcementAuditCapabilityIssuedEvent` under the dedicated
`sandbox-security-enforcement-audit-event.v1` schema. It uses
`event_type: "capability_issued"`, contains the authenticated administrator
identity, new capability ID/subject, fixed scope/stages/profile/composition,
issued-at, and expires-at, and never contains the raw token. It is handled by
the enforcement-audit repository and excluded from GENERAL-003's public v1
audit page by the `event_schema` predicate defined below. Revocation continues
to use the existing internal revoke route and never exposes the token.

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

### Replacement Provenance

The patched host, rather than an ordinary plugin or caller, is the only writer
of a replacement envelope. It attaches an internal non-user-writable marker:

```text
openclaw-security-fixed-replacement.v1
```

The marker is carried in a private host field outside the user payload and is
accepted only when the replacement code and exact fixed replacement text match
the closed mapper catalog. Ordinary host rewrites cannot mutate, remove, or
forge the marker. The patched delivery path writes the replacement after the
last ordinary rewrite, bypasses ordinary rewrite handlers, and does not
re-enter the same security barrier. The replacement path is still owned by
the barrier that selected it, so there is no unguarded delivery path. Tests
must prove that every `ask`, `deny`, and failure at every barrier emits only
the immutable replacement envelope and never the original value.

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
persisted. The fixed replacement is represented as a host `replaced` outcome,
never as a continued original event.

## Failure and Interruption Rules

The following all fail closed:

- missing, duplicated, unawaited, or drifting barrier registration;
- missing run/session/call correlation or final-value mismatch;
- authority builder rejection, unknown content block, unsupported media, or
  strict JSON normalization failure;
- Engine throw, timeout, invalid decision, unavailable slot, or composition
  mismatch;
- missing, duplicated, or invalidly configured enforcement plugin;
- invalid OpenClaw package, patch manifest, patch digest, or runtime probe.

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

The plugin sends one of two exact-key, closed discriminated unions. These
integration-private request types must import the canonical catalogs from
[`shared/types/sandbox-security-api.ts`](../../../shared/types/sandbox-security-api.ts)
and [`shared/types/sandbox-security.ts`](../../../shared/types/sandbox-security.ts);
the plugin must not define a second catalog.

```ts
type OpenClawEnforcementAuditCommon = {
  schema_version: "sandbox-security-enforcement-audit-request.v1";
  event_id: string;       // ^audit:<UUIDv4>$
  request_id: string;     // ^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$
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
  elapsed_ms: number;      // safe integer in [0, 60000]
};

type OpenClawEnforcementAuditRequest =
  | (OpenClawEnforcementAuditCommon & {
      event_type: "enforcement_completed";
      verdict: "no_detected_risk" | "risk_detected" | "indeterminate";
      action: "allow" | "alert" | "ask" | "deny";
      risk_level: "info" | "low" | "medium" | "high" | "critical";
      category_counts: SandboxSecurityAuditCategoryCounts;
      detector_run_status_counts: SandboxSecurityAuditRunStatusCounts;
      host_outcome: "continued" | "replaced";
    })
  | (OpenClawEnforcementAuditCommon & {
      event_type: "enforcement_interrupted";
      interruption_code:
        | "authority_mismatch"
        | "correlation_mismatch"
        | "unsupported_input"
        | "engine_error"
        | "engine_timeout"
        | "engine_slot_unavailable"
        | "barrier_timeout"
        | "startup_recovery";
      applied_fail_closed_action: "ask" | "deny";
    });
```

The two union variants have no optional fields: exact-key normalization rejects
missing or extra fields, accessors, non-plain prototypes, non-finite numbers,
and values outside the catalogs. `enforcement_point` and `stage` must match
the authority matrix. Completed `host_outcome` is `continued` exactly for
`allow|alert` and `replaced` exactly for `ask|deny`. Interrupted
`applied_fail_closed_action` is `ask` at user/model/outbound points and `deny`
at the tool point. Both count maps contain every canonical risk/status key,
each value is a safe integer in `[0, 4096]`, and their totals are at most 4096.
The request profile must equal the capability's single allowed profile and the
plugin's immutable configured profile. The request composition binding must
equal both the authenticated capability authorization-scope binding and the
backend module's immutable production composition.

The backend maps the request into a dedicated
`SandboxSecurityEnforcementAuditEvent` union without accepting any client
identity. This is an explicit versioned shared-contract extension with schema
version `sandbox-security-enforcement-audit-event.v1`; it is defined in a new
shared type/normalizer and does not mutate GENERAL-003's closed public
`SandboxSecurityAuditEvent` v1 union. Existing GENERAL-003 v1 readers and the
public audit page continue to accept only their existing event catalog. The
dedicated durable union has three exact variants: the two request-derived
`enforcement_completed|enforcement_interrupted` variants and the backend-only
`capability_issued` variant defined above.

SQLite v2 deliberately uses one dual-union `sandbox_security_audit_events`
table so the existing subject predicate, 90-day retention, event-ID
idempotency, and indexes remain authoritative. The v2 repository validates the
two schemas separately: the existing GENERAL-003 repository accepts only its
legacy event types, while a new enforcement-audit repository accepts only
the dedicated enforcement schema. The v2 table has an exact `event_schema`
column with values `sandbox-security-audit-event.v1` or
`sandbox-security-enforcement-audit-event.v1`. The public GENERAL-003
audit-read query requires the former in its existing subject-scoped SQL before
normalization; the enforcement repository requires the latter. Thus old v1
readers never receive a new row, including the dedicated `capability_issued`
row, and a future explicitly versioned page contract may expose enforcement
rows without changing the public v1 page.

The backend injects `subject_id`, capability ID, authorization scope, and
server-generated `occurred_at`; it copies only the validated common and
variant fields. The dedicated durable projection therefore has the same
discriminator and field relation as the request, plus authenticated identity,
and is the only enforcement JSON written to SQLite.

The request must reject and never accept: subject, authorization scope or
capability ID, occurred-at, a full Decision, findings, locator or evidence
references, provider data, free text, raw or sanitized content, ordinary
content hashes, session history, run IDs, call IDs, or replacement text. No
OpenClaw transcript field is copied into this request.

The service acknowledgement is the `data` payload inside the repository's
existing exact `ApiResponse<T>` success envelope; the HTTP body is never a bare
acknowledgement:

```ts
interface OpenClawEnforcementAuditAck {
  schema_version: "sandbox-security-enforcement-audit-ack.v1";
  event_id: string;
  status: "accepted" | "replayed";
  occurred_at: string;
}
```

The client first exact-normalizes `ApiResponse<OpenClawEnforcementAuditAck>`,
then exact-normalizes its `data`. `ack.event_id` must equal the request event
ID. `201` is valid only with `status: "accepted"`; `200` is valid only with
`status: "replayed"`. `occurred_at` is a strict UTC millisecond timestamp
generated by the backend; replay returns the timestamp stored by the first
accepted insert. Any status/body/ID/timestamp relationship mismatch is a
malformed acknowledgement and sets only audit health degraded. An event ID
reused with a different canonical content-free candidate returns `409`.
Authentication, normalization, and storage failures use the existing exact
error envelope and contain no raw request values.

### Internal Admission

The route applies the same internal-listener admission order as GENERAL-003:

1. route match on the internal listener and `POST` method;
2. authenticate the dedicated bearer capability and require the exact
   `sandbox_security:enforcement:audit:write` scope before reading the body;
3. require `Content-Type: application/json`;
4. read at most `65,536` bytes with a fixed `5,000 ms` body deadline;
5. normalize the exact union above and reject trailing/duplicate/unknown keys;
6. require stage/profile against the authenticated grant and require
   composition binding against both the grant and backend module; and
7. invoke the idempotent repository and write the bounded acknowledgement.

The route reuses GENERAL-003's fixed internal administrator token bucket
parameters (capacity `2`, refill `1` token every `6` seconds) as an
internal-listener
admission guard; this reuses limiter values only and never reuses administrator
credentials or scope. A deficit returns `429` with the existing bounded
`Retry-After` calculation. Missing or invalid bearer is `401`, an authenticated
wrong scope is `403`, malformed JSON or contract violation is `400`, body
timeout is `408`, oversized body is `413`, unsupported media type is `415`,
identical replay is `200`, event-ID conflict is `409`, and repository/storage
failure is `503`. Every error has a closed code and contains no request body,
raw content, or provider data.

A stage, profile, or composition mismatch returns the closed `403` authorization
error and stores no enforcement audit event. The plugin sets only
`audit: "degraded"`; the already selected host action and future Engine
enforcement remain unchanged.

### Audit Ordering and Health

For every completed or interrupted evaluation:

1. freeze the content-free projection;
2. select the immutable Engine action and host replacement/continue outcome;
3. attempt the audit request with a fixed 1,000 ms timeout; and
4. return the already selected host outcome regardless of audit success.

On timeout, authentication failure, storage failure, or malformed
acknowledgement, the plugin records only an internal error code, bounded count,
and elapsed time, then sets `audit: "degraded"`; `enforcement` remains
`"healthy"` unless an independent enforcement failure occurs. Audit failure
never changes an already selected Engine action, never makes a later
`allow|alert` fail closed solely due to audit state, and never causes an
original blocked event to be released. There is no persistent queue or
background retry in v1. Acceptance requires one audit attempt for every
completed/interrupted evaluation, not successful persistence when the audited
backend is demonstrably unavailable.

Failure to construct or exact-normalize the dedicated content-free audit
request is an audit failure, not an enforcement failure. The client sends no
invalid request, sets only `audit: "degraded"`, and returns the preselected host
action unchanged.

## SQLite v2 Migration

GENERAL-003's SQLite v1 schema remains the base. GENERAL-004 adds an explicit,
transactional v2 migration that:

- preserves all existing rows, foreign keys, retention indexes, subject SQL
  predicate, 90-day retention, 64 KiB event cap, and purge semantics;
- extends the capability-scope catalog with
  `sandbox_security:enforcement:audit:write`;
- extends the audit-event catalog with `enforcement_completed` and
  `enforcement_interrupted`;
- adds a required `event_schema` column whose CHECK accepts only the unchanged
  GENERAL-003 event schema or the new enforcement-audit event schema;
- records the migration in the schema-migrations table and rejects an unknown,
  skipped, or partially applied version;
- validates the v1 object definitions before migration and the v2 object
  definitions after migration; and
- implements idempotent append, identical replay, and event-ID payload
  conflict behavior for enforcement events.

SQLite cannot alter either CHECK catalog in place. Migration 2 therefore runs
in one transaction, validates the immutable v1 definitions and migration row,
creates v2 replacement tables with the old plus new scope/event literals,
copies every existing row without changing its JSON or identity and assigns
the legacy `sandbox-security-audit-event.v1` schema value, recreates the
same indexes/foreign keys, swaps tables, records migration version `2`, and
validates the complete v2 object catalog before commit. The migration adds the
two enforcement event literals and exact schema values to table CHECKs but does
not make the legacy normalizer accept them; the dual-union repositories and
their opposite `event_schema` SQL predicates enforce that separation. Any
failure rolls back to intact v1.
Startup accepts exactly a validated v1 (then migrates) or a validated v2;
unknown, skipped, partial, or drifted schemas fail startup.

Repository append canonicalizes the backend-owned content-free candidate
without `occurred_at`. If the event ID is absent, the repository validates the
supplied server timestamp, builds/stores the full durable event, and returns
`accepted`. If the event ID exists, it exact-normalizes the stored event,
removes only its stored `occurred_at`, and compares canonical candidate bytes.
An identical candidate returns `replayed` with the first stored timestamp; a
different candidate returns the domain conflict mapped to HTTP `409`. The
comparison includes event schema, authenticated identity, request projection,
and all exact variant fields, but deliberately excludes the newly generated
server timestamp and never uses a raw-content hash.

The migration must not rewrite existing event JSON, recalculate identities,
drop indexes, change capability TTL limits, or broaden audit visibility.
Existing GENERAL-003 capability policy is unchanged; only the new dedicated
internal storage scope, two new event-type literals, required event-schema
discriminator, and dedicated capability-issuance/audit schemas are added.

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
enforcement point, host outcome, stable interruption code, or the applied
fail-closed action. No ordinary content hash is an acceptable substitute for
this rule.

## Planned Implementation Surface

New integration files:

```text
integrations/openclaw/general-security/package.json
integrations/openclaw/general-security/pnpm-lock.yaml
integrations/openclaw/general-security/src/general-security/
  config.ts
  authority-builder.ts
  action-mapper.ts
  audit-client.ts
  plugin.ts
  runtime.ts
  index.ts

integrations/openclaw/general-security/tests/general-security-authority.spec.ts
integrations/openclaw/general-security/tests/general-security-action-mapper.spec.ts
integrations/openclaw/general-security/tests/general-security-plugin.spec.ts
integrations/openclaw/general-security/tests/general-security-audit-client.spec.ts
integrations/openclaw/general-security/tests/general-security-runtime.spec.ts
integrations/openclaw/general-security/openclaw-security.plugin.json
integrations/openclaw/general-security/config/openclaw-security.json5
integrations/openclaw/general-security/patches/openclaw-2026.6.34-general-security.patch
integrations/openclaw/general-security/patches/openclaw-2026.6.34-general-security.manifest.json
integrations/openclaw/general-security/scripts/apply-general-security-patch.mjs
```

The existing `integrations/openclaw/package.json`, its current lockfile entry,
root plugin manifest, Track 1 `src/`, tests, and Track 1 deployment image are
explicitly unchanged. The nested package is built and tested independently;
the two packages never share `node_modules`, an OpenClaw plugin directory, or
an image layer containing the other package's manifest.

New backend, shared, router, and repository tests/surfaces:

```text
backend/src/modules/sandbox-security/enforcement-audit.service.ts
backend/src/modules/sandbox-security/sandbox-security-enforcement-audit.controller.ts
backend/src/modules/sandbox-security/sandbox-security.module.ts
backend/src/modules/sandbox-security/sandbox-security.types.ts
backend/src/modules/sandbox-security/http-admission.ts
backend/src/modules/sandbox-security/dto/enforcement-audit-capability.ts
backend/src/modules/sandbox-security/capability.service.ts
backend/src/modules/sandbox-security/sandbox-security-admin.controller.ts
backend/src/modules/sandbox-security/ports/enforcement-audit.repository.ts
backend/src/modules/sandbox-security/adapters/sqlite/sqlite-migrations.ts
backend/src/modules/sandbox-security/adapters/sqlite/sqlite-enforcement-audit.repository.ts
backend/src/modules/sandbox-security/adapters/sqlite/sqlite-audit.repository.ts
backend/src/modules/sandbox-security/adapters/sqlite/sqlite-capability.repository.ts
backend/src/common/http/internal-router.ts
backend/src/internal-app.module.ts
shared/types/sandbox-security-api.ts
shared/contracts/sandbox-security-api.ts
shared/types/sandbox-security-enforcement-audit.ts
shared/contracts/sandbox-security-enforcement-audit.ts
tests/integration/openclaw-sandbox-security.runtime.spec.ts
tests/repository/sandbox-security-openclaw-enforcement.spec.ts
tests/repository/sandbox-security-openclaw-enforcement-route.spec.ts
deploy/sandbox-security/Dockerfile.openclaw
deploy/sandbox-security/compose.openclaw-security.yml
deploy/sandbox-security/README.md
```

The internal router adds exactly one
`enforcementAudit` route name for
`POST /internal/sandbox/security/enforcement-events`; `InternalAppModule`
registers exactly one controller branch and injects the existing sandbox
security module instance. Module construction wires the new audit service,
dedicated capability scope, audit limiter, shared normalizer, v2 repository,
and controller before the internal listener starts. Route tests prove that the
route is absent from the public router, present once on the internal router,
and unavailable when the sandbox-security module is not composed.

Event normalization is added to the canonical shared contracts rather than
duplicated inside the plugin. A new dedicated enforcement-audit type and
normalizer define two request variants and three durable variants (completed,
interrupted, and backend-only capability issuance); the existing public audit
type remains unchanged. The private storage-scope catalog and SQLite CHECK
catalogs are extended in their owning files. The dual-union repositories, SQL
predicates, and SQLite adapters remain backend-owned. Root package scripts,
lockfiles, OpenClaw package/build files, and required durable documentation are
modified only during implementation after the plan is approved.

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
- bare/malformed audit envelopes, ack ID/status/HTTP/timestamp mismatches, and
  replay with a different newly sampled server time;
- legacy GENERAL-003 capability/audit v1 normalization and SQL exclusion of
  every dedicated enforcement-schema row;
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
