# Phase 2 Authenticated Service Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` or
> `superpowers:executing-plans`, plus `superpowers:test-driven-development`,
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking. Complete one task, review it, commit its exact paths, and stop
> before starting the next task.

**Goal:** Build the authenticated transport, client-side limit pre-flight, and
sandbox-security service that the workbench and audit pages consume — with the
capability token passed per call and never stored, and every response validated
by a shared normalizer before it crosses into React state.

**Architecture:** `api-client.ts` gains an authenticated request path beside its
existing anonymous GET helper; the existing
`requestApiData`/`requestApiDataWithStatus` exports keep their signatures so no
current service changes. `sandbox-security-service.ts` owns the two public
routes and returns a discriminated result union carrying `error_code`,
HTTP status, and `Retry-After` so the pages can map all fifteen backend error
codes plus transport and validation failure without inspecting a `Response`.
`sandbox-security-limits.ts` mirrors no constant: it imports every bound from
`shared/types/sandbox-security` and rejects an over-limit request before a byte
leaves the browser.

**Tech Stack:** TypeScript 6.0.2, Vitest 4.1.1, `fetch` stubs, shared exact-key
normalizers from `shared/contracts/sandbox-security` and
`shared/contracts/sandbox-security-api`.

---

## Document Status

- Requirement: `REQ-SBX-GENERAL-005`
- Phase: 2 of 5
- Date: `2026-08-07`
- Status: `PLAN_DRAFT_PENDING_REVIEW`
- Canonical specification:
  `docs/superpowers/specs/2026-08-07-sandbox-security-frontend-workbench-design.md`
- Predecessor: Phase 1 complete, committed, reviewed, all exit criteria met

---

## Entry Gate

- [ ] Confirm Phase 1's exit criteria all hold, including the load-bearing one:
  all 221 pre-existing tests pass with no existing spec file edited.
- [ ] Read the approved spec sections `Frontend Service Signatures`,
  `Capability Session Model`, `Client Validation and Limits`, `Error Mapping`,
  and `Privacy Rules`.
- [ ] Record the baseline:

```bash
wsl -e bash -lc 'cd /Agent-security-platform && TMPDIR=/tmp npm run test --prefix frontend'
```

Expected: 17 files green (15 pre-existing + `console-theme.spec.ts` +
`console-theme.provider.spec.tsx`), 221 pre-existing tests plus Phase 1's new
cases. Any other result blocks this Phase.

---

## Locked Transport Contract

Both routes are already implemented and documented by GENERAL-003. This Phase
adds no backend file and changes no shared contract.

```text
POST /api/sandbox/security/evaluations
  Authorization: Bearer <capability>
  Idempotency-Key: <opaque client key>
  Content-Type: application/json
  body: SandboxSecurityRequest            <= 786432 raw bytes
  200 -> ApiResponse<SandboxSecurityDecision>

GET /api/sandbox/security/audit-events?cursor=<opaque>&limit=<1..100>
  Authorization: Bearer <capability>      scope sandbox_security:audit:read
  bodyless; only `cursor` and `limit` query keys are permitted
  200 -> ApiResponse<SandboxSecurityAuditPage>
```

The engine-owned canonical request limit is 512 KiB
(`SANDBOX_SECURITY_MAX_REQUEST_BYTES` = 524288); the HTTP route admits up to
786432 raw bytes. Client pre-flight uses the **engine** limit, because a request
that clears HTTP admission but exceeds the canonical bound is rejected later and
wastes a capability call.

Result union, fixed for the whole requirement:

```ts
export type SandboxSecurityCallResult<T> =
  | { kind: "ok"; data: T }
  | {
      kind: "error";
      httpStatus: number;
      errorCode: string | null;
      retryAfterSeconds: number | null;
    }
  | { kind: "invalid" }
  | { kind: "unavailable" };
```

`invalid` means the envelope or the shared normalizer rejected the payload.
`unavailable` means transport failed or was aborted. Neither carries a server
message, because an error body may not be trusted to be content-free.

