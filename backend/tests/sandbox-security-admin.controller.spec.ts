import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { Buffer } from "node:buffer";
import test from "node:test";
import type { IncomingMessage } from "node:http";

import type {
  SandboxSecurityAuditPurgeResult,
  SandboxSecurityAuditService,
  SandboxSecurityCapabilityAuthenticator,
  SandboxSecurityCapabilityIssueResult,
  SandboxSecurityCapabilityService,
  SandboxSecurityCapabilityPublicRecord,
  SandboxSecurityNormalizedCapabilityIssueRequest,
  SandboxSecurityTokenBucket
} from "../src/modules/sandbox-security/sandbox-security.types.ts";
import type { SandboxSecurityRuntimePort } from "../src/modules/sandbox-security/ports/runtime.ts";
import * as boundary from "../src/modules/sandbox-security/sandbox-security.module.ts";
import {
  createSandboxSecurityServiceError,
  type SandboxSecurityServiceError
} from "../src/modules/sandbox-security/sandbox-security.errors.ts";
import { SandboxSecurityHttpError } from "../src/modules/sandbox-security/http-admission.ts";
import type { HttpResponse } from "../src/common/http/http-response.ts";

const ADMIN_TOKEN = "admin-secret";
const CAPABILITY_ID = "capability:00000000-0000-4000-8000-000000000001";
const OTHER_CAPABILITY_ID = "capability:00000000-0000-4000-8000-000000000002";
const ISSUE_BODY = {
  schema_version: "sandbox-security-capability-issue-request.v1",
  subject_id: "operator:alpha",
  scopes: ["sandbox_security:evaluate"],
  allowed_stages: ["tool_request", "user_input"],
  allowed_policy_profile_ids: ["sandbox-security-strict.v1"]
} as const;

type AdminFactory = (input: Readonly<{
  authenticator: SandboxSecurityCapabilityAuthenticator;
  capability_service: SandboxSecurityCapabilityService;
  audit_service: SandboxSecurityAuditService;
  administrator_bucket: SandboxSecurityTokenBucket;
  runtime: SandboxSecurityRuntimePort;
}>) => {
  issue(request: IncomingMessage, requestId: string): Promise<HttpResponse>;
  revoke(request: IncomingMessage, rawCapabilityIdSegment: string, requestId: string): Promise<HttpResponse>;
  purge(request: IncomingMessage, requestId: string): Promise<HttpResponse>;
};

interface FixtureState {
  calls: string[];
  bodyReadCount: number;
  auditWrites: number;
  capabilityServiceCalls: number;
  issueInputs: Readonly<SandboxSecurityNormalizedCapabilityIssueRequest>[];
  revokedIds: string[];
  bucketAllowed: boolean;
  bucketRetryAfter: number;
  administratorError: SandboxSecurityServiceError | null;
  issueError: SandboxSecurityServiceError | null;
  revokeError: SandboxSecurityServiceError | null;
  purgeError: SandboxSecurityServiceError | null;
  issueResult: SandboxSecurityCapabilityIssueResult;
  revokeResult: SandboxSecurityCapabilityPublicRecord;
  purgeResult: SandboxSecurityAuditPurgeResult;
  purgePreCleanupCalls: number;
}

function getAdminFactory(): AdminFactory {
  const factory = (boundary as unknown as Record<string, unknown>)
    .createSandboxSecurityAdminController;
  assert.equal(typeof factory, "function", "module must export createSandboxSecurityAdminController");
  return factory as AdminFactory;
}

function hasSandboxHttpError(statusCode: number, code: string) {
  return (error: unknown): boolean =>
    error instanceof SandboxSecurityHttpError &&
    error.statusCode === statusCode &&
    error.code === code;
}

function makeIssueResult(): SandboxSecurityCapabilityIssueResult {
  return {
    schema_version: "sandbox-security-capability-issue-result.v1",
    capability_id: CAPABILITY_ID,
    subject_id: "operator:alpha",
    scopes: ["sandbox_security:evaluate"],
    allowed_stages: ["user_input", "tool_request"],
    allowed_policy_profile_ids: ["sandbox-security-strict.v1"],
    bearer_token: `sbxcap_v1.${"A".repeat(43)}`,
    issued_at: "2026-08-05T00:00:00.000Z",
    expires_at: "2026-08-05T00:15:00.000Z",
    revoked_at: null
  };
}

