# GENERAL-002 Explicit Judge Protocol Selection Amendment

## Status

This is an approved in-place amendment to `REQ-SBX-GENERAL-002`, made under
the user's standing authorization to resolve subsequent blockers and continue
through GENERAL-002 closure. It supersedes only the single installed Judge
wire-protocol assumption in
`2026-07-23-sandbox-security-operator-judge-protocol-adapter-amendment.md`.

No accepted P6 capture, replay tree, or seal exists. The fixed corpus, truth
isolation, metric thresholds, GENERAL-001 behavior, sanitizer, Judge decision
schema, no-retry policy, and hermetic P7 requirement remain unchanged.

## Evidence For The Amendment

The configured operator Judge endpoint normalized successfully but the
installed `openai_responses_v1` adapter derived an endpoint that returned HTTP
`404` with a non-JSON media type. The same provider also returned `404` for a
version-prefixed Responses endpoint.

A non-persistent, synthetic diagnostic against the provider's Chat
Completions endpoint established that:

- `response_format.type = "json_schema"` is rejected with HTTP `400`;
- `response_format.type = "json_object"` succeeds with HTTP `200`;
- the response is an OpenAI-compatible `chat.completion` JSON envelope;
- its assistant content is a JSON object with the frozen Judge schema shape;
- the response reports a resolved model and a terminal finish reason; and
- the request settles inside the frozen `4000ms` readiness budget.

The diagnostics emitted only status, normalized media/envelope categories,
elapsed time, and fixed classifications. They emitted no credential, request
body, response body, header value, benchmark input, or truth.

## Goal

Allow a controlled deployment administrator to select one source-controlled
Judge wire protocol explicitly at process startup. Preserve the existing
Responses adapter and add an independent OpenAI-compatible Chat Completions
JSON adapter without host inference, automatic probing, retry, fallback, or
per-request endpoint selection.

The accepted protocol IDs are:

- `openai_responses_v1`; and
- `openai_chat_completions_json_v1`.

## Runtime Boundary

Only `production-config.ts` reads the Judge environment. Add:

| Variable | Validation |
| --- | --- |
| `SANDBOX_SECURITY_JUDGE_PROTOCOL` | exact accepted source-controlled protocol ID |

The complete live environment surface is therefore six values: the protocol,
base URL, requested model, API key, exact enable flag, and existing Ollama
digest. The protocol is mandatory in `local_and_judge`; there is no default,
host-derived selection, model-derived selection, or fallback.

The nonsecret summary exposes the selected protocol ID, endpoint policy ID,
canonical base URL, adapter-derived endpoint URL, and requested model. The
credential remains in private one-use transport state.

## Adapter Contract

`judge-protocol-adapter.ts` remains production-private and has no environment,
credential, filesystem, DNS, or network capability. It accepts an explicit
protocol ID plus an operator base URL and returns a frozen binding:

- `openai_responses_v1` appends exactly one `responses` segment;
- `openai_chat_completions_json_v1` appends exactly two
  `chat/completions` segments; and
- both use `operator_https_fqdn_v1` and the existing canonical HTTPS DNS URL
  validation.

Endpoint normalization must prove that the endpoint is canonical for the
declared protocol and base URL. A protocol/base/endpoint mismatch fails before
the request factory is called. Redirects remain forbidden.

## Chat Completions Request Contract

The Chat adapter sends one bounded, non-streaming request with:

- the operator-selected model;
- the same versioned Sandbox Security Judge system instructions;
- the same delimiter-wrapped sanitized payload;
- `response_format: { "type": "json_object" }`;
- `reasoning_effort: "low"`;
- deterministic temperature and a bounded output-token ceiling; and
- no tools, store flag, conversation ID, previous response ID, or raw
  benchmark truth.

Because this provider does not accept provider-side `json_schema`, the full
canonical Judge schema is included in the trusted system instruction. This is
not treated as sufficient validation: the local parser remains the authority.

## Chat Completions Response Contract

The parser accepts only a bounded UTF-8 JSON response with the observed,
source-controlled OpenAI-compatible envelope shape. It requires:

- exactly one choice at index zero;
- `object: "chat.completion"`;
- a syntactically valid resolved model;
- assistant role and string content;
- a terminal `stop` finish reason;
- no tool calls, refusal, audio, or alternate message;
- bounded optional reasoning content that is discarded; and
- assistant content that parses to the exact frozen
  `sandbox-security-judge.v1` object.

The existing local Judge validator then enforces exact keys, obligation ID
membership and uniqueness, outcome/confidence/severity coupling, maximum item
count, and model identity. Unknown envelope or structured-output fields,
malformed JSON, truncation, model drift, or prose outside the JSON object fail
closed. Raw provider content is never recorded in candidate or sealed evidence.

## Detector And Transport Selection

Production composition passes the nonsecret protocol ID to the external
pipeline. The pipeline chooses exactly one source-controlled request/parser
pair. The transport accepts only the operation associated with the one-use
configured protocol and posts only to that adapter-derived endpoint.

Readiness uses the same selected request/parser pair as benchmark evaluation.
It remains one synthetic request, has no retry or fallback, is not counted as
a benchmark decision, and remains capped at exactly `4000ms`.

## Capture, Replay, And Seal Binding

The existing six-field Judge binding remains authoritative:

- `judge_protocol_id`;
- `judge_endpoint_policy_id`;
- `judge_base_url`;
- `judge_endpoint_url`;
- `judge_requested_model`; and
- `judge_resolved_model`.

`judge_binding_sha256` continues to hash those six exact canonical values.
Candidate packages, cassettes, capture manifests, evaluator reports, replay
envelopes, and seals must agree on the selected protocol and derived endpoint.
The protocol addition changes no credential, truth, or raw-content boundary.

The capture child receives the closed six-variable environment and no extra
endpoint or adapter override. P7 reads no Judge environment and performs no
network request.

## Failure Semantics

An absent or unknown protocol, protocol/endpoint mismatch, unsupported request
shape, non-JSON response, non-2xx status, redirect, malformed envelope,
nonterminal choice, structured-output mismatch, resolved-model drift, timeout,
or transport failure produces no accepted candidate, capture, replay tree, or
seal.

There is no protocol negotiation, automatic probe, retry, fallback protocol,
fallback model, or host-specific inference. Changing the protocol requires a
new process configuration and therefore a new live capture and seal.

## Required RED Coverage

1. Configuration rejects a missing or unknown protocol and exposes no secret.
2. Each protocol derives only its own canonical endpoint and rejects a forged
   endpoint for the other protocol before network dispatch.
3. The Chat request is bounded, non-streaming, JSON-object mode, low-reasoning,
   and contains only trusted instructions plus the sanitized payload.
4. The Chat parser rejects unknown fields, multiple choices, nonterminal
   finish reasons, model drift, malformed inner JSON, unknown obligations,
   and invalid risk/clearance severity coupling.
5. Composition and readiness use the selected protocol without negotiation,
   retry, or fallback.
6. Candidate, evaluator, sealer, and replay contracts bind either accepted
   protocol and reject cross-protocol endpoint or binding substitution.
7. The permission child receives exactly the closed six-variable environment
   and cannot serialize credentials or raw provider traffic.

## Acceptance

Deterministic gates must be green before a fresh controlled live run. P6-T4 is
VERIFIED only when the explicitly selected protocol passes real credentialed
readiness, all 300 evaluations, frozen metrics, evaluator validation,
truth-blind sealing, live-evidence validation, and independent specification
and quality/security re-review.
