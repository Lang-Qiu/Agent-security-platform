# REQ-SBX-GENERAL-005 Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans`, plus `superpowers:test-driven-development`,
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking. Complete one task, review it, commit its exact paths, and stop
> before starting the next task.

**Goal:** Deliver the sandbox security evaluation workbench and content-free
audit view as a cybersecurity-console frontend surface, on a shared dark
theme layer, without changing any backend route, shared contract, or Engine
semantics, and without regressing the existing 221-test frontend baseline.

**Architecture:** One shared token-driven theme layer replaces the light
console palette at `ConfigProvider` plus the `app.css` custom-property block,
so every existing page inherits the dark console without DOM or assertion
changes. Two new pages consume only the two public GENERAL-003 routes through
a new authenticated client path and the existing shared exact-key normalizers.
The capability bearer token is operator-pasted and lives only in React state.

**Tech Stack:** React `19.2.4`, TypeScript `6.0.2`, antd `6.3.4`
(`theme.darkAlgorithm` + `theme.compactAlgorithm`), react-router-dom `7.13.2`,
Vitest `4.1.1` with jsdom `29.0.1`, `@testing-library/react` `16.3.2`, existing
`shared/` sandbox-security contracts, and no new runtime dependency.

---

## Document Status

- Requirement: `REQ-SBX-GENERAL-005`
- Date: `2026-08-07`
- Status: `PLAN_DRAFT_PENDING_REVIEW`
- Canonical specification:
  `docs/superpowers/specs/2026-08-07-sandbox-security-frontend-workbench-design.md`
- Specification status: `DRAFT_PENDING_REVIEW`
- Plan review: not yet performed
- Review mode required before execution: independent read-only subagent review
- Execution authority: **NOT GRANTED**

### Execution Is Blocked

This plan group is a documentation-only Design-phase artifact. It changes no
production code, test, or dependency. Execution requires all four of the
following, and no worker may infer any of them:

1. `REQ-SBX-GENERAL-004` reaches its terminal status. At the time of writing
   `docs/sprint-current.md` names GENERAL-004 as
   `IMPLEMENTATION_IN_PROGRESS`, with `docs/progress.md` at P2-T2 complete and
   Phases 3 through 5 unstarted.
2. Independent specification review returns `PASS` with Critical `0` and
   Important `0`.
3. Independent plan review returns `PASS` with Critical `0` and Important `0`.
4. The user explicitly approves execution, and a separate documentation-only
   commit switches `docs/sprint-current.md` to `REQ-SBX-GENERAL-005`.

GENERAL-005 depends on GENERAL-001 through GENERAL-004 per the umbrella
Scope Decomposition table, and both `AGENTS.md` and `metadata.md` permit only
one active requirement at a time.

## Approved Product Decisions

These six decisions were explicitly confirmed by the user on `2026-08-07` and
are inputs to this plan, not open questions:

1. Documentation-only delivery now; the active sprint stays on GENERAL-004.
2. A shared theme layer applied once at the app root, plus new GENERAL-005
   pages authored natively in the new style. Existing Track 1 page markup is
   not rewritten.
3. Dark slate palette with a restrained cyan accent, Inter for prose and
   monospace reserved for identifiers and digests.
4. The capability bearer token is pasted by the operator and held in memory
   only. No new public route is added, so GENERAL-003's fixed five-route
   surface is untouched.
5. Specification and plan documents are written in English, matching every
   existing document under `docs/superpowers/`.
6. New UI copy uses Chinese labels with English enum and identifier values.

Decision 4 deliberately avoids the `metadata.md` change guardrail
"introduce a cross-cutting auth/authz model", which remains an open
project-wide Pending Decision.

## Plan Set

