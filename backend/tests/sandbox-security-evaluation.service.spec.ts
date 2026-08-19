import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { normalizeSandboxSecurityRequest } from "../../shared/contracts/sandbox-security-request.ts";
import { normalizeSandboxSecurityDecision } from "../../shared/contracts/sandbox-security.ts";
import type { SandboxSecurityEvaluationRequest } from "../../engines/sandbox/src/security/index.ts";
import type { SandboxSecurityEngineStageObservation } from "../../engines/sandbox/src/security/index.ts";
import type { SandboxSecurityRequest, SandboxSecurityDecision } from "../../shared/types/sandbox-security.ts";
import type { SandboxSecurityAuditEvent } from "../../shared/types/sandbox-security-api.ts";
import type { SandboxSecurityEvaluationStreamEvent } from "../../shared/types/sandbox-security-api.ts";
import * as boundary from "../src/modules/sandbox-security/sandbox-security.module.ts";
import type { SandboxSecurityEvaluationGateway } from "../src/modules/sandbox-security/ports/evaluation.gateway.ts";
import {
  createSandboxSecurityProductionEvaluationGatewayWithPorts,
  type SandboxSecurityProductionEvaluationGatewayPorts
} from "../src/modules/sandbox-security/adapters/production-evaluation.gateway.ts";
import type { SandboxSecurityIdempotencyRepository } from "../src/modules/sandbox-security/ports/idempotency.repository.ts";
import type { SandboxSecurityRuntimePort } from "../src/modules/sandbox-security/ports/runtime.ts";
import type {
  SandboxSecurityAuditProjector,
  SandboxSecurityAuthorizedCapability,
  SandboxSecurityCapabilityAuthenticator,
  SandboxSecurityHmacService,
  SandboxSecurityIdempotencyClaim,
  SandboxSecurityIdempotencyClaimResult,
  SandboxSecurityIdempotencyCompletion,
  SandboxSecurityIdempotencyConcurrencyRejection,
  SandboxSecurityIdempotencyInterruption,
  SandboxSecurityIdempotencyMaintenance,
  SandboxSecurityEvaluationService,
  SandboxSecurityEngineConcurrencyLimiter
} from "../src/modules/sandbox-security/sandbox-security.types.ts";
import { createSandboxSecurityHmacService } from "../src/modules/sandbox-security/hmac.ts";
import { createSandboxSecurityServiceError } from "../src/modules/sandbox-security/sandbox-security.errors.ts";

test("REQ-SBX-GENERAL-003 exposes the evaluation orchestration service factory", () => {
  const value = (boundary as unknown as Record<string, unknown>)
    .createSandboxSecurityEvaluationService;
  assert.equal(typeof value, "function");
});

const FIXED_DEPLOYMENT_KEY = Uint8Array.from(
  { length: 32 },
  (_, index) => index + 1
);

const FIXED_ENGINE_RUNTIME = {
  now: () => "2026-08-05T12:00:00.000Z",
  nextDecisionId: () =>
    "decision:00000000-0000-4000-8000-000000000002",
  monotonicNowMs: () => 1000,
  scheduleTimeout: () => () => {}
};

const FIXED_EVALUATION_REQUEST: SandboxSecurityEvaluationRequest = {
  submission: {
    schema_version: "sandbox-security-request.v1",
    request_id: "request-001",
    stage: "user_input",
    policy_profile_id: "sandbox-security-balanced.v1",
    content_items: [
      {
        source_id: "user-001",
        claimed_source_type: "user_input",
        media_type: "text/plain",
        value: "hello",
        provenance_ref: "source://fixture/user-001"
      }
    ]
  },
  authoritative_context: {
    schema_version: "sandbox-security-authoritative-context.v1",
    evaluation_mode: "simulation",
    stage: "user_input",
    policy_profile_id: "sandbox-security-balanced.v1",
    sources: [
      {
        source_id: "user-001",
        authority_kind: "simulation_observation",
        source_type: "user_input",
        media_type: "text/plain",
        value: "hello",
        provenance_ref: "source://fixture/user-001"
      }
    ]
  }
};

test("REQ-SBX-GENERAL-003 production gateway uses Engine canonical bytes for HMAC fingerprint", async () => {
  assert.equal(
    typeof (boundary as unknown as Record<string, unknown>)
      .createSandboxSecurityProductionEvaluationGateway,
    "function"
  );
  const hmac = createRecordingHmacService(FIXED_DEPLOYMENT_KEY);
  const factory = (boundary as unknown as Record<string, unknown>)
    .createSandboxSecurityProductionEvaluationGateway as (input: Readonly<{
    runtime: typeof FIXED_ENGINE_RUNTIME;
    production_mode: "rule_only";
    hmac: SandboxSecurityHmacService;
  }>) => Promise<SandboxSecurityEvaluationGateway>;
  const gateway = await factory({
    runtime: FIXED_ENGINE_RUNTIME,
    production_mode: "rule_only",
    hmac
  });

  const actual = gateway.fingerprint(FIXED_EVALUATION_REQUEST);
  const capturedCanonicalBytes = hmac.singleCapturedCanonicalCopy();
  const expected = independentlyFingerprintCanonicalBytes(
    FIXED_DEPLOYMENT_KEY,
    capturedCanonicalBytes
  );

  assert.equal(actual, expected);
  assert.notEqual(
    Buffer.from(capturedCanonicalBytes).toString("ascii"),
    '{"a":1}'
  );
  assert.equal(hmac.canonicalPortCalls, 1);
  assert.equal(hmac.retainedCanonicalBytes, false);
});