function makeRevokeResult(capabilityId = CAPABILITY_ID): SandboxSecurityCapabilityPublicRecord {
  return {
    schema_version: "sandbox-security-capability-record.v1",
    capability_id: capabilityId,
    subject_id: "operator:alpha",
    scopes: ["sandbox_security:evaluate"],
    allowed_stages: ["user_input", "tool_request"],
    allowed_policy_profile_ids: ["sandbox-security-strict.v1"],
    issued_at: "2026-08-05T00:00:00.000Z",
    expires_at: "2026-08-05T00:15:00.000Z",
    revoked_at: "2026-08-05T00:02:00.000Z"
  };
}

function makePurgeResult(overrides: Partial<SandboxSecurityAuditPurgeResult> = {}): SandboxSecurityAuditPurgeResult {
  return {
    schema_version: "sandbox-security-audit-purge-result.v1",
    retention_days: 90,
    deleted_count: 2,
    has_more: false,
    ...overrides
  };
}

function makeRuntime(): SandboxSecurityRuntimePort {
  return {
    now: () => "2026-08-05T00:00:00.000Z",
    monotonicNowMs: () => 100,
    randomBytes: (length) => new Uint8Array(length),
    nextCapabilityId: () => CAPABILITY_ID,
    nextAuditEventId: () => "audit:00000000-0000-4000-8000-000000000001",
    nextDecisionId: () => "decision:00000000-0000-4000-8000-000000000001",
    scheduleTimeout: (_delayMs, _callback) => () => {},
    scheduleInterval: (_delayMs, _callback) => ({ unref() {}, cancel() {} })
  };
}

function makeFixture(
  overrides: Partial<FixtureState> = {},
  options: Readonly<{ legacyCapabilityService?: boolean }> = {}
) {
  const state: FixtureState = {
    calls: [],
    bodyReadCount: 0,
    auditWrites: 0,
    capabilityServiceCalls: 0,
    issueInputs: [],
    revokedIds: [],
    bucketAllowed: true,
    bucketRetryAfter: 7,
    administratorError: null,
    issueError: null,
    revokeError: null,
    purgeError: null,
    issueResult: makeIssueResult(),
    revokeResult: makeRevokeResult(),
    purgeResult: makePurgeResult(),
    purgePreCleanupCalls: 0,
    ...overrides
  };

  const authenticator: SandboxSecurityCapabilityAuthenticator = {
    authenticateToken: () => ({ kind: "unknown" }),
    requireScope: () => {},
    requireEvaluationGrant: () => {},
    authenticateAdministrator(token: string): void {
      state.calls.push("authenticate_administrator");
      if (state.administratorError !== null || token !== ADMIN_TOKEN) {
        throw state.administratorError ?? createSandboxSecurityServiceError({
          code: "SANDBOX_SECURITY_ADMIN_UNAUTHORIZED"
        });
      }
    }
  };
  const capabilityService = {
    issue(input): Readonly<SandboxSecurityCapabilityIssueResult> {
      state.calls.push("capability_issue");
      state.capabilityServiceCalls += 1;
      state.issueInputs.push(input);
      if (state.issueError !== null) throw state.issueError;
      return state.issueResult;
    },
    issueEnforcementAudit() {
      throw new Error("private capability issue is not part of this fixture");
    },
    revoke(capabilityId): Readonly<SandboxSecurityCapabilityPublicRecord> {
      state.calls.push("capability_revoke");
      state.capabilityServiceCalls += 1;
      state.revokedIds.push(capabilityId);
      if (state.revokeError !== null) throw state.revokeError;
      return { ...state.revokeResult, capability_id: capabilityId };
    }
  } as SandboxSecurityCapabilityService;
  if (options.legacyCapabilityService === true) {
    Reflect.deleteProperty(capabilityService, "issueEnforcementAudit");
  }
  const auditService: SandboxSecurityAuditService = {
    list: () => ({ schema_version: "sandbox-security-audit-page.v1", events: [], next_cursor: null }),
    purgeExpired() {
      state.calls.push("audit_purge");
      if (state.purgeError !== null) throw state.purgeError;
      return state.purgeResult;
    }
  };
  const administratorBucket: SandboxSecurityTokenBucket = {
    consume: () => {
      state.calls.push("administrator_bucket");
      if (!state.bucketAllowed) {
        return { allowed: false, retry_after_seconds: state.bucketRetryAfter } as const;
      }
      return { allowed: true } as const;
    }
  };
  const runtime = makeRuntime();

  return {
    state,
    controller: getAdminFactory()({
      authenticator,
      capability_service: capabilityService,
      audit_service: auditService,
      administrator_bucket: administratorBucket,
      runtime
    })
  };
}

