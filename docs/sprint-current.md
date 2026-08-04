# Sprint Current

## Requirement ID

REQ-SBX-GENERAL-002

## Requirement Name

Sandbox Security Production Detectors and Sealed Benchmark

## Status

PROVISIONAL_ACCEPTED_PENDING_P6_RECAPTURE

## Temporary Planning Disposition (2026-08-05)

`PROVISIONAL_ACCEPTED_PENDING_P6_RECAPTURE`

The user authorized a temporary P6 release and continuation of GENERAL-002
planning using the content-free progress projection while deferring the next
complete 300-input P6 capture. This is a provisional acceptance for planning
only: P6 formal acceptance remains absent, GENERAL-002 is not `VERIFIED`, and
no progress-only record may be promoted to `capture.json`, receipts,
`seal.json`, or replay evidence.

The next live acceptance must use a fresh capture/evidence root pair and rerun
all 300 inputs; the rejected v8 root and the progress-only merge proposal are
not reusable formal evidence.

## Transition Authority

The user instructed the project to enter GENERAL-002 on `2026-07-16` after
GENERAL-001 Phase 1..5 and its final global review completed. The user then
approved the GENERAL-002 design choices and authorized the specification to be
written.

The written Spec and complete RED-first implementation plan set were
independently reviewed and explicitly approved. Production implementation is
authorized in the exact Master/Phase DAG order.

## Canonical Inputs

- `docs/superpowers/specs/2026-07-10-sandbox-general-security-design.md`
- `docs/superpowers/specs/2026-07-10-sandbox-security-core-spec.md`
- `docs/superpowers/plans/2026-07-11-sandbox-security-core-001-master.md`
- `docs/superpowers/specs/2026-07-16-sandbox-security-production-detectors-spec.md`
- `docs/superpowers/specs/2026-07-23-sandbox-security-operator-judge-protocol-adapter-amendment.md`
- `docs/superpowers/specs/2026-07-23-sandbox-security-explicit-judge-protocol-selection-amendment.md`
- `docs/superpowers/plans/2026-07-23-sandbox-security-explicit-judge-protocol-selection.md`
- `docs/superpowers/specs/2026-07-26-sandbox-security-p6-local-hardware-compatibility-amendment.md`
- `docs/superpowers/specs/2026-07-31-sandbox-security-p6-local-hardware-compatibility-v2-amendment.md`
- `docs/superpowers/specs/2026-08-01-sandbox-security-five-domain-judge-screening-amendment.md`
- `docs/superpowers/specs/2026-08-02-sandbox-security-seven-domain-judge-screening-amendment.md`
- `docs/superpowers/specs/2026-08-02-sandbox-security-p6-judge-latency-v4-amendment.md`
- `docs/superpowers/specs/2026-08-03-sandbox-security-p6-judge-readiness-v5-amendment.md`
- `docs/superpowers/specs/2026-08-03-sandbox-security-p6-local-hardware-compatibility-v6-amendment.md`

## Goal

- Add a deterministic production rule detector.
- Add a digest-pinned Ollama `qwen3:8b` local-model adapter.
- Add a deterministic structured sanitizer.
- Add explicitly selected Responses and Chat Completions JSON Judge protocol
  adapters with an operator-controlled safe HTTPS FQDN base URL and runtime
  requested model.
- Add production composition without changing GENERAL-001 semantics.
- Curate and seal the fixed 300-sample `sandbox-security-benchmark.v1`.
- Require both controlled live qualification and hermetic replay.

## Approved Design Decisions

- Production code lives under a sibling `security-production/` tree; the
  frozen GENERAL-001 core never imports it.
- GENERAL-002 uses only the final security index except for the sanitizer's one
  approved derive-helper deep import.
- Rule catalog is versioned TypeScript data with fixed deterministic operators.
- Ollama is loopback-only, does not auto-pull models, and requires an expected
  immutable model digest.
- Sanitization is deterministic, NFKC-based, structured, bounded, and
  fail-closed.
- Judge selects one source-controlled protocol at process startup with no host
  or model inference, retry, or fallback. The operator supplies a canonical
  safe HTTPS FQDN base URL; the adapter derives only the selected Responses or
  Chat Completions endpoint and keeps the credential private.
