# Sprint Current

## Requirement ID
REQ-T1-MONITOR-PLUGIN-007

## Requirement Name
Track 1 model call-chain monitoring plugin

## Background

`REQ-T1-ATTACK-REPLAY-006` provides deterministic scenario results and a nine-case replay source. `REQ-T1-MOCK-TOOLS-004` provides local-only simulated business tools, and `REQ-T1-SANDBOX-CONTRACT-005` provides the typed supervision contract. This requirement adds the runtime middleware that observes model calls, obtains injected policy decisions, and intercepts simulated tools before execution.

The approved detailed design is:

- `docs/superpowers/specs/2026-06-28-track1-monitor-plugin-design.md`

## Goal

- Provide a reusable session-level model and tool monitoring middleware.
- Obtain allow, deny, ask, and alert actions through an injected decision provider.
- Intercept deny, ask, and provider-failure paths before simulated-tool execution.
- Produce complete normalized sandbox supervision results without retaining raw content.
- Exercise the plugin with all nine existing Track 1 cases and a fixed controlled demo.

## In Scope

- Engine-private monitoring contracts, content boundary, session middleware, result builder, and replay adapter.
- Model-output and tool-request decision-provider stages.
- Simulated-tool allow/alert execution and deny/ask interception.
- Fail-closed provider behavior.
- Multi-round sequential session support.
- Fixed nine-case monitor demo.
- Focused monitor, sandbox-engine, repository, and shared-contract compatibility tests.
- Sandbox README, architecture, sprint, and progress documentation after verification.

## Out Of Scope

- No detection rules or base-model filter implementation.
- No OpenClaw adapter.
- No backend route, persistence, or frontend behavior.
- No cluster aggregation or shared trace fields.
- No approval resume workflow.
- No real model, network, email, host filesystem, or external process.
- No case, scenario, replay-script, or shared-contract changes.

## Acceptance Criteria

- Model and tool callbacks are wrapped by one session-level monitor.
- The injected provider is called at model-output and tool-request stages.
- Allow and alert execute validated simulated tools; deny and ask never call the executor.
- Provider failure produces a fail-closed deny and blocking record.
- Ask, deny, and failures seal the session.
- Multiple sequential calls preserve event order and correlation.
- Finalization emits a complete `BaseResult<SandboxRunResultDetails>` accepted by `normalizeBaseResult`.
- Raw prompt, model output, tool arguments, tool output, and exceptions do not enter serialized results.
- All nine cases pass through the monitor adapter exactly once.
- The fixed demo emits nine byte-identical normalized results.
- Existing REQ-006 scripts remain unchanged and deterministic.
- Tests demonstrate RED before implementation and GREEN afterward.

## Design Decision

The monitor is a sandbox-engine session middleware. Detection is injected through `MonitorDecisionProvider`, allowing REQ-008 to add filtering without changing orchestration. Raw content is visible only to the current callback/provider invocation and is never retained by the monitor.

## Constraints / Notes

- The requirement switch and design document are documentation exceptions to full TDD.
- Implementation must follow `Design -> Test -> Implement -> Document -> Stop and report`.
- Low-level implementation work is assigned by the user; Codex's current role is spec, task DAG, acceptance criteria, and final review.