| Order | Plan | Testable outcome |
| --- | --- | --- |
| 1 | `2026-08-07-sandbox-security-frontend-workbench-005-phase-1-theme-gate.md` | permanent requirement gate decoupled from rotating sprint ownership, console theme token module, dark/compact `ConfigProvider` algorithms, `app.css` custom-property inversion, hardcoded-color removal, and an unchanged 221-test baseline |
| 2 | `2026-08-07-sandbox-security-frontend-workbench-005-phase-2-service-layer.md` | authenticated request path with `Authorization` and `Idempotency-Key`, evaluation and audit service functions over the shared exact-key normalizers, closed error-code mapping, and no-persistence guarantees |
| 3 | `2026-08-07-sandbox-security-frontend-workbench-005-phase-3-components.md` | verdict/action/severity presentational tags, findings and detector-run tables, content-item editor with client limits, capability panel, and content-free audit event table |
| 4 | `2026-08-07-sandbox-security-frontend-workbench-005-phase-4-pages-routing.md` | workbench and audit pages, route registration, navigation group, cursor pagination, and URL state proven free of submitted content |
| 5 | `2026-08-07-sandbox-security-frontend-workbench-005-phase-5-privacy-acceptance.md` | privacy leak sentinel, accessibility and contrast gates, full-suite regression, and durable documentation closure |

The order is strict. A Phase starts only after every task in its predecessor
is green, committed, and reviewed with no unresolved Critical or Important
finding. No Phase may modify a later Phase's production files to make an
early test pass.

## Execution Environment

This repository lives on a WSL filesystem. Verified during Design-phase
baselining: running the frontend suite from a Windows UNC working directory
fails before any test executes. `npm` spawns `cmd.exe`, which rejects the UNC
path, and invoking Node directly from a UNC cwd fails CommonJS module
resolution. Every command below must run inside the Linux distro.

```bash
wsl -d Ubuntu -e bash -lc '
  cd /Agent-security-platform &&
  git rev-parse --show-toplevel &&
  node --version &&
  pnpm --version &&
  git branch --show-current &&
  git status --short
'
```

Expected: repository root `/Agent-security-platform`, Node `>=22.19.0`
(verified `v22.19.0`), pnpm `10.0.0`. Record and preserve unrelated worktree
changes. Do not reset, clean, switch branches, or alter Track 1 artifacts.

Frontend validation, which is the primary gate for this requirement:

```bash
wsl -d Ubuntu -e bash -lc '
  cd /Agent-security-platform && TMPDIR=/tmp npm run test:frontend
'
```

## Locked Baseline

```text
frontend test files: 15
frontend tests:      221 passed
frontend duration:   ~140 s (pool threads, maxWorkers 1, no file parallelism)
antd:                6.3.4  (theme.darkAlgorithm + theme.compactAlgorithm present)
react:               19.2.4
```

Every Phase must leave all 15 files and 221 tests green. A Phase that changes
a count must state the exact new count and the reason.

Two pre-existing antd 6 deprecation warnings are emitted by the current suite
(`Alert` `message` prop, and `List`). They are baseline noise owned by Track 1,
are out of GENERAL-005 scope, and must not be "fixed" opportunistically inside
this requirement.

### Why the theme layer is assertion-safe

Verified during Design: no existing frontend spec asserts a literal color, an
inline style, or a CSS class name; assertions are roles, accessible text, and
anchors. The shared test harness `frontend/src/test/app-test-harness.tsx`
already wraps `AppProviders`, so a token change at `ConfigProvider` reaches
every routed test without editing a single assertion. The theme layer changes
computed style only, never DOM structure or accessible names.

## Locked Console Theme Identity

Contrast was computed against the two background layers during Design. Every
text token clears WCAG 2.1 AA (>= 4.5:1); `border-interactive` clears the
1.4.11 non-text 3:1 floor required for input and control boundaries.

