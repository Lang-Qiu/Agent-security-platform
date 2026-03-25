# metadata.md

## Document Status
- Project: `agent-security-platform`
- Type: repository metadata and engineering baseline
- Scope: applies to the entire repository
- Status: initial template, can be refined as architecture and tooling are finalized
- Last updated: `2026-03-26`

## Purpose
This file defines the project-specific constraints and stable engineering conventions for this repository.

Use it together with `AGENTS.md`:
- `AGENTS.md` defines the default Codex workflow and TDD execution order
- `metadata.md` defines the project baseline, architecture boundaries, coding constraints, and change guardrails

If a future task conflicts with this file, stop and clarify before implementing.

## Project Snapshot
- Project name: `agent-security-platform`
- Product goal: build a sustainable platform for Agent security inspection, orchestration, and result aggregation
- Current phase goal: establish a long-lived platform skeleton that can support future iterative development
- Delivery posture: production-oriented skeleton first, not a one-off demo

## Known Product Direction
- Frontend: React + TypeScript
- Frontend style reference: Ant Design Pro simple
- Backend: Node.js + TypeScript
- Backend structural reference: NestJS-style module organization
- Engines planned for staged integration:
  - `asset-scan`
  - `skills-static`
  - `sandbox`

## Current Engineering Priorities
When trade-offs appear, prioritize in this order:
1. Clear structure and stable boundaries
2. Unified types and contracts
3. TDD-first development
4. Minimal integration-ready delivery
5. Long-term evolvability

Do not optimize for short-lived demo speed at the cost of architecture drift.

## In Scope For The Current Phase
- Establish the frontend, backend, shared-contract, and engine skeletons
- Define stable contracts between platform and engines
- Enable requirement-by-requirement incremental delivery
- Keep each change small enough for testing and joint debugging
- Accumulate durable documentation alongside code

## Non-Goals For The Current Phase
- Do not build a large one-shot demo
- Do not add heavy infrastructure before a requirement actually needs it
- Do not couple platform logic directly to a specific engine implementation
- Do not introduce broad future-proof abstractions without a concrete requirement

## Repository Baseline

### Frontend
- Location: `frontend/`
- Language: TypeScript
- Framework direction: React
- UX direction: information-dense, admin-console style, close to Ant Design Pro simple
- Expected responsibility:
  - task list and task detail pages
  - risk/result presentation
  - operator workflows and filtering
  - platform-facing API consumption only

### Backend
- Location: `backend/`
- Language: TypeScript
- Runtime direction: Node.js
- Structural direction: NestJS-style modular layering
- Expected responsibility:
  - public platform API
  - task orchestration
  - result aggregation
  - authorization/audit hooks when introduced
  - engine adapter coordination

### Shared
- Location: `shared/`
- Purpose: hold only cross-module contracts, shared types, shared constants, and low-coupling utilities
- Rule: if a type is only used inside one module, it should not live in `shared/`

### Engines
- Location: `engines/`
- Engines:
  - `engines/asset-scan`
  - `engines/skills-static`
  - `engines/sandbox`
- Rule: every engine should be able to evolve, test, and validate independently
- Rule: platform code depends on engine capability contracts, not engine internal rule logic

### Docs And Tests
- `docs/`: architecture, API contract, progress, plans, and ADR-oriented documentation
- `tests/`: repository-level integration, fixtures, and end-to-end verification

## Architecture Constraints
- The backend is the only platform entry for the frontend
- The frontend must not talk directly to engines
- Engines must not define frontend-facing contracts privately
- Shared contracts must be the source of truth for cross-boundary data exchange
- Engine outputs must be normalized before being exposed to the frontend
- Platform orchestration and engine detection logic must remain decoupled

## Coding Conventions
- Source code identifiers should use English
- Documentation may use Chinese or bilingual wording
- New business logic should prefer explicit types at module boundaries
- Cross-boundary DTOs and result models should be documented before broad reuse
- Prefer small, composable modules over large multi-purpose files
- New dependencies must be justified by a requirement, not convenience alone
- Avoid introducing tooling, frameworks, or patterns unrelated to the current requirement

