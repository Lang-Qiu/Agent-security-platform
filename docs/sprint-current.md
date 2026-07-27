# Sprint Current

## Requirement ID

REQ-SBX-GENERAL-002

## Requirement Name

Sandbox Security Production Detectors and Sealed Benchmark

## Status

IMPLEMENTATION_IN_PROGRESS

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

- Status remains `IMPLEMENTATION_IN_PROGRESS`; GENERAL-002 is the sole current
  requirement and follows the approved Master, amendment, and Phase plans.
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
- Controlled P6 live capture uses the source-controlled
  `p6_local_hardware_compatibility_v1` profile: Judge readiness, Ollama
  qualification, warmed prewarm, local slot, and Judge slot are `20000ms`, and
  normal work budget is `40000ms`. Ordinary composition and P7 replay retain
  the inherited GENERAL-001 `5000ms` normal budget and `100/1000/4000ms`
  detector slots.
- The `p6-live-judge-binding.ts` profile pins the reviewed Judge channel
  (protocol, endpoint policy, canonical base/endpoint/model hashes, stable IDs).
  It is committed unreviewed and fails closed until the operator commits the real
  reviewed channel values; ordinary production remains runtime-selected.
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
- The three committed live-evidence acceptance tests remain intentionally RED only
  because real `capture.json`, 300 replay envelopes, and `seal.json` are not yet
  present. Synthetic placeholders remain forbidden.
- Current execution node: Phase 6, P6-T4 controlled live capture. The four-worker
  pipeline is implemented and deterministically verified; the real controlled
  live run requires the operator's six ambient variables unset, the mode-`600`
  credential env file, the mode-`600` acceptance key, a reviewed
  `p6-live-judge-binding.ts` profile, a fresh capture parent, and the intended
  output root. Phase 7 remains gated on accepted real evidence.
- Each task requires RED, GREEN, static/integration/build gates, independent
  Specification Compliance Review, fix/re-review, independent Code
  Quality/Security Review, fix/re-review, status synchronization, and an exact
  commit before the next task.