- Benchmark inputs use multiple public sources with immutable provenance and
  only Apache-2.0, MIT, BSD, CC BY 4.0, or CC0 licensing.
- Human-reviewed Chinese derivatives and independently reviewed transformed
  attacks are permitted.
- The capture process cannot read benchmark truth; production code cannot read
  any benchmark input, truth, source lock, manifest, or replay data.

## In Scope

- Production rule, local, sanitizer, Judge, transport, configuration, and
  composition modules.
- Public-source admission, fixture normalization, truth isolation, live
  capture, metric evaluation, sealed replay, attribution, and anti-oracle gates.
- Tests, static checks, TypeScript checks, Track 1 compatibility, docs, review,
  fixes, re-review, and final global review.

## Out of Scope

- Backend API/auth/idempotency/audit (GENERAL-003).
- OpenClaw enforcement (GENERAL-004).
- Frontend workbench and audit UI (GENERAL-005).
- GENERAL-001 contract/profile/reducer/state-machine changes.
- Automatic model or dataset downloads, training, dynamic rules, retries,
  fallback providers, workers, queues, or sidecars.

## Current Work

- Status is `PROVISIONAL_ACCEPTED_PENDING_P6_RECAPTURE`; GENERAL-002 remains
  the sole current requirement and follows the approved Master, amendment,
  and Phase plans. Formal P6 acceptance remains absent and GENERAL-002 is not
  `VERIFIED`.
- P6 candidate progress persistence is implemented within this requirement:
  the parent atomically retains a content-free cumulative decision document
  after each acknowledged sample, while partial progress remains ineligible
  for candidate, receipt, seal, evidence-root, and P7 use.
- P6 live acceptance is now a fixed four-stage process pipeline authorized by the
  `2026-07-26 P6 live acceptance capability` amendment. The uncredentialed
  `accept-live.ts` authority owns only fixed worker launch and the local Ed25519
  signing key; it imports no production, capture-runtime, evaluator, or sealer
  code. Separate `prepare-live-worker.ts`, `capture-live-worker.ts`,
  `evaluate-live-worker.ts`, and `seal-live-worker.ts` stages communicate through
  exact content-free stdout summaries and authority-signed capture/evaluation
  receipts. The credential six-variable environment reaches only the capture
  worker through a Node `--env-file` argument; the private key is never inherited.
- Security-relevant JSON/code files are read through the immutable
  `fs-snapshot.ts` fd-bound primitives (no-follow open, pre/post `fstat`,
  regular-file + `nlink === 1`, bounded bytes, exact sorted inventories,
  exclusive fsync-before-rename writes). `bindSandboxSecurityLiveRoots` rejects
  forward/reverse containment and symlink aliases among the corpus,
  capture-parent, and output roots.
- The signed receipt chain uses the source-controlled acceptance public key
  (`p6-acceptance-public-key.pem`); the mode-`600` private key is local-only,
  Git-ignored, read only by `accept-live.ts`, and never serialized or inherited.
  The sealer persists the canonical receipt chain in `receipt-chain.json` beside
  the immutable evidence.
- Candidate materialization moved to the production-neutral `capture-candidate.ts`;
  the credentialed capture worker snapshots, normalizes, freezes, and hashes all
  300 input envelopes before Judge readiness so a post-snapshot input replacement
  has no effect. Permanent repository AST gates
  (`tests/repository/sandbox-security-p6-acceptance-capability.spec.ts`, in
  `test:repo`) enforce the disjoint worker import graphs, sole signing-key reader,
  and sole credential handoff.
- Controlled P6 live capture now uses the source-controlled
  `p6_local_hardware_compatibility_v8` profile: Judge readiness and Ollama
  qualification/warmed prewarm are `40000ms`; the local detector slot remains
  `60000ms`, the Judge detector slot is `300000ms`,
  and the closed normal work budget is `360000ms`. The larger budget authorizes
  no retry or fallback.
  Ordinary composition and P7 replay retain the inherited GENERAL-001
  `5000ms` normal budget and `100/1000/4000ms` detector slots. Candidate,
  receipt, evaluator, sealer, and final evidence contracts reject v5 and older
  timing.
