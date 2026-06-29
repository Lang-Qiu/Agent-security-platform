# Spec: Track 1 Behavior Supervision Console

## Document Status

- Requirement: `REQ-T1-SUPERVISION-UI-009`
- Status: ready for user review
- Date: `2026-06-29`
- Scope: shared supervision read DTOs, backend read projection API, frontend
  supervision console, compact task-detail integration, and sanitized session
  evidence download
- Next requirement: `REQ-T1-DEMO-010`

## Objective

`REQ-T1-SUPERVISION-UI-009` turns the existing sandbox placeholder into an
operator-facing behavior supervision console.

The primary users are security operators, researchers, and contest evaluators.
They need to triage monitored sessions, inspect one complete model/tool call
chain, and verify alert or blocking evidence without reading engine-private
objects or raw model/tool content.

Success means an operator can:

1. see the current supervision posture across recent sandbox sessions;
2. filter and select a session from a dense global workbench;
3. follow the ordered behavior-event timeline;
4. correlate policy decisions, alerts, and blocking records with their subject
   events and validated reason codes;
5. distinguish `allow`, `ask`, `alert`, and `deny` outcomes;
6. observe running data through safe conditional polling;
7. open the same session from a sandbox task detail page;
8. download a deterministic, schema-versioned, sanitized JSON evidence object.

The console displays references, identifiers, hashes, validated reason codes,
and alert categories. It never displays raw prompts, model output, email
content, file content, API bodies, producer-supplied narrative text, arbitrary
provider exceptions, or engine-private debug values.

## Assumptions

1. `REQ-T1-SANDBOX-CONTRACT-005` remains the source of truth for behavior
   events, policy decisions, alerts, and blocked records.
2. `REQ-T1-MONITOR-PLUGIN-007` and `REQ-T1-BASE-FILTER-008` already produce the
   normalized supervision results consumed by this requirement.
3. The backend remains the only platform API used by the frontend.
4. The current in-memory task repository is sufficient for this requirement.
   Persistence is not introduced.
5. A three-second HTTP polling loop satisfies the contest prototype's
   real-time display requirement. SSE and WebSocket transport are deferred.
6. The first list endpoint is deliberately bounded and does not implement
   pagination.
7. `ask` is a visible operator-review state, not an executable approval
   workflow.
8. A session evidence JSON download is part of REQ-009. The complete security
   risk analysis report and evidence pack remain owned by REQ-010.
9. This specification and the active-requirement switch are documentation
   exceptions to full TDD. Implementation still follows strict RED -> GREEN.

## Approved Decisions

1. The primary page is the global `/results/sandbox` supervision workbench.
2. Sandbox task detail retains a compact summary and links to the global page
   with the corresponding `session_id` selected.
3. The desktop layout uses a session list on the left and a selected-session
   timeline on the right.
4. Mobile and narrow layouts show list and inspector as separate views rather
   than compressing the desktop split view.
5. A selected event expands inline in the timeline. At most one event is
   expanded at a time.
6. A dedicated backend supervision projection API is introduced.
7. Shared, frontend-facing supervision summary and detail DTOs are introduced.
   The frontend does not derive cross-session statistics from raw results.
8. The backend filters and sorts supervision sessions. Each list response
   contains at most the latest 100 matching sessions.
9. Top-line counts always describe the latest 100 observable sessions and are
   not changed by list filters.
10. The overview and session list refresh every three seconds while the page
    is visible. The selected detail refreshes only while its task is running.
11. Polling pauses while the document is hidden and resumes immediately when
    it becomes visible.
12. A transient polling failure preserves the last valid snapshot, marks it
    stale, shows the last successful refresh time, and exposes manual retry.
13. `ask` records are displayed as awaiting operator confirmation. REQ-009 does
    not approve, reject, or resume the session.
14. The UI is otherwise read-only. It does not acknowledge, close, comment on,
    or mutate alerts, records, policies, or sessions.
15. The only export is the selected session's sanitized JSON evidence object.
16. No original prompt, model output, tool argument, tool result, memory
    content, producer-supplied narrative text, or arbitrary raw object is
    rendered or exported.

## Contest Outcome Mapping

This requirement contributes to the contest outcomes as follows:

| Contest expectation | REQ-009 evidence |
| --- | --- |
| Supervision terminal | Global session workbench and selected-session inspector |
| Real-time alert display | Three-second visible-page polling and stale-state handling |
| Blocking records | Correlated blocked-record presentation in session timeline |
| Policy actions | Explicit `allow`, `ask`, `alert`, and `deny` presentation |
| Model call-chain monitoring | Ordered model, tool, policy, and memory event timeline |
| External tool interaction | Typed tool request/result rows with safe references |
| Auditable evidence | Schema-versioned, deterministic sanitized JSON download |

REQ-009 does not claim the final OpenClaw demonstration or complete risk report.
Those remain acceptance targets for `REQ-T1-DEMO-010`.

## Existing Assets Reused

### Shared

- `shared/types/result.ts`
  - `BaseResult`
  - `SandboxRunResultDetails`
- `shared/types/sandbox.ts`
  - `SandboxBehaviorEvent`
  - `SandboxPolicyDecision`
  - `SandboxAlert`
  - `SandboxBlockedRecord`
- `shared/contracts/result.ts`
  - `normalizeBaseResult`
- `shared/contracts/sandbox.ts`
  - event and supervision collection normalizers/invariants
