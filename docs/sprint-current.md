# Sprint Current

## Requirement ID

REQ-T1-DEMO-010

## Requirement Name

OpenClaw-oriented end-to-end demo and report evidence pack

## Background

REQ-002 through REQ-009 now provide three attack scenarios, nine controlled
cases, attack replay scripts, simulated business tools, a typed supervision
contract, a monitor plugin, a rule-based filter, and a read-only supervision
console.

REQ-010 connects those assets to a real pinned OpenClaw runtime and cloud
OpenAI-compatible model, supervises three OpenClaw agents as one campaign, and
produces the final Track 1 risk report and evidence pack.

The approved design is:

- `docs/superpowers/specs/2026-06-30-track1-openclaw-demo-design.md`

The implementation is divided into one master index and seven independently
reviewed TDD phase plans under `docs/superpowers/plans/`.

## Goal

- Run all nine fixed cases through real OpenClaw and a cloud model.
- Intercept model/tool activity with a native OpenClaw security plugin.
- Supervise three scenario agents under one campaign.
- Display campaign progress, agent groups, alerts, asks, blocks, and sessions.
- Generate a Chinese risk report with bilingual abstracts, PDF, screenshots,
  normalized JSON, and a SHA-256 artifact manifest.
- Commit one sanitized, reproducible baseline evidence pack.

## In Scope

- Pinned OpenClaw `2026.6.10` Docker runtime.
- Native plugin using the existing monitor, filter, and simulated tools.
- Three fixed OpenClaw agents and nine fixed cases.
- Authenticated Docker-internal snapshot ingestion.
- Strict campaign read contracts and read-only supervision APIs.
- Campaign mode inside `/results/sandbox`.
- One audited retry per case and exact 9/9 final action matching.
- Automatic screenshot, Markdown, PDF, JSON, and manifest generation.
- Ordinary offline gates plus credentialed real OpenClaw/cloud-model E2E.

## Out Of Scope

- No real email, host filesystem, shell, browser, MCP, or business API side
  effects.
- No public campaign-start API or frontend execution control.
- No database, durable campaign persistence, SSE, WebSocket, or message queue.
- No arbitrary cases, model-selected targets, third-party systems, or external
  OpenClaw channels.
- No coordinator agent, additional scenario, or OpenClaw compatibility adapter.
- No policy editing, acknowledgement, approval, or workflow commands.

## Acceptance Criteria

- Real OpenClaw loads the native plugin and all required hooks.
- Three agents execute all nine cases through the configured cloud model.
- Final expected/actual policy actions match 9/9 with at most one retry each.
- Every tool request is intercepted before simulated execution.
- No real side effect or prohibited raw-content leak occurs.
- Campaign ingestion, projection, APIs, and UI satisfy the approved spec.
- The baseline report and evidence pack are complete and hash-consistent.
- Offline gates and the credentialed E2E gate pass.
- Required documentation is updated.

## Design Decision

Run the existing sandbox security engine inside a native OpenClaw plugin. Send
only normalized snapshots to a Docker-internal ingest listener, project
campaign data through shared read contracts, and extend the existing
supervision console rather than building a second investigation UI.

## Constraints / Notes

- The requirement switch and design document are documentation exceptions to
  full TDD.
- Implementation must follow:
  `Design -> Test -> Implement -> Document -> Stop and report`.
- No production code may be written before the relevant failing test is
  confirmed.
- Low-level implementation is assigned by the user. Codex produces the task
  DAG and acceptance criteria; Phase 3 review remediation was completed
  directly after repeated implementation defects exceeded the delegated
  model's capability.
- The specification is approved. No implementation starts until the user
  approves the phased implementation plans and assigns the first task.

## Current Phase Status

- Phase 1: complete
- Phase 2: complete
- Phase 3: review remediation complete, pending user review
- Phase 4 and later: not started by this worktree
