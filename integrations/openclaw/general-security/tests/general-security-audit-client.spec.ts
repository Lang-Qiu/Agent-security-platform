import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeSandboxSecurityEnforcementAuditRequest,
  type SandboxSecurityEnforcementAuditRequest
} from "../../../../shared/index.ts";

const auditModule = (await import(
  "../src/general-security/audit-client.ts"
).catch(() => ({}))) as Record<string, unknown>;
const indexModule = (await import("../src/index.ts")) as Record<string, unknown>;

type RecordValue = Record<string, unknown>;
type TransportInput = {
  url: string;
  bearer_token: string;
  body: Uint8Array;
  signal: AbortSignal;
};
type TransportResponse = { status: number; body: Uint8Array };

const EVENT_ID = "audit:00000000-0000-4000-8000-000000000040";
const REQUEST_ID = "request:00000000-0000-4000-8000-000000000040";
const TOKEN = `sbxcap_v1.${"A".repeat(43)}`;
const ENDPOINT = "http://sandbox-security-backend:3001/internal/sandbox/security/enforcement-events";
const OCCURRED_AT = "2026-08-07T00:00:00.040Z";

const REQUEST: SandboxSecurityEnforcementAuditRequest = {
  schema_version: "sandbox-security-enforcement-audit-request.v1",
  event_id: EVENT_ID,
  request_id: REQUEST_ID,
  enforcement_point: "before_agent_run",
  stage: "user_input",
  policy_profile_id: "sandbox-security-balanced.v1",
  composition_binding: "sandbox-security-production-composition.v1:rule_only",
  elapsed_ms: 40,
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

const NORMALIZED_REQUEST = normalizeSandboxSecurityEnforcementAuditRequest(REQUEST);
assert.notEqual(NORMALIZED_REQUEST, null);

const ACCEPTED_ACK = {
  schema_version: "sandbox-security-enforcement-audit-ack.v1",
  event_id: EVENT_ID,
  status: "accepted",
  occurred_at: OCCURRED_AT
} as const;

function apiResponse(data: unknown, extra: RecordValue = {}): RecordValue {
  return {
    success: true,
    message: "accepted",
    data,
    error_code: null,
    request_id: "req_000040",
    ...extra
  };
}

function bytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function createHealth() {
  const state = { enforcement: "healthy", audit: "healthy" } as const;
  let audit: "healthy" | "degraded" = state.audit;
  return {
    health: () => ({ enforcement: state.enforcement, audit }),
    markAuditDegraded: () => {
      audit = "degraded";
    }
  };
}

function createClock() {
  let timeout: (() => void) | null = null;
  let scheduledDelay = -1;
  let cancelled = 0;
  return {
    scheduleTimeout(delayMs: number, callback: () => void) {
      scheduledDelay = delayMs;
      timeout = callback;
      return () => {
        cancelled += 1;
        timeout = null;
      };
    },
    fire() {
      const callback = timeout;
      timeout = null;
      callback?.();
    },
    get scheduledDelay() {
      return scheduledDelay;
    },
    get cancelled() {
      return cancelled;
    }
  };
}

function createTransport(
  responseOrError:
    | TransportResponse
    | Error
    | ((input: TransportInput) => Promise<TransportResponse>)
) {
  const calls: TransportInput[] = [];
  return {
    calls,
    async post(input: TransportInput): Promise<TransportResponse> {
      calls.push({ ...input, body: new Uint8Array(input.body) });
      if (typeof responseOrError === "function") return responseOrError(input);
      if (responseOrError instanceof Error) throw responseOrError;
      return responseOrError;
    }
  };
}

function createClient(input: Readonly<{
  transport: Record<string, unknown>;
  health?: ReturnType<typeof createHealth>;
  clock?: ReturnType<typeof createClock>;
}>): { client: RecordValue; health: ReturnType<typeof createHealth>; clock: ReturnType<typeof createClock> } {
  const factory = auditModule.createOpenClawSecurityAuditClient;
  assert.equal(typeof factory, "function", "audit client factory must be exported");
  const health = input.health ?? createHealth();
  const clock = input.clock ?? createClock();
  const client = (factory as Function)({
    endpoint: ENDPOINT,
    bearer_token: TOKEN,
    transport: input.transport,
    markAuditDegraded: health.markAuditDegraded,
    scheduleTimeout: clock.scheduleTimeout
  }) as RecordValue;
  return { client, health, clock };
}

function assertFailed(result: unknown, code: string): void {
  assert.deepEqual(result, { kind: "failed", code });
  assert.equal(JSON.stringify(result).includes(TOKEN), false);
  assert.equal(JSON.stringify(result).includes("raw-private-input"), false);
}

test("REQ-SBX-GENERAL-004 P3-T4 exposes the audit client through the package index", () => {
  assert.equal(typeof auditModule.createOpenClawSecurityAuditClient, "function");
  assert.equal(typeof indexModule.createOpenClawSecurityAuditClient, "function");
});

test("REQ-SBX-GENERAL-004 P3-T4 accepts a 201 response with a content-free request", async () => {
  const transport = createTransport({ status: 201, body: bytes(apiResponse(ACCEPTED_ACK)) });
  const { client, health, clock } = createClient({ transport });

  const result = await (client.append as Function)(REQUEST);

  assert.deepEqual(result, { kind: "accepted", ack: ACCEPTED_ACK });
  assert.deepEqual(health.health(), { enforcement: "healthy", audit: "healthy" });
  assert.equal(clock.scheduledDelay, 1000);
  assert.equal(clock.cancelled, 1);
  assert.equal(transport.calls.length, 1);
  const call = transport.calls[0]!;
  assert.equal(call.url, ENDPOINT);
  assert.equal(call.bearer_token, TOKEN);
  assert.equal(call.signal.aborted, false);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(call.body)), NORMALIZED_REQUEST);
  const serialized = new TextDecoder().decode(call.body);
  for (const secret of [
    "prompt-secret",
    "assistant-secret",
    "tool-secret",
    "outbound-secret",
    "run-secret",
    "session-secret",
    "call-secret",
    "finding-secret",
    "provider-secret",
    "replacement-secret",
    TOKEN
  ]) {
    assert.equal(serialized.includes(secret), false, secret);
  }
});