---

### Task P2-T1: Authenticated Request Path in api-client

**Files:**
- Modify: `frontend/src/services/api-client.ts`
- Create: `frontend/src/services/api-client-authenticated.spec.ts`
- Verify unchanged: `frontend/src/services/task-service.ts`,
  `supervision-service.ts`, `campaign-supervision-service.ts` and their specs

The existing client is GET-only and sends just `accept: application/json`. It
must keep working untouched — three services and their 56 tests depend on it.

- [ ] **Step 1: Write the failing transport test**

```ts
import { describe, expect, it, vi } from "vitest";

import { requestAuthenticatedJson } from "./api-client";

const OK_ENVELOPE = {
  success: true,
  message: "ok",
  data: { value: 1 },
  error_code: null,
  request_id: "http:1"
};

function jsonResponse(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
  return {
    ok: (init?.status ?? 200) < 400,
    status: init?.status ?? 200,
    headers: { get: (name: string) => init?.headers?.[name.toLowerCase()] ?? null },
    json: async () => body
  } as unknown as Response;
}

describe("REQ-SBX-GENERAL-005 authenticated transport", () => {
  it("sends the bearer token and idempotency key on POST", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(OK_ENVELOPE));

    await requestAuthenticatedJson({
      path: "/api/sandbox/security/evaluations",
      method: "POST",
      capabilityToken: "tok-abc",
      idempotencyKey: "key-1",
      body: { schema_version: "sandbox-security-request.v1" },
      normalize: (value) => value as { value: number },
      options: { fetchImpl }
    });

    const [, init] = fetchImpl.mock.calls[0];
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer tok-abc");
    expect(headers["idempotency-key"]).toBe("key-1");
    expect(headers["content-type"]).toBe("application/json");
    expect(init.method).toBe("POST");
  });

  it("omits the idempotency header on a bodyless GET", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(OK_ENVELOPE));

    await requestAuthenticatedJson({
      path: "/api/sandbox/security/audit-events?limit=50",
      method: "GET",
      capabilityToken: "tok-abc",
      normalize: (value) => value as { value: number },
      options: { fetchImpl }
    });

    const [, init] = fetchImpl.mock.calls[0];
    expect(init.body).toBeUndefined();
    expect(Object.keys(init.headers as object)).not.toContain("idempotency-key");
  });

  it("surfaces error_code and Retry-After without a server message", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          success: false,
          message: "should not be surfaced",
          data: null,
          error_code: "SANDBOX_SECURITY_RATE_LIMITED",
          request_id: "http:2"
        },
        { status: 429, headers: { "retry-after": "7" } }
      )
    );

    const result = await requestAuthenticatedJson({
      path: "/api/sandbox/security/evaluations",
      method: "POST",
      capabilityToken: "tok-abc",
      idempotencyKey: "key-1",
      body: {},
      normalize: (value) => value as unknown,
      options: { fetchImpl }
    });

    expect(result).toEqual({
      kind: "error",
      httpStatus: 429,
      errorCode: "SANDBOX_SECURITY_RATE_LIMITED",
      retryAfterSeconds: 7
    });
  });

  it("returns invalid when the normalizer rejects the payload", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(OK_ENVELOPE));

    const result = await requestAuthenticatedJson({
      path: "/api/sandbox/security/evaluations",
      method: "POST",
      capabilityToken: "tok-abc",
      idempotencyKey: "key-1",
      body: {},
      normalize: () => null,
      options: { fetchImpl }
    });

    expect(result).toEqual({ kind: "invalid" });
  });

  it("returns unavailable when transport throws", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));

    const result = await requestAuthenticatedJson({
      path: "/api/sandbox/security/evaluations",
      method: "POST",
      capabilityToken: "tok-abc",
      idempotencyKey: "key-1",
      body: {},
      normalize: (value) => value as unknown,
      options: { fetchImpl }
    });

    expect(result).toEqual({ kind: "unavailable" });
  });

  it("never writes the capability token to storage", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(OK_ENVELOPE));
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    await requestAuthenticatedJson({
      path: "/api/sandbox/security/evaluations",
      method: "POST",
      capabilityToken: "tok-secret",
      idempotencyKey: "key-1",
      body: {},
      normalize: (value) => value as unknown,
      options: { fetchImpl }
    });

    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});
```

