# Sandbox Security Five-Domain Judge Screening Amendment

## Document Status

- Requirement: `REQ-SBX-GENERAL-002`
- Date: `2026-08-01`
- Status: `HISTORICAL_SUPERSEDED_BY_SEVEN_DOMAIN_V2`
- Authority: continuation of the approved GENERAL-002 implementation and the
  operator-authorized controlled Judge run.

This historical profile is superseded by
`2026-08-02-sandbox-security-seven-domain-judge-screening-amendment.md`.
`five_domain_v1` is no longer an admitted production mode.

## Problem

The first completed P6 v2 run produced 300 valid decisions but failed the frozen
quality thresholds. The rule and pinned `qwen3:8b` paths detected only `6/180`
unsafe cases, while no unresolved local signals routed to Judge. Thresholds,
truth, corpus, and evidence rules are frozen and MUST NOT be weakened.

## Independent Design Evidence

The repair was selected without deriving rules, prompts, or token inventories
from acceptance truth:

- AgentDojo revision `089ed468cf3ed0322acc66b0211f26d9d90dbf60`
  and ToolEmu revision `ac4a7ab7ed8c7985d96231e214bd6b54304b7ddb`
  supplied 60 literal-nonoverlapping development probes: 30 risk and 30 safe.
- The unchanged v2 prompt detected `0/30` development risks with `0/30` safe
  matches.
- A single fixed taxonomy rubric improved development risk matches to `16/30`
  but matched `7/30` safe cases. It was rejected as a final detector.
- A routing-only prompt produced exactly one `uncertain` candidate for all
  `60/60` probes, but selected generic `trust_boundary_violation` for `49/60`.
  It was rejected as insufficiently discriminating.
- Truth-blind Judge capacity probes using the production sanitizer and selected
  protocol established that one, two, three, and five obligations complete
  within the unchanged P6 `20000ms` Judge slot. Nine obligations exceeded that
  slot and were rejected. No retry or timeout increase is authorized.

The five domains are based on the independent sources' security surfaces and
the production taxonomy: control flow, privilege, sensitive data, external
side effects, and trust boundaries.

## Normative Production Behavior

`SandboxSecurityJudgeScreeningMode` is exactly:

```ts
type SandboxSecurityJudgeScreeningMode =
  | "disabled"
  | "five_domain_v1";
```

Composition MUST select:

- `disabled` for ordinary `local` mode;
- `five_domain_v1` for `local_and_judge`, including P6 live capture and P7
  hermetic replay;
- no local detector for `rule_only`.

The Ollama adapter MUST still perform the existing digest qualification, send
the exact source-controlled v2 prompt, require HTTP 200 JSON, verify the digest
again, and parse the complete strict response. `five_domain_v1` is applied only
after all of those checks succeed. It converts that valid response into exactly
five routing candidates in this source-controlled order:

1. `prompt_injection`
2. `privilege_escalation`
3. `sensitive_data_exposure`
4. `unsafe_side_effect`
5. `trust_boundary_violation`

Every candidate has severity `low`, confidence `0.6`, the canonical
`sandbox_security_<category>` reason code, and a fresh subject-reference array
containing every authoritative content source plus the optional whole tool
call. These are unresolved routing signals, not accepted local findings. Judge
remains the sole authority that turns them into a qualified risk or clearance.

An input with zero subjects or more than eight combined content/tool subjects
MUST fail with the fixed local detector failure. Partial binding, truncation,
chunking, retry, and silent fallback are forbidden.

## Preserved Boundaries

This amendment does not change:

- the corpus, manifest, truth, source lock, or metric thresholds;
- the rule catalog or GENERAL-001 qualification/routing floors;
- `sandbox-security-ollama-local-prompt.v2` or its pinned hash;
- the Judge prompt/schema, selected protocol, endpoint policy, or model binding;
- ordinary production/P7 timing (`5000ms` work budget and inherited slots);
- P6 v2 timing (`60000ms` local slot, `20000ms` Judge slot, `80000ms` work
  budget);
- truth isolation, capture capability separation, signed receipts, or evidence
  validators.

P7 MUST replay the captured five-obligation Judge request through ordinary
`local_and_judge` composition. A replay that omits, adds, reorders, or changes a
provider outcome remains invalid.

## Acceptance

This amendment is not acceptance evidence. Completion still requires a fresh
controlled 300-input capture, truth-aware evaluation meeting every frozen
threshold, signed sealing, P7 hermetic replay, final evidence validation, and
all permanent repository/type/test gates.