test("REQ-SBX-GENERAL-004 P3-T4 accepts a 200 replay and preserves the first timestamp", async () => {
  const replayAck = { ...ACCEPTED_ACK, status: "replayed" } as const;
  const transport = createTransport({ status: 200, body: bytes(apiResponse(replayAck)) });
  const { client, health } = createClient({ transport });

  assert.deepEqual(await (client.append as Function)(REQUEST), {
    kind: "accepted",
    ack: replayAck
  });
  assert.deepEqual(health.health(), { enforcement: "healthy", audit: "healthy" });
});

test("REQ-SBX-GENERAL-004 P3-T4 maps every closed HTTP failure without exposing body text", async () => {
  const cases = [
    [401, "audit_unauthorized"],
    [403, "audit_forbidden"],
    [408, "audit_timeout"],
    [413, "audit_payload_too_large"],
    [415, "audit_unsupported_media"],
    [429, "audit_rate_limited"],
    [503, "audit_unavailable"],
    [409, "audit_conflict"],
    [500, "audit_http_error"]
  ] as const;
  for (const [status, code] of cases) {
    const transport = createTransport({
      status,
      body: bytes({ raw_private_input: "raw-private-input" })
    });
    const { client, health } = createClient({ transport });
    assertFailed(await (client.append as Function)(REQUEST), code);
    assert.deepEqual(health.health(), { enforcement: "healthy", audit: "degraded" });
  }
});

test("REQ-SBX-GENERAL-004 P3-T4 aborts exactly at the fixed 1000 ms deadline", async () => {
  const transport = createTransport((input) => new Promise<TransportResponse>((_resolve, reject) => {
    input.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  }));
  const clock = createClock();
  const { client, health } = createClient({ transport, clock });
  const pending = (client.append as Function)(REQUEST) as Promise<unknown>;
  await Promise.resolve();
  clock.fire();
  assertFailed(await pending, "audit_timeout");
  assert.deepEqual(health.health(), { enforcement: "healthy", audit: "degraded" });
  assert.equal(clock.scheduledDelay, 1000);
  assert.equal(clock.cancelled, 1);
  assert.equal(transport.calls[0]?.signal.aborted, true);
});

test("REQ-SBX-GENERAL-004 P3-T4 rejects a late response after the abort deadline", async () => {
  let resolveResponse: ((response: TransportResponse) => void) | null = null;
  const transport = createTransport(() => new Promise<TransportResponse>((resolve) => {
    resolveResponse = resolve;
  }));
  const clock = createClock();
  const { client, health } = createClient({ transport, clock });
  const pending = (client.append as Function)(REQUEST) as Promise<unknown>;
  await Promise.resolve();
  clock.fire();
  const resolver: unknown = resolveResponse;
  assert.equal(typeof resolver, "function");
  (resolver as Function)({ status: 201, body: bytes(apiResponse(ACCEPTED_ACK)) });
  assertFailed(await pending, "audit_timeout");
  assert.deepEqual(health.health(), { enforcement: "healthy", audit: "degraded" });
});

test("REQ-SBX-GENERAL-004 P3-T4 fails closed on transport, decoding, and acknowledgement errors", async () => {
  const cases: readonly [RecordValue | Error, string][] = [
    [new Error("network secret"), "audit_transport_error"],
    [{ status: 201, body: new Uint8Array([0xff]) }, "audit_response_invalid"],
    [{ status: 201, body: bytes({ data: ACCEPTED_ACK }) }, "audit_response_invalid"],
    [{ status: 201, body: bytes(apiResponse(ACCEPTED_ACK, { extra: true })) }, "audit_response_invalid"],
    [{ status: 201, body: bytes(apiResponse({ ...ACCEPTED_ACK, event_id: "audit:00000000-0000-4000-8000-000000000041" })) }, "audit_response_mismatch"],
    [{ status: 201, body: bytes(apiResponse({ ...ACCEPTED_ACK, status: "replayed" })) }, "audit_response_mismatch"],
    [{ status: 200, body: bytes(apiResponse(ACCEPTED_ACK)) }, "audit_response_mismatch"],
    [{ status: 201, body: bytes(apiResponse({ ...ACCEPTED_ACK, occurred_at: "2026-08-07T00:00:00Z" })) }, "audit_response_invalid"]
  ];
  for (const [response, code] of cases) {
    const transport = createTransport(response instanceof Error ? response : response as TransportResponse);
    const { client, health } = createClient({ transport });
    assertFailed(await (client.append as Function)(REQUEST), code);
    assert.deepEqual(health.health(), { enforcement: "healthy", audit: "degraded" });
  }
});

test("REQ-SBX-GENERAL-004 P3-T4 rejects an invalid private request before transport", async () => {
  const transport = createTransport({ status: 201, body: bytes(apiResponse(ACCEPTED_ACK)) });
  const { client, health } = createClient({ transport });

  assertFailed(
    await (client.append as Function)({ ...REQUEST, raw_content: "prompt-secret" }),
    "audit_request_invalid"
  );
  assert.equal(transport.calls.length, 0);
  assert.deepEqual(health.health(), { enforcement: "healthy", audit: "degraded" });
});
