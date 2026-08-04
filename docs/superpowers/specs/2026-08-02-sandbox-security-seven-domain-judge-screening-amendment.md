# Sandbox Security Seven-Domain Judge Screening Amendment

## Document Status

- Requirement: `REQ-SBX-GENERAL-002`
- Date: `2026-08-02`
- Status: `IMPLEMENTED_PENDING_FRESH_LIVE_ACCEPTANCE`
- Authority: the operator explicitly approved this detection-quality amendment
  after the controlled P6 v4-02 capture failed the unchanged quality thresholds.

## Problem and Scope

The P6 v4-02 run proved the controlled infrastructure, strict admission, signed
capture receipt, and full `300/300` decision coverage, but the evaluator rejected
unsafe recall. The aggregate report identified `jailbreak` and
`instruction_override` as the only category thresholds that failed. The rejected
candidate remains diagnostic-only and is not an input to this amendment.

This amendment changes only the fixed unresolved-obligation inventory used by
production `local_and_judge`, P6 live capture, and P7 hermetic replay. Ordinary
`local` mode remains unchanged.

## Independent Development Boundary

Development MUST NOT read the acceptance benchmark body or per-item labels and
MUST NOT derive prompt tokens, rules, category mappings, or exceptions from
them. No v4-02 input or item label was used by the RED-first implementation.

The independent regression probes are instead derived from these pinned public
development sources:

- AgentDojo revision `089ed468cf3ed0322acc66b0211f26d9d90dbf60`,
  `src/agentdojo/attacks/baseline_attacks.py#IgnorePreviousAttack`, supplies the
  jailbreak/control-hierarchy semantic. The local paraphrased probe SHA-256 is
  `f53f88e6fa8c1a51c64037634d596f2cabe2ebb45f2bd599e070d557fffd7001`.
- ToolEmu revision `ac4a7ab7ed8c7985d96231e214bd6b54304b7ddb`,
  `assets/all_cases.json`, supplies the underspecified instruction and
  unconfirmed-authority semantic. The local paraphrased probe SHA-256 is
  `da16bc5d829f37db8916f229e82645fb3ca1dba056dbeaa7f7a99ceb09e9bc76`.

The probes test the fixed screening contract, not benchmark-specific text
matching. They require both new obligations after a completely valid local
response and do not alter the local model prompt or parser.

## Normative Production Behavior

`SandboxSecurityJudgeScreeningMode` is exactly:

```ts
type SandboxSecurityJudgeScreeningMode =
  | "disabled"
  | "seven_domain_v2";
```

Composition MUST select:

- `disabled` for ordinary `local` mode;
- `seven_domain_v2` for `local_and_judge`, including P6 live capture and P7
  hermetic replay;
- no local detector for `rule_only`.

`five_domain_v1` is retired and MUST fail closed. `seven_domain_v2` applies only
after the pinned Ollama response passes all existing HTTP, content-type, digest,
envelope, model, completion, schema, and parser checks. It replaces the parsed
local result with exactly seven unresolved routing candidates in this order:

1. `prompt_injection`
2. `jailbreak`
3. `instruction_override`
4. `privilege_escalation`
5. `sensitive_data_exposure`
6. `unsafe_side_effect`
7. `trust_boundary_violation`

Every candidate has severity `low`, confidence `0.6`, its canonical
`sandbox_security_<category>` reason code, and a fresh subject-reference array
covering every authoritative content source plus the optional whole tool call.
They are unresolved routing signals, not accepted local findings.

An input with zero subjects or more than eight combined content/tool subjects
MUST fail with the fixed local detector failure. Partial binding, truncation,
chunking, or category-dependent selection is forbidden.

For each evaluation that reaches the external detector, the existing sanitizer
must pass the seven obligations to exactly one Judge request. There is no retry,
fallback, or alternate provider. The existing Judge result remains the sole
authority for qualified risks and clearances.

## Preserved Boundaries

This amendment does not change: corpus, truth, source lock, metric thresholds,
metric definitions, rule catalog, local prompt/schema/digest, sanitizer,
selected Judge protocol, prompt/schema/model, endpoint policy, reviewed channel,
strict admission, or evidence isolation.

P6 uses the v5 local `60000ms`, Judge `120000ms`, and work `180000ms` profile;
Judge readiness is `40000ms` and qualification remains `20000ms`. Ordinary
production and P7 retain their inherited GENERAL-001 timing.
There is still one Judge request, no response repair, no retry, and no fallback.

P7 MUST replay the captured seven-obligation Judge request through ordinary
`local_and_judge` composition. Missing, added, reordered, or changed provider
outcomes fail closed.

## RED-First Verification and Acceptance

Before production changes, focused tests failed because the detector accepted
`five_domain_v1` and rejected `seven_domain_v2`, composition selected the old
profile, P6/P7 emitted only five obligations, and this amendment was absent.
The minimal implementation changes only the closed profile and fixed category
inventory; focused detector, composition, P6 capture, and P7 replay tests then
pass. Final deterministic verification is GREEN: production sandbox `422/422`,
repository `310/310`, shared `207/207`, core sandbox `1030/1030`, the eight
non-live benchmark files `242/242`, and both sandbox/benchmark TypeScript
checks. `git diff --check` is clean. A manual code and security review found no
blocking issue and confirmed the ordinary-local, one-request, timing,
admission, retry/fallback, and replay boundaries remain intact.

This amendment is implementation evidence, not live acceptance evidence.
Completion still requires separate explicit external-service authority,
completely fresh capture/evidence roots, accepted 300-input metrics, signed
sealing, P7 hermetic replay, and final validation.

## Controlled Live Execution Status

The operator separately authorized one seven-domain P6 v4 run on 2026-08-02
using `.env.sandbox-security.local` and completely fresh `v4-03`
capture/evidence roots. A content-free Ollama prewarm succeeded and the repeated
strict qualification passed in approximately `4745ms`. The formal 300-input
run failed closed after approximately 84 minutes with the bounded code
`sandbox_security_capture_live_reject:provider_outcome_not_acceptance_capable:judge_transport_error_connection_failed`.
The fixed admission rule performed no retry or fallback.

A content-free artifact audit found no receipt, report, seal, or receipt chain.
The evidence root contains zero files; the capture root contains only the frozen
bundle, its descriptor, and a zero-byte candidate reservation. No quality
conclusion can be drawn and no P6 acceptance evidence was issued. Both roots are
rejected permanently, the one-run external-service authority is consumed, and
another attempt requires new explicit authority and completely fresh roots.