- `shared/types/api-response.ts`
- `shared/contracts/api-response.ts`

### Backend

- `backend/src/modules/task-center/repositories/task.repository.ts`
- `backend/src/modules/task-center/repositories/in-memory-task.repository.ts`
- `backend/src/common/http/http-response.ts`
- `backend/src/common/http/router.ts`
- `backend/src/app.module.ts`

The supervision module reads the same repository instance as task-center. It
does not call the sandbox engine and does not know base-filter internals.

### Frontend

- `/results/sandbox`
- `frontend/src/pages/SandboxAlertsPage.tsx`
- `frontend/src/components/task-detail/SandboxAlertSection.tsx`
- `frontend/src/services/api-client.ts`
- `frontend/src/components/DataSourceTag.tsx`
- `frontend/src/components/RiskTag.tsx`
- `frontend/src/components/StatusTag.tsx`
- `frontend/src/layouts/ConsoleLayout.tsx`
- Ant Design and the existing icon package

No new runtime dependency is required.

## Scope

### In Scope

- Runtime-normalized shared supervision read DTOs.
- Backend projection from stored normalized sandbox results.
- Read-only supervision list, detail, and evidence endpoints.
- Server-side query validation, filtering, sorting, and 100-session cap.
- Global counts for running sessions, sessions awaiting confirmation, alert
  records, and blocked sessions.
- Session list and session inspector.
- Safe event-type-specific rendering.
- Alert, blocked-record, and decision correlation.
- Three-second visibility-aware polling.
- Stale-snapshot behavior and manual retry.
- Query-string deep links from task detail to supervision.
- Deterministic safe JSON evidence download.
- Frontend mock-only and API-error states.
- Shared, backend, frontend, integration, repository, and visual checks.
- Required documentation updates.

### Out Of Scope

- OpenClaw or another real agent adapter.
- Agent-cluster aggregation or cross-agent traces.
- Database schema, migrations, or persistence.
- SSE, WebSocket, message queue, or callback transport.
- Approval, rejection, resume, retry, or cancellation commands.
- Alert acknowledgement, comments, ownership, or workflow state.
- Policy/rule editing and policy administration.
- Full contest risk report generation.
- PDF, CSV, spreadsheet, archive, or bulk evidence export.
- Pagination, saved views, user preferences, or local-storage persistence.
- Authentication, authorization, tenancy, or role management.
- Raw content reveal, even behind a developer or debug toggle.

## Architecture

### Component Boundary

```text
InMemoryTaskRepository
  -> SupervisionProjectionService
  -> SupervisionController
  -> /api/supervision/sessions
  -> frontend supervision-service
  -> SandboxAlertsPage
  -> session list + event timeline
```

The repository stores the platform `Task`, `BaseResult`, and `RiskSummary`
shells. The supervision projection service:

1. selects `sandbox_run` records;
2. re-normalizes each result at the runtime boundary;
3. rejects or omits records that cannot form a safe supervision session;
4. derives only approved summary fields;
5. returns shared supervision DTOs.

The frontend consumes only the shared projection contracts. It never imports
from `engines/sandbox/**`.

### Backend Module

Create a dedicated platform module:

```text
backend/src/modules/supervision/
  dto/supervision-query.ts
  supervision-projector.ts
  supervision.service.ts
  supervision.controller.ts
  supervision.module.ts
```

`createAppModule()` constructs task-center and supervision with the same
`TaskRepository` instance. This is a composition change only; it does not alter
repository ownership or introduce a second store.

### Frontend Structure

```text
frontend/src/
  components/supervision/
    SupervisionSummary.tsx
    SupervisionFilters.tsx
    SupervisionSessionList.tsx
    SupervisionSessionInspector.tsx
    SupervisionEventTimeline.tsx
    SupervisionEventDetails.tsx
  hooks/
    useSupervisionPolling.ts
  services/
    supervision-service.ts
  mocks/
    supervision.ts
  pages/
    SandboxAlertsPage.tsx
```

The page owns query state and selection. The service owns API normalization and
mock fallback. The polling hook owns timers, visibility, abort handling, and
freshness state. Presentational components receive already normalized DTOs.

## Shared Contracts

### Schema Versions

```typescript
export const SANDBOX_SUPERVISION_SCHEMA_VERSION =
  "track1-supervision-ui.v1" as const;

export const SANDBOX_SUPERVISION_EVIDENCE_SCHEMA_VERSION =
  "track1-supervision-evidence.v1" as const;
```

### Session Summary

```typescript
export type SandboxSupervisionToolName =
  | "send_email"
  | "read_file"
  | "write_file"
  | "call_api";

export interface SandboxSupervisionSessionSummary {
  task_id: string;
  session_id: string;
  task_status: TaskStatus;
  risk_level: RiskLevel;
  highest_action: SandboxPolicyAction;
  scenario_id: string | null;
  case_id: string | null;
  tool_names: SandboxSupervisionToolName[];
  event_count: number;
  decision_count: number;
  alert_count: number;
  blocked_record_count: number;
  blocked: boolean;
  evidence_available: boolean;
  updated_at: string;
  last_event_at: string | null;
}
```

`tool_names` is unique and lexicographically sorted. It is derived only from
typed events using the four approved simulated-tool names. `highest_action`
uses:

```text
deny > ask > alert > allow
```

