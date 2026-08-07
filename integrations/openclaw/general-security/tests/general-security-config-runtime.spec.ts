import assert from "node:assert/strict";
import test from "node:test";

const CONFIG_URL = new URL("../src/general-security/config.ts", import.meta.url);
const RUNTIME_URL = new URL("../src/general-security/runtime.ts", import.meta.url);

async function importFeatureModule(url: URL): Promise<Record<string, unknown>> {
  try {
    return (await import(url.href)) as Record<string, unknown>;
  } catch (error: unknown) {
    const details = error as { code?: unknown; url?: unknown };
    if (
      details.code === "ERR_MODULE_NOT_FOUND" &&
      String(details.url ?? "") === url.href
    ) {
      return {};
    }
    throw error;
  }
}

const configModule = await importFeatureModule(CONFIG_URL);
const runtimeModule = await importFeatureModule(RUNTIME_URL);
const indexModule = (await import("../src/index.ts")) as Record<string, unknown>;

const LOOPBACK_ORIGIN = "http://127.0.0.1:43101";
const AUDIT_PATH = "/internal/sandbox/security/enforcement-events";
const VALID_TOKEN = `sbxcap_v1.${"a".repeat(43)}`;
const VALID_REQUEST_ID =
  "request:00000000-0000-4000-8000-000000000001";

const BASE_CONFIG = Object.freeze({
  policyProfileId: "sandbox-security-balanced.v1",
  productionMode: "rule_only",
  auditEndpoint: `${LOOPBACK_ORIGIN}${AUDIT_PATH}`,
  auditCapabilityToken: VALID_TOKEN
});

function normalizeConfig(
  value: unknown,
  internalAuditOrigins: readonly string[] = [LOOPBACK_ORIGIN]
): unknown {
  const normalize = configModule.normalizeOpenClawSecurityConfig;
  assert.equal(typeof normalize, "function", "config normalizer must be exported");
  return (normalize as Function)(value, { internalAuditOrigins });
}

function assertDeeplyFrozen(value: unknown, seen = new WeakSet<object>()): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && "value" in descriptor) {
      assertDeeplyFrozen(descriptor.value, seen);
    }
  }
}

function assertInvalidConfig(value: unknown, origins = [LOOPBACK_ORIGIN]): void {
  assert.throws(
    () => normalizeConfig(value, origins),
    (error: unknown) =>
      error instanceof Error &&
      error.name === "openclaw_security_config_invalid"
  );
}

function makeEvaluationRequest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const submission = {
    schema_version: "sandbox-security-request.v1",
    request_id: VALID_REQUEST_ID,
    stage: "user_input",
    policy_profile_id: "sandbox-security-balanced.v1",
    content_items: [
      {
        source_id: "source-1",
        claimed_source_type: "user_input",
        media_type: "text/plain",
        value: "opaque input",
        provenance_ref: "provenance-1"
      }
    ]
  };
  const authoritativeContext = {
    schema_version: "sandbox-security-authoritative-context.v1",
    evaluation_mode: "enforcement",
    stage: "user_input",
    policy_profile_id: "sandbox-security-balanced.v1",
    sources: [
      {
        source_id: "source-1",
        authority_kind: "integration_observation",
        source_type: "user_input",
        media_type: "text/plain",
        value: "opaque input",
        provenance_ref: "provenance-1"
      }
    ]
  };
  return {
    submission: { ...submission, ...(overrides.submission as object | undefined) },
    authoritative_context: {
      ...authoritativeContext,
      ...(overrides.authoritative_context as object | undefined)
    }
  };
}

function makeDecision(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: "sandbox-security-decision.v1",
    decision_id: "decision:0001",
    request_id: VALID_REQUEST_ID,
    evaluation_mode: "enforcement",
    stage: "user_input",
    policy_profile_id: "sandbox-security-balanced.v1",
    verdict: "no_detected_risk",
    action: "allow",
    risk_level: "info",
    findings: [],
    detector_runs: [],
    evidence_refs: [],
    created_at: "2026-08-07T00:00:00.000Z",
    ...overrides
  };
}