- The first v2 run failed closed when Ollama duplicated one `subject_refs`
  reference at corpus ordinal `241`. The exact local prompt is now
  `sandbox-security-ollama-local-prompt.v2`, adding only the explicit
  no-duplicate-reference instruction; its prompt SHA-256 is
  `e2632e29c2720f8f3c34436fe5daf6a7f251f5e912c3effeb21beccf56e4c196`.
  The parser remains strict and no response retry, repair, or deduplication was
  introduced. A full 300-input local parser preflight gates the next Judge run.
- A subsequent formal run completed 300 acceptance-capable provider outcomes
  but failed closed at candidate materialization because the benchmark
  projection contract used the obsolete `allow|block` action set. The contract
  now imports the frozen GENERAL-001 `allow|alert|ask|deny` catalog and rejects
  `block`; evaluator metrics remain verdict-only. No evidence was published.
- After that contract correction, a fresh controlled run completed all 300
  evaluations and reached the truth-aware evaluator. It failed the frozen
  acceptance thresholds: unsafe recall `6/180` (`0.033333`), high/critical
  recall `2/60` (`0.033333`), transformed recall `1/54` (`0.018519`), safe
  false-positive rate `0/120`, and decision coverage `300/300`. The local
  detector returned 299 valid responses (3 matches, 296 no-match) and one
  rule-short-circuited evaluation did not call it. The Judge binding and
  readiness were valid, but the frozen production router selected Judge only
  for unresolved signals; all 300 Judge outcomes were therefore legitimately
  `not_called`. The failed candidate and report are diagnostic-only and must
  never be promoted or reused.
- The user then approved a routing amendment after independent AgentDojo and
  ToolEmu development evidence and truth-blind live capacity probes. Ordinary
  `local` remains unchanged, while `local_and_judge` now uses source-controlled
  `five_domain_v1` screening after a completely valid pinned Ollama response.
  It emits exactly five low-confidence unresolved obligations for prompt
  injection, privilege escalation, sensitive-data exposure, unsafe side
  effects, and trust-boundary violations; the existing sanitizer and external
  Judge remain responsible for the final finding or clearance. More than eight
  combined authoritative subjects fails closed instead of truncating.
- The amendment was implemented RED-first. Focused detector, composition,
  benchmark composition, and replay integration tests are GREEN; the complete
  production sandbox suite is `420/420`, both sandbox/benchmark TypeScript
  checks pass, and the permanent repository spec gate pins the exact mode,
  categories, confidence, subject binding, timing isolation, and P7 replay.
 These results are implementation evidence only: a completely fresh 300-input
 live capture is still required.
- The `p6-live-judge-binding.ts` profile pins only the reviewed Judge protocol
  and endpoint policy. Base URL, derived endpoint, requested model, and API key
  are supplied exclusively by the mode-`600` operator environment; the
  resolved model is accepted only from the provider response. No external
  provider URL, model default, or credential is source-controlled. The fixed
  local `qwen3:8b` digest requirement remains separate.
- All deterministic pre-live gates are GREEN: benchmark isolation, capture-live,
  evaluate, contracts, corpus, capture-sink, accept-live, both TypeScript checks,
  `test:repo`, `test:engine:sandbox:production`, and `git diff --check`.
- An independent adversarial code + security review of the acceptance authority
  and four workers was completed. It confirmed the cryptographic receipt layer is
  sound and raised seven findings; all are resolved: (1) the authority now spawns
  each worker with a fixed closed environment via the stage-protocol builders and
  never spreads its own `process.env`, so no inherited credential or `NODE_OPTIONS`
  reaches a worker; (2) the capture worker cross-binds package/manifest/inputs
  hashes to anchor the signed binding to the sandboxed child's output; (3) the
  capture worker enforces the pinned `p6-live-judge-binding.ts` profile before any
  Judge value enters evidence; (4) the sealer re-verifies candidate, report, and
  corpus manifest hashes against the signed evaluation binding before publishing;
  (5) the authority binds the prepare→capture and capture→evaluation chain links;
  (6) exclusive atomic writes use `link`+`unlink` for true exclusivity; and (7)
  the credential env file gets the same mode-`600`/no-symlink/single-link hygiene
  as the private key. Permanent repository regression guards cover each fix.
