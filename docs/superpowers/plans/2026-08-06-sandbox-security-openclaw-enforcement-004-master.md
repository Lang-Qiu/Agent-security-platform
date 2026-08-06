# REQ-SBX-GENERAL-004 Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans`, plus `superpowers:test-driven-development`,
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking. Complete one task, review it, commit its exact paths, and stop
> before starting the next task.

**Goal:** Enforce GENERAL-002 sandbox security decisions at four final awaited
OpenClaw barriers, with content-free authenticated audit and no change to the
Track 1 runtime or GENERAL-003 public v1 contracts.

**Architecture:** A standalone nested OpenClaw `2026.6.34` package loads one
general-security plugin and one in-process production Engine. A minimal
integrity-gated patch adds three final barriers beside the existing
`before_agent_run`; the plugin reconstructs authority, maps actions, and sends
versioned private audit events to a GENERAL-003 backend extension. SQLite v2
uses one table with an `event_schema` discriminator so legacy public readers
and new enforcement repositories remain disjoint.

**Tech Stack:** Node.js `>=22.19.0`, TypeScript ESM, `node:test`,
`node:assert/strict`, `node:sqlite`, OpenClaw `2026.6.34`, pnpm `10.0.0`, Docker
Compose, existing GENERAL-001/002 public Engine indexes, and no frontend code.

---

## Document Status

- Requirement: `REQ-SBX-GENERAL-004`
- Date: `2026-08-06`
- Status: `PLAN_REVIEWED_PENDING_USER_APPROVAL`
- Canonical specification:
  `docs/superpowers/specs/2026-08-06-sandbox-security-openclaw-enforcement-design.md`
- Specification review: final independent `PASS`, Critical `0`, Important `0`,
  Minor `0`
- Specification status: `SPEC_APPROVED`
- Plan review: final independent re-review `PASS`, Critical `0`, Important `0`,
  Minor `0`; all earlier findings are resolved
- Review mode: independent read-only subagent review
- Dependency: GENERAL-002 remains
  `PROVISIONAL_ACCEPTED_PENDING_P6_RECAPTURE`
- Maximum implementation status before that dependency closes:
  `IMPLEMENTED_PENDING_GLOBAL_P6_GATE`
- This reviewed plan does not authorize implementation. It requires the user's
  explicit approval before execution.

## Plan Set

| Order | Plan | Testable outcome |
| --- | --- | --- |
| 1 | `2026-08-06-sandbox-security-openclaw-enforcement-004-phase-1-contracts-package.md` | predecessor gate decoupled from rotating sprint ownership, permanent requirement gate, versioned shared/private contracts, nested package identity, route/type surfaces, and root scripts |
| 2 | `2026-08-06-sandbox-security-openclaw-enforcement-004-phase-2-backend-sqlite.md` | SQLite v2, dual-schema repositories, private capability provisioning, exact enforcement audit service/controller, and internal HTTP integration |
| 3 | `2026-08-06-sandbox-security-openclaw-enforcement-004-phase-3-plugin-enforcement.md` | immutable plugin config/health, plugin-issued evaluation identity, authority builder, Engine runtime, action mapper, audit client, correlation, and fake-host hook tests |
| 4 | `2026-08-06-sandbox-security-openclaw-enforcement-004-phase-4-openclaw-patch.md` | synthetic-first patch mechanism, native runtime hook catalog, exact thirteen-file manifest, dispatcher/follow-up-scoped turn context, all four real awaited barriers, host-only replacement path, and nested-CLI runtime probes |
| 5 | `2026-08-06-sandbox-security-openclaw-enforcement-004-phase-5-deployment-closure.md` | isolated Docker/Compose runtime, tmpfs/privacy gates, Track 1 regression, durable docs, and dependency-bounded final validation |

The order is strict. A Phase starts only after every task in its predecessor is
green, committed, and reviewed with no unresolved Critical or Important
finding. No Phase may modify a later Phase's production files to make an early
test pass.

## Execution Environment

