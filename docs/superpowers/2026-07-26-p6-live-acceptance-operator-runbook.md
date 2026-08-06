# P6 Live Acceptance — Operator Runbook

> P6 retry amendment (2026-08-05): A fresh P6 run permits exactly one retry
> only after a first-attempt exact `transport_error:connection_failed` outcome,
> with no more than two sequential attempts per qualification, local, or Judge
> provider slot. Readiness has no retry, and all other failures have no retry.
> Historical v4-v8 no-retry records apply only to those historical roots. Current
> v2 capture/cassette/replay/evidence artifacts preserve and hash the full
> ordered attempt sequences. A final non-response, final failure, or partial
> progress remains fail-closed and cannot be resumed, promoted, sealed, or used
> to generate formal evidence. Use fresh disjoint roots and do not claim live
> acceptance is complete until a fresh 300-input run, accepted seal, and
> hermetic replay pass.

> Current complete-run rule (2026-08-06): after a fresh run has all `300`
> decision results, `decided === 300`, no infrastructure codes, and valid final
> provider outcomes, live P6 continues to receipt, seal, and P7 even when
> model-quality metrics miss the frozen thresholds. The actual quality boolean
> remains in `accepted_metrics.accepted` and is never rewritten. Incomplete,
> failed, malformed, or partially captured provider outcomes remain fail-closed.

> Status (2026-08-03): the fixed four-worker P6 acceptance pipeline and the
> approved seven-domain Judge screening amendment are implemented and
> deterministically GREEN. The P6-only v6 local hardware compatibility
> amendment is implemented. The newly authorized v5-01 attempt also failed
> closed before candidate
> materialization; no accepted evidence exists. The 2026-07-31 run and all
> subsequent attempts remain rejected historical candidates. A completely fresh
> 300-input run is required after a new approved operating boundary. Never
> fabricate evidence or promote a rejected candidate.

> Live update (2026-08-01): the fresh five-domain run reached the end of the
> serialized evaluation loop but candidate admission rejected at least one
> `judge_signal_termination_slot_timeout`. No evidence was published. Under the
> current contract, even one invoked provider timeout rejects the whole capture.
> The operator subsequently approved the P6-only
> `p6_local_hardware_compatibility_v3` amendment: Judge slot `60000ms`, work
> budget `120000ms`, local slot still `60000ms`. The strict provider-admission
> rule and all ordinary-production/P7 limits remain unchanged. The next run must
> use completely fresh roots.

> v3 live result (2026-08-01): after an exact content-free preflight returned
> Ollama qualification `response`, Judge readiness `response`, and reviewed
> binding `match`, a fresh v3 run executed for approximately 103 minutes and
> still rejected on `judge_signal_termination_slot_timeout`. The zero-byte
> candidate reservation was never materialized, no receipt was signed, and the
> evidence root remained empty. Do not repeat another 300-input run without a
> reviewed channel/timing decision and explicit service-usage authority.

> Post-failure attribution audit (2026-08-02): the credentialed v3 capture
> bundle contains the exact reviewed v3 Engine/profile bytes and hashes. The
> deadline controller records `work_budget` whenever the total budget narrows a
> detector lease or expires simultaneously, so the observed `slot_timeout`
> cannot be a `120000ms` work-budget exhaustion mislabeled as a Judge timeout.
> The `60000ms` Judge lease covers deterministic sanitization plus the external
> request. An earlier truth-blind 300-input, single-obligation screen under the
> same production sanitizer/protocol already returned 297 responses, two
> timeouts, and one invalid response at `20000ms`; it recorded no successful
> latency distribution. Existing evidence therefore proves a long-tail or
> intermittent channel failure, but cannot establish a safe next timeout.

> v4 authority (2026-08-02): the operator approved the exact P6-only
> `p6_local_hardware_compatibility_v4` profile: local `60000ms`, Judge
> `120000ms`, and work `180000ms`; strict provider admission and zero retry are
> preserved, and all other P6/ordinary-production/P7 limits remain unchanged.
> One fresh 300-input run using `.env.sandbox-security.local` and its service
> usage was authorized. That authority was consumed by the rejected v4 attempt
> below. Only completely fresh capture/evidence roots are valid.