- A second independent review verified every prior finding RESOLVED and found one
  functional defect introduced by the fixes: the sealer's `receipt-chain.json`
  self-invalidated the evidence root against the exact-layout validator. That is
  fixed: `validateAcceptedSandboxSecurityLiveEvidence` now admits an optional
  `receipt-chain.json` and, when present, verifies both embedded Ed25519 receipts
  with the tracked public key, their shared run ID, the capture→evaluation link,
  and that its `seal_sha256` matches the published `seal.json`. Smaller hardening
  items from the re-review (env-file content is an operator-trusted input;
  exclusive-write cleanup; stale comments) were also addressed.
- The three committed live-evidence acceptance tests remain intentionally RED:
  real `capture.json`, 300 replay envelopes, and `seal.json` are absent because
  the latest real run failed the frozen quality thresholds. Synthetic
  placeholders and promotion of the rejected candidate remain forbidden.
- The authorized v4 run completed a real 300-decision candidate but rejected
  before capture-receipt issuance. Content-free attribution proved the tree
  hasher had coupled aggregate evidence to the 512 KiB production-request
  bound: the valid cassette was 645046 bytes. A RED-first regression now admits
  aggregate tree artifacts through 16 MiB while retaining the 256 MiB total
  tree bound. Production request limits and every provider/timing boundary are
  unchanged. The rejected candidate remains unsigned and unusable, and the
  intended evidence root remains empty.
- A separately authorized post-fix `v4-02` run then completed in approximately
  91 minutes. It produced 299 Ollama and 299 Judge HTTP-200 responses plus one
  legitimate rule short-circuit, issued a valid signed capture receipt for all
  300 fixtures, and had zero infrastructure codes. The evaluator rejected
  quality: unsafe recall `152/180`, jailbreak `12/20`, and instruction override
  `13/20` were below their frozen thresholds; high/critical `57/60`, transformed
  `48/54`, safe false positives `0/120`, and coverage `300/300` passed. No
  evaluation receipt or evidence was published, and the candidate remains
  diagnostic-only.
- The operator approved a detection-quality amendment that retires
  `five_domain_v1` and selects `seven_domain_v2` for production
  `local_and_judge`, P6, and P7. After a completely valid local response it
  emits the prior five obligations plus `jailbreak` and
  `instruction_override`, in a fixed seven-item order. Ordinary `local`, the
  sanitizer/protocol/model, single Judge request, P6 v4 timing, strict
  admission, zero retry/fallback, and all acceptance thresholds remain fixed.
  RED-first tests use only paraphrased probes derived from pinned AgentDojo and
  ToolEmu revisions; benchmark bodies and per-item labels were not read or used
  for development.
- Current execution node: Phase 6, P6-T4 controlled live capture. The four-worker
  pipeline, seven-domain routing, and P6-only v4 timing amendment are implemented
  RED-first. Two prior five-domain attempts
  published no evidence: the first ended with a bounded capture failure, while
  the second completed the long serialized evaluation loop and was rejected
  before materialization because at least one Judge invocation exceeded the v2
  `20000ms` slot. The operator approved Judge `60000ms` and work `120000ms`
  only for P6; the provider gate still requires a normalized response from every
  invoked slot. The completely fresh `v3-02` run then executed for approximately
  103 minutes and again failed before candidate materialization because at least
  one Judge invocation exceeded the new `60000ms` slot. Its candidate reservation
  remained zero bytes, no receipt was signed, and the evidence root is empty.
  Phase 7 remains gated on accepted, signed real evidence; no rejected attempt
  can be reused. On 2026-08-02 the operator approved v4 local `60000ms`, Judge
  `120000ms`, and work `180000ms`, retained strict admission/no retry and all
  ordinary/P7 limits, and authorized one fresh 300-input external Judge run.
  That one-run authority is now consumed by the post-capture tree-boundary
  rejection. The defect is fixed and all deterministic gates are GREEN. A
  separately authorized post-fix run proved the v4 infrastructure and receipt
  boundary but failed detection quality. The approved seven-domain amendment is
  now implemented RED-first; production `422/422`, repository `310/310`, shared
  `207/207`, core sandbox `1030/1030`, the eight non-live benchmark files
  `242/242`, and both TypeScript checks are GREEN. Manual code/security review
  found no blocking issue. The operator then authorized one seven-domain run
  with completely fresh `v4-03` capture/evidence roots. Content-free Ollama
  prewarm and the repeated strict qualification passed (about `4745ms`), but
  the formal run failed closed after approximately 84 minutes with
  `sandbox_security_capture_live_reject:provider_outcome_not_acceptance_capable:judge_transport_error_connection_failed`.
  Strict admission performed no retry or fallback. The capture root contains
  only its frozen bundle, a descriptor, and a zero-byte candidate reservation;
  no receipt/report/seal exists and the evidence root has zero files. That
  one-run authority is consumed, both roots are permanently unusable, and any
  future run requires new explicit service authority plus completely fresh
  roots.