- [ ] **Step 2: Verify the RED**

Expected: the import of `requestAuthenticatedJson` fails to resolve. That is the
intended RED. A failure inside the existing `requestApiData` would mean the
module was edited before its test existed — revert and restart the step.

- [ ] **Step 3: GREEN — add the authenticated path**

Add `requestAuthenticatedJson` and the `SandboxSecurityCallResult` union.
Reuse `isApiResponse` from `shared/contracts/api-response`. Parse `Retry-After`
as a base-10 integer and clamp to a non-negative safe integer, returning `null`
when absent or unparseable. Do not log, and do not include `message` in any
returned value.

Keep `requestApiData` and `requestApiDataWithStatus` byte-identical in
signature and behaviour.

- [ ] **Step 4: Confirm**

```bash
wsl -e bash -lc 'cd /Agent-security-platform && TMPDIR=/tmp npm run test --prefix frontend'
```

Expected: the three existing service specs (56 tests) still pass unchanged.

- [ ] **Step 5: Commit exactly**

```text
frontend/src/services/api-client.ts
frontend/src/services/api-client-authenticated.spec.ts
```

Suggested message:
`feat(frontend): add authenticated JSON transport path`

---

### Task P2-T2: Client-Side Limit Pre-flight

**Files:**
- Create: `frontend/src/utils/sandbox-security-limits.ts`
- Create: `frontend/src/utils/sandbox-security-limits.spec.ts`

Every bound is imported from `shared/types/sandbox-security`. Redeclaring any
of them locally violates `frontend.instructions.md`.

- [ ] **Step 1: Write the failing limits test**

