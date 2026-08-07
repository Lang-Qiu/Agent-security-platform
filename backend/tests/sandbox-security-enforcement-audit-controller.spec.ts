import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { EventEmitter } from "node:events";
import test from "node:test";
import type { IncomingMessage } from "node:http";

import type {
  SandboxSecurityEnforcementAuditRequest,
  OpenClawEnforcementAuditAck
} from "../../shared/index.ts";
import type {
  OpenClawEnforcementAuditIdentity,
  SandboxSecurityEnforcementAuditAuthenticator,
  SandboxSecurityEnforcementAuditService,
  SandboxSecurityRuntimePort,
  SandboxSecurityTokenBucket
} from "../src/modules/sandbox-security/sandbox-security.module.ts";
import {
  createSandboxSecurityServiceError,
  type SandboxSecurityServiceError
} from "../src/modules/sandbox-security/sandbox-security.errors.ts";
import { SandboxSecurityHttpError } from "../src/modules/sandbox-security/http-admission.ts";
import * as boundary from "../src/modules/sandbox-security/sandbox-security.module.ts";

const PRIVATE_TOKEN = `sbxcap_v1.${"A".repeat(43)}`;
const REQUEST_ID = "request:00000000-0000-4000-8000-000000000030";
const EVENT_ID = "audit:00000000-0000-4000-8000-000000000030";
const NOW = "2026-08-07T00:00:00.000Z";
const IDENTITY: OpenClawEnforcementAuditIdentity = {
  subject_id: "integration:openclaw",
  capability_id: "capability:00000000-0000-4000-8000-000000000030",
  authorization_scope_id: `authscope:hmac-sha256:${"b".repeat(64)}`
};
const CAPABILITY = {
  capability_id: IDENTITY.capability_id,
  subject_id: IDENTITY.subject_id,
  authorization_scope_id: IDENTITY.authorization_scope_id,
  scopes: ["sandbox_security:enforcement:audit:write"],
  allowed_stages: ["user_input", "model_output", "tool_request"],
  allowed_policy_profile_ids: ["sandbox-security-balanced.v1"],
  composition_binding: "sandbox-security-production-composition.v1:rule_only",
  issued_at: "2026-08-07T00:00:00.000Z",
  expires_at: "2026-08-07T01:00:00.000Z"
} as const;

const REQUEST: SandboxSecurityEnforcementAuditRequest = {
  schema_version: "sandbox-security-enforcement-audit-request.v1",
  event_id: EVENT_ID,
  request_id: REQUEST_ID,
  enforcement_point: "before_agent_run",
  stage: "user_input",
  policy_profile_id: "sandbox-security-balanced.v1",
  composition_binding: "sandbox-security-production-composition.v1:rule_only",
  elapsed_ms: 3,
  event_type: "enforcement_completed",
  verdict: "no_detected_risk",
  action: "allow",
  risk_level: "info",
  category_counts: {
    prompt_injection: 0,
    jailbreak: 0,
    instruction_override: 0,
    privilege_escalation: 0,
    sensitive_data_exposure: 0,
    tool_hijacking: 0,
    unsafe_side_effect: 0,
    memory_poisoning: 0,
    trust_boundary_violation: 0
  },
  detector_run_status_counts: {
    matched: 0,
    no_match: 1,
    failed: 0,
    timeout: 0,
    invalid_result: 0,
    skipped: 0
  },
  host_outcome: "continued"
};

interface FixtureState {
  calls: string[];
  bodyReads: number;
  bucketAllowed: boolean;
  authentication: "authorized" | "unknown";
  authenticationSequence: readonly ("authorized" | "unknown")[] | null;
  authenticationError: "none" | "unexpected";
  privateScope: "authorized" | "wrong";
  grantError: SandboxSecurityServiceError | null;
  serviceError: SandboxSecurityServiceError | null;
  appendResult: Readonly<{
    schema_version: "sandbox-security-enforcement-audit-ack.v1";
    event_id: string;
    status: "accepted" | "replayed";
    occurred_at: string;
  }>;
}

interface RequestOptions {
  authorization?: string;
  content_type?: string;
  content_length?: string;
  transfer_encoding?: string;
  chunks?: readonly Buffer[];
  pending?: boolean;
  raw_body?: string;
}

function runtime(): SandboxSecurityRuntimePort {
  return {
    now: () => NOW,
    monotonicNowMs: () => 100,
    randomBytes: (length) => new Uint8Array(length),
    nextCapabilityId: () => IDENTITY.capability_id,
    nextAuditEventId: () => EVENT_ID,
    nextDecisionId: () => "decision:00000000-0000-4000-8000-000000000030",
    scheduleTimeout: () => () => {},
    scheduleInterval: () => ({ unref() {}, cancel() {} })
  };
}