Run from the repository root on Linux:

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
nvm use
node --version
pnpm --version
git branch --show-current
git status --short
test "$(node -p 'process.platform')" = "linux"
test -f ./frontend/node_modules/typescript/bin/tsc
node -e 'const { DatabaseSync } = require("node:sqlite"); const db = new DatabaseSync(":memory:"); db.close()'
```

Expected: Node `>=22.19.0`, pnpm `10.0.0`, the local TypeScript compiler
exists, and `node:sqlite` opens. Record and preserve unrelated worktree changes.
Do not reset, clean, switch branches, or alter existing Track 1 artifacts.
Repository test commands set `TMPDIR=/tmp` so a Windows-mounted shell cannot
inherit a read-only host temp path and misclassify FOFA fixture setup as a code
failure.

The nested package dependency install is authorized only in P1-T4 after its
RED repository test exists and after
`integrations/openclaw/general-security/pnpm-workspace.yaml` establishes the
nearest pnpm workspace root. Use:

```bash
pnpm --dir integrations/openclaw/general-security install --lockfile-only
pnpm --dir integrations/openclaw/general-security install --frozen-lockfile
```

Expected: only the nested package lockfile/node_modules changes; its lockfile
owns importer `.`, while repository-root `pnpm-lock.yaml` keeps SHA-256
`c94b923620ce5e3f82616fa366fb530a2b74b44c5ebbbccf572653c2bea06c0d`.
The existing `integrations/openclaw/package.json` and Track 1 lockfile entry
remain byte-identical.

## Canonical Inputs

- `AGENTS.md`
- `metadata.md`
- `docs/sprint-current.md`
- `docs/architecture.md`
- `docs/api-contract.md`
- `docs/superpowers/specs/2026-08-06-sandbox-security-openclaw-enforcement-design.md`
- `docs/superpowers/specs/2026-08-05-sandbox-security-backend-api-design.md`
- `engines/sandbox/src/security/index.ts`
- `engines/sandbox/src/security-production/index.ts`
- `shared/index.ts`
- `backend/src/modules/sandbox-security/sandbox-security.module.ts`
- `backend/src/common/http/internal-router.ts`
- `backend/src/internal-app.module.ts`
- `integrations/openclaw/package.json`
- `deploy/track1/Dockerfile.openclaw`

The specification wins if wording differs. Stop for user direction if a task
would change GENERAL-001 Engine semantics, GENERAL-002 detector/provider/P6
behavior, GENERAL-003 public v1 DTO meaning, Track 1 plugin/runtime/evidence,
or any frontend production file.

## Locked Runtime Identity

```text
general-security OpenClaw: 2026.6.34
npm integrity: sha512-Rm4khBrWn9HYqE99NBryCFgjwlsIuwBqK5jIANn2773CGXJ1JIZkDn5twEHB+8SVFdh0FPNPHRVgZepzNJDfHg==
packed tgz SHA-256: d0edcbc937428ce1cb5729e444ea615651c9a8895807653ac2c4ed4e05122fa5
Track 1 OpenClaw: 2026.6.10 unchanged
repository-root pnpm-lock.yaml SHA-256: c94b923620ce5e3f82616fa366fb530a2b74b44c5ebbbccf572653c2bea06c0d
Node: >=22.19.0
host barrier deadline: 10000 ms, fixed in code
audit client deadline: 1000 ms, fixed in code
Engine concurrency: 4, no queue
```

The three new patch hook names are exactly
`before_model_output_delivery`, `before_tool_execution`, and
`before_message_delivery`. The existing fourth barrier is
`before_agent_run`. Startup requires one and only one configured
`agent-security-sandbox-general` plugin and all four barriers.

## Locked Host Turn Context

For a normal turn, `withReplyDispatcher` creates one inactive private capsule
before `params.run` and keeps its dedicated `AsyncLocalStorage.run(...)` scope
active through dispatcher settlement and `waitForIdle()`. The selection or CLI
acceptance site activates that existing capsule immediately before
`before_agent_run` with only schema `openclaw-security-turn-context.v1`, the
exact normalized current prompt, `runId`, and `sessionKey`; acceptance does not
own the scope lifetime. A queued follow-up creates its own pending capsule
around the complete `runQueuedFollowup`, including payload send and routed
delivery, and its accepted run activates that capsule with its own exact tuple.

Every capsule uses `run`, never `enterWith`; no global raw map, queue, transcript,
history, `BodyForAgent`, or session-only prompt lookup exists. The owning
dispatcher/follow-up `finally` clears the prompt and invalidates the capsule
after all awaited delivery settles. Nested scopes restore the outer capsule;
detached, missing, inactive, or mismatched reads fail closed. Model, tool, and
outbound call sites must match this host-owned tuple, and the plugin cannot
reconstruct or retain the raw prompt.

## Locked Evaluation Request Identity

After exact host event/context normalization and before authority or correlation
state, the plugin coordinator obtains exactly one integration-private
`request:<UUIDv4>` from injected `nextEvaluationRequestId()`. The production
port uses `crypto.randomUUID()`. That immutable ID is unique per evaluation and
is copied unchanged into the authority/Engine request, Decision correlation,
and completed/interrupted audit request; it is independent from and cannot be
supplied or derived from run/session/call identity, content, provenance,
digests, Engine output, or audit transport. The host envelope never exposes it.

Generation/normalization failure occurs before an evaluation exists: no state,
builder, Engine, audit event ID, or audit request is created; enforcement health
fails and the handler returns the fixed unavailable barrier. Audit event identity
remains separately generated as `audit:<UUIDv4>` only after action selection.

## Locked Action and Health Contract

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

interface OpenClawSecurityHealth {
  enforcement: "healthy" | "failed";
  audit: "healthy" | "degraded";
}

interface OpenClawSecurityHookEnvelope {
  schema_version: "openclaw-security-hook-result.v1";
  correlation: {
    runId: string;
    sessionKey: string;
    callId: string | null;
  };
  health: OpenClawSecurityHealth;
  barrier: OpenClawSecurityBarrierResult;
}
```