> v4 live result (2026-08-02): the controlled run completed a real 300-decision
> candidate, then rejected before capture-receipt issuance with
> `sandbox_security_capture_worker_reject:internal`. A content-free audit found
> that the canonical tree hasher incorrectly applied the 512 KiB single-request
> limit to the 645046-byte aggregate cassette. The defect is fixed RED-first by
> a separate 16 MiB per-artifact bound while retaining the 256 MiB total-tree
> bound. No receipt or evidence was published, the candidate remains unusable,
> and another live run requires new explicit service-usage authority.

> post-fix v4-02 result (2026-08-02): a separately authorized fresh run
> completed in approximately 91 minutes with 299 Ollama and 299 Judge HTTP-200
> responses plus one legitimate rule short-circuit. Capture receipt issuance
> succeeded, proving the tree-boundary fix. The evaluator rejected quality:
> unsafe recall `152/180`, jailbreak `12/20`, and instruction override `13/20`;
> high/critical `57/60`, transformed `48/54`, safe false positives `0/120`, and
> coverage `300/300` passed. No evaluation receipt or evidence was published.
> Do not rerun without an approved quality amendment and new service authority.

> seven-domain v4-03 result (2026-08-02): the operator authorized one fresh
> run using `.env.sandbox-security.local`. Content-free local prewarm and the
> repeated strict Ollama qualification passed in about `4745ms`. The formal
> run then failed closed after approximately 84 minutes with
> `sandbox_security_capture_live_reject:provider_outcome_not_acceptance_capable:judge_transport_error_connection_failed`.
> Strict admission performed no retry or fallback. No receipt, report, seal, or
> receipt chain exists; the intended evidence root has zero files. The capture
> root contains a frozen bundle, one descriptor, and a zero-byte candidate
> reservation only. Both `v4-03` roots are rejected and must never be reused.
> The one-run service authority is consumed.

> v4-04 result (2026-08-03): after the reviewed Chat parser was corrected to
> accept the observed bounded provider metadata and omitted `logprobs`, a fresh
> run was started with new roots. It failed closed at the unchanged
> `20000ms` Judge readiness ceiling with
> `sandbox_security_capture_live_reject:judge_readiness_timeout`. The capture
> root contains 429 frozen-bundle files and the evidence root contains zero
> files; no receipt, report, seal, or receipt chain exists. Both roots are
> permanently rejected and cannot be resumed or reused. The fixed v4 timeout
> and no-retry policy remain unchanged.

> v4-05 result (2026-08-03): a newly authorized fresh run was preceded by a
> content-free local qualification (`3927ms`) and two direct Judge readiness
> probes; one probe passed at `19592ms`, but the formal capture worker then
> failed closed at the fixed `20000ms` readiness ceiling. A post-run direct probe
> also timed out at `20007ms`, so the result is consistent with an intermittent
> or over-budget Judge response/connection lifecycle rather than a credential or
> binding mismatch. The capture root
> `tmp/sandbox-security-capture-v4-05-deE7FK` contains 429 frozen-bundle files,
> one zero-byte candidate reservation, and no materialized candidate; the
> evidence root `tmp/sandbox-security-evidence-v4-05-lsqaoa` contains zero
> files. No receipt, report, seal, or receipt chain exists. Both roots are
> permanently rejected and the one-run authority is consumed. No timing,
> retry, fallback, or provider-admission relaxation is authorized by this
> result.

> v5 readiness amendment (2026-08-03): the operator approved the exact
> P6-only `p6_local_hardware_compatibility_v5` profile for newly produced
> capture manifests and signed receipts. Judge readiness is now `40000ms`;
> Ollama qualification and warmed prewarm remain `20000ms`; local and Judge
> detector slots remain `60000ms` and `120000ms`, and the normal work budget
> remains `180000ms`. Strict provider admission, zero retry/fallback, the
> seven-domain contract, and all ordinary-production/P7 timing remain fixed.
> This timing amendment alone does not authorize external service usage. Any
> future run needs explicit service authority, a mode-`600` env file, and
> completely fresh capture/evidence roots; all v4 roots remain permanently
> unusable.

> v5-01 result (2026-08-03): after the operator authorized one fresh v5 run,
> the pipeline failed closed after approximately `26s` with
> `sandbox_security_capture_live_reject:transport_aborted`. The fresh capture
> root `tmp/sandbox-security-capture-v5-sUViBZ` contains 300 frozen input files,
> the code snapshot, the descriptor, and a zero-byte candidate reservation
> only; the candidate was never materialized. The evidence root
> `tmp/sandbox-security-evidence-v5-cnAXjQ` contains zero files. No receipt,
> report, seal, or receipt chain exists. The readiness path maps a readiness
> transport abort to `judge_readiness_failed`; this surfaced abort occurred
> downstream during Engine creation or the separate local Ollama qualification
> path, whose v5 ceiling remains `20000ms`. The v5-01 authority is consumed,
> both roots are permanently unusable, and no retry or qualification-timing
> relaxation is authorized by this result.