function makeGatewayPortsFixture(input: Readonly<{
  fingerprint?: string;
  fingerprint_error?: unknown;
  engine_error?: unknown;
  decision?: unknown;
  stage_observations?: readonly Record<string, unknown>[];
}> = {}) {
  const calls: string[] = [];
  const evaluate_signals: (AbortSignal | undefined)[] = [];
  const decision = input.decision ?? FIXED_DECISION;
  const engine = {
    async evaluate(
      _request: SandboxSecurityEvaluationRequest,
      signal?: AbortSignal,
      observer?: (observation: SandboxSecurityEngineStageObservation) => void
    ) {
      calls.push("engine.evaluate");
      evaluate_signals.push(signal);
      if (input.engine_error !== undefined) throw input.engine_error;
      for (const observation of input.stage_observations ?? []) {
        observer?.(observation as SandboxSecurityEngineStageObservation);
      }
      return decision as Readonly<SandboxSecurityDecision>;
    }
  };
  const canonicalFingerprint = {
    fingerprint() {
      calls.push("canonical.fingerprint");
      if (input.fingerprint_error !== undefined) {
        throw input.fingerprint_error;
      }
      return input.fingerprint ?? FINGERPRINT;
    }
  };
  const ports: SandboxSecurityProductionEvaluationGatewayPorts = {
    async create_engine({ mode }) {
      calls.push(`create_engine:${mode}`);
      return engine;
    },
    create_canonical_fingerprint() {
      calls.push("create_canonical_fingerprint");
      return canonicalFingerprint;
    }
  };
  return { ports, calls, evaluate_signals, engine };
}

async function createGatewayWithPorts(
  ports: SandboxSecurityProductionEvaluationGatewayPorts,
  production_mode: "rule_only" | "local" | "local_and_judge" = "rule_only"
) {
  return createSandboxSecurityProductionEvaluationGatewayWithPorts({
    runtime: FIXED_ENGINE_RUNTIME,
    production_mode,
    hmac: createSandboxSecurityHmacService(FIXED_DEPLOYMENT_KEY),
    ports
  });
}

test("REQ-SBX-GENERAL-003 production gateway binds each configured production mode", async () => {
  for (const mode of ["rule_only", "local", "local_and_judge"] as const) {
    const fixture = makeGatewayPortsFixture();
    const gateway = await createGatewayWithPorts(fixture.ports, mode);
    assert.equal(
      gateway.composition_binding,
      `sandbox-security-production-composition.v1:${mode}`
    );
    assert.deepEqual(fixture.calls, [
      `create_engine:${mode}`,
      "create_canonical_fingerprint"
    ]);
  }
});

test("REQ-SBX-GENERAL-003 production gateway converts fingerprint failures to fixed internal errors", async () => {
  const invalid = makeGatewayPortsFixture({ fingerprint: "not-a-fingerprint" });
  const invalidGateway = await createGatewayWithPorts(invalid.ports);
  assert.throws(
    () => invalidGateway.fingerprint(FIXED_EVALUATION_REQUEST),
    (error: any) =>
      error?.code === "SANDBOX_SECURITY_INTERNAL_ERROR" &&
      !String(error?.message).includes("detector") &&
      !String(error?.message).includes("provider")
  );

  const thrown = makeGatewayPortsFixture({
    fingerprint_error: new Error("detector/provider detail")
  });
  const thrownGateway = await createGatewayWithPorts(thrown.ports);
  assert.throws(
    () => thrownGateway.fingerprint(FIXED_EVALUATION_REQUEST),
    (error: any) =>
      error?.code === "SANDBOX_SECURITY_INTERNAL_ERROR" &&
      !String(error?.message).includes("detector") &&
      !String(error?.message).includes("provider")
  );
});

test("REQ-SBX-GENERAL-003 production gateway passes AbortSignal and hides Engine failures", async () => {
  const controller = new AbortController();
  const fixture = makeGatewayPortsFixture({
    engine_error: new Error("provider endpoint and detector detail")
  });
  const gateway = await createGatewayWithPorts(fixture.ports);
  await assert.rejects(
    () => gateway.evaluate(FIXED_EVALUATION_REQUEST, controller.signal),
    (error: any) =>
      error?.code === "SANDBOX_SECURITY_INTERNAL_ERROR" &&
      !String(error?.message).includes("provider") &&
      !String(error?.message).includes("detector")
  );
  assert.equal(fixture.evaluate_signals[0], controller.signal);
});

test("REQ-SBX-GENERAL-003 production gateway preserves a caller abort signal", async () => {
  const controller = new AbortController();
  const fixture = makeGatewayPortsFixture();
  const gateway = await createGatewayWithPorts(fixture.ports);
  controller.abort();

  await gateway.evaluate(FIXED_EVALUATION_REQUEST, controller.signal);

  assert.equal(fixture.evaluate_signals[0], controller.signal);
  assert.equal(fixture.evaluate_signals[0]?.aborted, true);
});

test("REQ-SBX-GENERAL-006 production gateway maps engine observations to exact live stage events", async () => {
  const fixture = makeGatewayPortsFixture({
    stage_observations: [
      {
        stage: "source",
        status: "completed",
        source_count: 1,
        tool_request_present: false,
        elapsed_ms: 0
      },
      {
        stage: "rule",
        status: "no_match",
        detector_id: "detector://sandbox/security/rule/default/v1",
        detector_version: "1.0.0",
        detector_kind: "rule",
        obligation: "profile_required",
        elapsed_ms: 4
      }
    ]
  });
  const gateway = await createGatewayWithPorts(fixture.ports);
  const events: SandboxSecurityEvaluationStreamEvent[] = [];

  await (gateway.evaluate as (...args: any[]) => Promise<unknown>)(
    FIXED_EVALUATION_REQUEST,
    undefined,
    (event: SandboxSecurityEvaluationStreamEvent) => events.push(event)
  );

  assert.deepEqual(
    events.map((event) =>
      event.event_type === "stage"
        ? [event.sequence, event.stage, event.status, event.delivery]
        : []
    ),
    [
      [1, "source", "completed", "live"],
      [2, "rule", "no_match", "live"]
    ]
  );
});