function requestFrom(
  state: FixtureState,
  value: unknown = REQUEST,
  options: Readonly<RequestOptions> = {}
): IncomingMessage {
  const body = options.raw_body ?? JSON.stringify(value);
  const request = new EventEmitter() as EventEmitter & Record<string, unknown>;
  const rawHeaders: string[] = [
    "Authorization", options.authorization ?? `Bearer ${PRIVATE_TOKEN}`
  ];
  if (options.content_type !== undefined) {
    rawHeaders.push("Content-Type", options.content_type);
  } else {
    rawHeaders.push("Content-Type", "application/json");
  }
  if (options.transfer_encoding !== undefined) {
    rawHeaders.push("Transfer-Encoding", options.transfer_encoding);
  } else {
    rawHeaders.push(
      "Content-Length",
      options.content_length ?? String(Buffer.byteLength(body))
    );
  }
  request.rawHeaders = rawHeaders;
  request.complete = options.pending !== true;
  request.readableEnded = options.pending !== true;
  request.destroyed = false;
  request.aborted = false;
  request.socket = { destroyed: false };
  let index = 0;
  const chunks = options.chunks ?? [Buffer.from(body)];
  Object.defineProperty(request, Symbol.asyncIterator, {
    value: () => ({
      next: async () => {
        if (options.pending === true) return await new Promise<never>(() => {});
        const chunk = chunks[index++];
        if (chunk === undefined) return { done: true, value: undefined };
        if (chunk.byteLength > 0) state.bodyReads += 1;
        return { done: false, value: chunk };
      }
    })
  });
  return request as unknown as IncomingMessage;
}

function makeFixture(overrides: Partial<FixtureState> = {}) {
  const state: FixtureState = {
    calls: [],
    bodyReads: 0,
    bucketAllowed: true,
    authentication: "authorized",
    authenticationSequence: null,
    authenticationError: "none",
    privateScope: "authorized",
    grantError: null,
    serviceError: null,
    appendResult: {
      schema_version: "sandbox-security-enforcement-audit-ack.v1",
      event_id: EVENT_ID,
      status: "accepted",
      occurred_at: NOW
    },
    ...overrides
  };
  const authenticator: SandboxSecurityEnforcementAuditAuthenticator = {
    authenticateEnforcementAuditToken(token) {
      state.calls.push(`authenticate:${token}`);
      if (state.authenticationError === "unexpected") {
        throw new Error("authenticator failure");
      }
      const authenticationAttempt = state.calls.filter((call) =>
        call.startsWith("authenticate:")
      ).length - 1;
      const authentication = state.authenticationSequence?.[authenticationAttempt] ??
        state.authentication;
      if (authentication === "unknown") return { kind: "unknown" };
      if (state.privateScope === "wrong") {
        return {
          kind: "authorized",
          capability: {
            ...CAPABILITY,
            scopes: ["sandbox_security:evaluate"]
          } as never
        };
      }
      return { kind: "authorized", capability: CAPABILITY };
    },
    requireEnforcementAuditGrant(_capability, _context) {
      state.calls.push("grant");
      if (state.grantError !== null) throw state.grantError;
      return CAPABILITY;
    }
  };
  const service: SandboxSecurityEnforcementAuditService = {
    async appendEnforcementEvent(request, identity): Promise<Readonly<OpenClawEnforcementAuditAck>> {
      state.calls.push(`append:${request.event_id}:${identity.capability_id}`);
      if (state.serviceError !== null) throw state.serviceError;
      return state.appendResult;
    }
  };
  const bucket: SandboxSecurityTokenBucket = {
    consume(now) {
      state.calls.push(`bucket:${now}`);
      return state.bucketAllowed
        ? { allowed: true }
        : { allowed: false, retry_after_seconds: 7 };
    }
  };
  const factory = (boundary as unknown as Record<string, unknown>)
    .createSandboxSecurityEnforcementAuditController;
  assert.equal(typeof factory, "function", "module must export the enforcement audit controller factory");
  const controller = (factory as (input: Readonly<{
    authenticator: SandboxSecurityEnforcementAuditAuthenticator;
    service: SandboxSecurityEnforcementAuditService;
    enforcement_bucket: SandboxSecurityTokenBucket;
    runtime: SandboxSecurityRuntimePort;
    composition_binding: string;
  }>) => unknown)({
    authenticator,
    service,
    enforcement_bucket: bucket,
    runtime: runtime(),
    composition_binding: CAPABILITY.composition_binding
  }) as {
    enforcementAudit(request: IncomingMessage, requestId: string): Promise<unknown>;
  };
  return { state, controller };
}