The plugin handler returns only this exact private envelope. The patched host
runner independently validates its own event/context correlation and
`health.enforcement`, tolerates `audit: "degraded"`, and returns only the
nested `barrier` to the owning call site. Invalid envelopes, correlation drift,
or failed enforcement health select the fixed fail-closed unavailable barrier,
never `pass`.

- `allow|alert` -> pass/continue.
- `ask` -> replace with `Security review required. This action was not completed.`
- `deny` -> replace with `Blocked by sandbox security policy.`
- required failure -> replace with
  `Security evaluation unavailable. This action was not completed.`
- user/model/outbound failure floor -> `ask`.
- tool failure floor -> `deny`.
- audit failure changes only `audit`, never the selected host action.
- replacement provenance is the non-user-writable marker
  `openclaw-security-fixed-replacement.v1`.

## File Ownership Map

### Shared Private Enforcement Contracts

```text
shared/types/sandbox-security-enforcement-audit.ts
shared/contracts/sandbox-security-enforcement-audit.ts
shared/tests/sandbox-security-enforcement-audit-contract.spec.ts
shared/index.ts
```

GENERAL-003's `shared/types/sandbox-security-api.ts` and
`shared/contracts/sandbox-security-api.ts` remain behavior-compatible. They may
receive import-only compatibility tests but no new v1 literal.

### Backend v2 and Internal Route