test("REQ-SBX-GENERAL-006 production gateway clamps fractional and over-budget engine elapsed times to the stream contract", async () => {
  // The real engine measures elapsed time with performance.now() and emits
  // fractional milliseconds (e.g. 0.5616...), and a judge slot may legitimately
  // run longer than the stream contract's 60000 ms bound. Both must be clamped
  // to safe integers in 0..60000 instead of failing stage normalization.
  const fixture = makeGatewayPortsFixture({
    stage_observations: [
      {
        stage: "source",
        status: "completed",
        source_count: 3,
        tool_request_present: false,
        elapsed_ms: 0.5616939999999886
      },
      {
        stage: "rule",
        status: "no_match",
        detector_id: "detector://sandbox/security/rule/default/v1",
        detector_version: "1.0.0",
        detector_kind: "rule",
        obligation: "profile_required",
        elapsed_ms: 0.5616939999999886
      },
      {
        stage: "judge",
        status: "matched",
        detector_id: "detector://sandbox/security/judge/default/v1",
        detector_version: "1.0.0",
        detector_kind: "external_judge",
        obligation: "optional_not_selected",
        elapsed_ms: 121000.4
      }
    ]
  });
  const gateway = await createGatewayWithPorts(fixture.ports);
  const events: SandboxSecurityEvaluationStreamEvent[] = [];

  await (gateway.evaluate as (...args: any[]) => Promise<unknown>)(
    FIXED_EVALUATION_REQUEST,
    undefined,
    (event: SandboxSecurityEvaluationStreamEvent) => events.push(event)
  );

  assert.deepEqual(
    events.map((event) =>
      event.event_type === "stage"
        ? [event.stage, event.result.elapsed_ms]
        : []
    ),
    [
      ["source", 1],
      ["rule", 1],
      ["judge", 60000]
    ]
  );
});

test("REQ-SBX-GENERAL-003 production gateway rejects invalid Decisions and defensively normalizes valid Decisions", async () => {
  const invalid = makeGatewayPortsFixture({ decision: { invalid: true } });
  const invalidGateway = await createGatewayWithPorts(invalid.ports);
  await assert.rejects(
    () => invalidGateway.evaluate(FIXED_EVALUATION_REQUEST),
    (error: any) => error?.code === "SANDBOX_SECURITY_INTERNAL_ERROR"
  );

  const sourceDecision = structuredClone(FIXED_DECISION);
  const valid = makeGatewayPortsFixture({ decision: sourceDecision });
  const validGateway = await createGatewayWithPorts(valid.ports);
  const result = await validGateway.evaluate(FIXED_EVALUATION_REQUEST);
  assert.deepEqual(result, FIXED_DECISION);
  result.findings.push({} as never);
  assert.equal(sourceDecision.findings.length, 0);
});

function createRecordingHmacService(
  key: Uint8Array
): SandboxSecurityHmacService &
  Readonly<{
    canonicalPortCalls: number;
    retainedCanonicalBytes: false;
    singleCapturedCanonicalCopy(): Uint8Array;
  }> {
  const delegate = createSandboxSecurityHmacService(key);
  let canonicalPortCalls = 0;
  let capturedCanonicalCopy: Uint8Array | null = null;
  return {
    ...delegate,
    get canonicalPortCalls() {
      return canonicalPortCalls;
    },
    retainedCanonicalBytes: false,
    singleCapturedCanonicalCopy() {
      if (canonicalPortCalls !== 1 || capturedCanonicalCopy === null) {
        throw new Error("expected exactly one canonical port call");
      }
      return Uint8Array.from(capturedCanonicalCopy);
    },
    fingerprintCanonicalBytes(canonicalBytes) {
      canonicalPortCalls += 1;
      capturedCanonicalCopy = Uint8Array.from(canonicalBytes);
      return delegate.fingerprintCanonicalBytes(canonicalBytes);
    }
  };
}

function independentlyFingerprintCanonicalBytes(
  key: Uint8Array,
  canonicalBytes: Uint8Array
): `hmac-sha256:${string}` {
  const prefix = Buffer.from("sandbox-security-hmac-frame.v1", "ascii");
  const domain = Buffer.from(
    "sandbox-security-canonical-fingerprint.v1",
    "ascii"
  );
  const domainLength = Buffer.alloc(2);
  domainLength.writeUInt16BE(domain.byteLength);
  const fieldLength = Buffer.alloc(4);
  fieldLength.writeUInt32BE(canonicalBytes.byteLength);
  const frame = Buffer.concat([
    prefix,
    Buffer.from([0]),
    domainLength,
    domain,
    Buffer.from([1]),
    fieldLength,
    Buffer.from(canonicalBytes)
  ]);
  return `hmac-sha256:${createHmac("sha256", key).update(frame).digest("hex")}`;
}

const NOW = "2026-08-05T12:00:00.000Z";
const EXPIRES = "2026-08-06T12:00:00.000Z";
const CAPABILITY_ID = "capability:00000000-0000-4000-8000-000000000001";
const SCOPE_A =
  "authscope:hmac-sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SCOPE_B =
  "authscope:hmac-sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const KEY_HMAC =
  "idem-key:hmac-sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const FINGERPRINT =
  "hmac-sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
const COMPOSITION = "sandbox-security-production-composition.v1:rule_only";

const CAPABILITY_A = {
  capability_id: CAPABILITY_ID,
  subject_id: "subject-a",
  authorization_scope_id: SCOPE_A,
  scopes: ["sandbox_security:evaluate"] as const,
  allowed_stages: ["user_input"] as const,
  allowed_policy_profile_ids: ["sandbox-security-balanced.v1"] as const,
  issued_at: "2026-08-05T00:00:00.000Z",
  expires_at: EXPIRES
} satisfies SandboxSecurityAuthorizedCapability;