```ts
import { describe, expect, it } from "vitest";

import {
  SANDBOX_SECURITY_MAX_CONTENT_ITEMS,
  SANDBOX_SECURITY_MAX_JSON_DEPTH,
  SANDBOX_SECURITY_MAX_JSON_NODES,
  SANDBOX_SECURITY_MAX_REQUEST_BYTES,
  SANDBOX_SECURITY_MAX_TEXT_BYTES
} from "../../../shared/types/sandbox-security";
import {
  countJsonNodes,
  measureJsonDepth,
  measureUtf8Bytes,
  validateEvaluationRequest
} from "./sandbox-security-limits";

describe("REQ-SBX-GENERAL-005 limit pre-flight", () => {
  it("measures UTF-8 bytes, not UTF-16 code units", () => {
    expect(measureUtf8Bytes("abc")).toBe(3);
    expect(measureUtf8Bytes("安全")).toBe(6);
    expect(measureUtf8Bytes("\u{1F512}")).toBe(4);
  });

  it("rejects a text value above the shared byte bound", () => {
    const oversized = "a".repeat(SANDBOX_SECURITY_MAX_TEXT_BYTES + 1);
    const result = validateEvaluationRequest({
      stage: "user_input",
      contentItems: [
        {
          source_id: "src-1",
          claimed_source_type: "user_input",
          media_type: "text/plain",
          value: oversized,
          provenance_ref: "source://client/1"
        }
      ]
    });
    expect(result.ok).toBe(false);
    expect(result.violations[0]?.rule).toBe("text_bytes");
  });

  it("rejects more content items than the shared cap", () => {
    const items = Array.from(
      { length: SANDBOX_SECURITY_MAX_CONTENT_ITEMS + 1 },
      (_unused, index) => ({
        source_id: `src-${index}`,
        claimed_source_type: "user_input" as const,
        media_type: "text/plain" as const,
        value: "x",
        provenance_ref: `source://client/${index}`
      })
    );
    const result = validateEvaluationRequest({ stage: "user_input", contentItems: items });
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.rule === "content_items")).toBe(true);
  });

  it("requires at least one content item", () => {
    const result = validateEvaluationRequest({ stage: "user_input", contentItems: [] });
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.rule === "content_items")).toBe(true);
  });

  it("measures JSON depth and node count", () => {
    expect(measureJsonDepth({ a: { b: { c: 1 } } })).toBe(3);
    expect(measureJsonDepth("scalar")).toBe(0);
    expect(countJsonNodes({ a: 1, b: [2, 3] })).toBe(5);
  });

  it("rejects JSON deeper than the shared depth bound", () => {
    let nested: unknown = 1;
    for (let index = 0; index <= SANDBOX_SECURITY_MAX_JSON_DEPTH; index += 1) {
      nested = { nested };
    }
    const result = validateEvaluationRequest({
      stage: "user_input",
      contentItems: [
        {
          source_id: "src-1",
          claimed_source_type: "retrieved_content",
          media_type: "application/json",
          value: nested,
          provenance_ref: "source://client/1"
        }
      ]
    });
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.rule === "json_depth")).toBe(true);
  });

  it("rejects a whole request above the canonical byte bound", () => {
    const chunk = "a".repeat(SANDBOX_SECURITY_MAX_TEXT_BYTES);
    const items = Array.from({ length: 8 }, (_unused, index) => ({
      source_id: `src-${index}`,
      claimed_source_type: "user_input" as const,
      media_type: "text/plain" as const,
      value: chunk,
      provenance_ref: `source://client/${index}`
    }));
    const result = validateEvaluationRequest({ stage: "user_input", contentItems: items });
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.rule === "request_bytes")).toBe(true);
    expect(SANDBOX_SECURITY_MAX_REQUEST_BYTES).toBe(524288);
  });

  it("requires a tool_request only at the tool_request stage", () => {
    const base = {
      contentItems: [
        {
          source_id: "src-1",
          claimed_source_type: "user_input" as const,
          media_type: "text/plain" as const,
          value: "x",
          provenance_ref: "source://client/1"
        }
      ]
    };
    expect(
      validateEvaluationRequest({ ...base, stage: "tool_request" }).violations.some(
        (v) => v.rule === "tool_request_required"
      )
    ).toBe(true);
    expect(validateEvaluationRequest({ ...base, stage: "user_input" }).ok).toBe(true);
  });

  it("never includes a submitted value in a violation", () => {
    const secret = "SECRET-CANARY-VALUE";
    const result = validateEvaluationRequest({
      stage: "user_input",
      contentItems: [
        {
          source_id: "src-1",
          claimed_source_type: "user_input",
          media_type: "text/plain",
          value: secret.repeat(20000),
          provenance_ref: "source://client/1"
        }
      ]
    });
    expect(JSON.stringify(result)).not.toContain("SECRET-CANARY");
  });

  it("rejects a JSON value exceeding the shared node bound", () => {
    // Build a flat array of > SANDBOX_SECURITY_MAX_JSON_NODES nodes. Depth
    // stays at 2 so this isolates the node rule from the depth rule.
    const wide = Array.from({ length: SANDBOX_SECURITY_MAX_JSON_NODES + 50 }, (_, i) => i);
    // Use camelCase `contentItems` — matching every other test in this file.
    // snake_case `content_items` would be ignored by the function, triggering
    // the wrong violation (empty items) instead of json_nodes.
    const result = validateEvaluationRequest({
      stage: "user_input",
      contentItems: [
        {
          source_id: "src-1",
          claimed_source_type: "user_input",
          media_type: "application/json",
          value: wide,
          provenance_ref: "source://client/1"
        }
      ]
    });
    expect(result.violations.some((v) => v.rule === "json_nodes")).toBe(true);
  });
});
```

- [ ] **Step 2: Verify the RED**

Expected: module resolution failure for `./sandbox-security-limits`.

- [ ] **Step 3: GREEN — implement the pre-flight**

Return `{ ok: boolean; violations: Array<{ rule: string; sourceId?: string }> }`.
A violation names the failing rule and at most the `source_id` — never the
value, never a substring, never a byte offset into content. `measureUtf8Bytes`
uses `TextEncoder`. Depth counting must treat arrays and objects alike and must
not recurse unboundedly on a cyclic value; guard with a visited set.

- [ ] **Step 4: Confirm and commit exactly**

```text
frontend/src/utils/sandbox-security-limits.ts
frontend/src/utils/sandbox-security-limits.spec.ts
```

Suggested message:
`feat(frontend): add sandbox security limit pre-flight`

---

### Task P2-T3: Sandbox Security Service

**Files:**
- Create: `frontend/src/services/sandbox-security-service.ts`
- Create: `frontend/src/services/sandbox-security-service.spec.ts`

- [ ] **Step 1: Write the failing service test**

Cover: happy path through the real shared normalizer; audit query building;
query-key restriction; limit rejection before any fetch; idempotency-key reuse
on retry; and the privacy invariants.

```ts
import { describe, expect, it, vi } from "vitest";