function isHttp(error: unknown, statusCode: number, code: string): boolean {
  return error instanceof SandboxSecurityHttpError &&
    error.statusCode === statusCode && error.code === code;
}

test("REQ-SBX-GENERAL-004 exposes the enforcement audit controller factory", () => {
  assert.equal(
    typeof (boundary as unknown as Record<string, unknown>)
      .createSandboxSecurityEnforcementAuditController,
    "function"
  );
});

test("REQ-SBX-GENERAL-004 uses a dedicated two-token six-second enforcement bucket", () => {
  const factory = (boundary as unknown as Record<string, unknown>)
    .createSandboxSecurityEnforcementAuditTokenBucket;
  assert.equal(typeof factory, "function");
  const bucket = (factory as (input: Readonly<{ initial_monotonic_ms: number }>) => SandboxSecurityTokenBucket)({
    initial_monotonic_ms: 100
  });
  assert.deepEqual(bucket.consume(100), { allowed: true });
  assert.deepEqual(bucket.consume(100), { allowed: true });
  assert.deepEqual(bucket.consume(100), {
    allowed: false,
    retry_after_seconds: 6
  });
  assert.deepEqual(bucket.consume(6100), { allowed: true });
});

test("REQ-SBX-GENERAL-004 admits and acknowledges a private enforcement event in order", async () => {
  const fixture = makeFixture();
  const response = await fixture.controller.enforcementAudit(
    requestFrom(fixture.state),
    "request-http-00000000000000000000000000000001"
  ) as { statusCode: number; body: { data: unknown } };
  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.body.data, fixture.state.appendResult);
  assert.deepEqual(fixture.state.calls, [
    "bucket:100",
    `authenticate:${PRIVATE_TOKEN}`,
    `authenticate:${PRIVATE_TOKEN}`,
    "grant",
    `append:${EVENT_ID}:${IDENTITY.capability_id}`
  ]);
  assert.equal(fixture.state.bodyReads, 1);
});

test("REQ-SBX-GENERAL-004 re-authenticates after body read before granting a revoked token", async () => {
  const fixture = makeFixture({
    authenticationSequence: ["authorized", "unknown"]
  });
  await assert.rejects(
    () => fixture.controller.enforcementAudit(
      requestFrom(fixture.state),
      "request-http-revoked-after-auth"
    ),
    (error: unknown) => isHttp(error, 401, "SANDBOX_SECURITY_UNAUTHORIZED")
  );
  assert.equal(fixture.state.bodyReads, 1);
  assert.deepEqual(fixture.state.calls, [
    "bucket:100",
    `authenticate:${PRIVATE_TOKEN}`,
    `authenticate:${PRIVATE_TOKEN}`
  ]);
});

test("REQ-SBX-GENERAL-004 rejects unknown private capability before reading the body", async () => {
  const fixture = makeFixture({ authentication: "unknown" });
  await assert.rejects(
    () => fixture.controller.enforcementAudit(requestFrom(fixture.state), "request-http-unknown"),
    (error: unknown) => isHttp(error, 401, "SANDBOX_SECURITY_UNAUTHORIZED")
  );
  assert.equal(fixture.state.bodyReads, 0);
});

test("REQ-SBX-GENERAL-004 rejects a wrong private scope before reading the body", async () => {
  const fixture = makeFixture({ privateScope: "wrong" });
  await assert.rejects(
    () => fixture.controller.enforcementAudit(requestFrom(fixture.state), "request-http-scope"),
    (error: unknown) => isHttp(error, 403, "SANDBOX_SECURITY_FORBIDDEN")
  );
  assert.equal(fixture.state.bodyReads, 0);
  assert.equal(fixture.state.calls.includes("grant"), false);
});

test("REQ-SBX-GENERAL-004 maps an unexpected authenticator failure to bounded internal error", async () => {
  const fixture = makeFixture({ authenticationError: "unexpected" });
  await assert.rejects(
    () => fixture.controller.enforcementAudit(requestFrom(fixture.state), "request-http-auth-error"),
    (error: unknown) => isHttp(error, 500, "SANDBOX_SECURITY_INTERNAL_ERROR")
  );
  assert.equal(fixture.state.bodyReads, 0);
});