const SUBMISSION = normalizeSandboxSecurityRequest({
  schema_version: "sandbox-security-request.v1",
  request_id: "request-001",
  stage: "user_input",
  policy_profile_id: "sandbox-security-balanced.v1",
  content_items: [
    {
      source_id: "user-001",
      claimed_source_type: "user_input",
      media_type: "text/plain",
      value: "hello",
      provenance_ref: "source://fixture/user-001"
    }
  ]
});
assert.ok(SUBMISSION);

const FIXED_DECISION: SandboxSecurityDecision = {
  schema_version: "sandbox-security-decision.v1",
  decision_id: "decision:00000000-0000-4000-8000-000000000001",
  request_id: "request-001",
  evaluation_mode: "simulation",
  stage: "user_input",
  policy_profile_id: "sandbox-security-balanced.v1",
  verdict: "no_detected_risk",
  action: "allow",
  risk_level: "info",
  findings: [],
  detector_runs: [],
  evidence_refs: [],
  created_at: NOW
};

function getFactory<T extends (...args: any[]) => any>(name: string): T {
  const value = (boundary as unknown as Record<string, unknown>)[name];
  assert.equal(typeof value, "function", `module must export ${name}`);
  return value as T;
}

function makeAuditProjector(): SandboxSecurityAuditProjector {
  return getFactory<() => SandboxSecurityAuditProjector>(
    "createSandboxSecurityAuditProjector"
  )();
}

function makeEventId(counter: number): string {
  return `audit:00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`;
}