type TimerHandle = {
  delayMs: number;
  callback: () => void;
  cancelled: boolean;
};

function makeRuntimePorts(overrides: Record<string, unknown> = {}): {
  timers: TimerHandle[];
  ports: Record<string, unknown>;
} {
  const timers: TimerHandle[] = [];
  const ports = {
    internalAuditOrigins: [LOOPBACK_ORIGIN],
    nextEvaluationRequestId: () => VALID_REQUEST_ID,
    now: () => "2026-08-07T00:00:00.000Z",
    nextDecisionId: () => "decision:runtime-0001",
    monotonicNowMs: () => 0,
    scheduleTimeout: (delayMs: number, callback: () => void) => {
      const handle: TimerHandle = { delayMs, callback, cancelled: false };
      timers.push(handle);
      return () => {
        handle.cancelled = true;
      };
    },
    ...overrides
  };
  return { timers, ports };
}

function runtimeFactory(): Function {
  const factory = runtimeModule.createOpenClawSecurityRuntime;
  assert.equal(typeof factory, "function", "runtime factory must be exported");
  return factory as Function;
}

async function createFakeRuntime(input: {
  engine: Record<string, unknown>;
  ports?: Record<string, unknown>;
  engineFactory?: Function;
}): Promise<{ runtime: Record<string, unknown>; timers: TimerHandle[]; calls: number }> {
  const { timers, ports } = makeRuntimePorts(input.ports);
  let calls = 0;
  const engineFactory = input.engineFactory ?? (async () => {
    calls += 1;
    return input.engine;
  });
  const runtime = (await runtimeFactory()({
    config: BASE_CONFIG,
    runtimePorts: ports,
    engineFactory
  })) as Record<string, unknown>;
  return { runtime, timers, calls };
}

test("REQ-SBX-GENERAL-004 P3-T1 exports the immutable config and runtime surfaces", () => {
  assert.equal(typeof configModule.normalizeOpenClawSecurityConfig, "function");
  assert.equal(typeof runtimeModule.createOpenClawSecurityRuntime, "function");
  assert.equal(typeof runtimeModule.issueOpenClawSecurityEvaluationRequestId, "function");
  assert.equal(typeof runtimeModule.normalizeOpenClawSecurityEvaluationRequestId, "function");
  assert.equal(typeof indexModule.createOpenClawSecurityRuntime, "function");
});

test("REQ-SBX-GENERAL-004 P3-T1 accepts only the two profiles and three production modes", () => {
  for (const policyProfileId of [
    "sandbox-security-balanced.v1",
    "sandbox-security-strict.v1"
  ]) {
    for (const productionMode of ["rule_only", "local", "local_and_judge"]) {
      const result = normalizeConfig({
        ...BASE_CONFIG,
        policyProfileId,
        productionMode
      });
      assert.deepEqual(result, {
        policyProfileId,
        productionMode,
        auditEndpoint: BASE_CONFIG.auditEndpoint,
        auditCapabilityToken: VALID_TOKEN
      });
      assertDeeplyFrozen(result);
    }
  }
});

test("REQ-SBX-GENERAL-004 P3-T1 rejects extra keys and malformed immutable configuration", () => {
  assertInvalidConfig({ ...BASE_CONFIG, extra: true });
  assertInvalidConfig({ ...BASE_CONFIG, policyProfileId: "sandbox-security-custom.v1" });
  assertInvalidConfig({ ...BASE_CONFIG, productionMode: "remote" });
  assertInvalidConfig({ ...BASE_CONFIG, auditCapabilityToken: `sbxcap_v1.${"a".repeat(42)}` });
  assertInvalidConfig({ ...BASE_CONFIG, auditCapabilityToken: `sbxcap_v1.${"a".repeat(44)}` });
  assertInvalidConfig({ ...BASE_CONFIG, auditCapabilityToken: `sbxcap_v1.${"a".repeat(42)}!` });
  assertInvalidConfig({ ...BASE_CONFIG, auditCapabilityToken: `sbxcap_v1.${"a".repeat(42)} ` });

  const accessorConfig = { ...BASE_CONFIG } as Record<string, unknown>;
  Object.defineProperty(accessorConfig, "auditEndpoint", {
    enumerable: true,
    get() {
      return BASE_CONFIG.auditEndpoint;
    }
  });
  assertInvalidConfig(accessorConfig);

  const symbolConfig = { ...BASE_CONFIG, [Symbol("extra")]: true };
  assertInvalidConfig(symbolConfig);
  assertInvalidConfig(Object.assign(Object.create(null), BASE_CONFIG));
});

