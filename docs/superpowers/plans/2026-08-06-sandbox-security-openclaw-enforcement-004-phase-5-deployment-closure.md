# Phase 5 Isolated Deployment, Privacy, and Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` or
> `superpowers:executing-plans`, plus `superpowers:test-driven-development`,
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Package the patched general-security OpenClaw runtime as an isolated,
non-durable deployment, prove permanent privacy and Track 1 non-regression
gates, and close GENERAL-004 at its dependency-bounded implementation status.

**Architecture:** A digest-pinned image builds only the standalone
`integrations/openclaw/general-security` package, verifies and applies the
approved OpenClaw patch, and runs as an unprivileged process with a read-only
root. Compose attaches that one runtime to the internal-audit network,
publishes no host port, and places every OpenClaw
session, transcript, workspace, and plugin-scratch path on tmpfs. Permanent
tests scan all application-managed surfaces for raw/transformed sentinels and
lock the existing Track 1 package, deployment, and evidence bytes.

**Tech Stack:** Docker/BuildKit, Docker Compose v2, Node.js `>=22.19.0`, pnpm
`10.0.0`, OpenClaw `2026.6.34`, TypeScript ESM, `node:test`, `node:crypto`, and
the existing GENERAL-004 runtime/repository test harnesses.

---

## Entry Gate

- [ ] Confirm all eight Phase 4 tasks are green, committed, and reviewed with no
  unresolved Critical or Important finding.
- [ ] Record the commit immediately before the first GENERAL-004 implementation
  commit. It is the byte-stability source for Track 1-owned paths; do not use a
  dirty worktree as the baseline.
- [ ] Run:

```bash
npm run test:integration:openclaw:security
npm run typecheck:integration:openclaw:security
TMPDIR=/tmp npm run test:repo
npm run test:track1:openclaw
git diff --check
```

Expected: the real patched-runtime probe is green, the standalone package
typechecks, repository gates pass, and Track 1 remains green. Preserve and
report unrelated worktree changes; never reset, clean, or stage them.

- [ ] Verify Docker and Compose are available before starting P5-T1:

```bash
docker version
docker compose version
docker buildx version
```

If a real image build or container probe cannot run, stop this Phase and report
the missing execution prerequisite. Do not replace the required real probe
with a mocked success.

## Locked Deployment and Privacy Boundary

```text
image package root: /opt/openclaw-general-security
OpenClaw version: 2026.6.34
plugin ID: agent-security-sandbox-general
plugin registration count: 1
container user: non-root
root filesystem: read-only at runtime
published host ports: none
durable OpenClaw volumes: none
tmpfs roots:
  /run/openclaw-security
  /tmp/openclaw
  /workspace
audit route:
  http://sandbox-security-backend:3001/internal/sandbox/security/enforcement-events
```

The image may copy the nested general-security package plus the public
`shared/` and sandbox Engine build inputs it needs. It must not copy the Track 1
plugin manifest, package, configuration, source, tests, deployment tree, or
evidence. It must not contain two OpenClaw installations or two agent-security
plugin manifests.

Compose owns only the `openclaw-security` service. The GENERAL-003 backend is
an independently composed service reachable by the fixed internal hostname on
an operator-provided internal network. GENERAL-004 does not define or accept an
egress-network/firewall requirement; OpenClaw model and inherited GENERAL-002
provider connectivity remain deployment concerns outside this plan. The
runbook may note that Compose alone does not prove egress confinement, but such
guidance is non-binding and is not an acceptance gate.

The four immutable plugin values are supplied only at process startup. No
credential has a Docker build argument, image-layer literal, checked-in
default, or command-line value. Real secret values must never be used when
rendering or retaining Compose diagnostic output.

### Task P5-T1: Digest-Pinned General-Security Image and Closed Runtime Config

**Files:**
- Create: `deploy/sandbox-security/Dockerfile.openclaw`
- Modify: `integrations/openclaw/general-security/config/openclaw-security.json5`
- Modify: `tests/repository/sandbox-security-openclaw-enforcement.spec.ts`
- Modify: `tests/integration/openclaw-sandbox-security.runtime.spec.ts`