function requestFromBody(
  state: FixtureState,
  body: string,
  options: Readonly<{ token?: string; contentLength?: string; contentType?: string }> = {}
): IncomingMessage {
  const token = options.token ?? ADMIN_TOKEN;
  const contentLength = options.contentLength ?? String(Buffer.byteLength(body));
  const rawHeaders = ["Authorization", `Bearer ${token}`];
  if (options.contentType !== undefined || body.length >= 0) {
    rawHeaders.push("Content-Type", options.contentType ?? "application/json");
  }
  if (contentLength !== "") rawHeaders.push("Content-Length", contentLength);
  const chunks = [Buffer.from(body)];
  let index = 0;
  const request = new EventEmitter() as EventEmitter & Record<string, unknown>;
  request.rawHeaders = rawHeaders;
  request.complete = true;
  request.readableEnded = true;
  request.destroyed = false;
  request.aborted = false;
  request.socket = { destroyed: false };
  Object.defineProperty(request, Symbol.asyncIterator, {
    value: () => ({
      next: async () => {
        state.bodyReadCount += 1;
        const chunk = chunks[index++];
        return chunk === undefined ? { done: true, value: undefined } : { done: false, value: chunk };
      }
    })
  });
  return request as unknown as IncomingMessage;
}

function bodylessRequest(state: FixtureState, token = ADMIN_TOKEN): IncomingMessage {
  const request = new EventEmitter() as EventEmitter & Record<string, unknown>;
  request.rawHeaders = ["Authorization", `Bearer ${token}`];
  request.complete = true;
  request.readableEnded = true;
  request.destroyed = false;
  request.aborted = false;
  request.socket = { destroyed: false };
  Object.defineProperty(request, Symbol.asyncIterator, {
    value: () => ({
      next: async () => {
        state.bodyReadCount += 1;
        return { done: true, value: undefined };
      }
    })
  });
  return request as unknown as IncomingMessage;
}

function deferredBodylessRequest(state: FixtureState) {
  let resolver: ((value: IteratorResult<Buffer>) => void) | null = null;
  const request = new EventEmitter() as EventEmitter & Record<string, unknown>;
  request.rawHeaders = ["Authorization", `Bearer ${ADMIN_TOKEN}`];
  request.complete = false;
  request.readableEnded = false;
  request.destroyed = false;
  request.aborted = false;
  request.socket = { destroyed: false };
  Object.defineProperty(request, Symbol.asyncIterator, {
    value: () => ({
      next: () => {
        state.bodyReadCount += 1;
        return new Promise<IteratorResult<Buffer>>((resolve) => {
          resolver = resolve;
        });
      }
    })
  });
  return {
    message: request as unknown as IncomingMessage,
    end() {
      request.complete = true;
      request.readableEnded = true;
      resolver?.({ done: true, value: undefined });
    }
  };
}

function malformedBodylessRequest(state: FixtureState): IncomingMessage {
  const request = new EventEmitter() as EventEmitter & Record<string, unknown>;
  request.rawHeaders = ["Authorization", `Bearer ${ADMIN_TOKEN}`];
  request.complete = true;
  request.readableEnded = true;
  request.destroyed = false;
  request.aborted = false;
  request.socket = { destroyed: false };
  Object.defineProperty(request, Symbol.asyncIterator, {
    value: () => ({
      next: () => {
        state.bodyReadCount += 1;
        throw new Error("malformed request iterator");
      }
    })
  });
  return request as unknown as IncomingMessage;
}