test("REQ-SBX-GENERAL-004 P3-T1 admits only startup-allowlisted internal audit origins and the exact route", () => {
  const defaultEndpoint = `http://sandbox-security-backend:3001${AUDIT_PATH}`;
  assert.deepEqual(normalizeConfig({ ...BASE_CONFIG, auditEndpoint: defaultEndpoint }, undefined), {
    ...BASE_CONFIG,
    auditEndpoint: defaultEndpoint
  });

  assertInvalidConfig({ ...BASE_CONFIG, auditEndpoint: `https://public.example${AUDIT_PATH}` });
  assertInvalidConfig({ ...BASE_CONFIG, auditEndpoint: `http://127.0.0.1:43102${AUDIT_PATH}` });
  assertInvalidConfig({ ...BASE_CONFIG, auditEndpoint: `${LOOPBACK_ORIGIN}/public` });
  assertInvalidConfig({ ...BASE_CONFIG, auditEndpoint: `${LOOPBACK_ORIGIN}${AUDIT_PATH}?x=1` });
  assertInvalidConfig({ ...BASE_CONFIG, auditEndpoint: `${LOOPBACK_ORIGIN}${AUDIT_PATH}#fragment` });
  assertInvalidConfig({
    ...BASE_CONFIG,
    auditEndpoint: `http://user:pass@127.0.0.1:43101${AUDIT_PATH}`
  });
  assertInvalidConfig({ ...BASE_CONFIG, auditEndpoint: `${LOOPBACK_ORIGIN}${AUDIT_PATH}/` });

  const httpsLoopback = "https://127.0.0.1:43103";
  assert.deepEqual(
    normalizeConfig(
      { ...BASE_CONFIG, auditEndpoint: `${httpsLoopback}${AUDIT_PATH}` },
      [httpsLoopback]
    ),
    { ...BASE_CONFIG, auditEndpoint: `${httpsLoopback}${AUDIT_PATH}` }
  );
});

test("REQ-SBX-GENERAL-004 P3-T1 returns a frozen clone that is unaffected by caller mutation", () => {
  const input: {
    policyProfileId: string;
    productionMode: string;
    auditEndpoint: string;
    auditCapabilityToken: string;
  } = { ...BASE_CONFIG };
  const result = normalizeConfig(input) as Record<string, unknown>;
  input.policyProfileId = "sandbox-security-strict.v1";
  input.auditCapabilityToken = `sbxcap_v1.${"b".repeat(43)}`;
  assert.equal(result.policyProfileId, "sandbox-security-balanced.v1");
  assert.equal(result.auditCapabilityToken, VALID_TOKEN);
  assertDeeplyFrozen(result);
  assert.throws(() => {
    result.productionMode = "local";
  }, TypeError);
});