- [ ] **Step 1: Write failing image/config repository tests**

Extend the existing permanent repository gate. Parse the JSON5 configuration
and inspect the Dockerfile. Assert one plugin ID/load path, exact four required
environment references, fixed audit path, no token literal/default, disabled
raw-stream/debug/transcript capture, the three tmpfs-backed paths, non-root
runtime, frozen nested lockfile installation, patch verification/application,
and exact runtime version verification.

```ts
test("REQ-SBX-GENERAL-004 image contains only the protected OpenClaw runtime", () => {
  const dockerfile = read("deploy/sandbox-security/Dockerfile.openclaw");
  assert.match(
    dockerfile,
    /^FROM node:22\.19\.0-bookworm-slim@sha256:[a-f0-9]{64}$/m
  );
  assert.match(dockerfile, /pnpm install --frozen-lockfile/);
  assert.match(dockerfile, /apply-general-security-patch\.mjs/);
  assert.match(dockerfile, /USER node/);
  assert.equal(/ARG .*KEY|ARG .*TOKEN|2026\.6\.10/i.test(dockerfile), false);
  assert.equal(dockerfile.includes("integrations/openclaw/config"), false);
});
```

Also require a multi-stage image, no package-manager cache/final build sources,
one patched OpenClaw package root, the sealed patch and manifest as read-only
final-image artifacts, immutable config/plugin mounts inside the image, and a
startup command that runs the P4 integrity/barrier probe before normal runtime
registration. Add a runtime tamper fixture that changes one patch byte while
leaving the manifest/runtime tree unchanged and assert startup fails before
plugin registration. Do not accept a missing-file/import error as the only RED;
after creating the empty path/surface, keep at least one intended digest/config
assertion failing.

- [ ] **Step 2: Run and verify RED**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/repository/sandbox-security-openclaw-enforcement.spec.ts \
  tests/integration/openclaw-sandbox-security.runtime.spec.ts
```

Expected: FAIL on the absent digest-pinned image and closed runtime-storage
configuration, while the Phase 4 runtime assertions remain green.

- [ ] **Step 3: Resolve and record the immutable Node base digest**

```bash
docker buildx imagetools inspect node:22.19.0-bookworm-slim
```

Copy the actual manifest-list digest into `FROM`. Do not use the existing
Track 1 Dockerfile as a build stage, a floating tag, or an invented digest.

- [ ] **Step 4: Implement the minimal isolated image/config**

The builder enables Corepack/pnpm `10.0.0`, copies only the nested package and
its approved public Engine/shared build inputs, installs with the nested frozen
lockfile, validates the official package identity, applies the exact P4 patch,
validates every post-patch hash, builds the plugin, and runs the P4 probe.

The final stage copies only the patched runtime, built plugin, sealed patch,
manifest, and closed config. The patch and manifest are immutable/read-only and
remain available to recompute `patch_sha256` at startup. The image owns no npm
registry cache, compiler, test fixture, Track 1 path, or source credential.
Create the three runtime directories with ownership for the unprivileged user,
but rely on Compose tmpfs for their runtime storage. Startup repeats package,
patch-byte digest, patched-file, and four-barrier verification before hooks are
registered; build-time verification never substitutes for startup verification.

Use only OpenClaw `2026.6.34` configuration keys verified by the real
`plugins inspect --runtime --json` command. If raw/debug/transcript capture
cannot be disabled or redirected with supported keys, stop and request a
specification decision instead of inventing a key or weakening privacy.

- [ ] **Step 5: Run GREEN and the real image identity probe**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/repository/sandbox-security-openclaw-enforcement.spec.ts \
  tests/integration/openclaw-sandbox-security.runtime.spec.ts
docker build -f deploy/sandbox-security/Dockerfile.openclaw \
  -t agent-security-openclaw-general:2026.6.34 .
docker run --rm --entrypoint openclaw \
  agent-security-openclaw-general:2026.6.34 --version
docker history --no-trunc agent-security-openclaw-general:2026.6.34
git diff --check
```