`evidence_available` is true only when the current stored result can produce a
complete normalized `SandboxSupervisionEvidenceExport`.

### Overview Counts

```typescript
export interface SandboxSupervisionCounts {
  observed_session_count: number;
  running_session_count: number;
  awaiting_confirmation_count: number;
  alert_record_count: number;
  blocked_session_count: number;
}
```

The counts are computed over the latest 100 observable sessions before list
filters are applied:

- `running_session_count`: task status is `running`.
- `awaiting_confirmation_count`: `highest_action === "ask"`.
- `alert_record_count`: total materialized alert records.
- `blocked_session_count`: `blocked === true`.

### Overview

```typescript
export interface SandboxSupervisionOverview {
  schema_version: typeof SANDBOX_SUPERVISION_SCHEMA_VERSION;
  counts: SandboxSupervisionCounts;
  matched_session_count: number;
  returned_session_count: number;
  limit: 100;
  truncated: boolean;
  sessions: SandboxSupervisionSessionSummary[];
}
```

`matched_session_count` is the number of valid records matching the current
query before the 100-row cap. `truncated` is true when it exceeds 100.

### Session Detail

```typescript
export interface SandboxSupervisionSessionDetail {
  schema_version: typeof SANDBOX_SUPERVISION_SCHEMA_VERSION;
  summary: SandboxSupervisionSessionSummary;
  events: SandboxSupervisionEventView[];
  policy_decisions: SandboxSupervisionDecisionView[];
  alerts: SandboxSupervisionAlertView[];
  blocked_records: SandboxSupervisionBlockedRecordView[];
}
```

The arrays are defensive copies. Their order is stable:

- events: ascending `sequence`;
- policy decisions: ascending `decided_at`, then `decision_id`;
- alerts: ascending `occurred_at`, then `alert_id`;
- blocked records: ascending `occurred_at`, then `blocked_record_id`.

### Content-Free View Records

The public supervision detail does not reuse producer-owned records directly.
It projects them into closed display records:

```typescript
export interface SandboxSupervisionDecisionView {
  decision_id: string;
  subject_event_id: string;
  policy_id: string;
  action: SandboxPolicyAction;
  reason_code: string;
  evidence_refs: string[];
  decided_at: string;
}

export interface SandboxSupervisionAlertView {
  alert_id: string;
  subject_event_id: string;
  decision_id: string;
  risk_level: RiskLevel;
  category: string;
  evidence_refs: string[];
  occurred_at: string;
}

export interface SandboxSupervisionBlockedRecordView {
  blocked_record_id: string;
  subject_event_id: string;
  decision_id: string;
  evidence_refs: string[];
  occurred_at: string;
}

export interface SandboxSupervisionEventEnvelope<
  TType extends SandboxEventType,
  TPayload
> {
  event_id: string;
  session_id: string;
  sequence: number;
  event_type: TType;
  occurred_at: string;
  source: SandboxEventSource;
  scenario_id: string | null;
  case_id: string | null;
  evidence_refs: string[];
  payload: TPayload;
}

export interface SandboxSupervisionModelPayload {
  model_ref: string;
  content_ref: string;
  content_sha256: string;
}

export interface SandboxSupervisionToolRequestPayload {
  call_id: string;
  tool_name: SandboxSupervisionToolName;
  target_ref: string;
  arguments_ref: string;
}

export type SandboxSupervisionStateChange =
  | "none"
  | "outbox_append"
  | "virtual_file_write";

export interface SandboxSupervisionToolResultPayload {
  call_id: string;
  tool_name: SandboxSupervisionToolName;
  status: SandboxToolResultStatus;
  result_ref: string;
  state_change: SandboxSupervisionStateChange;
}

export interface SandboxSupervisionMemoryPayload {
  memory_entry_id: string;
  content_ref: string;
  content_sha256: string;
}

export type SandboxSupervisionEventView =
  | SandboxSupervisionEventEnvelope<
      "model_input",
      SandboxSupervisionModelPayload
    >
  | SandboxSupervisionEventEnvelope<
      "model_output",
      SandboxSupervisionModelPayload
    >
  | SandboxSupervisionEventEnvelope<
      "tool_request",
      SandboxSupervisionToolRequestPayload
    >
  | SandboxSupervisionEventEnvelope<
      "tool_result",
      SandboxSupervisionToolResultPayload
    >
  | SandboxSupervisionEventEnvelope<
      "policy_decision",
      SandboxSupervisionDecisionView
    >
  | SandboxSupervisionEventEnvelope<
      "memory_write",
      SandboxSupervisionMemoryPayload
    >
  | SandboxSupervisionEventEnvelope<
      "memory_read",
      SandboxSupervisionMemoryPayload
    >;
```

`SandboxSupervisionEventView` is a closed discriminated union parallel to the
seven shared sandbox event types. It keeps the common event envelope and these
payload fields only:

| Event | Public payload fields |
| --- | --- |
| `model_input` / `model_output` | `model_ref`, `content_ref`, `content_sha256` |
| `tool_request` | `call_id`, `tool_name`, `target_ref`, `arguments_ref` |
| `tool_result` | `call_id`, `tool_name`, `status`, `result_ref`, `state_change` |
| `policy_decision` | the closed `SandboxSupervisionDecisionView` fields |
| `memory_write` / `memory_read` | `memory_entry_id`, `content_ref`, `content_sha256` |

The projection intentionally discards:

- `BaseResult.summary`;
- `BaseResult.metadata`;
- model or memory payload `summary`;
- `SandboxPolicyDecision.reason`;
- `SandboxAlert.title` and `SandboxAlert.reason`;
- `SandboxBlockedRecord.reason` and `resource_ref`;
- all unrecognized fields.

The operator sees the validated `reason_code` and alert `category`. The
frontend may derive a presentation label only by replacing validated token
separators with spaces; it must not use producer-supplied narrative text.

### Evidence Export

```typescript
export interface SandboxSupervisionEvidenceExport {
  schema_version: typeof SANDBOX_SUPERVISION_EVIDENCE_SCHEMA_VERSION;
  source_schema_version: typeof SANDBOX_SUPERVISION_SCHEMA_VERSION;
  session: SandboxSupervisionSessionDetail;
}
```

The export has no generated timestamp or request ID. For an unchanged stored
session, canonical JSON serialization is byte-identical.

### Runtime Normalizers

Add strict normalizers for:

- `normalizeSandboxSupervisionSessionSummary`
- `normalizeSandboxSupervisionCounts`
- `normalizeSandboxSupervisionOverview`
- `normalizeSandboxSupervisionSessionDetail`
- `normalizeSandboxSupervisionEvidenceExport`

They must:

- require exact top-level key sets;
- validate all enums through existing shared guards;
- reject impossible counts and negative integers;
- require sorted unique `tool_names`;
- enforce array/count agreement;
- reuse sandbox event/outcome normalizers;
- enforce event/session correlation;
- require safe token grammar for `reason_code`, category, tool name, status,
  and state-change values;
- validate every timestamp as a real ISO-8601 calendar value with a legal
  timezone offset no greater than `+/-14:00`;
- return defensive copies;
- reject extra keys on public view records;
- never copy producer narrative fields into public view records.

Display-string guards are closed and bounded:

- IDs: non-empty, no whitespace/control characters, maximum 256 characters;
- reason codes/categories: lowercase ASCII token grammar with `_` or `-`
  separators, maximum 96 characters;
- refs: a shared REQ-009 safe-reference guard equivalent to the monitor's
  no-whitespace URI grammar, maximum 512 characters; shared code does not
  import the engine implementation;
- SHA-256: exactly 64 lowercase hexadecimal characters;
- tool names and state changes: the approved unions only.

## Backend Projection Rules

### Observable Record

A repository record is observable only when:

1. `task.task_type === "sandbox_run"`;
2. `result.task_type === "sandbox_run"`;
3. task and result engine types are both `sandbox`;
4. task and result IDs and statuses match;
5. `normalizeBaseResult(result)` succeeds;
6. `details.session_id` is a non-empty string;
7. any present supervision collections satisfy the shared sandbox contract;
8. all projected timestamps pass the stricter supervision timestamp guard.

Pending/running records may expose empty safe collections when the shared
contract permits an incomplete non-terminal result. Terminal records must
satisfy the complete supervision contract.

Contract-invalid records are not partially projected. They are excluded and
recorded only through safe internal diagnostics; no raw value enters the API
response.

Shape normalization is not treated as semantic redaction. The projector builds
every public view record field by field and never spreads an event, decision,
alert, blocked record, result, details object, or metadata object into a public
DTO.

`task_status` comes from the normalized task after the status-agreement check.
`risk_level` and `updated_at` come from the normalized result.

Session IDs are unique read-model keys. If multiple observable task records
claim the same `session_id`, every conflicting record is omitted from overview
counts and lists. Direct detail or evidence lookup for that ID returns
`SUPERVISION_SESSION_AMBIGUOUS`; the service never chooses one arbitrarily.

### Scenario And Case Derivation

The projector derives `scenario_id` and `case_id` from event envelopes:

- all non-null scenario IDs must agree;
- all non-null case IDs must agree;
- disagreement makes the record non-observable;
- no scenario or case value is synthesized from task IDs.

### Highest Action

The projector reduces every policy decision with:

```text
deny > ask > alert > allow
```

When no decision exists in an allowed non-terminal record, `highest_action` is
`allow`.

### Tool Names

Tool names are collected only from normalized `tool_request` and `tool_result`
payloads. They are deduplicated and sorted. Arbitrary metadata is ignored.

### Ordering

- session list: descending `updated_at`, then ascending `session_id`;
- events and records: stable ordering defined by the shared detail contract;
- all timestamps must be valid ISO-8601 values accepted by shared contracts.

## Public API

All endpoints use the existing `ApiResponse<T>` envelope.

### List Sessions

```http
GET /api/supervision/sessions
```

Optional single-value query parameters:

| Parameter | Meaning |
| --- | --- |
| `q` | Case-insensitive substring over `task_id` and `session_id`, max 128 characters |
| `status` | One valid `TaskStatus` |
| `risk_level` | One valid `RiskLevel` |
| `action` | One of `allow`, `ask`, `alert`, `deny` |
| `scenario_id` | Exact ID matching `^T1-SC-\d{3}$` |
| `tool_name` | One approved `SandboxSupervisionToolName` |

Filtering behavior:

- missing parameters mean no filter;
- values are trimmed;
- duplicate query parameters are rejected;
- unknown parameters are rejected;
- empty provided values are rejected;
- `status`, `risk_level`, `action`, and `scenario_id` match the corresponding
  session-summary field exactly;