test("REQ-SBX-GENERAL-004 P3-T1 constructs one injected Engine and starts with independent healthy domains", async () => {
  let engineFactoryCalls = 0;
  let receivedEngineRuntime: Record<string, unknown> | undefined;
  const engine = { evaluate: async () => makeDecision() };
  const { ports } = makeRuntimePorts();
  const runtime = (await runtimeFactory()({
    config: BASE_CONFIG,
    runtimePorts: ports,
    engineFactory: async (input: Record<string, unknown>) => {
      engineFactoryCalls += 1;
      receivedEngineRuntime = input.runtime as Record<string, unknown>;
      assert.equal(input.mode, "rule_only");
      return engine;
    }
  })) as Record<string, unknown>;

  assert.equal(engineFactoryCalls, 1);
  assert.equal(typeof receivedEngineRuntime?.scheduleTimeout, "function");
  assert.deepEqual((runtime.health as Function)(), {
    enforcement: "healthy",
    audit: "healthy"
  });
  (runtime.markAuditDegraded as Function)("audit_timeout");
  assert.deepEqual((runtime.health as Function)(), {
    enforcement: "healthy",
    audit: "degraded"
  });
  (runtime.markEnforcementFailed as Function)("fatal_invariant_drift");
  assert.deepEqual((runtime.health as Function)(), {
    enforcement: "failed",
    audit: "degraded"
  });
});

test("REQ-SBX-GENERAL-004 P3-T1 admits four Engine slots immediately and rejects the fifth without a queue", async () => {
  const resolvers: Array<(value: unknown) => void> = [];
  let evaluateCalls = 0;
  const engine = {
    evaluate: () => {
      evaluateCalls += 1;
      return new Promise((resolve) => resolvers.push(resolve));
    }
  };
  const { runtime } = await createFakeRuntime({ engine });
  const evaluations = [0, 1, 2, 3].map(() =>
    (runtime.tryEvaluate as Function)(makeEvaluationRequest())
  );
  await Promise.resolve();
  assert.equal(evaluateCalls, 4);

  assert.deepEqual(await (runtime.tryEvaluate as Function)(makeEvaluationRequest()), {
    kind: "interrupted",
    code: "engine_slot_unavailable"
  });
  assert.equal(evaluateCalls, 4);

  for (const resolve of resolvers) resolve(makeDecision());
  const results = await Promise.all(evaluations);
  assert.equal(results.every((result) => result.kind === "decision"), true);
});

test("REQ-SBX-GENERAL-004 P3-T1 does not mint a second evaluation ID inside Engine dispatch", async () => {
  let issuerCalls = 0;
  const { runtime } = await createFakeRuntime({
    engine: { evaluate: async () => makeDecision() },
    ports: {
      nextEvaluationRequestId: () => {
        issuerCalls += 1;
        return VALID_REQUEST_ID;
      }
    }
  });

  assert.deepEqual(
    await (runtime.tryEvaluate as Function)(makeEvaluationRequest()),
    { kind: "decision", decision: makeDecision() }
  );
  assert.equal(issuerCalls, 0);
});

test("REQ-SBX-GENERAL-004 P3-T1 passes a fixed 10000 ms caller signal and releases the slot after timeout", async () => {
  let receivedSignal: AbortSignal | undefined;
  const engine = {
    evaluate: (_request: unknown, signal: AbortSignal) => {
      receivedSignal = signal;
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("caller-aborted")), {
          once: true
        });
      });
    }
  };
  const { runtime, timers } = await createFakeRuntime({ engine });
  const evaluation = (runtime.tryEvaluate as Function)(makeEvaluationRequest());
  await Promise.resolve();
  assert.equal(timers.length, 1);
  assert.equal(timers[0].delayMs, 10000);
  assert.equal(receivedSignal?.aborted, false);
  timers[0].callback();
  assert.deepEqual(await evaluation, {
    kind: "interrupted",
    code: "engine_timeout"
  });
  assert.equal(receivedSignal?.aborted, true);
  assert.equal(timers[0].cancelled, true);
  assert.deepEqual((runtime.health as Function)(), {
    enforcement: "healthy",
    audit: "healthy"
  });
});

test("REQ-SBX-GENERAL-004 P3-T1 closes Engine throws and invalid public decisions without poisoning enforcement health", async () => {
  for (const engine of [
    { evaluate: async () => { throw new Error("engine-failure"); } },
    { evaluate: async () => ({ unexpected: true }) }
  ]) {
    const { runtime } = await createFakeRuntime({ engine });
    assert.deepEqual(await (runtime.tryEvaluate as Function)(makeEvaluationRequest()), {
      kind: "interrupted",
      code: "engine_error"
    });
    assert.deepEqual((runtime.health as Function)(), {
      enforcement: "healthy",
      audit: "healthy"
    });
  }
});

