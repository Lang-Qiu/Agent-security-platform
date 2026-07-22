# GENERAL-002 Dynamic Judge Provider Amendment

## Status

This is an approved formal amendment to `REQ-SBX-GENERAL-002` and the
production-detectors specification. It replaces the fixed OpenAI Judge vendor,
endpoint, model, credential variable, and enable variable with a dynamically
selected, source-controlled Judge configuration. It applies in place to the
unsealed `sandbox-security-benchmark.v1` contract.

No accepted P6 capture, replay tree, or seal exists. The corpus, truth, source
lock, reviews, request-ID evidence, frozen metric thresholds, and GENERAL-001
semantics remain unchanged.

This document is a documentation-only amendment. It records approved design;
the following implementation remains RED-first.

## Approved Decisions

- Keep `sandbox-security-benchmark.v1` as the benchmark revision. Do not create
  a duplicate v2 corpus solely for this provider amendment.
- Select the Judge endpoint, model, and API key at process startup through
  runtime configuration. These values are immutable for that process.
- Permit only a source-controlled endpoint allowlist. An environment value can
  select an approved endpoint but cannot introduce a new network destination.
- Start the allowlist with the Doro profile at `https://doro.lol/v1`, whose
  Responses endpoint is `https://doro.lol/v1/responses`.
- Permit a safe, runtime-selected requested model identifier. The initial live
  configuration may select `gpt-5.4-mini`; model selection is not a source-code
  constant.
- Read a rotatable credential only from `SANDBOX_SECURITY_JUDGE_API_KEY`.
  Never persist, hash, serialize, log, or expose it in public configuration.
- The permission parent forwards only the approved Judge and Ollama environment
  names to the capture child. It never places their values in child arguments,
  bundle metadata, stdout, stderr, or tracked files.
- Require `SANDBOX_SECURITY_ENABLE_JUDGE=1` for `local_and_judge`. The former
  `SANDBOX_SECURITY_ENABLE_OPENAI_JUDGE` and `OPENAI_API_KEY` names are not
  accepted as valid Judge configuration after this amendment.
- Treat OpenAI-named internal types as OpenAI Responses wire-protocol names,
  not as an assertion about the actual provider. Persisted evidence records the
  actual provider separately.

## Runtime Configuration Boundary

Only `production-config.ts` may read these environment variables:

| Variable | Role | Validation |
| --- | --- | --- |
| `SANDBOX_SECURITY_JUDGE_BASE_URL` | selects an approved provider base URL | exact canonical match against the source-controlled allowlist |
| `SANDBOX_SECURITY_JUDGE_MODEL` | requested model identifier | `^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$` |
| `SANDBOX_SECURITY_JUDGE_API_KEY` | rotatable provider credential | nonempty after trim; no ASCII control characters |
| `SANDBOX_SECURITY_ENABLE_JUDGE` | explicit live-Judge opt-in | exact value `1` |
| `SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST` | existing local-model pin | existing SHA-256 rule |

The allowlist maps a stable provider ID to one canonical HTTPS base URL and its
exact Responses path. A base URL must have no credentials, query, fragment, or
unapproved path and must resolve by exact canonical string equality. The
transport receives the resolved Responses URL, not an arbitrary environment URL.

The returned production-config summary may expose `judge_configured`, provider
ID, canonical base URL, Responses URL, and requested model. It must not expose
the API key. Private state passes the key and resolved nonsecret provider fields
to the default transport, clears intermediate references, and cannot be reused
after construction.

Changing an API key, base URL, or requested model requires a new process. It
does not mutate an already created config, capture, replay, or seal.

## Permission Child Environment Handoff

`prepare-capture-bundle.ts` is the only parent that launches the permissioned
live-capture child. In addition to its existing process-location values, it may
forward exactly these values when present:

- `SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST`
- `SANDBOX_SECURITY_JUDGE_BASE_URL`
- `SANDBOX_SECURITY_JUDGE_MODEL`
- `SANDBOX_SECURITY_JUDGE_API_KEY`
- `SANDBOX_SECURITY_ENABLE_JUDGE`

