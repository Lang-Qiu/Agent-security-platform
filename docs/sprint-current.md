# Sprint Current

## Requirement ID

REQ-SBX-GENERAL-005

## Requirement Name

Sandbox security audit browser-runtime compatibility

## Status

COMPLETE

## Goal

Keep sandbox-security audit pagination working in browsers and distinguish
malformed pasted capability tokens from genuine transport outages.

## In Scope

- Validate canonical audit cursors without Node-only runtime globals.
- Trim capability-token edge whitespace before authenticated requests.
- Reject remaining C0/C1 control characters before calling `fetch`.
- Return a distinct `invalid_token` result and render dedicated operator copy.
- Apply the same token boundary to JSON and SSE authenticated calls.
- Add shared, service, and audit-page regression coverage.

## Out of Scope

- Backend routes, capability issuance, token grammar, or audit response schema.
- Audit rate limits, SQLite persistence, WSL networking, or startup recovery.
- Browser storage, URL state, telemetry, or token logging.

## Canonical Inputs

- `AGENTS.md`
- `metadata.md`
- `docs/api-contract.md`
- `docs/architecture.md`
- `shared/contracts/sandbox-security-api.ts`
- `frontend/src/services/api-client.ts`

## Acceptance Criteria

1. A canonical audit page with `next_cursor` normalizes when `Buffer` is absent.
2. Edge whitespace is removed before constructing `Authorization`.
3. Interior control characters return `invalid_token` without calling `fetch`.
4. Audit and evaluation UI distinguish `invalid_token` from `unavailable`.
5. Existing audit pagination, JSON, and SSE behavior remains green.
6. Focused and full frontend/shared tests pass, apart from documented unrelated
   repository environment failures.