| Token | Value | vs `bg #0d1520` | vs `surface #121c28` |
| --- | --- | --- | --- |
| `--console-ink` | `#e4edf5` | 15.48 | 14.50 |
| `--console-muted` | `#8fa3b8` | 7.07 | 6.63 |
| `--console-muted-dim` | `#7d92a8` | 5.72 | 5.36 |
| `--console-accent` | `#22d3ee` | 10.15 | 9.51 |
| `--console-border-interactive` | `#51708f` | 3.55 | 3.32 |

```text
--console-bg:                  #0d1520
--console-surface:             #121c28
--console-ink:                 #e4edf5
--console-muted:               #8fa3b8
--console-muted-dim:           #7d92a8
--console-accent:              #22d3ee
--console-accent-soft:         #0f2a35
--console-border:              #1f2d3d
--console-border-strong:       #2c3e52
--console-border-interactive:  #51708f

severity  critical #f87171  high #fb923c  medium #fbbf24  low #38bdf8  info #94a3b8
action    allow    #34d399  alert #fbbf24  ask #38bdf8  deny #f87171
```

`--console-muted-dim` `#7d92a8` and `--console-border-interactive` `#51708f`
are corrections applied during Design. The initially considered `#6b7f94`
reached only 4.44:1 (AA-large, not AA text) and the initial
`#2c3e52` reached only 1.67:1, below the 3:1 interactive floor. Neither
original value may be reintroduced.

`ConfigProvider` uses `algorithm: [theme.darkAlgorithm, theme.compactAlgorithm]`.
The compact algorithm is not decorative: it directly serves the
`metadata.md` mandate for an information-dense admin console.

## Locked Consumed Surface

GENERAL-005 consumes exactly two existing public routes and adds none:

```http
POST /api/sandbox/security/evaluations
     Authorization: Bearer <capability>
     Idempotency-Key: <opaque-client-key>
     Content-Type: application/json
GET  /api/sandbox/security/audit-events?cursor=<cursor>&limit=<1..100>
     Authorization: Bearer <capability>
```

The complete route, DTO, and error tables are canonical in
`docs/api-contract.md` under `REQ-SBX-GENERAL-003 Authenticated Backend API`
and must not be duplicated into frontend code as literals beyond the closed
catalogs already exported by `shared/`.

Shared boundary functions the frontend must use rather than reimplement:

```text
normalizeSandboxSecurityDecision    shared/contracts/sandbox-security
normalizeSandboxSecurityFinding     shared/contracts/sandbox-security
normalizeSandboxDetectorRun         shared/contracts/sandbox-security
normalizeSandboxSecurityAuditPage   shared/contracts/sandbox-security-api
normalizeSandboxSecurityAuditEvent  shared/contracts/sandbox-security-api
```

Verified browser-safe: no sandbox-security shared contract or type file
imports a `node:` builtin or uses `require`. The frontend import convention is
a deep relative path with no file extension, matching the existing
`shared/contracts/supervision` precedent already bundled by Vite.

Closed catalog sizes the UI must render exhaustively and never widen:
3 stages, 6 claimed source types, 9 risk categories, 2 policy profiles,
4 severities, 3 verdicts, 4 actions, 6 detector run statuses, 8 audit event
types, 15 HTTP error codes.

Client-side limits mirrored from `shared/types/sandbox-security`:
`128 KiB` text per item, `512 KiB` whole request, `64` content items,
JSON depth `12`, JSON nodes `4096`.

## Locked Privacy Rules

The umbrella design assigns GENERAL-005 this non-negotiable boundary:
application code must not put submitted content in URL state, browser
storage, response history, telemetry, or durable audit.

Therefore, across every Phase:

- no `localStorage`, `sessionStorage`, `IndexedDB`, or cookie write of
  submitted content or of the capability token;
- no submitted content in a route path, query string, or hash;
- no `console.*` emission of submitted content or the token;
- the capability token exists only in React state, is never rendered back
  after entry, and is never placed in a log, error message, or retry record;
- the audit view renders only the content-free event union; it has no code
  path that could display content, because the contract carries none;