Expected version: exactly `2026.6.34`. Inspect image history with only dummy
configuration available and verify that no token, credential, Track 1 path, or
raw fixture value appears.

- [ ] **Step 6: Commit**

```bash
git add deploy/sandbox-security/Dockerfile.openclaw \
  integrations/openclaw/general-security/config/openclaw-security.json5 \
  tests/repository/sandbox-security-openclaw-enforcement.spec.ts \
  tests/integration/openclaw-sandbox-security.runtime.spec.ts
git commit -m "build(sandbox): isolate protected OpenClaw image"
```

### Task P5-T2: Compose Topology, tmpfs, and Real Container Probe

**Files:**
- Create: `deploy/sandbox-security/compose.openclaw-security.yml`
- Create: `deploy/sandbox-security/README.md`
- Modify: `tests/repository/sandbox-security-openclaw-enforcement.spec.ts`
- Modify: `tests/integration/openclaw-sandbox-security.runtime.spec.ts`

- [ ] **Step 1: Write failing Compose/topology tests**

Parse the Compose document through a test-local exact loader. Require exactly
one `openclaw-security` service, the `sandbox-security` profile, no host ports,
no durable volumes, three exact tmpfs mounts, read-only root, non-root user,
all capabilities dropped, `no-new-privileges`, bounded CPU/memory/PIDs, an
init/reaping strategy, and a health check that exercises the startup/runtime
probe without logging configuration.

```ts
assert.equal("ports" in service, false);
assert.equal("volumes" in service, false);
assert.deepEqual(service.tmpfs.slice().sort(), [
  "/run/openclaw-security",
  "/tmp/openclaw",
  "/workspace"
]);
assert.deepEqual(service.cap_drop, ["ALL"]);
assert.equal(service.read_only, true);
```

Require exactly one explicit internal-audit network, no Track 1 network/service/
image, a fixed internal audit endpoint, required environment
references without fallback values, and no bootstrap administrator token. The
dedicated `sbxcap_v1.*` token is the only audit credential accepted by the
OpenClaw service.

Add injected lifecycle tests to the runtime spec for config failure before
registration, package/patch/barrier failure before readiness, valid-form audit
rejection producing `enforcement: healthy/audit: degraded`, signal shutdown,
and no persistent state after restart.

- [ ] **Step 2: Run and verify RED**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/repository/sandbox-security-openclaw-enforcement.spec.ts \
  tests/integration/openclaw-sandbox-security.runtime.spec.ts
```

Expected: FAIL because the Compose topology and lifecycle closure do not yet
exist. A malformed YAML/parser error must be corrected before counting RED.

- [ ] **Step 3: Implement the isolated topology and operator runbook**

The Compose file builds only `deploy/sandbox-security/Dockerfile.openclaw`,
does not compose or inherit the Track 1 stack, and requires the operator to
attach the independently running GENERAL-003 backend to the named internal
network as `sandbox-security-backend`. Keep the audit route fixed to the exact
internal path. Expose no public listener; a future gateway/UI belongs to
GENERAL-005.

Document prerequisites, dedicated capability issuance, the one-hour maximum
TTL/no automatic rotation boundary, startup order, audit-degraded behavior,
internal-listener attachment, tmpfs/no-volume behavior, health inspection,
safe stop/restart, and exact validation commands. Label any egress guidance as
out-of-scope operator guidance rather than required GENERAL-004 behavior. Never
put the bootstrap admin credential into OpenClaw configuration; it is used only
by an operator to mint the dedicated token through GENERAL-003.

- [ ] **Step 4: Validate rendered topology using dummy-only values**

Use a syntactically valid dummy capability and non-secret placeholder provider
configuration. Do not render real credentials:

```bash
export SANDBOX_SECURITY_POLICY_PROFILE_ID=sandbox-security-balanced.v1
export SANDBOX_SECURITY_PRODUCTION_MODE=rule_only
export SANDBOX_SECURITY_AUDIT_CAPABILITY_TOKEN=sbxcap_v1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
docker compose -f deploy/sandbox-security/compose.openclaw-security.yml \
  --profile sandbox-security config