function makeEvaluationFixture(input: Readonly<{
  claim?: SandboxSecurityIdempotencyClaimResult;
  replay_decision?: SandboxSecurityDecision;
  gateway_decision?: SandboxSecurityDecision;
  gateway_error?: unknown;
  fingerprint?: string;
  fingerprint_error?: unknown;
  hmac_error?: unknown;
  claim_error?: unknown;
  completion_error?: unknown;
  interruption_error?: unknown;
  concurrency_rejection_error?: unknown;
  maintenance_error?: unknown;
  slot_available?: boolean;
  try_acquire_error?: unknown;
  release_error?: unknown;
  authorization_monotonic_advance?: number;
  production_scope?: string;
  authorizer_error?: unknown;
  stage_events?: readonly SandboxSecurityEvaluationStreamEvent[];
}> = {}) {
  const state = {
    calls: [] as string[],
    claim_inputs: [] as SandboxSecurityIdempotencyClaim[],
    completion_inputs: [] as SandboxSecurityIdempotencyCompletion[],
    interruption_inputs: [] as SandboxSecurityIdempotencyInterruption[],
    concurrency_inputs: [] as SandboxSecurityIdempotencyConcurrencyRejection[],
    replay_inputs: [] as unknown[],
    rejection_inputs: [] as unknown[],
    fingerprint_requests: [] as SandboxSecurityEvaluationRequest[],
    evaluate_requests: [] as SandboxSecurityEvaluationRequest[],
    evaluate_signals: [] as (AbortSignal | undefined)[],
    read_events: [] as SandboxSecurityAuditEvent[],
    now_calls: 0,
    audit_event_counter: 10,
    claim: input.claim ?? { kind: "claimed" as const },
    replay_decision: input.replay_decision ?? FIXED_DECISION,
    gateway_decision: input.gateway_decision ?? FIXED_DECISION,
    gateway_error: input.gateway_error,
    fingerprint: input.fingerprint ?? FINGERPRINT,
    fingerprint_error: input.fingerprint_error,
    hmac_error: input.hmac_error,
    claim_error: input.claim_error,
    completion_error: input.completion_error,
    interruption_error: input.interruption_error,
    concurrency_rejection_error: input.concurrency_rejection_error,
    maintenance_error: input.maintenance_error,
    slot_available: input.slot_available ?? true,
    try_acquire_error: input.try_acquire_error,
    release_error: input.release_error,
    authorization_monotonic_advance: input.authorization_monotonic_advance ?? 0,
    production_scope: input.production_scope ?? SCOPE_A,
    authorizer_error: input.authorizer_error
  };

  const projectorBase = makeAuditProjector();
  const projector: SandboxSecurityAuditProjector = {
    ...projectorBase,
    evaluationCompleted(value) {
      state.calls.push("projector.evaluationCompleted");
      return projectorBase.evaluationCompleted(value);
    },
    evaluationReplayed(value) {
      state.calls.push("projector.evaluationReplayed");
      state.replay_inputs.push(value);
      return projectorBase.evaluationReplayed(value);
    },
    evaluationInterrupted(value) {
      state.calls.push("projector.evaluationInterrupted");
      return projectorBase.evaluationInterrupted(value);
    },
    requestRejected(value) {
      state.calls.push(`projector.requestRejected:${value.rejection_code}`);
      return projectorBase.requestRejected(value);
    }
  };

  const baseHmac = createSandboxSecurityHmacService(
    Uint8Array.from({ length: 32 }, (_, index) => index + 1)
  );
  const hmac: SandboxSecurityHmacService = {
    ...baseHmac,
    idempotencyKeyHmac(rawKey) {
      state.calls.push("hmac.idempotencyKeyHmac");
      if (state.hmac_error !== undefined) throw state.hmac_error;
      assert.equal(rawKey, "0123456789abcdef");
      return KEY_HMAC;
    }
  };

  const authorizer: SandboxSecurityCapabilityAuthenticator = {
    authenticateToken() {
      throw new Error("unsupported");
    },
    requireScope() {
      throw new Error("unsupported");
    },
    requireEvaluationGrant() {
      state.calls.push("authorizer.requireEvaluationGrant");
      monotonic += state.authorization_monotonic_advance;
      if (state.authorizer_error !== undefined) throw state.authorizer_error;
    },
    authenticateAdministrator() {
      throw new Error("unsupported");
    }
  };

  const gateway: SandboxSecurityEvaluationGateway = {
    composition_binding: COMPOSITION,
    fingerprint(request) {
      state.calls.push("gateway.fingerprint");
      state.fingerprint_requests.push(request);
      if (state.fingerprint_error !== undefined) throw state.fingerprint_error;
      return state.fingerprint;
    },
    async evaluate(request, signal, onStage) {
      state.calls.push("gateway.evaluate");
      state.evaluate_requests.push(request);
      state.evaluate_signals.push(signal);
      if (state.gateway_error !== undefined) throw state.gateway_error;
      for (const event of input.stage_events ?? []) onStage?.(event as never);
      return structuredClone(state.gateway_decision);
    }
  };

  const repository: SandboxSecurityIdempotencyRepository = {
    claim() {
      throw new Error("maintenance.claim owns claim calls");
    },
    complete(value) {
      state.calls.push("repository.complete");
      state.completion_inputs.push(value);
      if (state.completion_error !== undefined) throw state.completion_error;
    },
    interrupt(value) {
      state.calls.push("repository.interrupt");
      state.interruption_inputs.push(value);
      if (state.interruption_error !== undefined) throw state.interruption_error;
    },
    rejectConcurrency(value) {
      state.calls.push("repository.rejectConcurrency");
      state.concurrency_inputs.push(value);
      state.rejection_inputs.push(value.rejection_event);
      if (state.concurrency_rejection_error !== undefined) {
        throw state.concurrency_rejection_error;
      }
    },
    recoverInProgress() {
      throw new Error("unsupported");
    },
    cleanupExpired() {
      throw new Error("unsupported");
    }
  };

  const maintenance: SandboxSecurityIdempotencyMaintenance = {
    state() {
      return "healthy";
    },
    assertEvaluationAvailable() {},
    claim(value) {
      state.calls.push("maintenance.claim");
      state.claim_inputs.push(value);
      if (state.maintenance_error !== undefined) throw state.maintenance_error;
      if (state.claim.kind === "completed") {
        value.create_replayed_event(state.replay_decision);
      }
      return state.claim;
    },
    runHourlyCleanup() {},
    runPurgePreCleanup() {},
    close() {}
  };

  const concurrency = {
    tryAcquire() {
      state.calls.push("concurrency.tryAcquire");
      if (state.try_acquire_error !== undefined) throw state.try_acquire_error;
      if (!state.slot_available) return null;
      return () => {
        state.calls.push("concurrency.release");
        if (state.release_error !== undefined) throw state.release_error;
      };
    },
    activeCount() {
      return state.slot_available ? 1 : 0;
    }
  };

  let monotonic = 1000;
  const runtime: SandboxSecurityRuntimePort = {
    now() {
      state.now_calls += 1;
      return NOW;
    },
    monotonicNowMs() {
      monotonic += 10;
      return monotonic;
    },
    randomBytes(length) {
      return new Uint8Array(length);
    },
    nextCapabilityId() {
      return CAPABILITY_ID;
    },
    nextAuditEventId() {
      state.audit_event_counter += 1;
      return makeEventId(state.audit_event_counter);
    },
    nextDecisionId() {
      return "decision:00000000-0000-4000-8000-000000000002";
    },
    scheduleTimeout() {
      return () => {};
    },
    scheduleInterval() {
      return { unref() {}, cancel() {} };
    }
  };

  const create = getFactory<(
    value: Readonly<{
      authorizer: SandboxSecurityCapabilityAuthenticator;
      hmac: SandboxSecurityHmacService;
      idempotency_repository: SandboxSecurityIdempotencyRepository;
      maintenance: SandboxSecurityIdempotencyMaintenance;
      concurrency: SandboxSecurityEngineConcurrencyLimiter;
      gateway: SandboxSecurityEvaluationGateway;
      runtime: SandboxSecurityRuntimePort;
      audit_projector: SandboxSecurityAuditProjector;
    }>
  ) => SandboxSecurityEvaluationService>("createSandboxSecurityEvaluationService");
  const service = create({
    authorizer,
    hmac,
    idempotency_repository: repository,
    maintenance,
    concurrency,
    gateway,
    runtime,
    audit_projector: projector
  });
  return { service, state, repository, maintenance, gateway, runtime, hmac, projector };
}

function evaluateInput(
  capability: SandboxSecurityAuthorizedCapability = CAPABILITY_A,
  signal?: AbortSignal
) {
  return {
    capability,
    idempotency_key: "0123456789abcdef",
    submission: SUBMISSION as SandboxSecurityRequest,
    ...(signal === undefined ? {} : { signal })
  };
}

function hasError(code: string, extra: Partial<Record<string, unknown>> = {}) {
  return (error: any) =>
    error?.code === code && Object.entries(extra).every(([key, value]) => error?.[key] === value);
}