- `subject_refs` locators (byte ranges, JSON pointers) and `evidence_refs`
  are content-free positional data and are safe to render.

This boundary explicitly does not claim control over DevTools, browser
extensions, browser process memory, or OS swap.

## Canonical Inputs

- `AGENTS.md`
- `metadata.md`
- `docs/sprint-current.md`
- `.github/instructions/frontend.instructions.md`
- `.github/instructions/docs.instructions.md`
- `docs/architecture.md`
- `docs/api-contract.md`
- `docs/superpowers/specs/2026-07-10-sandbox-general-security-design.md`
- `docs/superpowers/specs/2026-07-10-sandbox-security-core-spec.md`
- `docs/superpowers/specs/2026-08-05-sandbox-security-backend-api-design.md`
- `docs/superpowers/specs/2026-08-07-sandbox-security-frontend-workbench-design.md`
- `shared/types/sandbox-security.ts`
- `shared/types/sandbox-security-api.ts`
- `shared/contracts/sandbox-security.ts`
- `shared/contracts/sandbox-security-api.ts`
- `frontend/src/app/AppProviders.tsx`
- `frontend/src/styles/app.css`
- `frontend/src/test/app-test-harness.tsx`

The specification wins if wording differs. Stop for user direction if a task
would change GENERAL-001 Engine semantics, GENERAL-002 detector behavior,
GENERAL-003 public v1 DTO meaning or its five-route surface, GENERAL-004
enforcement behavior, or any Track 1 backend/engine file.

## Requirement Gate Design Note

The Phase 1 permanent gate must assert this requirement's spec and plan
identity — file presence, `Plan Set` ordering, and status strings — and must
**not** assert that `docs/sprint-current.md` names GENERAL-005. GENERAL-004's
Phase 1 recorded exactly this lesson after its predecessor gate broke when
sprint ownership rotated. A gate coupled to the rotating current-sprint file
becomes a stale failure the moment the next requirement begins.

## Validation Gates

Run from inside the distro. Every gate must be recorded per task.

```bash
cd /Agent-security-platform
TMPDIR=/tmp npm run test:frontend
TMPDIR=/tmp npm run test:repo
./frontend/node_modules/typescript/bin/tsc -p frontend/tsconfig.json
git diff --check
```

Backend, shared, engine, and integration suites are not expected to change.
If any of them moves, stop and classify before continuing.

## Acceptance Criteria

1. Specification and plan reviews both return `PASS` with Critical `0` and
   Important `0`, and the user has approved execution.
2. All five Phases are complete, each task committed with its exact paths.
3. The frontend suite is green with the 221 pre-existing tests unchanged in
   intent, plus the new GENERAL-005 tests.
4. The workbench performs a real simulation evaluation against a running
   backend using an operator-pasted capability, and renders verdict, action,
   risk level, findings, and detector runs from the normalized decision.
5. The audit view pages forward through cursors and can restart from the first
   page, and renders all
   eight event types content-free.
6. The privacy sentinel proves no submitted content or token reaches URL
   state, storage, or console output.
7. Contrast and keyboard-accessibility gates pass for the locked palette.
8. `README.md`, `docs/architecture.md`, `docs/api-contract.md`, and
   `docs/progress.md` are updated consistently, and
   `docs/sprint-current.md` records the terminal status.

## Documentation And Stop Rule

Phase 5 owns durable documentation. On completion, report modified files,
added tests, whether tests passed, whether the requirement is complete, and a
suggested commit message, then stop. Do not begin an adjacent requirement.

## Open Questions

None. Both questions raised during drafting have been resolved as explicit
non-goals in the spec's `Out of Scope` section:

- A "load example request" affordance using benchmark corpus samples: out of
  scope (benchmark is sealed; reuse is a contract violation).
- A client-side subject filter on the audit view: out of scope (the route
  supports only `cursor` and `limit`; client-side filtering over a 100-row
  window would mislead operators).