> v7-01 result (2026-08-04): a fresh run under the
> `p6_local_hardware_compatibility_v7` profile passed readiness and
> qualification but ran for approximately six hours and forty minutes before
> failing closed with
> `sandbox_security_capture_live_reject:provider_outcome_not_acceptance_capable:judge_signal_termination_slot_timeout`.
> The invoked Judge request reached the exact `180000ms` detector lease; strict
> admission made no retry or fallback. The capture root
> `tmp/sandbox-security-capture-v7-uQ3bUj` contains 429 frozen-bundle/
> descriptor/input files and a zero-byte candidate reservation; the evidence
> root `tmp/sandbox-security-evidence-v7-szzyvC` contains zero files. No
> receipt, report, seal, or receipt chain exists. Both roots are permanently
> rejected and cannot be resumed, repaired, or reused. A new bounded P6-only
> timing decision and fresh roots are required.

> v8 Judge long-tail amendment (2026-08-04): the active P6-only
> `p6_local_hardware_compatibility_v8` profile uses `40000ms` Judge readiness
> and `40000ms` Ollama qualification/warmed prewarm, with local/Judge slots of
> `60000ms`/`300000ms` and a `360000ms` work budget. It is the bounded response
> lifecycle extension after v7-01; ordinary production and P7 keep GENERAL-001
> timing, and strict admission still provides no retry or fallback. The next
> attempt must use completely fresh, disjoint roots and the mode-`600` env file.

> v8 readiness result (2026-08-04): a fresh v8 run failed closed immediately
> at Judge readiness with `sandbox_security_capture_live_reject:judge_readiness_failed`.
> The capture root `tmp/sandbox-security-capture-v8-acGKJa` contains 429
> frozen-bundle/descriptor/input files and a zero-byte candidate reservation;
> the evidence root `tmp/sandbox-security-evidence-v8-u0VTdN` contains zero
> files. An independent content-free transport probe returned HTTP `429` in
> approximately `519ms`, and a second probe after a 60-second wait returned
> HTTP `429` in approximately `549ms`. No 300-input evaluation, receipt,
> report, seal, or receipt chain exists. Both roots are permanently rejected;
> this is an external Judge quota/rate-limit prerequisite, not a v8 timing or
> environment-binding result.

> v7 Judge long-tail amendment (2026-08-04): the active P6-only
> `p6_local_hardware_compatibility_v7` profile uses `40000ms` Judge readiness
> and `40000ms` Ollama qualification/warmed prewarm, with local/Judge slots of
> `60000ms`/`180000ms` and a `240000ms` work budget. The v7 Judge ceiling
> addresses the v6-01 invoked-request long tail; it remains limited to this P6
> qualification boundary. Ordinary production and P7 keep
> GENERAL-001 timing, and strict provider admission still provides no retry or
> fallback. The current continuation instruction permits the next fresh live
> attempt without another service-usage confirmation; it still requires fresh,
> disjoint roots and the mode-`600` env file.

> v6-01 result (2026-08-04): the fresh v6 run completed its controlled
> readiness/qualification path and then ran for approximately six hours before
> failing closed with
> `sandbox_security_capture_live_reject:provider_outcome_not_acceptance_capable:judge_signal_termination_slot_timeout`.
> The `120000ms` Judge detector lease expired on an invoked request; the
> deadline classified it as `slot_timeout`, not `work_budget`. Strict admission
> made no retry or fallback. The capture root
> `tmp/sandbox-security-capture-v6-7uYDXg` contains 429 frozen-bundle/descriptor/
> input files and a zero-byte candidate reservation; the evidence root
> `tmp/sandbox-security-evidence-v6-jxbXyx` contains zero files. No receipt,
> report, seal, or receipt chain exists. Both roots are permanently rejected
> and cannot be resumed, repaired, or reused. A new P6-only timing decision and
> completely fresh roots are required; ordinary production and P7 timing remain
> unchanged.

## What the pipeline is