```

Inspect the rendered service/network list, mounts, privileges, port exposure,
and absence of Track 1 paths. Do not check the rendered dummy file into the
repository.

- [ ] **Step 5: Run GREEN and the real container startup probe**

```bash
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/repository/sandbox-security-openclaw-enforcement.spec.ts \
  tests/integration/openclaw-sandbox-security.runtime.spec.ts
docker compose -f deploy/sandbox-security/compose.openclaw-security.yml \
  --profile sandbox-security build openclaw-security
docker compose -f deploy/sandbox-security/compose.openclaw-security.yml \
  --profile sandbox-security run --rm --no-deps --entrypoint openclaw \
  openclaw-security --version
docker compose -f deploy/sandbox-security/compose.openclaw-security.yml \
  --profile sandbox-security run --rm --no-deps --entrypoint openclaw \
  openclaw-security plugins inspect agent-security-sandbox-general \
  --runtime --json
git diff --check
```

Expected: exact version, one plugin, four barriers, registration count one,
enforcement healthy, and either healthy audit or the specified degraded audit
when the dummy/unavailable backend is used. No model or ordinary agent command
is allowed in this probe.

- [ ] **Step 6: Commit**

```bash
git add deploy/sandbox-security/compose.openclaw-security.yml \
  deploy/sandbox-security/README.md \
  tests/repository/sandbox-security-openclaw-enforcement.spec.ts \
  tests/integration/openclaw-sandbox-security.runtime.spec.ts
git commit -m "build(sandbox): deploy protected OpenClaw runtime"
```

### Task P5-T3: Permanent Privacy, Isolation, and Track 1 Regression Gates

**Files:**
- Modify: `tests/integration/openclaw-sandbox-security.runtime.spec.ts`
- Modify: `tests/repository/sandbox-security-openclaw-enforcement.spec.ts`

- [ ] **Step 1: Add the mutation RED for the permanent gate**

Create one test-local artifact scanner used by both suites. Before completing
it, feed copied artifacts with one forbidden transformation at a time and
assert rejection: literal UTF-8, case-folded, NFKC, JSON-escaped, percent-
encoded, base64, hex, and SHA-256. At least the first newly added transformation
must produce the intended assertion RED; do not count an existing clean
runtime as RED.

Create a second test-local Track 1 snapshot helper. Its canonical input is the
sorted relative path plus SHA-256 for all committed files under these owned
surfaces, excluding only generated/ignored files:

```text
integrations/openclaw/ (except integrations/openclaw/general-security/)
deploy/track1/
docs/track1/evidence/
```

Seed its expected aggregate from the clean commit recorded at the Phase entry,
then mutate one copied byte and observe RED before enabling the comparison.
The permanent test stores only the baseline commit ID and aggregate digest; it
does not invoke Git and does not accept a digest sampled from a dirty tree.

- [ ] **Step 2: Add the full real-event privacy matrix**

Drive one deterministic local turn through each of the four real patched
barriers with distinct sentinels in the prompt, assistant text/tool projection,
final tool parameters, and final outbound payload. Cover `allow`, `alert`,
`ask`, `deny`, required failure, Engine timeout/throw/slot-unavailable,
correlation drift, and audit unavailable/malformed acknowledgement.

Collect and scan every application-managed surface available to the harness:

```text
plugin/runtime state and health snapshots
host results and replacement envelopes
stdout/stderr/log/metric/trace/error captures
audit request and response bytes
backend SQLite, WAL, and SHM bytes
OpenClaw session/transcript/plugin scratch tmpfs while the container is live
container export and image history after the turn
repository-owned generated artifacts
```

Assert blocked originals are absent and only the approved fixed replacement
text/provenance is emitted. Assert tmpfs paths disappear on container removal
and no named/anonymous persistent volume was created. Do not claim protection
from physical memory, OS swap, or malicious trusted in-process code; those
remain explicit specification non-goals.

- [ ] **Step 3: Complete static isolation and registration checks**

The repository helper rejects any nested package import of Track 1 source,
manifest/config copy into the image, both plugin IDs in one image/config,
public exposure of the internal audit route, public v1 union widening, raw or
transformed content keys in audit types, missing patch/startup probe, a
persistent queue/retry/volume, or an unregistered GENERAL-004 test.

Assert every GENERAL-004 shared/backend/plugin/runtime/repository spec remains
registered in `test:shared`, `test:backend`, `test:repo`, or
`test:integration:openclaw:security` as owned by its creation task. Do not add
live Docker/provider execution to `TMPDIR=/tmp npm run test:all`; keep the real
image probe as an explicit acceptance command.

- [ ] **Step 4: Run focused GREEN, Track 1, and widening regressions**

```bash
npm run test:integration:openclaw:security
npm run typecheck:integration:openclaw:security
TMPDIR=/tmp npm run test:repo
npm run test:shared
npm run test:backend
npm run test:engine:sandbox
npm run test:engine:sandbox:production
npm run test:track1:openclaw
git diff --check
```

If the privacy test reveals an earlier production leak, stop P5-T3 and return
to the owning Phase/task. Add the focused RED, make the smallest production
fix, run that owner's GREEN/review/commit, then restart this P5-T3 sequence.
Do not hide an owning-boundary fix inside the two-file P5-T3 test commit. Never
weaken the sentinel set or exclude a failing managed surface.

- [ ] **Step 5: Re-run the real container privacy probe and commit**

Run the P5-T2 build/inspect commands plus the deterministic no-network privacy
probe supplied by `openclaw-sandbox-security.runtime.spec.ts`. Record only
opaque IDs, counts, digests of approved non-content artifacts, and pass/fail
status; do not retain raw sentinel-bearing diagnostic files.

```bash
git add tests/integration/openclaw-sandbox-security.runtime.spec.ts \
  tests/repository/sandbox-security-openclaw-enforcement.spec.ts