test("REQ-SBX-GENERAL-004 P3-T1 marks enforcement failed only for fatal Engine invariant drift", async () => {
  const engine = {
    evaluate: async () =>
      makeDecision({ request_id: "request:00000000-0000-4000-8000-000000000099" })
  };
  const { runtime } = await createFakeRuntime({ engine });
  assert.deepEqual(await (runtime.tryEvaluate as Function)(makeEvaluationRequest()), {
    kind: "interrupted",
    code: "correlation_mismatch"
  });
  assert.deepEqual((runtime.health as Function)(), {
    enforcement: "failed",
    audit: "healthy"
  });
});

test("REQ-SBX-GENERAL-004 P3-T1 issues exact independent lower-case UUIDv4 request IDs", () => {
  const issue = runtimeModule.issueOpenClawSecurityEvaluationRequestId as Function;
  const first = issue(() => "request:00000000-0000-4000-8000-000000000001");
  const second = issue(() => "request:00000000-0000-4000-8000-000000000002");
  assert.deepEqual(first, {
    kind: "issued",
    requestId: "request:00000000-0000-4000-8000-000000000001"
  });
  assert.deepEqual(second, {
    kind: "issued",
    requestId: "request:00000000-0000-4000-8000-000000000002"
  });
  assert.notEqual(first.requestId, second.requestId);
  assert.deepEqual(Object.keys(first).sort(), ["kind", "requestId"]);
});

test("REQ-SBX-GENERAL-004 P3-T1 rejects malformed or throwing request-ID issuers as closed pre-evaluation failures", () => {
  const issue = runtimeModule.issueOpenClawSecurityEvaluationRequestId as Function;
  for (const value of [
    "00000000-0000-4000-8000-000000000001",
    "request:00000000-0000-5000-8000-000000000001",
    "request:00000000-0000-4000-7000-000000000001",
    "request:00000000-0000-4000-C000-000000000001",
    "REQUEST:00000000-0000-4000-8000-000000000001",
    "request:00000000-0000-4000-8000-000000000001x",
    "request:00000000-0000-4000-8000-00000000001"
  ]) {
    assert.deepEqual(issue(() => value), {
      kind: "interrupted",
      code: "request_id_unavailable"
    });
  }
  assert.deepEqual(issue(() => { throw new Error("issuer-failure"); }), {
    kind: "interrupted",
    code: "request_id_unavailable"
  });
});

test("REQ-SBX-GENERAL-004 P3-T1 production request-ID ports prefix crypto UUIDv4 values without history", () => {
  const createPorts = runtimeModule.createOpenClawSecurityRuntimePorts as Function;
  assert.equal(typeof createPorts, "function");
  const ports = createPorts() as Record<string, unknown>;
  const first = (ports.nextEvaluationRequestId as Function)();
  const second = (ports.nextEvaluationRequestId as Function)();
  assert.match(first, /^request:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.match(second, /^request:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(first, second);
  assert.equal("issuedIds" in ports, false);
  assert.equal("history" in ports, false);
});

test("REQ-SBX-GENERAL-004 P3-T1 fails closed on runtime issuer failure without evaluating the Engine", async () => {
  let evaluateCalls = 0;
  const { ports } = makeRuntimePorts({
    nextEvaluationRequestId: () => "request:bad"
  });
  const runtime = (await runtimeFactory()({
    config: BASE_CONFIG,
    runtimePorts: ports,
    engineFactory: async () => ({
      evaluate: async () => {
        evaluateCalls += 1;
        return makeDecision();
      }
    })
  })) as Record<string, unknown>;
  assert.deepEqual((runtime.nextEvaluationRequestId as Function)(), {
    kind: "interrupted",
    code: "request_id_unavailable"
  });
  assert.equal(evaluateCalls, 0);
  assert.deepEqual((runtime.health as Function)(), {
    enforcement: "failed",
    audit: "healthy"
  });
});