`accept-live.ts` is the sole operator entrypoint and Ed25519 receipt-signing
authority. It is uncredentialed: it imports no production, capture-runtime,
evaluator, or sealer code, and the six live variables must be **absent** from its
own environment. It launches four fixed capability-separated workers in order and
signs the capture and evaluation receipts:

1. `prepare-live-worker.ts` — uncredentialed; builds the input-only capture
   bundle and the exact serializable descriptor.
2. `capture-live-worker.ts` — the only worker that receives the closed
   six-variable live environment (via Node `--env-file`); reconstructs and
   revalidates the bundle, launches the Node `--permission` capture child, and
   emits the content-free capture binding.
3. `evaluate-live-worker.ts` — uncredentialed; verifies and consumes the signed
   capture receipt, joins candidate decisions with corpus truth, and emits the
   complete-run evaluation binding while retaining the quality metrics.
4. `seal-live-worker.ts` — uncredentialed, no truth-read permission; verifies and
   consumes both signed receipts, publishes `capture.json`, `replay/`, and
   `seal.json`, and persists the canonical receipt chain in `receipt-chain.json`.

## Prerequisites the operator must provide

1. **Local Ollama** serving the pinned `qwen3:8b` digest on loopback (no
   auto-pull).
2. **A reachable Judge endpoint** over a canonical safe HTTPS FQDN.
3. **A mode-`600` credential env file** containing exactly the six variables:
   `SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST`, `SANDBOX_SECURITY_JUDGE_PROTOCOL`,
   `SANDBOX_SECURITY_JUDGE_BASE_URL`, `SANDBOX_SECURITY_JUDGE_MODEL`,
   `SANDBOX_SECURITY_JUDGE_API_KEY`, `SANDBOX_SECURITY_ENABLE_JUDGE`.
4. **A mode-`600` local Ed25519 private key** whose public key equals the tracked
   `p6-acceptance-public-key.pem`. The provisioned local key is
   `scripts/benchmark/sandbox-security/.p6-acceptance-private-key.pem`
   (Git-ignored).
5. **A reviewed `p6-live-judge-binding.ts` profile.** It must have
   `reviewed: true` and stable protocol/policy IDs. The profile intentionally
   contains no provider URL, external model, or credential; those values come
   from the operator environment and are validated before capture evidence is
   accepted. The resolved model is obtained from the provider response.
6. A **fresh capture-parent directory** and the **intended output root**, disjoint
   from each other and from the corpus root (no containment in either direction,
   no symlink aliases).

## The controlled live command

Run with all six ambient variables unset (credentials reach only the capture
worker through `--env-file`), the local mode-`600` credential env file, and the
local mode-`600` acceptance key:

```bash
env -u SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST \
    -u SANDBOX_SECURITY_JUDGE_PROTOCOL \
    -u SANDBOX_SECURITY_JUDGE_BASE_URL \
    -u SANDBOX_SECURITY_JUDGE_MODEL \
    -u SANDBOX_SECURITY_JUDGE_API_KEY \
    -u SANDBOX_SECURITY_ENABLE_JUDGE \
  node --experimental-strip-types \
    scripts/benchmark/sandbox-security/accept-live.ts \
    --capture-parent-root=<fresh-dir> \
    --output-root=<evidence-dir> \
    --credential-env-file=<mode-600-env-file> \
    --acceptance-key=<mode-600-key> \
    [--corpus-root=samples/sandbox-security-benchmark/v1]
```

Never print environment values or worker bodies. Expected on success: Judge
readiness, five warmed Ollama probes, 300 evaluations, complete-run acceptance,
the retained quality metrics, a signed seal, and empty successful worker stderr within the P6 v8 `60s` local /
`300s` Judge / `360s` work profile. Before spending Judge usage, verify all 300
inputs against the exact `sandbox-security-ollama-local-prompt.v2` request and
strict production parser; prompt v1 evidence is intentionally rejected.

For every evaluation that is not rule-short-circuited, a valid Ollama response
must produce the exact seven-domain obligation set and the existing production
sanitizer/protocol must send it to Judge. Ordinary production and P7 timing are
unchanged. A missing, reordered, truncated, timed-out, or otherwise invalid
provider outcome fails the capture. Only the exact first-attempt
`transport_error:connection_failed` outcome may be retried once; readiness and
all other failures have no retry or fallback.

All previously listed v4/v5 live-run roots remain permanently rejected. The
current continuation instruction permits the next 300-input external-service
run, but no run permits reuse of a rejected root, a different channel/model, or
any admission relaxation.