git commit -m "test(sandbox): gate OpenClaw enforcement privacy"
```

### Task P5-T4: Durable Documentation and Dependency-Bounded Final Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/api-contract.md`
- Modify: `docs/progress.md`
- Modify: `docs/sprint-current.md`

This task is the documentation-only exception to RED/GREEN. All described
business and deployment behavior must already be covered by the green tests
from P1 through P5-T3.

- [ ] **Step 1: Cross-check and update durable documentation**

Correct only implemented/tested facts:

- `README.md`: prerequisites, exact nested package/image commands, required
  immutable configuration, dedicated capability issuance, Compose startup,
  health/degraded-audit inspection, safe stop, and validation commands;
- `docs/architecture.md`: four final barriers/order, authoritative projection,
  process Engine/concurrency, action/failure floors, audit independence,
  package/image/internal-listener isolation, tmpfs, SQLite v2 ownership, and
  shutdown;
- `docs/api-contract.md`: the private capability issuance schema branch,
  internal enforcement-event request/ack variants, admission/status/error/
  replay/conflict behavior, and explicit absence from the public router;
- `docs/progress.md`: every task commit, RED/GREEN evidence, exact command
  counts, package/patch/image/probe identities, privacy zero-leak result,
  Track 1 result, closing review, and unresolved global P6 dependency; and
- `docs/sprint-current.md`: keep implementation in progress until the closing
  review passes; only then transition to
  `IMPLEMENTED_PENDING_GLOBAL_P6_GATE`.

Do not claim GENERAL-002/003/004 `VERIFIED`, accepted signed P6 evidence, a
successful hermetic replay, a public enforcement API, frontend/audit UI, or
GENERAL-005 behavior.

- [ ] **Step 2: Run the exact final non-Docker sequence**

```bash
npm run test:integration:openclaw:security
npm run typecheck:integration:openclaw:security
TMPDIR=/tmp npm run test:repo
npm run test:shared
npm run test:backend
npm run test:engine:sandbox
npm run test:engine:sandbox:production
npm run test:track1:openclaw
git diff --check
TMPDIR=/tmp npm run test:all
```

The first nine commands must exit `0`. `TMPDIR=/tmp npm run test:all` must be
attempted and its actual exit/status recorded. Until GENERAL-002 has an accepted
signed P6
recapture and successful hermetic replay, the expected fail-closed P6 result is
a dependency gate, not permission to skip, rewrite, or waive that command.