test("REQ-SBX-GENERAL-004 maps private grant rejection and storage errors without leaking input", async () => {
  const forbidden = createSandboxSecurityServiceError({
    code: "SANDBOX_SECURITY_FORBIDDEN",
    audit_rejection_code: "profile_forbidden"
  });
  const fixture = makeFixture({ grantError: forbidden });
  await assert.rejects(
    () => fixture.controller.enforcementAudit(requestFrom(fixture.state), "request-http-forbidden"),
    (error: unknown) => isHttp(error, 403, "SANDBOX_SECURITY_FORBIDDEN")
  );

  const storage = createSandboxSecurityServiceError({
    code: "SANDBOX_SECURITY_STORAGE_UNAVAILABLE",
    audit_rejection_code: "storage_unavailable"
  });
  const storageFixture = makeFixture({ serviceError: storage });
  await assert.rejects(
    () => storageFixture.controller.enforcementAudit(requestFrom(storageFixture.state), "request-http-storage"),
    (error: unknown) => isHttp(error, 503, "SANDBOX_SECURITY_STORAGE_UNAVAILABLE")
  );
});

test("REQ-SBX-GENERAL-004 maps accepted and replayed acknowledgements to 201 and 200", async () => {
  const accepted = makeFixture();
  assert.equal((await accepted.controller.enforcementAudit(
    requestFrom(accepted.state),
    "request-http-accepted"
  ) as { statusCode: number }).statusCode, 201);

  const replayed = makeFixture({
    appendResult: {
      schema_version: "sandbox-security-enforcement-audit-ack.v1",
      event_id: EVENT_ID,
      status: "replayed",
      occurred_at: NOW
    }
  });
  assert.equal((await replayed.controller.enforcementAudit(
    requestFrom(replayed.state),
    "request-http-replayed"
  ) as { statusCode: number }).statusCode, 200);
});

test("REQ-SBX-GENERAL-004 rejects malformed private event fields before grant and service", async () => {
  const fixture = makeFixture();
  const malformed = { ...REQUEST, extra: "raw-input" };
  await assert.rejects(
    () => fixture.controller.enforcementAudit(requestFrom(fixture.state, malformed), "request-http-malformed"),
    (error: unknown) => isHttp(error, 400, "SANDBOX_SECURITY_INVALID_REQUEST")
  );
  assert.equal(fixture.state.calls.includes("grant"), false);
  assert.equal(fixture.state.calls.some((call) => call.startsWith("append:")), false);
});

test("REQ-SBX-GENERAL-004 rejects duplicate JSON keys before grant and service", async () => {
  const fixture = makeFixture();
  const rawBody = JSON.stringify(REQUEST).replace(
    '"action":"allow","risk_level"',
    '"action":"allow","action":"allow","risk_level"'
  );
  await assert.rejects(
    () => fixture.controller.enforcementAudit(
      requestFrom(fixture.state, REQUEST, { raw_body: rawBody }),
      "request-http-duplicate-key"
    ),
    (error: unknown) => isHttp(error, 400, "SANDBOX_SECURITY_INVALID_REQUEST")
  );
  assert.equal(fixture.state.calls.includes("grant"), false);
  assert.equal(fixture.state.calls.some((call) => call.startsWith("append:")), false);
});

test("REQ-SBX-GENERAL-004 rejects escaped and nested duplicate JSON structures", async () => {
  const bodies = [
    JSON.stringify(REQUEST).replace(
      '"action":"allow"',
      '"\\u0061ction":"allow","action":"allow"'
    ),
    JSON.stringify(REQUEST).replace(
      '"prompt_injection":0,"jailbreak"',
      '"prompt_injection":0,"prompt_injection":0,"jailbreak"'
    ),
    JSON.stringify(REQUEST).replace(
      ',"host_outcome":"continued"}',
      ',"host_outcome":"continued","extra":[{"key":1,"key":1}]}'
    )
  ];
  for (const [index, rawBody] of bodies.entries()) {
    const fixture = makeFixture();
    await assert.rejects(
      () => fixture.controller.enforcementAudit(
        requestFrom(fixture.state, REQUEST, { raw_body: rawBody }),
        `request-http-duplicate-structure-${index}`
      ),
      (error: unknown) => isHttp(error, 400, "SANDBOX_SECURITY_INVALID_REQUEST")
    );
    assert.equal(fixture.state.calls.includes("grant"), false);
    assert.equal(fixture.state.calls.some((call) => call.startsWith("append:")), false);
  }
});