- `tool_name` matches when it is present in `tool_names`;
- filtering occurs before the 100-row list cap;
- counts remain based on the latest 100 observable sessions and do not change
  with filters.

Response data:

```typescript
SandboxSupervisionOverview
```

### Session Detail

```http
GET /api/supervision/sessions/:sessionId
```

The path value is URL-decoded once. Invalid encoding, an empty ID, a duplicate
session ID, or an unknown session produces a safe domain error.

Response data:

```typescript
SandboxSupervisionSessionDetail
```

### Session Evidence

```http
GET /api/supervision/sessions/:sessionId/evidence
```

Response data:

```typescript
SandboxSupervisionEvidenceExport
```

The standard API envelope remains in transit. The frontend downloads only the
normalized `data` object, serialized with two-space indentation and one final
newline.

Filename:

```text
supervision-<sanitized-session-id>.json
```

Filename sanitization replaces every character outside `[A-Za-z0-9._-]` with
`_`.

### Error Codes

| Code | HTTP | Meaning |
| --- | ---: | --- |
| `INVALID_SUPERVISION_QUERY` | 400 | Unknown, duplicate, empty, overlong, or invalid filter |
| `SUPERVISION_SESSION_NOT_FOUND` | 404 | No observable session matches the ID |
| `SUPERVISION_SESSION_AMBIGUOUS` | 409 | More than one task projects to the same session ID |
| `SUPERVISION_EVIDENCE_NOT_AVAILABLE` | 409 | Session exists but cannot produce a complete safe export |
| `INTERNAL_ERROR` | 500 | Unexpected internal failure with fixed public text |

No error response contains raw record data or internal exception messages.

## Frontend Information Architecture

### Route

```text
/results/sandbox
```

Supported URL query state:

```text
session_id
q
status
risk_level
action
scenario_id
tool_name
```

Unknown parameters are ignored by the frontend and are not forwarded. Invalid
known values are removed from the URL and do not enter service calls.

The task-detail deep link is:

```text
/results/sandbox?session_id=<encoded-session-id>
```

### Desktop Layout

The page is an unframed work surface inside the existing console content area:

1. compact page heading, data-source state, freshness state, last success time,
   and refresh/download controls;
2. four stable summary tiles:
   - Running
   - Awaiting confirmation
   - Alerts
   - Blocked
3. one compact filter toolbar;
4. split investigation workspace:
   - left: session list;
   - right: selected-session inspector.

Page sections are not nested cards. Repeated summary tiles may use a restrained
border and a radius no greater than 8px. The split workbench uses dividers and
stable grid tracks rather than floating decorative containers.

Recommended desktop grid:

```css
grid-template-columns: minmax(320px, 0.8fr) minmax(520px, 1.2fr);
```

### Session List

Each row presents:

- status;
- session ID;
- task ID;
- scenario/case;
- risk;
- highest action;
- tool names;
- event, alert, and blocked counts;
- updated time.

Rows have stable height and do not resize on hover. Status and risk use text or
icons in addition to color. The selected row remains visible after polling if
the session still exists.

Default selection:

1. `session_id` from the URL when valid;
2. otherwise the most recent session containing `deny`, `ask`, or `alert`;
3. otherwise the first returned session.

If a deep-linked session is valid but outside the current filters, the frontend
loads its detail and shows a clear "outside current filters" state instead of
silently changing filters.

### Session Inspector

The inspector header presents:

- session and task IDs;
- task status and risk;
- highest action;
- scenario/case;
- blocked state;
- event/decision/alert/blocked counts;
- updated and last-event times.

Below the header, events appear in ascending sequence.

Each timeline row includes:

- sequence;
- event type;
- source;
- occurrence time;
- scenario/case when present;
- compact summary derived only from event type, action, tool name, and status;
- correlated action or outcome badges.

Selecting a row expands it inline. Selecting another row closes the previous
one. Expansion does not change the row's outer width.

### Event-Type Details

Only explicit typed fields are rendered.

#### Model Input / Model Output

- `model_ref`
- `content_ref`
- `content_sha256`

#### Tool Request

- `call_id`
- `tool_name`
- `target_ref`
- `arguments_ref`

#### Tool Result

- `call_id`
- `tool_name`
- `status`
- `result_ref`
- `state_change`

#### Policy Decision

- `decision_id`
- `subject_event_id`
- `policy_id`
- `action`
- `reason_code`
- `evidence_refs`
- `decided_at`

#### Memory Read / Memory Write

- `memory_entry_id`
- `content_ref`
- `content_sha256`

References and hashes are visually truncated when necessary but remain
available through an accessible tooltip and copy-icon button. They are always
rendered as plain text, never HTML or navigable URLs.

### Correlated Outcomes

The inspector indexes records by `subject_event_id` and `decision_id`.

For each event, it shows:

- related policy decisions;
- related alerts;
- related blocked records.

An alert or blocked record without a valid shared-contract correlation never
reaches the component. The UI does not invent missing outcomes.

### `ask` Presentation

`ask` is labelled "Awaiting confirmation." It is visually distinct from
`alert` and `deny`, but no command button is displayed. The UI may show the
validated decision `reason_code` and evidence references only.

### Task Detail Integration

`SandboxAlertSection` becomes a compact read-only summary containing:

- session state;
- highest action;
- event count;
- alert count;
- blocked count;
- latest alert category or decision reason code;
- "Investigate in supervision console" link.