The parent constructs a fresh child environment from this closed list. The
credential is inherited in memory only; it is not included in command arguments
or any serialized capture-bundle descriptor. The child remains unable to read
truth, evaluator, metric, source-lock, review, request-ID, or inherited-file
descriptor capability. Production source continues to read Judge configuration
only through `production-config.ts`; this parent handoff exists solely to pass
the already selected runtime values across the process boundary.

## Requested and Resolved Models

The Judge request contains `judge_requested_model`. The non-benchmark strict
schema readiness call must receive a successful normalized provider response
whose model identifier becomes `judge_resolved_model`.

The resolver permits a provider deployment alias. It therefore does not require
the resolved model to equal the requested model. Instead, both bounded model
identifiers are recorded and sealed. Every successful Judge response during the
same capture must report the same resolved model as readiness. A missing,
malformed, or different resolved model fails the live run before a seal can be
written.

The strict JSON Schema, `store: false`, low reasoning effort, bounded response
size, no redirects, no retries, and sanitized-payload-only egress rules remain
mandatory. An approved endpoint/model combination that cannot satisfy those
rules is unavailable for P6 qualification.

## Capture and Replay Binding

`sandbox-security-benchmark-capture.v1` is amended in place. Its exact-key
capture manifest replaces the old single `openai_model` field with:

- `judge_provider_id`
- `judge_base_url`
- `judge_responses_url`
- `judge_requested_model`
- `judge_resolved_model`

All five values are nonsecret, bounded, and structurally validated. The
manifest continues to bind the benchmark manifest, source lock, input tree,
decision tree, cassette tree, local-model qualification, prompt/schema/catalog
versions, and sanitizer version.

Every normalized Judge replay response retains only its validated resolved model
and strict parsed result. The replay tree contains no URL credentials, provider
body, prose, request payload, headers, key, truth, or fixture label.

`seal.json` already commits to the capture-manifest hash. Validators and the
future P7 replay transport must additionally prove that the manifest, all
successful Judge outcomes, and replay construction agree on the same provider,
base URL, Responses URL, requested model, and resolved model. P7 consumes only
sealed content-free evidence, reads no Judge environment variable, and makes no
network request.

## Failure Semantics

Configuration fails closed when the enable flag, key, base URL, requested model,
or Ollama digest is invalid. The live runner fails closed when readiness rejects
the strict schema, when the provider is not allowlisted, when a response cannot
be normalized, or when the resolved model is inconsistent.

Such failures may create no accepted capture, replay directory, or seal. P6-T4
must be recorded as `BLOCKED` when the declared live prerequisites are absent or
unavailable. It must not use a fallback provider, silently substitute a model,
relax strict-schema parsing, fabricate a cassette, or enter P7.

## Test and Review Requirements

The implementation starts with focused RED tests covering:

- allowlisted canonical endpoint acceptance and unallowlisted, malformed, or
  credential-bearing URL rejection;
- safe requested-model validation, dynamic request serialization, and key
  isolation;
- strict parsing of a dynamic resolved model and rejection of model drift;
- amended capture-manifest and seal/replay binding, including tamper cases;
- P6 readiness and candidate-capture failure paths; and
- P7 replay rejection for provider/base/model mismatches without network access.

Tests use synthetic normalized outcomes only. A real credentialed run is
required exclusively for P6-T4 after all deterministic gates are green. It must
be independently reviewed for actual provider behavior, evidence binding, and
zero secret/raw-content leakage before P7 begins.

## Documentation and Plan Changes

The implementation plan must update the production-detectors specification,
`docs/sprint-current.md`, Phase 6, Phase 7, relevant architecture/API
documentation, and progress evidence. The plan must allocate ownership for
production config, transport, Judge wire contract/parser, provider outcomes,
benchmark contracts, capture-live, P6 evidence validation, and P7 replay.

The amended plan must preserve the existing one task at a time closure protocol:
Design, RED, GREEN, static gates, independent specification review, quality and
security review, re-review, documentation, exact commit, then the next task.