function malformedIssueBodyRequest(state: FixtureState): IncomingMessage {
  const request = new EventEmitter() as EventEmitter & Record<string, unknown>;
  request.rawHeaders = [
    "Authorization", `Bearer ${ADMIN_TOKEN}`,
    "Content-Type", "application/json",
    "Content-Length", "1"
  ];
  request.complete = true;
  request.readableEnded = true;
  request.destroyed = false;
  request.aborted = false;
  request.socket = { destroyed: false };
  Object.defineProperty(request, Symbol.asyncIterator, {
    value: () => ({
      next: () => {
        state.bodyReadCount += 1;
        throw new Error("malformed request body iterator");
      }
    })
  });
  return request as unknown as IncomingMessage;
}

function issueBodyWithExactBytes(targetBytes: number): string {
  const body = JSON.stringify(ISSUE_BODY);
  const padding = targetBytes - Buffer.byteLength(body);
  assert.ok(padding >= 0);
  return body + " ".repeat(padding);
}

test("REQ-SBX-GENERAL-003 exposes the administrator controller factory", () => {
  assert.equal(typeof (boundary as unknown as Record<string, unknown>).createSandboxSecurityAdminController, "function");
});

test("REQ-SBX-GENERAL-003 authenticates administrator before capability issue body", async () => {
  const fixture = makeFixture({
    administratorError: createSandboxSecurityServiceError({ code: "SANDBOX_SECURITY_ADMIN_UNAUTHORIZED" })
  });
  await assert.rejects(
    () => fixture.controller.issue(requestFromBody(fixture.state, JSON.stringify(ISSUE_BODY), { token: "invalid" }), "http-request-2"),
    hasSandboxHttpError(401, "SANDBOX_SECURITY_ADMIN_UNAUTHORIZED")
  );
  assert.deepEqual(fixture.state.calls, ["administrator_bucket", "authenticate_administrator"]);
  assert.equal(fixture.state.bodyReadCount, 0);
  assert.equal(fixture.state.auditWrites, 0);
});

test("REQ-SBX-GENERAL-003 rejects administrator bucket before authentication", async () => {
  const fixture = makeFixture({ bucketAllowed: false });
  await assert.rejects(
    () => fixture.controller.issue(requestFromBody(fixture.state, JSON.stringify(ISSUE_BODY), { token: "invalid" }), "request-rate"),
    hasSandboxHttpError(429, "SANDBOX_SECURITY_RATE_LIMITED")
  );
  assert.deepEqual(fixture.state.calls, ["administrator_bucket"]);
  assert.equal(fixture.state.bodyReadCount, 0);
});

test("REQ-SBX-GENERAL-003 rejects duplicate or malformed administrator bearer before body admission", async () => {
  for (const rawAuthorization of [
    ["Authorization", `Bearer ${ADMIN_TOKEN}`, "authorization", `Bearer ${ADMIN_TOKEN}`],
    ["Authorization", "Basic not-a-bearer"]
  ]) {
    const fixture = makeFixture();
    const request = requestFromBody(fixture.state, JSON.stringify(ISSUE_BODY));
    (request as unknown as { rawHeaders: string[] }).rawHeaders = rawAuthorization;
    await assert.rejects(
      () => fixture.controller.issue(request, "request-bad-header"),
      hasSandboxHttpError(401, "SANDBOX_SECURITY_ADMIN_UNAUTHORIZED")
    );
    assert.deepEqual(fixture.state.calls, ["administrator_bucket"]);
    assert.equal(fixture.state.bodyReadCount, 0);
  }
});

