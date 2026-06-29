# Sprint Current

## Requirement ID

REQ-T1-SUPERVISION-UI-009

## Requirement Name

Track 1 behavior supervision console

## Background

`REQ-T1-SANDBOX-CONTRACT-005` defines typed behavior events, policy decisions,
alerts, and blocked records. `REQ-T1-MONITOR-PLUGIN-007` produces normalized
model/tool call-chain results, and `REQ-T1-BASE-FILTER-008` supplies the first
real decision provider.

This requirement presents those normalized results through the platform API
and the React operator console.

The approved design is:

- `docs/superpowers/specs/2026-06-29-track1-supervision-ui-design.md`

## Goal

- Replace the sandbox placeholder with a global supervision workbench.
- Let operators triage recent sessions and inspect one complete event timeline.
- Show policy decisions, alerts, blocking records, and safe evidence refs.
- Refresh running supervision data every three seconds.
- Provide deterministic sanitized session evidence JSON.
- Preserve platform, shared-contract, and engine ownership boundaries.

## In Scope

- Shared supervision overview, summary, detail, and evidence DTOs.
- Dedicated read-only backend supervision projection API.
- Server-side search/filter/sort with a 100-session cap.
- Global supervision summary, session list, and inline-expand timeline.
- Visibility-aware polling and stale-snapshot handling.
- Task-detail deep link to a selected supervision session.
- Safe JSON evidence download.
- Shared, backend, frontend, integration, repository, and visual tests.
- API, architecture, progress, and usage documentation.

## Out Of Scope

- No raw prompt, output, tool argument, tool result, or memory content.
- No direct frontend-to-engine access.
- No database, persistence, pagination, SSE, or WebSocket.
- No approval/resume, alert acknowledgement, comments, or policy editing.
- No OpenClaw adapter or agent-cluster aggregation.
- No full risk report, PDF/CSV, archive, or bulk export.
- No modification to attack cases, replay scripts, monitor behavior, or filter
  behavior.

## Acceptance Criteria

- `/results/sandbox` is a usable global supervision workbench.
- Shared supervision read contracts are strict, runtime-validatable, and
  content-free.
- Backend list, detail, and evidence endpoints expose only normalized shared
  DTOs.
- Search and all approved filters work, and no list returns more than 100
  sessions.
- Global counts are independent from list filters.
- Desktop and mobile investigation workflows are coherent and non-overlapping.
- All seven sandbox event types have explicit safe renderers.
- Decisions, alerts, and blocked records are correlated to subject events.
- `ask` is visible but has no mutation command.
- Polling obeys cadence, visibility, cancellation, and terminal-state rules.
- Transient failures preserve the last valid snapshot and mark it stale.
- Task detail deep-links to the corresponding session.
- Evidence JSON is normalized, deterministic, and content-free.
- No frontend source imports an engine module.
- Focused and repository gates pass.
- Implementation stops before `REQ-T1-DEMO-010`.

## Design Decision

Use a shared platform read model and dedicated supervision projection API.
The backend derives safe summaries from normalized sandbox results. The
frontend polls the overview and selected running detail every three seconds,
uses a session-list/timeline split layout, and downloads only normalized
evidence DTO data.

## Constraints / Notes

- The requirement switch and design document are documentation exceptions to
  full TDD.
- Implementation must follow:
  `Design -> Test -> Implement -> Document -> Stop and report`.
- No production code may be written before the relevant failing test is
  confirmed.
- Low-level implementation is assigned by the user. Codex produces the task
  DAG, acceptance criteria, and final diff/report/risk review.
- The known backend test hang must be baselined and may not be silently waived.