It does not embed the full timeline. The task detail extracts only
`session_id` from its normalized sandbox result, then obtains display data from
the supervision detail endpoint. It does not derive or render decisions,
alerts, blocked records, or narrative fields directly from the task-result
payload.

If supervision detail is unavailable, the compact section shows a safe
availability state and retains the deep link when a valid `session_id` exists.

### Narrow And Mobile Layout

At narrow widths:

- summary tiles wrap into two columns, then one column;
- filter controls wrap without text clipping;
- session list and inspector are not shown side by side;
- selecting a session opens the inspector view;
- a familiar back-arrow icon returns to the list;
- the selected session remains encoded in the URL;
- no fixed-width content causes horizontal page scrolling;
- long references wrap or truncate inside their own detail row.

## Polling And Freshness

### Cadence

- overview/list: every 3000 ms while the page is visible and the resource is
  fresh;
- selected detail: every 3000 ms only when its task status is `running` and
  the resource is fresh;
- evidence: never polled;
- terminal detail: refreshed on selection or manual refresh only.

### Concurrency

- At most one overview request is active.
- At most one detail request is active.
- A new manual refresh aborts the corresponding in-flight request.
- Component unmount aborts all requests and clears timers.
- Late responses from a previous selection cannot overwrite the new selection.

### Visibility

On `document.visibilitychange`:

- hidden: abort no request solely because of hiding, but schedule no next poll;
- visible: immediately refresh fresh overview data and any fresh running
  selected detail;
- stale resources remain paused until manual retry;
- repeated visibility events do not create duplicate timers.

### Freshness States

```typescript
export type SupervisionFreshness = "fresh" | "stale";
```

Page data source continues to use the existing concepts:

```typescript
export type SupervisionDataSource =
  | "api"
  | "degraded"
  | "integration-error"
  | "mock";
```

Behavior:

- first valid API snapshot: `api` + `fresh`;
- valid overview with unavailable detail: `degraded`;
- contract-invalid initial response: safe mocks + `integration-error`;
- unavailable initial API: safe mocks + `mock`;
- failure after a valid API snapshot: preserve snapshot, mark `stale`, and stop
  automatic polling for that resource;
- successful manual retry: replace snapshot atomically, return to `fresh`, and
  resume the approved cadence.

The stale UI displays last successful refresh time and a retry button. It never
silently labels mock or invalid data as healthy API data.

## Mock Data

Mock-only mode uses public supervision DTO fixtures, not engine fixtures or
private monitor objects.

The fixed mock set must:

- pass every shared supervision normalizer;
- contain no producer narrative or raw-content field;
- cover `allow`, `ask`, `alert`, and `deny`;
- cover running, finished, and blocked task states;
- represent all three Track 1 scenario IDs;
- collectively exercise all seven event renderers;
- include at least one alert record and one blocked record;
- preserve deterministic ordering and evidence export bytes.

Mocks are a frontend integration fallback, not the source of truth for contest
evaluation metrics.

## Evidence Download

The download command is available only when:

1. a session is selected;
2. `summary.evidence_available === true`;
3. its evidence endpoint returns a valid normalized export;
4. freshness is not relevant to content validity.

The frontend:

1. requests the evidence endpoint;
2. validates the response data through the shared evidence normalizer;
3. serializes only normalized data;
4. creates a JSON Blob;
5. triggers a browser download;
6. revokes the object URL.

The evidence object contains no request ID, download time, browser state,
filters, stale marker, or frontend-only data.

Repeated downloads for an unchanged session must be byte-identical.

## Loading, Empty, And Error States

### Loading

- Summary and workbench dimensions remain stable.
- Loading indicators do not replace the entire console after a prior snapshot.
- Initial loading does not display mock data until the API attempt resolves.

### Empty

Two empty states are distinct:

- no observable sessions exist;
- sessions exist but current filters match none.

The filtered-empty state offers a clear-filter command. It does not reset
filters automatically.

### Deep-Link Failure

An unknown deep-linked session shows a safe not-found state and keeps the
session list usable. It does not clear valid list data.

### Invalid Contract

The frontend labels the source as integration error and uses only normalized
safe mocks. It does not partially render the invalid API payload.

### Download Failure

The current page remains usable. A concise error notification is shown without
provider or stack details. No partial file is downloaded.

## Visual Direction

The console follows the existing React + Ant Design administrative shell while
making the supervision page denser and more work-focused.

### Palette

- neutral white and light gray surfaces;
- dark neutral text;
- restrained teal for selection and healthy monitoring;
- amber for `ask`;
- red for `deny` and blocked records;
- a distinct non-red warning treatment for `alert`;
- color is never the only status signal.

### Shape And Spacing

- page sections are unframed;
- repeated tiles and rows use radius `<= 8px`;
- no nested cards;
- no decorative gradients, orbs, or large hero treatment;
- compact headings inside panels;
- stable list/timeline row dimensions;
- letter spacing is `0`;
- font size does not scale with viewport width.

### Controls

- icon buttons use the existing Ant Design icon library;
- refresh, download, copy, clear, and mobile-back commands use familiar icons;
- unfamiliar icon-only controls have tooltips;
- option sets use selects or menus;
- filters use inputs/selects;
- no text-filled rounded rectangle substitutes for a familiar icon.

## Accessibility