```text
backend/src/modules/sandbox-security/dto/enforcement-audit-capability.ts
backend/src/modules/sandbox-security/enforcement-audit.service.ts
backend/src/modules/sandbox-security/sandbox-security-enforcement-audit.controller.ts
backend/src/modules/sandbox-security/ports/enforcement-audit.repository.ts
backend/src/modules/sandbox-security/adapters/sqlite/sqlite-enforcement-audit.repository.ts
backend/src/modules/sandbox-security/adapters/sqlite/sqlite-migrations.ts
backend/src/modules/sandbox-security/adapters/sqlite/sqlite-audit.repository.ts
backend/src/modules/sandbox-security/adapters/sqlite/sqlite-capability.repository.ts
backend/src/modules/sandbox-security/capability-authorizer.ts
backend/src/modules/sandbox-security/capability.service.ts
backend/src/modules/sandbox-security/sandbox-security-admin.controller.ts
backend/src/modules/sandbox-security/sandbox-security.module.ts
backend/src/modules/sandbox-security/sandbox-security.types.ts
backend/src/common/http/internal-router.ts
backend/src/internal-app.module.ts
backend/tests/sandbox-security-enforcement-audit-*.spec.ts
tests/integration/backend-sandbox-security-enforcement-audit.api.spec.ts
tests/repository/sandbox-security-openclaw-enforcement.spec.ts
tests/repository/sandbox-security-openclaw-enforcement-route.spec.ts
tests/repository/sandbox-security-backend-spec.spec.ts
```

### Standalone General-Security Package

```text
integrations/openclaw/general-security/package.json
integrations/openclaw/general-security/pnpm-workspace.yaml
integrations/openclaw/general-security/pnpm-lock.yaml
integrations/openclaw/general-security/tsconfig.json
integrations/openclaw/general-security/openclaw.plugin.json
integrations/openclaw/general-security/config/openclaw-security.json5
integrations/openclaw/general-security/scripts/build.mjs
integrations/openclaw/general-security/scripts/apply-general-security-patch.mjs
integrations/openclaw/general-security/patches/openclaw-2026.6.34-general-security.patch
integrations/openclaw/general-security/patches/openclaw-2026.6.34-general-security.manifest.json
integrations/openclaw/general-security/src/index.ts
integrations/openclaw/general-security/src/general-security/*.ts
integrations/openclaw/general-security/tests/general-security-*.spec.ts
```

The existing `integrations/openclaw/` files outside `general-security/` are
Track 1-owned and remain unchanged.

### Deployment and Closure

```text
deploy/sandbox-security/Dockerfile.openclaw
deploy/sandbox-security/compose.openclaw-security.yml
deploy/sandbox-security/README.md
tests/integration/openclaw-sandbox-security.runtime.spec.ts
tests/repository/sandbox-security-openclaw-enforcement.spec.ts
package.json
README.md
docs/architecture.md
docs/api-contract.md
docs/progress.md
docs/sprint-current.md
```

## Test Command Ledger

Phase tasks use focused direct commands first. These aggregate scripts are
added in P1-T5 and remain stable:

```json
{
  "test:integration:openclaw:security": "node --experimental-strip-types --experimental-test-isolation=none --test integrations/openclaw/general-security/tests/general-security-*.spec.ts tests/integration/openclaw-sandbox-security.runtime.spec.ts tests/integration/backend-sandbox-security-enforcement-audit.api.spec.ts",
  "typecheck:integration:openclaw:security": "node ./frontend/node_modules/typescript/bin/tsc --noEmit -p integrations/openclaw/general-security/tsconfig.json"
}
```

Final order:

```bash
npm run test:integration:openclaw:security
npm run typecheck:integration:openclaw:security
TMPDIR=/tmp npm run test:repo
npm run test:shared
npm run test:backend
npm run test:engine:sandbox
npm run test:engine:sandbox:production
npm run test:track1:openclaw
TMPDIR=/tmp npm run test:all
git diff --check
```

`TMPDIR=/tmp npm run test:all` must be attempted. The expected GLOBAL P6
hermetic failure remains dependency-bounded until the signed GENERAL-002
recapture and replay exist; it is recorded, never hidden or bypassed.

## Cross-Phase RED Ownership