test("REQ-SBX-GENERAL-003 rejects revoke credentials before unread body or malformed path decoding", async () => {
  const fixture = makeFixture({
    administratorError: createSandboxSecurityServiceError({
      code: "SANDBOX_SECURITY_ADMIN_UNAUTHORIZED"
    })
  });
  const request = deferredBodylessRequest(fixture.state);
  (request.message as unknown as { rawHeaders: string[] }).rawHeaders = [
    "Authorization",
    "Bearer invalid-admin"
  ];
  await assert.rejects(
    () => fixture.controller.revoke(request.message, "%ZZ", "request-revoke-bad-admin"),
    hasSandboxHttpError(401, "SANDBOX_SECURITY_ADMIN_UNAUTHORIZED")
  );
  assert.deepEqual(fixture.state.calls, [
    "administrator_bucket",
    "authenticate_administrator"
  ]);
  assert.equal(fixture.state.bodyReadCount, 0);
  assert.equal(fixture.state.capabilityServiceCalls, 0);
});

test("REQ-SBX-GENERAL-003 accepts an exact 65536-byte issue body and passes strict normalized DTO", async () => {
  const fixture = makeFixture();
  const body = issueBodyWithExactBytes(65536);
  const response = await fixture.controller.issue(
    requestFromBody(fixture.state, body),
    "request-issue"
  );
  assert.equal(response.statusCode, 201);
  assert.equal(fixture.state.bodyReadCount, 2);
  assert.deepEqual(fixture.state.issueInputs, [{
    schema_version: "sandbox-security-capability-issue-request.v1",
    subject_id: "operator:alpha",
    scopes: ["sandbox_security:evaluate"],
    allowed_stages: ["user_input", "tool_request"],
    allowed_policy_profile_ids: ["sandbox-security-strict.v1"],
    ttl_seconds: 900
  }]);
});

test("REQ-SBX-GENERAL-003 rejects the first byte over the 65536-byte issue limit", async () => {
  const fixture = makeFixture();
  const body = issueBodyWithExactBytes(65537);
  await assert.rejects(
    () => fixture.controller.issue(requestFromBody(fixture.state, body), "request-too-large"),
    hasSandboxHttpError(413, "SANDBOX_SECURITY_BODY_TOO_LARGE")
  );
  assert.equal(fixture.state.bodyReadCount, 0);
});

test("REQ-SBX-GENERAL-003 rejects strict issue DTO extras and invalid TTL before service", async () => {
  const fixture = makeFixture();
  const body = JSON.stringify({ ...ISSUE_BODY, ttl_seconds: 59, unexpected: true });
  await assert.rejects(
    () => fixture.controller.issue(requestFromBody(fixture.state, body), "request-invalid-dto"),
    hasSandboxHttpError(400, "SANDBOX_SECURITY_INVALID_REQUEST")
  );
  assert.equal(fixture.state.capabilityServiceCalls, 0);
});

test("REQ-SBX-GENERAL-004 public v1 scope branch rejects the private enforcement scope", async () => {
  const fixture = makeFixture();
  const body = JSON.stringify({
    schema_version: "sandbox-security-capability-issue-request.v1",
    subject_id: "integration:openclaw",
    scopes: ["sandbox_security:enforcement:audit:write"],
    allowed_stages: [],
    allowed_policy_profile_ids: [],
    ttl_seconds: 3600
  });
  await assert.rejects(
    () => fixture.controller.issue(requestFromBody(fixture.state, body), "request-private-scope"),
    hasSandboxHttpError(400, "SANDBOX_SECURITY_INVALID_REQUEST")
  );
  assert.equal(fixture.state.capabilityServiceCalls, 0);
});

test("REQ-SBX-GENERAL-003 maps malformed issue body iterators to invalid request", async () => {
  const fixture = makeFixture();
  await assert.rejects(
    () => fixture.controller.issue(malformedIssueBodyRequest(fixture.state), "request-malformed-body"),
    hasSandboxHttpError(400, "SANDBOX_SECURITY_INVALID_REQUEST")
  );
  assert.equal(fixture.state.capabilityServiceCalls, 0);
});