- On 2026-08-03 the operator instructed the workflow to end that v4-03
  assessment and manually treat the preceding 300 evaluations as acceptable
  for planning continuation. This does not create, repair, or promote a
  capture receipt, evaluation receipt, report, `seal.json`, or
  `receipt-chain.json`; P6 formal acceptance therefore remains absent and
  GENERAL-002 is not `VERIFIED`.
- On 2026-08-03 a newly authorized fresh `v4-05` run was attempted after local
  qualification passed in `3927ms` and a direct Judge readiness probe passed in
  `19592ms`. The formal capture worker failed closed at the fixed `20000ms`
  Judge readiness ceiling, and a post-run direct probe also timed out at
  `20007ms`. The capture root has 429 frozen-bundle files and a zero-byte
  candidate reservation; the evidence root is empty, with no receipt, report,
  seal, or receipt chain. The two roots are permanently rejected, the
  one-run authority is consumed, and P6/GENERAL-002 remain unaccepted. The
  external Judge protocol, base URL, requested model, and API key remain
  environment-only; no timing, retry, fallback, or admission relaxation was
  introduced.
- On 2026-08-03 the P6-only `p6_local_hardware_compatibility_v5` readiness
  amendment was implemented after the v4-05 readiness rejection. Newly
  produced P6 manifests and signed receipts require Judge readiness `40000ms`;
  Ollama qualification/prewarm remains `20000ms`, local/Judge slots remain
  `60000ms`/`120000ms`, and the normal work budget remains `180000ms`. The
  amendment changes no provider identity, environment-only Judge configuration,
  strict admission, retry/fallback policy, ordinary production, or P7 timing.
  It does not grant new external-service authority; a future live run requires
  explicit usage approval and completely fresh roots. GENERAL-002 remains not
  `VERIFIED` until real signed P6 evidence and the gated P7 replay exist.
- The newly authorized v5-01 run then failed closed after approximately `26s`
  with `sandbox_security_capture_live_reject:transport_aborted`. Its fresh
  capture root contains the 300 frozen inputs, code snapshot, descriptor, and a
  zero-byte candidate reservation; its evidence root is empty. No signed
  receipt, report, seal, or receipt chain exists. The surfaced code is not the
  readiness-timeout branch: readiness transport aborts are normalized to
  `judge_readiness_failed`, so this is downstream of readiness and consistent
  with the separate local Ollama qualification/prewarm boundary, which remains
  `20000ms`. The one-run authority and both roots are consumed; no retry or
  qualification relaxation is authorized, and GENERAL-002 remains not
  `VERIFIED`.
- On 2026-08-03 the P6-only `p6_local_hardware_compatibility_v6` amendment was
  implemented after the v5-01 post-readiness transport rejection. The exact
  source-generated Ollama prewarm returned in approximately `29731ms`, so the
  qualification and warmed-prewarm ceiling is now `40000ms`; readiness remains
  `40000ms`, local/Judge slots remain `60000ms`/`120000ms`, and the normal work
  budget remains `180000ms`. Strict admission, zero retry/fallback, the
  environment-only Judge configuration, ordinary production, and P7 timing are
  unchanged. The active v6 validators reject v5 and older records, and the
  next live attempt must use completely fresh roots. GENERAL-002 remains not
  `VERIFIED` until real signed P6 evidence and the gated P7 replay exist.