- Every interactive control is keyboard reachable.
- Selected list rows expose selected state semantically.
- Timeline expansion buttons expose expanded state.
- Focus remains predictable after polling.
- Polling does not steal focus or scroll position.
- Status and action include text, not color alone.
- Tooltips are not the only way to access essential information.
- Icon buttons have accessible names.
- Tables/lists and event groups have clear headings.
- Reduced-motion preference disables non-essential transitions.
- Mobile back navigation has an accessible label.

## Security And Content Boundary

### Always Enforce

- Normalize every API payload before rendering.
- Render event details through an event-type switch and explicit field list.
- Treat all IDs, refs, hashes, reason codes, and categories as plain text.
- Derive list fields on the backend from normalized contracts.
- Keep engine-private metadata out of shared DTOs.
- Export only the normalized evidence DTO.
- Use fixed public error messages.

### Never Permit

- `dangerouslySetInnerHTML`.
- arbitrary `JSON.stringify` of an API or engine object into the page.
- generic recursive object renderers.
- raw-content fields or debug toggles.
- producer-supplied decision, alert, or blocked-record narrative fields.
- direct frontend imports from `engines/**`.
- clickable evidence refs that trigger network navigation.
- export of API envelopes containing request IDs or internal metadata.
- local storage of session details or evidence.

## Code Style

Cross-boundary fields use `snake_case`. React props and local UI state use
normal TypeScript/React naming. Components receive narrow typed inputs.

Example:

```tsx
interface SupervisionSessionInspectorProps {
  detail: SandboxSupervisionSessionDetail;
  expandedEventId: string | null;
  onExpandedEventChange(eventId: string | null): void;
}

export function SupervisionSessionInspector({
  detail,
  expandedEventId,
  onExpandedEventChange
}: SupervisionSessionInspectorProps) {
  return (
    <SupervisionEventTimeline
      events={detail.events}
      expandedEventId={expandedEventId}
      onExpandedEventChange={onExpandedEventChange}
    />
  );
}
```

Avoid page components that fetch, normalize, poll, derive, and render all data
in one file.

## Testing Strategy

Implementation follows:

```text
Design -> Test (RED) -> Implement (GREEN) -> Document -> Stop and report
```

### Shared Contract Tests

Add focused tests proving:

- all valid DTOs normalize;
- extra/missing keys are rejected;
- invalid enums, timestamps, counts, or sort order are rejected;
- session/count/array invariants are enforced;
- defensive copies are returned;
- raw-content fields and arbitrary metadata are rejected;
- evidence export is deterministic and schema-versioned.

### Backend Unit Tests

Test the projector and service for:

- sandbox-only selection;
- runtime result re-normalization;
- invalid-record omission;
- scenario/case agreement;
- highest-action precedence;
- tool-name extraction, uniqueness, and sorting;
- fixed list ordering;
- global counts independent of filters;
- each query filter;
- search length and invalid query rejection;
- 100-row limit and `truncated`;
- duplicate session detection;
- safe detail and evidence output;
- no raw content in serialized outputs.

### Backend API Integration Tests

Test:

- all three GET routes;
- standard `ApiResponse` shell;
- query parsing and URL decoding;
- 400/404/409 safe errors;
- list/detail/evidence contract normalization;
- evidence response determinism;
- frontend-visible payloads contain no engine-private data.

### Frontend Service Tests

Test:

- valid API normalization;
- mock-only mode;
- unavailable and invalid initial responses;
- last-good snapshot preservation;
- stale/fresh transitions;
- evidence normalization and filename sanitization;
- no partial invalid payload rendering.

### Polling Hook Tests

Use fake timers to prove:

- 3000 ms cadence;
- no overlapping requests;
- hidden-page pause;
- immediate visible-page refresh;
- terminal-detail polling stop;
- stale-resource polling pause;
- stale selection response suppression;
- abort and timer cleanup;
- manual retry behavior.

### Frontend Component/Page Tests

Test:

- summary cards use global counts;
- all filters update query/service input;
- default actionable-session selection;
- deep-link selection;
- deep-linked session outside filters;
- session list selection;
- one inline event expansion at a time;
- all seven event types render only approved fields;
- producer narrative fields are absent from every rendered and exported DTO;
- decisions/alerts/blocked records correlate correctly;
- `ask` has no approval command;
- stale, loading, empty, filtered-empty, mock, integration-error, and not-found
  states;
- evidence download command;
- task-detail deep link;
- task detail renders no producer narrative from its original sandbox result;
- no placeholder explanatory copy remains.

### Repository Gates

Add assertions that:

- REQ-009 tests are registered in canonical gates;
- frontend supervision source imports no engine module;
- public DTOs live in shared;
- no raw-content key or generic object renderer enters supervision UI code;
- no SSE/WebSocket, persistence, approval, or report-generation scope appears.

### Visual Verification

After implementation, verify at minimum:

- desktop: `1440x900`;
- compact desktop/tablet: `1024x768`;
- mobile: `390x844`.

Checks:

- no overlap or clipped text;
- stable split-pane dimensions;
- correct mobile list/inspector transition;
- long refs do not force horizontal page scrolling;
- filter wrapping remains usable;
- expanded timeline content stays inside its row;
- polling does not shift layout;
- all icons, tags, and empty/error states render.

## Commands

Run from the repository root unless stated otherwise.