test("REQ-SBX-GENERAL-003 fingerprints claims leases evaluates releases and completes in order", async () => {
  const fixture = makeEvaluationFixture({ authorization_monotonic_advance: 1000 });
  const decision = await fixture.service.evaluate(evaluateInput());
  assert.deepEqual(decision, FIXED_DECISION);
  assert.deepEqual(fixture.state.calls, [
    "authorizer.requireEvaluationGrant",
    "gateway.fingerprint",
    "hmac.idempotencyKeyHmac",
    "projector.requestRejected:idempotency_in_progress",
    "projector.requestRejected:idempotency_conflict",
    "maintenance.claim",
    "concurrency.tryAcquire",
    "gateway.evaluate",
    "concurrency.release",
    "projector.evaluationCompleted",
    "repository.complete"
  ]);
  const authority = fixture.state.fingerprint_requests[0]?.authoritative_context;
  assert.equal(authority?.evaluation_mode, "simulation");
  assert.equal(authority?.sources[0]?.authority_kind, "simulation_observation");
  assert.equal(fixture.state.claim_inputs.length, 1);
  const claim = fixture.state.claim_inputs[0]!;
  assert.equal(claim.authorization_scope_id, SCOPE_A);
  assert.equal(claim.idempotency_key_hmac, KEY_HMAC);
  assert.equal(claim.request_fingerprint, FINGERPRINT);
  assert.equal(claim.capability_id, CAPABILITY_ID);
  assert.equal(claim.subject_id, "subject-a");
  assert.equal(claim.request_id, "request-001");
  assert.equal(claim.stage, "user_input");
  assert.equal(claim.policy_profile_id, "sandbox-security-balanced.v1");
  assert.equal(claim.composition_binding, COMPOSITION);
  assert.equal(claim.now, NOW);
  assert.equal(claim.expires_at, EXPIRES);
  assert.doesNotMatch(JSON.stringify(claim), /0123456789abcdef/);
  assert.equal(fixture.state.completion_inputs[0]?.decision.request_id, "request-001");
  const completedEvent = fixture.state.completion_inputs[0]?.completed_event as
    | (SandboxSecurityAuditEvent & {
        event_type: "evaluation_completed";
        elapsed_ms: number;
      })
    | undefined;
  assert.ok(completedEvent);
  assert.equal(Number.isSafeInteger(completedEvent.elapsed_ms), true);
  assert.equal(completedEvent.elapsed_ms >= 1000, true);
});

test("REQ-SBX-GENERAL-003 replays a completed decision without a slot or Engine call", async () => {
  const fixture = makeEvaluationFixture({ claim: { kind: "completed", response: FIXED_DECISION } });
  const result = await fixture.service.evaluate(evaluateInput());
  assert.deepEqual(result, FIXED_DECISION);
  assert.equal(fixture.state.calls.includes("concurrency.tryAcquire"), false);
  assert.equal(fixture.state.calls.includes("gateway.evaluate"), false);
  assert.equal(fixture.state.replay_inputs.length, 1);
  const replay = fixture.state.replay_inputs[0] as any;
  assert.equal(replay.subject_id, "subject-a");
  assert.equal(replay.authorization_scope_id, SCOPE_A);
  assert.equal(replay.capability_id, CAPABILITY_ID);
  assert.equal(replay.decision.request_id, "request-001");
  result.findings.push({} as never);
  assert.equal(FIXED_DECISION.findings.length, 0);
});

test("REQ-SBX-GENERAL-006 forwards live stages before completion persistence", async () => {
  const sourceEvent = {
    schema_version: "sandbox-security-evaluation-stream.v1",
    event_type: "stage",
    request_id: "request-001",
    sequence: 1,
    stage: "source",
    status: "completed",
    delivery: "live",
    result: { source_count: 1, tool_request_present: false, elapsed_ms: 0 }
  } as const satisfies SandboxSecurityEvaluationStreamEvent;
  const fixture = makeEvaluationFixture({ stage_events: [sourceEvent] });
  const order: string[] = [];
  const originalComplete = fixture.repository.complete.bind(fixture.repository);
  fixture.repository.complete = (value) => {
    order.push("persisted");
    originalComplete(value);
  };

  await fixture.service.evaluate({
    ...evaluateInput(),
    on_stage(event: SandboxSecurityEvaluationStreamEvent) {
      order.push(`stage:${event.event_type === "stage" ? event.stage : "invalid"}`);
    }
  } as never);

  assert.deepEqual(order, ["stage:source", "persisted"]);
});

test("REQ-SBX-GENERAL-006 synthesizes four replayed stages without an Engine call", async () => {
  const replayDecision: SandboxSecurityDecision = {
    ...FIXED_DECISION,
    detector_runs: [
      {
        detector_id: "detector://sandbox/security/rule/default/v1",
        detector_version: "1.0.0",
        detector_kind: "rule",
        obligation: "profile_required",
        elapsed_ms: 2,
        status: "no_match",
        finding_ids: []
      },
      {
        detector_id: "detector://sandbox/security/local/default/v1",
        detector_version: "1.0.0",
        detector_kind: "local_model",
        obligation: "optional_not_selected",
        elapsed_ms: 0,
        status: "skipped",
        skip_reason: "optional_not_configured"
      },
      {
        detector_id: "detector://sandbox/security/judge/default/v1",
        detector_version: "1.0.0",
        detector_kind: "external_judge",
        obligation: "optional_not_selected",
        elapsed_ms: 0,
        status: "skipped",
        skip_reason: "routing_not_selected"
      }
    ]
  };
  const fixture = makeEvaluationFixture({
    claim: { kind: "completed", response: replayDecision },
    replay_decision: replayDecision
  });
  const events: SandboxSecurityEvaluationStreamEvent[] = [];

  await fixture.service.evaluate({
    ...evaluateInput(),
    on_stage: (event: SandboxSecurityEvaluationStreamEvent) => events.push(event)
  } as never);

  assert.equal(fixture.state.calls.includes("gateway.evaluate"), false);
  assert.deepEqual(
    events.map((event) =>
      event.event_type === "stage"
        ? [event.sequence, event.stage, event.status, event.delivery]
        : []
    ),
    [
      [1, "source", "completed", "replayed"],
      [2, "rule", "no_match", "replayed"],
      [3, "model", "skipped", "replayed"],
      [4, "judge", "skipped", "replayed"]
    ]
  );
});