- Current continuation node: Phase 7 / P7-T3/T4 closure review. P7-T2
  hermetic replay hardening and the P7-T3 permanent package/repository gates
  are implemented and locally rechecked. The Engine child now derives
  `network_attempts` from a closed Node `net`
  permission check plus before/after hashes and entry counts for its
  read-only `/proc/self/net/{tcp,tcp6,udp,udp6}` snapshot. The parent validates
  the proof's schema, self-consistency, and unchanged tables before accepting a
  zero count. The replay command remains fail-closed until a formally accepted
  signed P6 evidence root exists; no live provider is called by this work.
- P7-T2 closure hardening is now RED/GREEN complete: both replay children
  reconstruct and enforce their exact generated filesystem read scopes and
  single result-file write scope, reject non-filesystem permission flags, and
  verify effective Node permissions. The parent additionally records
  `/proc/<child-pid>/ns/net` and rejects a child that shares the parent's
  network namespace; final `network_attempts` is bound to that parent-side
  proof rather than only the child's self-report. Staging cleanup failures now
  fail closed instead of being swallowed.
- Fresh continuation checks are green for replay transport (`8/8`), hermetic
  replay (`14/14`), the benchmark repository gate (`8/8`), production sandbox
  (`424/424`), repository (`318/318`), shared (`207/207`), core sandbox
  (`1030/1030`), corpus validation (`300` inputs), both TypeScript checks,
  frontend build, and `git diff --check`. The direct hermetic command returns
  the expected `sandbox_security_hermetic_replay_reject:failed_closed` result
  because the manually accepted assessment still has no signed P6 evidence.
- P7-T2 local specification and security audit status: the initial checkpoint
  was followed by RED/GREEN fixes for child permission exactness, cleanup
  failure handling, missing Engine import scopes, and parent network namespace
  isolation. Durable docs contain no raw provider, truth, or oracle payload.
  This is an implementation checkpoint, not an independent final approval.
  The formal P6 evidence boundary and GENERAL-002 `VERIFIED` gate remain open.
- Each task requires RED, GREEN, static/integration/build gates, independent
  Specification Compliance Review, fix/re-review, independent Code
  Quality/Security Review, fix/re-review, status synchronization, and an exact
  commit before the next task.
- The v6-01 fresh live run was rejected after approximately six hours at the
  invoked Judge `120000ms` detector slot with
  `judge_signal_termination_slot_timeout`. Its capture root has 429 frozen
  files plus a zero-byte candidate reservation, its evidence root is empty, and
  no receipt/report/seal/receipt chain exists. Both roots are permanently
  rejected. GENERAL-002 remains pending formal P6 evidence; the next attempt
  requires a reviewed P6-only timing amendment and fresh disjoint roots.
- The reviewed P6-only `p6_local_hardware_compatibility_v7` amendment is now
  implemented: readiness/qualification remain `40000ms`, local remains
  `60000ms`, Judge is `180000ms`, and normal work is `240000ms`. This changes
  no Judge identity or environment boundary, retry/fallback rule, ordinary
  production timing, or P7 replay timing. The next step is a fresh real
  300-input v7 run; GENERAL-002 remains not `VERIFIED` until its signed
  evidence chain and hermetic replay pass.
- The fresh v7-01 run then failed closed after approximately six hours and
  forty minutes at the invoked Judge `180000ms` detector slot with
  `judge_signal_termination_slot_timeout`. Its 429-file capture root contains
  only frozen inputs, descriptor, and a zero-byte candidate reservation; its
  evidence root is empty. Both roots are permanently rejected. A bounded v8
  P6-only timing amendment is now required before the next fresh run; no
  ordinary production or P7 timing changes.
- The bounded v8 amendment is implemented after RED: readiness/qualification
  remain `40000ms`, local remains `60000ms`, Judge is `300000ms`, and normal
  work is `360000ms`. The v8 profile changes no provider identity, environment
  boundary, retry/fallback rule, ordinary production timing, or P7 replay
  timing. A fresh v8 300-input run is the only next live step.
- The first fresh v8 run was rejected immediately at readiness with bounded
  `judge_readiness_failed`; two content-free probes returned HTTP `429` before
  any benchmark input reached Judge. Its roots are permanently rejected and
  no evidence exists. GENERAL-002 remains pending external Judge capacity
  recovery, after which a new v8 root pair is required.