test("REQ-SBX-GENERAL-004 bounds malformed JSON depth and escape handling", async () => {
  let nested = "0";
  for (let index = 0; index < 130; index += 1) nested = `[${nested}]`;
  const bodies = [
    JSON.stringify(REQUEST).replace(
      ',"host_outcome":"continued"}',
      `,"extra":${nested},"host_outcome":"continued"}`
    ),
    JSON.stringify(REQUEST).replace(
      '"action":"allow"',
      '"action":"\\uZZZZ"'
    ),
    JSON.stringify(REQUEST).replace(
      '"action":"allow"',
      '"action":truex'
    )
  ];
  for (const [index, rawBody] of bodies.entries()) {
    const fixture = makeFixture();
    await assert.rejects(
      () => fixture.controller.enforcementAudit(
        requestFrom(fixture.state, REQUEST, { raw_body: rawBody }),
        `request-http-malformed-structure-${index}`
      ),
      (error: unknown) => isHttp(error, 400, "SANDBOX_SECURITY_INVALID_REQUEST")
    );
    assert.equal(fixture.state.calls.includes("grant"), false);
    assert.equal(fixture.state.calls.some((call) => call.startsWith("append:")), false);
  }
});

test("REQ-SBX-GENERAL-004 rejects a full enforcement bucket before authentication", async () => {
  const fixture = makeFixture({ bucketAllowed: false });
  await assert.rejects(
    () => fixture.controller.enforcementAudit(requestFrom(fixture.state), "request-http-rate"),
    (error: unknown) => isHttp(error, 429, "SANDBOX_SECURITY_RATE_LIMITED")
  );
  assert.deepEqual(fixture.state.calls, ["bucket:100"]);
  assert.equal(fixture.state.bodyReads, 0);
});

test("REQ-SBX-GENERAL-004 maps strict media and body framing failures without grant or service", async () => {
  const mediaFixture = makeFixture();
  await assert.rejects(
    () => mediaFixture.controller.enforcementAudit(
      requestFrom(mediaFixture.state, REQUEST, { content_type: "text/plain" }),
      "request-http-media"
    ),
    (error: unknown) => isHttp(error, 415, "SANDBOX_SECURITY_UNSUPPORTED_MEDIA_TYPE")
  );

  const declaredFixture = makeFixture();
  await assert.rejects(
    () => declaredFixture.controller.enforcementAudit(
      requestFrom(declaredFixture.state, REQUEST, { content_length: "65537" }),
      "request-http-declared-overflow"
    ),
    (error: unknown) => isHttp(error, 413, "SANDBOX_SECURITY_BODY_TOO_LARGE")
  );

  const chunkedFixture = makeFixture();
  await assert.rejects(
    () => chunkedFixture.controller.enforcementAudit(
      requestFrom(chunkedFixture.state, REQUEST, {
        transfer_encoding: "chunked",
        chunks: [Buffer.alloc(65537, 0x61)]
      }),
      "request-http-chunked-overflow"
    ),
    (error: unknown) => isHttp(error, 413, "SANDBOX_SECURITY_BODY_TOO_LARGE")
  );

  assert.equal(mediaFixture.state.calls.includes("grant"), false);
  assert.equal(declaredFixture.state.calls.includes("grant"), false);
  assert.equal(chunkedFixture.state.calls.includes("grant"), false);
});

test("REQ-SBX-GENERAL-004 maps the fixed body deadline to 408", async () => {
  const fixture = makeFixture();
  await assert.rejects(
    () => fixture.controller.enforcementAudit(
      requestFrom(fixture.state, REQUEST, { pending: true }),
      "request-http-timeout"
    ),
    (error: unknown) => isHttp(error, 408, "SANDBOX_SECURITY_REQUEST_TIMEOUT")
  );
  assert.equal(fixture.state.bodyReads, 0);
  assert.equal(fixture.state.calls.includes("grant"), false);
});

test("REQ-SBX-GENERAL-004 maps event-id conflicts to 409 without exposing input", async () => {
  const conflict = createSandboxSecurityServiceError({
    code: "SANDBOX_SECURITY_IDEMPOTENCY_CONFLICT",
    audit_rejection_code: "idempotency_conflict"
  });
  const fixture = makeFixture({ serviceError: conflict });
  await assert.rejects(
    () => fixture.controller.enforcementAudit(
      requestFrom(fixture.state),
      "request-http-conflict"
    ),
    (error: unknown) => isHttp(error, 409, "SANDBOX_SECURITY_IDEMPOTENCY_CONFLICT")
  );
  assert.equal(String(fixture.state.serviceError).includes(EVENT_ID), false);
});