test("REQ-SBX-GENERAL-006 replayed stages clamp fractional and over-budget detector elapsed times to the stream contract", async () => {
  // A cached decision may carry fractional elapsed milliseconds (real engine
  // measurement) or a judge run longer than the stream contract's 60000 ms
  // bound; both are valid inside the decision but must be clamped when the
  // replay path synthesizes stage events.
  const replayDecision: SandboxSecurityDecision = {
    ...FIXED_DECISION,
    detector_runs: [
      {
        detector_id: "detector://sandbox/security/rule/default/v1",
        detector_version: "1.0.0",
        detector_kind: "rule",
        obligation: "profile_required",
        elapsed_ms: 0.5616939999999886,
        status: "no_match",
        finding_ids: []
      },
      {
        detector_id: "detector://sandbox/security/local/default/v1",
        detector_version: "1.0.0",
        detector_kind: "local_model",
        obligation: "optional_not_selected",
        elapsed_ms: 0,
        status: "skipped",
        skip_reason: "optional_not_configured"
      },
      {
        detector_id: "detector://sandbox/security/judge/default/v1",
        detector_version: "1.0.0",
        detector_kind: "external_judge",
        obligation: "optional_not_selected",
        elapsed_ms: 121000,
        status: "skipped",
        skip_reason: "routing_not_selected"
      }
    ]
  };
  const fixture = makeEvaluationFixture({
    claim: { kind: "completed", response: replayDecision },
    replay_decision: replayDecision
  });
  const events: SandboxSecurityEvaluationStreamEvent[] = [];

  await fixture.service.evaluate({
    ...evaluateInput(),
    on_stage: (event: SandboxSecurityEvaluationStreamEvent) => events.push(event)
  } as never);

  assert.deepEqual(
    events.map((event) =>
      event.event_type === "stage"
        ? [event.stage, event.result.elapsed_ms]
        : []
    ),
    [
      ["source", 0],
      ["rule", 1],
      ["model", 0],
      ["judge", 60000]
    ]
  );
});

test("REQ-SBX-GENERAL-003 rejects in-progress and fingerprint-conflict claims without a slot", async () => {
  for (const [kind, code, rejection] of [
    ["in_progress", "SANDBOX_SECURITY_IDEMPOTENCY_IN_PROGRESS", "idempotency_in_progress"],
    ["fingerprint_conflict", "SANDBOX_SECURITY_IDEMPOTENCY_CONFLICT", "idempotency_conflict"]
  ] as const) {
    const fixture = makeEvaluationFixture({ claim: { kind } });
    await assert.rejects(
      () => fixture.service.evaluate(evaluateInput()),
      hasError(code, {
        audit_rejection_code: rejection,
        ...(kind === "in_progress" ? { retry_after_seconds: 1 } : {})
      })
    );
    assert.equal(fixture.state.calls.includes("concurrency.tryAcquire"), false);
    assert.equal(fixture.state.calls.includes("gateway.evaluate"), false);
  }
});

test("REQ-SBX-GENERAL-003 keeps idempotency claims separated by authorization scope", async () => {
  const first = makeEvaluationFixture();
  await first.service.evaluate(evaluateInput());
  const second = makeEvaluationFixture();
  await second.service.evaluate(evaluateInput({
    ...CAPABILITY_A,
    authorization_scope_id: SCOPE_B
  }));
  assert.equal(first.state.claim_inputs[0]?.authorization_scope_id, SCOPE_A);
  assert.equal(second.state.claim_inputs[0]?.authorization_scope_id, SCOPE_B);
});

test("REQ-SBX-GENERAL-003 fails before claim when fingerprinting or HMAC fails", async () => {
  const fingerprintFailure = makeEvaluationFixture({
    fingerprint_error: new Error("fingerprint failed")
  });
  await assert.rejects(
    () => fingerprintFailure.service.evaluate(evaluateInput()),
    hasError("SANDBOX_SECURITY_INTERNAL_ERROR")
  );
  assert.equal(fingerprintFailure.state.calls.includes("maintenance.claim"), false);

  const hmacFailure = makeEvaluationFixture({ hmac_error: new Error("HMAC failed") });
  await assert.rejects(
    () => hmacFailure.service.evaluate(evaluateInput()),
    hasError("SANDBOX_SECURITY_INTERNAL_ERROR")
  );
  assert.equal(hmacFailure.state.calls.includes("maintenance.claim"), false);
});

test("REQ-SBX-GENERAL-003 rejects a claimed request when no Engine slot is available", async () => {
  const fixture = makeEvaluationFixture({ slot_available: false });
  await assert.rejects(
    () => fixture.service.evaluate(evaluateInput()),
    hasError("SANDBOX_SECURITY_CONCURRENCY_LIMITED", {
      audit_rejection_code: "concurrency_limited",
      retry_after_seconds: 1
    })
  );
  assert.equal(fixture.state.calls.includes("gateway.evaluate"), false);
  assert.equal(fixture.state.concurrency_inputs.length, 1);
  assert.equal(fixture.state.concurrency_inputs[0]?.rejection_event.event_type, "request_rejected");
});

test("REQ-SBX-GENERAL-003 interrupts a claim when concurrency rejection persistence fails", async () => {
  const fixture = makeEvaluationFixture({
    slot_available: false,
    concurrency_rejection_error: new Error("reject failed")
  });
  await assert.rejects(
    () => fixture.service.evaluate(evaluateInput()),
    hasError("SANDBOX_SECURITY_INTERNAL_ERROR")
  );
  assert.equal(fixture.state.interruption_inputs.length, 1);
  assert.equal(fixture.state.calls.includes("gateway.evaluate"), false);
});