test("REQ-SBX-GENERAL-003 returns 201 issue result with raw token only once", async () => {
  const fixture = makeFixture();
  const response = await fixture.controller.issue(
    requestFromBody(fixture.state, JSON.stringify(ISSUE_BODY)),
    "request-once"
  );
  assert.equal(response.statusCode, 201);
  const data = (response.body as { data: unknown }).data as Record<string, unknown>;
  assert.equal(data.bearer_token, fixture.state.issueResult.bearer_token);
  assert.equal(fixture.state.capabilityServiceCalls, 1);
});

test("REQ-SBX-GENERAL-003 waits for bodyless completion before revoke path decoding", async () => {
  const fixture = makeFixture();
  const request = deferredBodylessRequest(fixture.state);
  const attempt = fixture.controller.revoke(request.message, "%ZZ", "http-request-3");
  const early = await Promise.race([
    attempt.then(() => "settled", () => "settled"),
    new Promise<"pending">((resolve) => setImmediate(() => resolve("pending")))
  ]);
  assert.equal(early, "pending");
  assert.equal(fixture.state.capabilityServiceCalls, 0);
  request.end();
  await assert.rejects(attempt, hasSandboxHttpError(400, "SANDBOX_SECURITY_INVALID_REQUEST"));
  assert.equal(fixture.state.capabilityServiceCalls, 0);
});

test("REQ-SBX-GENERAL-003 revokes after one percent decode and preserves idempotent result", async () => {
  const fixture = makeFixture();
  const encoded = CAPABILITY_ID.replaceAll(":", "%3A");
  const response = await fixture.controller.revoke(bodylessRequest(fixture.state), encoded, "request-revoke");
  assert.equal(response.statusCode, 200);
  assert.deepEqual(fixture.state.revokedIds, [CAPABILITY_ID]);
  const second = await fixture.controller.revoke(bodylessRequest(fixture.state), encoded, "request-revoke-again");
  assert.equal(second.statusCode, 200);
  assert.deepEqual(fixture.state.revokedIds, [CAPABILITY_ID, CAPABILITY_ID]);
});

test("REQ-SBX-GENERAL-003 rejects malformed, encoded separator, and invalid capability IDs", async () => {
  for (const segment of [
    "%ZZ",
    "capability%253A00000000-0000-4000-8000-000000000001",
    "capability%2F00000000-0000-4000-8000-000000000001",
    "capability%5C00000000-0000-4000-8000-000000000001",
    "capability%00000000-0000-4000-8000-000000000001",
    "not-a-capability"
  ]) {
    const fixture = makeFixture();
    await assert.rejects(
      () => fixture.controller.revoke(bodylessRequest(fixture.state), segment, "request-invalid-path"),
      hasSandboxHttpError(400, "SANDBOX_SECURITY_INVALID_REQUEST")
    );
    assert.equal(fixture.state.capabilityServiceCalls, 0);
  }
});

test("REQ-SBX-GENERAL-003 maps unknown revoke target to fixed 404 without leaking details", async () => {
  const fixture = makeFixture({
    revokeError: createSandboxSecurityServiceError({ code: "SANDBOX_SECURITY_CAPABILITY_NOT_FOUND" })
  });
  await assert.rejects(
    () => fixture.controller.revoke(bodylessRequest(fixture.state), OTHER_CAPABILITY_ID, "request-404"),
    (error: unknown) => {
      assert.ok(error instanceof SandboxSecurityHttpError);
      assert.equal(error.statusCode, 404);
      assert.equal(error.code, "SANDBOX_SECURITY_CAPABILITY_NOT_FOUND");
      assert.equal(error.message.includes(OTHER_CAPABILITY_ID), false);
      return true;
    }
  );
});

test("REQ-SBX-GENERAL-003 rejects a body on revoke before path or service", async () => {
  const fixture = makeFixture();
  const request = requestFromBody(fixture.state, "x", { contentType: undefined });
  await assert.rejects(
    () => fixture.controller.revoke(request, CAPABILITY_ID, "request-body"),
    hasSandboxHttpError(400, "SANDBOX_SECURITY_INVALID_REQUEST")
  );
  assert.equal(fixture.state.capabilityServiceCalls, 0);
});