## Frontend Conventions
- Prefer React + TypeScript component decomposition that is easy to test
- Keep presentational components separate from platform data integration concerns when practical
- Follow the established console-style information hierarchy instead of marketing-page patterns
- New frontend behavior should align with `docs/api-contract.md` and `shared/` contracts
- Frontend requirement work should default to `$react-best-practices`
- If the task has strong visual and interaction design goals, combine with `$frontend-design`

## Backend Conventions
- Organize code by module boundaries, not by ad-hoc scripts
- Prefer controller/service/domain or adapter-style separation consistent with a NestJS-like skeleton
- Keep engine integrations behind explicit interfaces or adapters
- Normalize request/response shapes before exposing them externally
- Backend requirement work may combine with `$senior-backend` when API or contract design is central

## Contract And Data Rules
- Any cross-boundary contract change must be reflected in `shared/` and `docs/api-contract.md`
- Backend APIs must not leak raw engine-private structures directly to the frontend
- Engine task submission, status, and result payloads should converge on stable shared shapes
- If a breaking contract change is required, document the reason and stop for confirmation before widening scope

## TDD And Testing Baseline
- `AGENTS.md` is the execution workflow source of truth for TDD
- No production business logic without a failing test first
- Preferred test order:
  1. backend unit tests
  2. backend API integration tests
  3. frontend component or full-stack interaction tests
- Tests must fail for the intended reason before implementation begins
- Tests must use requirement-and-scenario-oriented names
- No test-skipping, fake-passing, or production conditionals that only exist to satisfy tests

## Allowed Exceptions To Full TDD
The following work may proceed without RED/GREEN business tests, but the reason must be stated explicitly:
- documentation updates
- repository configuration
- workspace conventions

These exceptions do not permit piggybacking unrelated business logic into the same change.

## Documentation Update Rules
After completing a requirement, check and update as needed:
- `README.md`
- `docs/architecture.md`
- `docs/api-contract.md`
- `docs/progress.md`

If a decision has long-term architecture impact, capture it in `docs/adr/` when the project starts recording ADRs.

## Requirement Handling Rules
- Default current requirement source: `docs/sprint-current.md`
- One requirement at a time
- Finish one requirement, then stop
- If the requirement is ambiguous, state assumptions and plan first
- If the requirement affects multiple architectural boundaries, confirm the intended scope before broadening implementation

## Skills Baseline
- Default development workflow: `$test-driven-development`
- Frontend React requirements: add `$react-best-practices`
- Higher-fidelity frontend visual work: optionally add `$frontend-design`
- Backend contract and service design work: optionally add `$senior-backend`
- Architecture and boundary decisions: optionally add `$senior-architect`
- After implementation completes: default to `$code-reviewer` for a closing review

Skills are helpers, not exceptions to repository rules.
No skill may bypass `AGENTS.md`, this file, or explicit user constraints.

## Change Guardrails
Stop and confirm before making changes that:
- introduce a new top-level package or major toolchain
- create or remove a shared contract used by multiple modules
- commit to a database/storage architecture not yet approved
- introduce a cross-cutting auth/authz model
- change engine-platform responsibility boundaries
- expand one requirement into multiple requirements

## Output Contract For Completed Requirements
Each completed requirement should report:
1. modified files
2. added tests
3. whether tests passed
4. whether the current requirement is complete
5. a suggested commit message

## Pending Decisions
The following items are intentionally left open and should be confirmed before they become implementation assumptions:
- package manager and workspace bootstrap details
- Node.js version baseline
- TypeScript strictness and lint/format presets
- database/storage selection
- auth/authz approach
- engine execution and callback/polling strategy

## Template Maintenance Note
This file should evolve slowly.
Update it when project-wide norms change, not for every local implementation detail.