test("REQ-SBX-GENERAL-003 releases the Engine slot on failure and records interruption", async () => {
  const fixture = makeEvaluationFixture({ gateway_error: new Error("engine failed") });
  await assert.rejects(
    () => fixture.service.evaluate(evaluateInput()),
    hasError("SANDBOX_SECURITY_INTERNAL_ERROR")
  );
  assert.deepEqual(fixture.state.interruption_inputs.map((input) => input.interrupted_event.event_type), [
    "evaluation_interrupted"
  ]);
  assert.equal(
    (fixture.state.interruption_inputs[0]?.interrupted_event as Extract<
      SandboxSecurityAuditEvent,
      { event_type: "evaluation_interrupted" }
    >).interruption_code,
    "engine_error"
  );
  assert.equal(
    fixture.state.calls.indexOf("concurrency.release") <
      fixture.state.calls.indexOf("repository.interrupt"),
    true
  );
});

test("REQ-SBX-GENERAL-003 converges a slot-acquisition failure to interruption and internal error", async () => {
  const fixture = makeEvaluationFixture({ try_acquire_error: new Error("limiter failed") });
  await assert.rejects(
    () => fixture.service.evaluate(evaluateInput()),
    hasError("SANDBOX_SECURITY_INTERNAL_ERROR")
  );
  assert.equal(fixture.state.calls.includes("gateway.evaluate"), false);
  assert.equal(fixture.state.interruption_inputs.length, 1);
  assert.equal(
    (fixture.state.interruption_inputs[0]?.interrupted_event as Extract<
      SandboxSecurityAuditEvent,
      { event_type: "evaluation_interrupted" }
    >).interruption_code,
    "persistence_error"
  );
});

test("REQ-SBX-GENERAL-003 treats a throwing slot release as an internal interruption", async () => {
  const fixture = makeEvaluationFixture({ release_error: new Error("release failed") });
  await assert.rejects(
    () => fixture.service.evaluate(evaluateInput()),
    hasError("SANDBOX_SECURITY_INTERNAL_ERROR")
  );
  assert.equal(fixture.state.calls.includes("repository.complete"), false);
  assert.equal(fixture.state.interruption_inputs.length, 1);
  assert.equal(
    (fixture.state.interruption_inputs[0]?.interrupted_event as Extract<
      SandboxSecurityAuditEvent,
      { event_type: "evaluation_interrupted" }
    >).interruption_code,
    "persistence_error"
  );
});

test("REQ-SBX-GENERAL-003 propagates the caller AbortSignal to the gateway", async () => {
  const fixture = makeEvaluationFixture();
  const controller = new AbortController();
  await fixture.service.evaluate(evaluateInput(CAPABILITY_A, controller.signal));
  assert.equal(fixture.state.evaluate_signals[0], controller.signal);
});

test("REQ-SBX-GENERAL-003 returns no decision when completion persistence fails", async () => {
  const fixture = makeEvaluationFixture({ completion_error: new Error("complete failed") });
  await assert.rejects(
    () => fixture.service.evaluate(evaluateInput()),
    hasError("SANDBOX_SECURITY_INTERNAL_ERROR")
  );
  assert.equal(
    (fixture.state.interruption_inputs[0]?.interrupted_event as Extract<
      SandboxSecurityAuditEvent,
      { event_type: "evaluation_interrupted" }
    >).interruption_code,
    "persistence_error"
  );
  assert.equal(
    fixture.state.calls.indexOf("concurrency.release") <
      fixture.state.calls.indexOf("repository.complete"),
    true
  );
});

test("REQ-SBX-GENERAL-003 treats invalid Engine and cached decisions as internal", async () => {
  const invalidEngine = makeEvaluationFixture({ gateway_decision: { invalid: true } as never });
  await assert.rejects(
    () => invalidEngine.service.evaluate(evaluateInput()),
    hasError("SANDBOX_SECURITY_INTERNAL_ERROR")
  );
  assert.equal(
    (invalidEngine.state.interruption_inputs[0]?.interrupted_event as Extract<
      SandboxSecurityAuditEvent,
      { event_type: "evaluation_interrupted" }
    >).interruption_code,
    "engine_error"
  );

  const invalidCached = makeEvaluationFixture({
    claim: { kind: "completed", response: FIXED_DECISION },
    replay_decision: { invalid: true } as never
  });
  await assert.rejects(
    () => invalidCached.service.evaluate(evaluateInput()),
    hasError("SANDBOX_SECURITY_INTERNAL_ERROR")
  );
  assert.equal(invalidCached.state.calls.includes("concurrency.tryAcquire"), false);

  const wrongMode = makeEvaluationFixture({
    claim: { kind: "completed", response: FIXED_DECISION },
    replay_decision: {
      ...FIXED_DECISION,
      evaluation_mode: "enforcement"
    } as never
  });
  await assert.rejects(
    () => wrongMode.service.evaluate(evaluateInput()),
    hasError("SANDBOX_SECURITY_INTERNAL_ERROR")
  );
  assert.equal(wrongMode.state.replay_inputs.length, 0);
  assert.equal(wrongMode.state.calls.includes("concurrency.tryAcquire"), false);
});

test("REQ-SBX-GENERAL-003 preserves maintenance storage-unavailable claim failures", async () => {
  const storageUnavailable = createSandboxSecurityServiceError({
    code: "SANDBOX_SECURITY_STORAGE_UNAVAILABLE",
    audit_rejection_code: "storage_unavailable"
  });
  const fixture = makeEvaluationFixture({ maintenance_error: storageUnavailable });
  await assert.rejects(
    () => fixture.service.evaluate(evaluateInput()),
    hasError("SANDBOX_SECURITY_STORAGE_UNAVAILABLE", {
      audit_rejection_code: "storage_unavailable",
      retry_after_seconds: 60
    })
  );
  assert.equal(fixture.state.calls.includes("gateway.evaluate"), false);
});