import {
  evaluateSandboxSecurityRequest,
  readSandboxSecurityAuditPage
} from "./sandbox-security-service";

const DECISION = {
  schema_version: "sandbox-security-decision.v1",
  decision_id: "decision:1",
  request_id: "req-1",
  evaluation_mode: "simulation",
  stage: "user_input",
  policy_profile_id: "sandbox-security-balanced.v1",
  verdict: "no_detected_risk",
  action: "allow",
  risk_level: "info",
  findings: [],
  detector_runs: [],
  evidence_refs: [],
  created_at: "2026-08-07T00:00:00.000Z"
};

function envelope(data: unknown) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({
      success: true,
      message: "ok",
      data,
      error_code: null,
      request_id: "http:1"
    })
  } as unknown as Response;
}

const ITEM = {
  source_id: "src-1",
  claimed_source_type: "user_input" as const,
  media_type: "text/plain" as const,
  value: "hello",
  provenance_ref: "source://client/1"
};

describe("REQ-SBX-GENERAL-005 sandbox security service", () => {
  it("posts a normalized decision through the shared normalizer", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(envelope(DECISION));

    const result = await evaluateSandboxSecurityRequest({
      capabilityToken: "tok",
      idempotencyKey: "key-1",
      requestId: "req-1",
      stage: "user_input",
      policyProfileId: "sandbox-security-balanced.v1",
      contentItems: [ITEM],
      options: { fetchImpl }
    });

    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.data.decision_id).toBe("decision:1");
      expect(result.data.evaluation_mode).toBe("simulation");
    }
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/sandbox/security/evaluations");
  });

  it("marks a structurally invalid decision as invalid", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(envelope({ ...DECISION, verdict: "not_a_verdict" }));

    const result = await evaluateSandboxSecurityRequest({
      capabilityToken: "tok",
      idempotencyKey: "key-1",
      requestId: "req-1",
      stage: "user_input",
      policyProfileId: "sandbox-security-balanced.v1",
      contentItems: [ITEM],
      options: { fetchImpl }
    });

    expect(result.kind).toBe("invalid");
  });

  it("rejects an over-limit request before any fetch", async () => {
    const fetchImpl = vi.fn();

    const result = await evaluateSandboxSecurityRequest({
      capabilityToken: "tok",
      idempotencyKey: "key-1",
      requestId: "req-1",
      stage: "user_input",
      policyProfileId: "sandbox-security-balanced.v1",
      contentItems: [],
      options: { fetchImpl }
    });

    expect(result.kind).toBe("invalid");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends only cursor and limit on the audit route", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      envelope({
        schema_version: "sandbox-security-audit-page.v1",
        events: [],
        next_cursor: null
      })
    );

    await readSandboxSecurityAuditPage({
      capabilityToken: "tok",
      limit: 50,
      cursor: "sbxcur_v1.abc.def",
      options: { fetchImpl }
    });

    const url = new URL(fetchImpl.mock.calls[0][0], "https://example.test");
    expect([...url.searchParams.keys()].sort()).toEqual(["cursor", "limit"]);
    expect(url.searchParams.get("limit")).toBe("50");
  });

  it("clamps the audit limit into 1..100", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      envelope({
        schema_version: "sandbox-security-audit-page.v1",
        events: [],
        next_cursor: null
      })
    );

    await readSandboxSecurityAuditPage({
      capabilityToken: "tok",
      limit: 5000,
      options: { fetchImpl }
    });

    const url = new URL(fetchImpl.mock.calls[0][0], "https://example.test");
    expect(url.searchParams.get("limit")).toBe("100");
  });

  it("never places submitted content in the request URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(envelope(DECISION));
    const canary = "SECRET-CANARY-VALUE";

    await evaluateSandboxSecurityRequest({
      capabilityToken: "tok",
      idempotencyKey: "key-1",
      requestId: "req-1",
      stage: "user_input",
      policyProfileId: "sandbox-security-balanced.v1",
      contentItems: [{ ...ITEM, value: canary }],
      options: { fetchImpl }
    });

    expect(String(fetchImpl.mock.calls[0][0])).not.toContain("SECRET-CANARY");
  });

  it("never places the capability token in the request URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(envelope(DECISION));

    await evaluateSandboxSecurityRequest({
      capabilityToken: "tok-secret-value",
      idempotencyKey: "key-1",
      requestId: "req-1",
      stage: "user_input",
      policyProfileId: "sandbox-security-balanced.v1",
      contentItems: [ITEM],
      options: { fetchImpl }
    });

    expect(String(fetchImpl.mock.calls[0][0])).not.toContain("tok-secret-value");
  });

  it("holds no module-level capability state between calls", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(envelope(DECISION));
    const base = {
      idempotencyKey: "key-1",
      requestId: "req-1",
      stage: "user_input" as const,
      policyProfileId: "sandbox-security-balanced.v1" as const,
      contentItems: [ITEM],
      options: { fetchImpl }
    };

    await evaluateSandboxSecurityRequest({ ...base, capabilityToken: "tok-a" });
    await evaluateSandboxSecurityRequest({ ...base, capabilityToken: "tok-b" });

    expect(
      (fetchImpl.mock.calls[0][1].headers as Record<string, string>).authorization
    ).toBe("Bearer tok-a");
    expect(
      (fetchImpl.mock.calls[1][1].headers as Record<string, string>).authorization
    ).toBe("Bearer tok-b");
  });
});
```

- [ ] **Step 2: Verify the RED**

Expected: module resolution failure. Confirm the shared normalizer import path
resolves under Vite — `shared/contracts/sandbox-security` uses explicit `.ts`
extensions internally, which the existing `supervision.ts` precedent proves is
already resolvable from the frontend.

- [ ] **Step 3: GREEN — implement the service**

Import `normalizeSandboxSecurityDecision` and `normalizeSandboxSecurityAuditPage`
from the shared contracts. Run the limit pre-flight before constructing the body
and return `{ kind: "invalid" }` on violation without calling fetch. Build the
audit query with `URLSearchParams`, adding `cursor` only when present. Clamp
`limit` to `1..100`. Accept `capabilityToken` as a parameter on every call;
declare no module-level mutable state.

- [ ] **Step 4: Confirm and commit exactly**

```text
frontend/src/services/sandbox-security-service.ts
frontend/src/services/sandbox-security-service.spec.ts
```

Suggested message:
`feat(frontend): add sandbox security evaluation and audit service`

---

### Task P2-T4: Error and Copy Catalog

**Files:**
- Create: `frontend/src/content/sandbox-security-copy.ts`
- Create: `frontend/src/content/sandbox-security-copy.spec.ts`

UI copy is Chinese; enum and contract values stay English, per the approved
decision and `metadata.md`'s "source code identifiers should use English".

- [ ] **Step 1: Write the failing copy test**

```ts
import { describe, expect, it } from "vitest";