- [ ] **Step 3: Run the exact final Docker sequence**

With dummy-only configuration and no model invocation:

```bash
export SANDBOX_SECURITY_POLICY_PROFILE_ID=sandbox-security-balanced.v1
export SANDBOX_SECURITY_PRODUCTION_MODE=rule_only
export SANDBOX_SECURITY_AUDIT_CAPABILITY_TOKEN=sbxcap_v1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
docker compose -f deploy/sandbox-security/compose.openclaw-security.yml \
  --profile sandbox-security config
docker compose -f deploy/sandbox-security/compose.openclaw-security.yml \
  --profile sandbox-security build openclaw-security
docker compose -f deploy/sandbox-security/compose.openclaw-security.yml \
  --profile sandbox-security run --rm --no-deps --entrypoint openclaw \
  openclaw-security --version
docker compose -f deploy/sandbox-security/compose.openclaw-security.yml \
  --profile sandbox-security run --rm --no-deps --entrypoint openclaw \
  openclaw-security plugins inspect agent-security-sandbox-general \
  --runtime --json
```

Record exact package/patch/file identities, one plugin/four barriers,
registration count, health, and empty diagnostics without storing configuration
or content. Confirm no persistent volume remains.

- [ ] **Step 4: Perform closing review and correct accepted findings RED-first**

The closing reviewer checks specification coverage, package/patch integrity,
barrier ordering and correlation, authority/action/failure matrices, audit
admission/replay/privacy, SQLite v2 compatibility, container isolation,
Track 1 byte stability, types, tests, and durable docs. Every accepted
correctness or security finding receives a focused failing regression, the
minimal fix, a full P5-T4 verification rerun, and re-review. Completion requires
no unresolved Critical or Important finding.

- [ ] **Step 5: Record evidence and transition the bounded status**

Only after the closing review returns `PASS`, record its result and exact
command outcomes in `docs/progress.md`, then set the current sprint to
`IMPLEMENTED_PENDING_GLOBAL_P6_GATE`. Run the status-owning permanent gates
again:

```bash
TMPDIR=/tmp npm run test:repo
git diff --check
```

- [ ] **Step 6: Commit the documentation checkpoint**

```bash
git add README.md docs/architecture.md docs/api-contract.md \
  docs/progress.md docs/sprint-current.md
git commit -m "docs(sandbox): complete GENERAL-004 enforcement"
```

- [ ] **Step 7: Stop and report**

Report modified files, added tests, RED/GREEN evidence, exact passing command
counts, Docker/package/patch identities, privacy and Track 1 results, the
`TMPDIR=/tmp npm run test:all` dependency-gated outcome, closing review verdict,
final GENERAL-004 status, remaining GENERAL-002 P6 work, and every task commit
SHA.
Do not begin GENERAL-005.

## Phase 5 Exit Gate

- [ ] The image contains only OpenClaw `2026.6.34`, the approved patch, one
  general-security plugin, and its public Engine/shared build inputs.
- [ ] Startup revalidates package/patch/patched-file identity and all four
  exactly-once awaited barriers before readiness.
- [ ] Compose publishes no host port, uses no durable OpenClaw volume, and
  mounts every session/transcript/workspace/plugin-scratch path on tmpfs.
- [ ] The runtime is non-root/read-only/capability-dropped and uses only the
  dedicated audit capability on the internal route.
- [ ] Raw/transformed sentinel count is zero on every application-managed
  surface and blocked originals never leave the final barrier.
- [ ] Track 1 package/config/deployment/evidence bytes and behavioral gates are
  unchanged and green.
- [ ] All focused and aggregate non-Docker commands are green except the
  honestly recorded dependency-bounded global P6 gate.
- [ ] Durable docs describe only implemented/tested behavior; GENERAL-005 and
  frontend/audit UI remain deferred.
- [ ] Closing review has no unresolved Critical or Important finding.
- [ ] GENERAL-004 is exactly `IMPLEMENTED_PENDING_GLOBAL_P6_GATE`, then work
  stops.