```powershell
# Shared contracts
npm.cmd run test:shared

# Backend
npm.cmd run test:backend

# Frontend focused tests
npm.cmd run test --prefix frontend -- supervision

# Frontend full gate
npm.cmd run test:frontend

# Repository and sandbox regressions
npm.cmd run test:repo
npm.cmd run test:engine:sandbox

# Full repository gate
npm.cmd run test

# Frontend build
npm.cmd run build --prefix frontend

# Local backend
cd backend
$env:PORT=3000
node --experimental-strip-types src/main.ts

# Local frontend
cd frontend
npm.cmd run dev -- --host 127.0.0.1 --port 5173
```

The known backend-gate hang must not be silently waived. Before REQ-009 is
declared complete, compare against the pre-REQ-009 baseline. If it remains,
either resolve it as an explicitly approved prerequisite or report the full
gate as blocked. A new REQ-009 failure may not be classified as unrelated
without baseline evidence.

## Planned File Surface

Exact task-level slices are defined in the implementation plan. The expected
surface is:

```text
shared/
  types/supervision.ts
  contracts/supervision.ts
  tests/supervision-contract.spec.ts
  index.ts

backend/src/
  common/http/router.ts
  app.module.ts
  modules/supervision/**

backend/tests/
  supervision*.spec.ts

frontend/src/
  pages/SandboxAlertsPage.tsx
  pages/sandbox-alerts.page.spec.tsx
  components/supervision/**
  components/task-detail/SandboxAlertSection.tsx
  hooks/useSupervisionPolling.ts
  services/supervision-service.ts
  services/supervision-service.spec.ts
  mocks/supervision.ts
  styles/app.css

tests/
  integration/backend-supervision.api.spec.ts
  repository/track1-supervision-ui.spec.ts

docs/
  sprint-current.md
  api-contract.md
  architecture.md
  progress.md
```

No file under `engines/sandbox/src/**`, `samples/track1/cases/**`,
`samples/track1/attack-scripts/**`, or existing REQ-006/007/008 demo source is
modified by REQ-009.

## Boundaries

### Always Do

- Use shared runtime normalizers at API boundaries.
- Write and verify RED before production behavior.
- Keep the frontend behind platform APIs.
- Use event-type-specific renderers.
- Preserve last valid data on transient polling failure.
- Keep all exported evidence content-free.
- Update API, architecture, progress, and frontend usage documentation.
- Run focused gates before wider gates.

### Ask First

- Any new dependency.
- Any shared change beyond the approved supervision DTOs.
- Any repository-interface change that affects task-center behavior.
- Any persistence or schema decision.
- Any authentication/authorization behavior.
- Any change to polling cadence or transport.
- Any scope move from REQ-010 into REQ-009.

### Never Do

- Implement approval/resume or alert workflow mutation.
- Add SSE/WebSocket in this requirement.
- Expose raw content or engine-private objects.
- Couple the frontend to sandbox engine modules.
- Add full report generation.
- Modify existing attack fixtures or detection behavior.
- Claim a healthy API state after contract-invalid data.
- Skip failing tests or weaken shared sandbox invariants.

## Success Criteria

REQ-009 is complete only when all of the following are true:

1. `/results/sandbox` is a usable global supervision workbench.
2. The shared overview, summary, detail, and evidence contracts are
   runtime-validatable and content-free.
3. The three read-only backend endpoints return normalized shared DTOs.
4. List filtering supports task/session search, status, risk, action, scenario,
   and tool.
5. No list response returns more than 100 sessions.
6. Top counts use the fixed global latest-100 observation window.
7. The desktop session-list/timeline layout and mobile two-view layout work
   without overlap.
8. Every shared sandbox event variant has a safe typed renderer.
9. Decisions, alerts, and blocked records are visibly correlated.
10. `ask` is visible and has no mutation command.
11. Overview/list polling and running-detail polling obey the approved
    three-second, visibility, cancellation, and terminal-state semantics.
12. A transient failure preserves the last valid snapshot and marks it stale.
13. Task detail deep-links to the selected supervision session.
14. Session evidence downloads are normalized, deterministic, and contain no
    raw content.
15. No frontend source imports an engine module.
16. No new runtime dependency, persistence, streaming, approval workflow, or
    full report generation is introduced.
17. Focused tests, repository gates, frontend build, and relevant regression
    gates pass.
18. Required documentation is updated.
19. Implementation stops and reports before `REQ-T1-DEMO-010`.

## Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| Polling creates overlapping requests | One in-flight request per resource, abort/manual replacement, fake-timer tests |
| Invalid data leaks through generic rendering | Shared strict normalizers and event-type field whitelists |
| Global console becomes an N+1 frontend query | Dedicated backend list projection and separate selected detail |
| Summary changes unexpectedly with filters | Counts are explicitly independent from filters |
| Deep link conflicts with active filters | Detail loads independently and shows outside-filter state |
| Long refs break layout | Constrained rows, truncation, tooltip/copy, mobile visual checks |
| Mock fallback appears healthy | Explicit data-source and freshness states |
| Evidence download leaks wrapper/debug data | Download only normalized evidence DTO data |
| Requirement expands into workflow/reporting | Read-only boundary and explicit REQ-010 ownership |
| Existing backend test hang obscures regressions | Record pre-change baseline and prohibit silent waiver |

## Open Questions

None. Product, architecture, API, content-boundary, polling, interaction,
export, and testing decisions required for implementation planning are
resolved.