import {
  SANDBOX_SECURITY_ERROR_CODES,
  describeSandboxSecurityFailure
} from "./sandbox-security-copy";

describe("REQ-SBX-GENERAL-005 failure copy", () => {
  it("covers all fifteen documented error codes", () => {
    expect(SANDBOX_SECURITY_ERROR_CODES).toHaveLength(15);
    for (const code of SANDBOX_SECURITY_ERROR_CODES) {
      const copy = describeSandboxSecurityFailure({
        kind: "error",
        httpStatus: 400,
        errorCode: code,
        retryAfterSeconds: null
      });
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.remedy.length).toBeGreaterThan(0);
    }
  });

  it("maps an unauthorized capability to a re-paste remedy", () => {
    const copy = describeSandboxSecurityFailure({
      kind: "error",
      httpStatus: 401,
      errorCode: "SANDBOX_SECURITY_UNAUTHORIZED",
      retryAfterSeconds: null
    });
    expect(copy.requiresNewCapability).toBe(true);
  });

  it("surfaces a retry delay when the backend supplies one", () => {
    const copy = describeSandboxSecurityFailure({
      kind: "error",
      httpStatus: 429,
      errorCode: "SANDBOX_SECURITY_RATE_LIMITED",
      retryAfterSeconds: 12
    });
    expect(copy.retryAfterSeconds).toBe(12);
  });

  it("distinguishes idempotency conflict from in-progress", () => {
    const conflict = describeSandboxSecurityFailure({
      kind: "error",
      httpStatus: 409,
      errorCode: "SANDBOX_SECURITY_IDEMPOTENCY_CONFLICT",
      retryAfterSeconds: 1
    });
    const inProgress = describeSandboxSecurityFailure({
      kind: "error",
      httpStatus: 409,
      errorCode: "SANDBOX_SECURITY_IDEMPOTENCY_IN_PROGRESS",
      retryAfterSeconds: 1
    });
    expect(conflict.title).not.toBe(inProgress.title);
    expect(conflict.requiresNewIdempotencyKey).toBe(true);
    expect(inProgress.requiresNewIdempotencyKey).toBe(false);
  });

  it("handles unknown, invalid, and unavailable results", () => {
    expect(
      describeSandboxSecurityFailure({
        kind: "error",
        httpStatus: 418,
        errorCode: "SOMETHING_NEW",
        retryAfterSeconds: null
      }).title.length
    ).toBeGreaterThan(0);
    expect(describeSandboxSecurityFailure({ kind: "invalid" }).title.length).toBeGreaterThan(0);
    expect(describeSandboxSecurityFailure({ kind: "unavailable" }).title.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Verify the RED, then GREEN**

Implement the catalog with the fifteen codes from the GENERAL-003 status table.
`requiresNewCapability` is true for `SANDBOX_SECURITY_UNAUTHORIZED` and
`SANDBOX_SECURITY_FORBIDDEN`. `requiresNewIdempotencyKey` is true only for
`SANDBOX_SECURITY_IDEMPOTENCY_CONFLICT`. Copy must never instruct the operator
to paste a token into a URL or save it anywhere.

- [ ] **Step 3: Confirm and commit exactly**

```text
frontend/src/content/sandbox-security-copy.ts
frontend/src/content/sandbox-security-copy.spec.ts
```

Suggested message:
`feat(frontend): add sandbox security failure copy catalog`

---

## Phase 2 Exit Criteria

- [ ] `requestAuthenticatedJson` sends `Authorization` and, on POST only,
  `Idempotency-Key`; it never returns a server `message`.
- [ ] The three existing services and their 56 tests are unchanged and green.
- [ ] Limit pre-flight imports every bound from `shared/` and duplicates none.
- [ ] No violation, error value, or URL ever contains a submitted value or the
  capability token.
- [ ] Both routes are validated by the real shared normalizers, not by local
  type assertions.
- [ ] All fifteen error codes have Chinese title and remedy copy.
- [ ] All 221 pre-existing tests still pass with no existing spec edited.

Stop and report before Phase 3. Create no component, page, or route in this
Phase.