test("REQ-SBX-GENERAL-003 maps malformed bodyless iterators to invalid request", async () => {
  for (const operation of ["revoke", "purge"] as const) {
    const fixture = makeFixture();
    const attempt = operation === "revoke"
      ? fixture.controller.revoke(malformedBodylessRequest(fixture.state), CAPABILITY_ID, "request-malformed-bodyless")
      : fixture.controller.purge(malformedBodylessRequest(fixture.state), "request-malformed-bodyless");
    await assert.rejects(
      () => attempt,
      hasSandboxHttpError(400, "SANDBOX_SECURITY_INVALID_REQUEST")
    );
    assert.equal(fixture.state.capabilityServiceCalls, 0);
    assert.equal(fixture.state.calls.includes("audit_purge"), false);
  }
});

test("REQ-SBX-GENERAL-003 runs purge bodyless admission before cleanup and returns fixed retention", async () => {
  const fixture = makeFixture();
  const response = await fixture.controller.purge(bodylessRequest(fixture.state), "request-purge");
  assert.equal(response.statusCode, 200);
  assert.deepEqual(fixture.state.calls, ["administrator_bucket", "authenticate_administrator", "audit_purge"]);
  assert.deepEqual((response.body as { data: unknown }).data, fixture.state.purgeResult);
  assert.equal(fixture.state.purgeResult.retention_days, 90);
});

test("REQ-SBX-GENERAL-003 rejects purge body before invoking cleanup", async () => {
  const fixture = makeFixture();
  const request = requestFromBody(fixture.state, "x", { contentType: undefined });
  await assert.rejects(
    () => fixture.controller.purge(request, "request-purge-body"),
    hasSandboxHttpError(400, "SANDBOX_SECURITY_INVALID_REQUEST")
  );
  assert.equal(fixture.state.calls.includes("audit_purge"), false);
});

test("REQ-SBX-GENERAL-003 maps purge storage failure to 503 Retry-After 60", async () => {
  const fixture = makeFixture({
    purgeError: createSandboxSecurityServiceError({
      code: "SANDBOX_SECURITY_STORAGE_UNAVAILABLE",
      audit_rejection_code: "storage_unavailable"
    })
  });
  await assert.rejects(
    () => fixture.controller.purge(bodylessRequest(fixture.state), "request-purge-storage"),
    (error: unknown) => {
      assert.ok(error instanceof SandboxSecurityHttpError);
      assert.equal(error.statusCode, 503);
      assert.equal(error.code, "SANDBOX_SECURITY_STORAGE_UNAVAILABLE");
      assert.equal(error.retry_after_seconds, 60);
      return true;
    }
  );
});

test("REQ-SBX-GENERAL-003 keeps bad administrator credentials typed and free of durable audit amplification", async () => {
  const fixture = makeFixture({
    administratorError: createSandboxSecurityServiceError({ code: "SANDBOX_SECURITY_ADMIN_UNAUTHORIZED" })
  });
  await assert.rejects(
    () => fixture.controller.purge(bodylessRequest(fixture.state, "wrong"), "request-bad-admin"),
    hasSandboxHttpError(401, "SANDBOX_SECURITY_ADMIN_UNAUTHORIZED")
  );
  assert.equal(fixture.state.auditWrites, 0);
  assert.equal(fixture.state.capabilityServiceCalls, 0);
});

test("REQ-SBX-GENERAL-003 maps unexpected service failures to typed internal errors", async () => {
  const fixture = makeFixture({ issueError: new Error("sqlite secret: should not leak") as never });
  await assert.rejects(
    () => fixture.controller.issue(requestFromBody(fixture.state, JSON.stringify(ISSUE_BODY)), "request-internal"),
    (error: unknown) => {
      assert.ok(error instanceof SandboxSecurityHttpError);
      assert.equal(error.statusCode, 500);
      assert.equal(error.code, "SANDBOX_SECURITY_INTERNAL_ERROR");
      assert.equal(error.message.includes("sqlite secret"), false);
      return true;
    }
  );
});

test("REQ-SBX-GENERAL-004 keeps the admin controller constructible with a public-only service fixture", () => {
  assert.doesNotThrow(() => makeFixture({}, { legacyCapabilityService: true }));
});
