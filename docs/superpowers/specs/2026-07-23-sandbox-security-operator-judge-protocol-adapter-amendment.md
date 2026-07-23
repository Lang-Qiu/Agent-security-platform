# GENERAL-002 Operator Judge Protocol Adapter Amendment

## Status

This is an approved in-place amendment to `REQ-SBX-GENERAL-002`. It
supersedes only the exact-host Judge allowlist in
`2026-07-22-sandbox-security-dynamic-judge-provider-amendment.md` after the
user explicitly requested that the Judge base URL not be restricted to one
canonical Doro host and requested an independent protocol adapter.

No accepted P6 capture, replay tree, or seal exists. The corpus revision,
truth isolation, metric thresholds, GENERAL-001 behavior, Judge prompt/schema,
and no-network P7 requirement remain unchanged.

## Goal

Allow an operator to select a canonical HTTPS Judge base URL at process
startup, while keeping outbound Judge traffic behind one independent,
source-controlled `openai_responses_v1` protocol adapter. The adapter derives
the only permitted endpoint from that base URL and records its protocol and
canonical endpoint values in live evidence.

This is not an unrestricted per-request URL override and does not add a
fallback protocol, model fallback, retry, redirect, or dynamic download.

## Runtime Boundary

Only `production-config.ts` reads these existing environment variables:

| Variable | Validation |
| --- | --- |
| `SANDBOX_SECURITY_JUDGE_BASE_URL` | Canonicalizable safe HTTPS base URL for the installed adapter |
| `SANDBOX_SECURITY_JUDGE_MODEL` | `^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$` |
| `SANDBOX_SECURITY_JUDGE_API_KEY` | nonempty after trim; no ASCII control character |
| `SANDBOX_SECURITY_ENABLE_JUDGE` | exact `1` |
| `SANDBOX_SECURITY_OLLAMA_MODEL_DIGEST` | existing SHA-256 pin |

The environment surface remains five values. The former OpenAI-named
variables remain invalid Judge configuration sources.

`SANDBOX_SECURITY_JUDGE_BASE_URL` is no longer compared against a fixed host
allowlist. The installed adapter accepts only a URL that:

- uses `https:` and a DNS hostname, not an IPv4 or IPv6 literal;
- has no userinfo, query, fragment, or non-default port;
- has no empty, dot, encoded slash, or encoded backslash path segment;
- is not `localhost` or a `.localhost` name; and
- is no longer than the bounded adapter input limit.

The adapter canonicalizes case/default port/trailing slash and derives the
Responses endpoint by appending exactly one `responses` path segment. For
example, `https://us.doro.lol/v1/` becomes base
`https://us.doro.lol/v1` and endpoint
`https://us.doro.lol/v1/responses`. A deployment may use another compliant
HTTPS DNS host and base path; no host-specific source change is required.

The base URL remains operator-controlled process configuration. The principal
that can change it is trusted to direct the Judge credential and sanitized
egress, so it must be a controlled deployment or CI administrator rather than
an ordinary user or task author. It is never
accepted from a request, benchmark input, replay cassette, or frontend/API
contract. The default transport sends the credential only to the canonical
adapter-derived endpoint, does not follow redirects, and retains its bounded
body, abort, and cleanup behavior.

## Independent Adapter Contract

Add a production-private `judge-protocol-adapter.ts` module with the fixed
adapter ID `openai_responses_v1`. It owns URL normalization and endpoint
derivation. The existing `openai-*` request/parser names continue to describe
the OpenAI Responses wire format only; they do not identify a provider.

For every valid configuration, the nonsecret summary exposes:

- `judge_protocol_id: "openai_responses_v1"`;
- `judge_endpoint_policy_id: "operator_https_fqdn_v1"`;
- canonical `judge_base_url`;
- adapter-derived `judge_endpoint_url`; and
- `judge_requested_model`.

The API key remains in private one-use transport state only. The transport
receives the adapter-derived endpoint and independently validates that it is a
canonical endpoint for `openai_responses_v1`; it never trusts a raw
environment URL. The adapter has no environment, credential, filesystem, DNS,
or network capability; it only normalizes data and returns a fixed operation
path.

## Capture, Replay, and Seal Binding

The in-place `sandbox-security-benchmark-capture.v1` manifest replaces the
provider assertion with `judge_protocol_id` and records
`judge_endpoint_policy_id`, `judge_base_url`, `judge_endpoint_url`,
`judge_requested_model`, and `judge_resolved_model`. A canonical
`judge_binding_sha256` covers those six nonsecret values.

Capture, evaluator, sealer, and P7 replay normalization must prove that all
six binding values agree. They must canonicalize the recorded base URL through the
same adapter and reject any protocol/base/endpoint mismatch, unknown key,
credential, raw provider body, or URL that no longer passes adapter validation.
No secret enters an artifact, argument, stdout, stderr, or tracked file.

The candidate package must also hash its exact capture manifest, and cassette
and replay units must carry the same binding hash. This prevents a post-
evaluation replacement of endpoint/model evidence before sealing.

`prepare-capture-bundle.ts` keeps its closed five-variable child environment.
The child receives no adapter override or network destination other than the
already selected base URL. P7 reads no Judge environment and does no network
I/O.

## Failure Semantics

Invalid base URLs, protocol/base/endpoint inconsistency, missing protocol
binding, malformed model identifiers, failed readiness, response parsing
failure, model drift, redirects, and non-2xx provider results fail closed. A
failure may not produce an accepted candidate, capture, replay tree, or seal.

P6-T4 remains blocked until deterministic gates are green and a real
credentialed strict-schema readiness request plus the full controlled capture
succeeds. This amendment does not relax the separately frozen `4000ms` Judge
readiness gate; any later timing change requires measured evidence and a
separate explicit amendment.

## Required RED Coverage

1. The adapter canonicalizes a non-fixed Doro-style HTTPS base URL and derives
   only its Responses endpoint.
2. The adapter rejects HTTP, literals/loopback hostnames, credentials,
   query/fragment, non-default ports, and ambiguous path encodings.
3. Production config accepts a compliant non-Doro hostname, exposes only
   nonsecret protocol/policy/endpoint fields, and transfers the credential
   once.
4. Default transport posts only to the adapter-derived endpoint and rejects a
   forged or inconsistent endpoint before any request factory call.
5. Capture contracts, benchmark composition, evaluator, and sealer preserve
   the complete binding hash and reject protocol/base/endpoint/model tampering.
6. The permission child still receives only the closed five-variable
   environment and cannot serialize credentials or raw provider traffic.