The v5-01 authority and roots remain consumed. The current active P6 timing
profile is v8: readiness and qualification are `40000ms`, the local slot is
`60000ms`, the Judge slot is `300000ms`, and the work budget is `360000ms`.
This timing profile is separate from the retry policy and does not alter
ordinary production or P7 timing.

Provider readiness is fail-closed and cold starts can consume the `40000ms`
readiness ceiling; local qualification and warmed prewarm use a separate
`40000ms` ceiling. Prewarm the pinned local model and verify the reviewed Judge
channel with content-free readiness checks before launching a fresh run. Do not
log request or response bodies.

## After a rejected run

Do not copy, sign, reuse, or promote the candidate/report from a rejected run.
Keep the intended evidence root empty. Record only aggregate metrics,
content-free provider status counts, fixed profile/version hashes, and the
bounded stage error code.

The 2026-08-02 v4 run materialized 300 decision projections and a 645046-byte
aggregate cassette but failed before capture-receipt issuance because the tree
hasher reused the 512 KiB request limit. The corrected code admits a tree
artifact only through 16 MiB and retains the 256 MiB whole-tree bound. This fix
does not make that rejected candidate reusable; its evidence root is empty and
a new authorized run must use completely fresh roots.

The subsequent post-fix `v4-02` run passed capture receipt issuance and had no
infrastructure code, but failed the frozen unsafe/category recall thresholds.
Its one signed capture receipt and aggregate evaluation report are diagnostic
only. Because no evaluation receipt exists, sealing and P7 are prohibited.

The separately authorized seven-domain `v4-03` run passed content-free local
prewarm and strict qualification, but an invoked Judge outcome later failed
with `judge_transport_error_connection_failed`. The capture worker rejected the
whole run under the unchanged acceptance-capable provider gate; it did not
retry or fall back. A content-free filesystem audit found 429 files in the
capture root (the 300 frozen inputs, code snapshot, descriptor, and zero-byte
candidate reservation included), zero files in the evidence root, and no
capture/evaluation receipt, report, seal, or receipt chain. Neither root may be
resumed, repaired, or reused.

The 2026-07-31 controlled v2 run reached all 300 evaluations but failed with
unsafe recall `6/180`, high/critical recall `2/60`, transformed recall `1/54`,
safe false-positive rate `0/120`, and coverage `300/300`. Ollama produced 299
valid responses (3 matches and 296 no-match); one evaluation was
rule-short-circuited. Judge readiness and binding passed, but all Judge slots
were `not_called` because the frozen production router invokes Judge only for
unresolved signals. Authorization to use Judge does not authorize changing that
routing rule.

The first fresh five-domain attempt then failed before materialization with a
bounded internal code. Isolated readiness and qualification passed. A
truth-blind 20-input production diagnostic returned 20 Ollama responses and
18 Judge responses plus two Judge slot timeouts. A second fresh run completed
the serialized loop in approximately 103 minutes and failed closed on
`judge_signal_termination_slot_timeout`; no candidate, receipt, or evidence was
published. Those roots are historical diagnostics and must not be reused.

That outcome historically blocked P6 on detection quality. The historical
five-domain amendment was developed against separate AgentDojo and ToolEmu
probes and later superseded by the approved `seven_domain_v2` amendment after
v4-02. The new profile adds fixed `jailbreak` and `instruction_override`
obligations without changing the sanitizer, protocol, model, single-request
rule, timing, admission, retry/fallback policy, or acceptance thresholds. It
does not make any rejected candidate reusable; only a separately authorized run
with completely fresh roots can produce evidence.

## After a successful run — validate real evidence

```bash
node --experimental-strip-types scripts/benchmark/sandbox-security/validate-corpus.ts
node --experimental-strip-types --experimental-test-isolation=none --test \
  tests/benchmark/sandbox-security-live-evidence.spec.ts
npm run test:engine:sandbox:production
npm run test:repo
node ./frontend/node_modules/typescript/bin/tsc --noEmit -p engines/sandbox/tsconfig.json
npm run typecheck:benchmark:sandbox-security
git diff --check
```

The three previously-RED live-evidence acceptance tests must turn GREEN only from
the real `capture.json`, 300 `replay/*.json`, and `seal.json`. Then record P6
VERIFIED with aggregate metrics, content-free hashes, timing, the public-key
fingerprint, review conclusions, and counts, and advance to P7-T1.
