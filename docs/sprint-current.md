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

## Goal

- Add a deterministic production rule detector.
- Add a digest-pinned Ollama `qwen3:8b` local-model adapter.
- Add a deterministic structured sanitizer.
- Add a Responses-protocol Judge adapter with allowlisted dynamic provider/model selection (initial Doro profile; requested model runtime-selected, e.g. `gpt-5.4-mini`).
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
- Judge uses `https://api.openai.com/v1/responses`, `gpt-5.6-terra`, low
  reasoning, strict JSON Schema, and `store: false`.
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

- The user explicitly approved the reviewed GENERAL-002 Spec and Plan.
- Status is `IMPLEMENTATION_IN_PROGRESS`; implementation follows the exact
  Master/Phase DAG with one task closed at a time.
- Formal amendment approved: `docs/superpowers/specs/2026-07-22-sandbox-security-dynamic-judge-provider-amendment.md`.
- Amendment implementation plan: `docs/superpowers/plans/2026-07-22-sandbox-security-dynamic-judge-provider.md`.
- Dynamic Judge Provider amendment applies in place to unsealed
  `sandbox-security-benchmark.v1` (no v2 corpus): allowlisted endpoint, runtime
  model, `SANDBOX_SECURITY_JUDGE_*` env surface, capture five-field binding.
- Deterministic production and benchmark suites are GREEN for the amendment.
- P6-T4 credentialed live seal remains blocked until Doro-accepted key, enable
  flag, and digest-pinned loopback Ollama are present.
- Current execution node: Phase 1, P1-T1 boundary gate.
- Each task requires RED, GREEN, static/integration/build gates, independent
  Specification Compliance Review, fix/re-review, independent Code
  Quality/Security Review, fix/re-review, status synchronization, and an exact
  commit before the next task.