| Behavior | First RED owner | Production owner |
| --- | --- | --- |
| predecessor permanent-gate ownership | P1-T1 | GENERAL-003 canonical spec/progress gate |
| private audit/capability exact types | P1-T2/P1-T3 | shared private files/backend DTO |
| nested package identity and Track 1 byte stability | P1-T4 | nested package config only |
| route/type/script presence | P1-T5 | routers/module/package scripts |
| schema v2 and event_schema separation | P2-T1 | SQLite migration |
| replay/conflict and public filter | P2-T2 | dual repositories |
| capability issue/auth | P2-T3 | capability service/repository/admin branch |
| audit service/controller/admission | P2-T4/P2-T5 | backend service/controller/internal module |
| config/Engine/health and trusted evaluation request-ID issuer | P3-T1 | plugin runtime |
| authority/correlation and per-evaluation request-ID lifecycle | P3-T2/P3-T5 | authority builder/plugin |
| actions/replacements | P3-T3 | mapper/plugin |
| audit client | P3-T4 | audit client |
| verified patch application mechanism | P4-T1 | generic patch script with synthetic fixtures |
| native hook declaration/runtime catalogs and closed runner | P4-T2 | exact OpenClaw patch |
| dispatcher/follow-up-scoped turn context and final user/model/tool/message ordering | P4-T3..P4-T6 | exact OpenClaw patch |
| production patch manifest/post-hashes | P4-T7 | sealed manifest and fixed identity wrapper |
| real four-barrier nested-CLI probe | P4-T8 | patched package/plugin |
| Docker/tmpfs/privacy/docs | P5-T1..P5-T4 | deployment, repository gates, durable docs |

Missing-module errors are not accepted as behavioral RED. Every test imports
an existing module boundary or a type-only export introduced by an earlier
green task; RED must fail on the named missing behavior/assertion.

## Commit Sequence

Use these task-local prefixes; never stage unrelated user changes:

```text
test(sandbox): gate GENERAL-004 implementation surfaces
feat(shared): add private enforcement audit contracts
feat(sandbox): define enforcement audit capability contracts
build(openclaw): isolate general security package
feat(sandbox): register enforcement audit route surface
feat(sandbox): migrate security audit storage to v2
feat(sandbox): add enforcement audit repositories
feat(sandbox): provision enforcement audit capabilities
feat(sandbox): persist enforcement audit events
feat(sandbox): accept OpenClaw enforcement audit events
feat(openclaw): create sandbox security runtime
feat(openclaw): build sandbox security authority
feat(openclaw): enforce sandbox security actions
feat(openclaw): audit sandbox security enforcement
feat(openclaw): coordinate final security hooks
test(openclaw): verify general security patch application
feat(openclaw): add awaited final barrier runner
feat(openclaw): enforce normalized user input
feat(openclaw): await final assistant security barrier
feat(openclaw): enforce final tool requests
feat(openclaw): enforce final outbound messages
build(openclaw): seal general security patch identity
test(openclaw): verify four final barrier paths
build(sandbox): isolate protected OpenClaw image
build(sandbox): deploy protected OpenClaw runtime
test(sandbox): gate OpenClaw enforcement privacy
docs(sandbox): complete GENERAL-004 enforcement
```

## Completion Gate

GENERAL-004 is implementation-complete only when:

1. every Phase checkbox is complete and every task has a focused commit;
2. RED evidence records the intended missing behavior before each production
   change and GREEN evidence records the focused pass afterward;
3. the exact package/patch manifest and all four barrier runtime probes pass;
4. all action/failure/correlation/unsupported-input matrices pass;
5. v1-to-v2 migration, public filtering, capability provisioning,
   replay/conflict, admission, and audit-health matrices pass;
6. raw/transformed leakage count is zero on every application-managed surface;
7. Track 1 package/config/evidence byte and behavioral gates remain green;
8. `README.md`, architecture, API contract, progress, and sprint reflect only
   tested implementation state;
9. `TMPDIR=/tmp npm run test:all` is attempted and the unresolved GENERAL-002
   P6 gate is reported honestly; and
10. a closing review reports no unresolved Critical or Important finding.

Stop after reporting GENERAL-004. Do not start GENERAL-005.
