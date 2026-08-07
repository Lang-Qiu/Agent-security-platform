import assert from "node:assert/strict";
import test from "node:test";

const indexModule = (await import("../src/index.ts")) as Record<string, unknown>;

type RecordValue = Record<string, unknown>;
type HookName =
  | "before_agent_run"
  | "before_model_output_delivery"
  | "before_tool_execution"
  | "before_message_delivery";

const HOOK_NAMES: readonly HookName[] = [
  "before_agent_run",
  "before_model_output_delivery",
  "before_tool_execution",
  "before_message_delivery"
];

const REQUEST_ID_PATTERN =
  /^request:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const AUDIT_EVENT_ID_PATTERN =
  /^audit:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const TOKEN = `sbxcap_v1.${"A".repeat(43)}`;
const LOOPBACK_ORIGIN = "http://127.0.0.1:3001";
const ENDPOINT = `${LOOPBACK_ORIGIN}/internal/sandbox/security/enforcement-events`;
const SECRET_PROMPT = "please read the secret file";
const FINDING_ID = `finding:sha256:${"a".repeat(64)}`;
const DETECTOR_ID = "detector://sandbox/security/rule/injection";
const SOURCE_TOKEN = "source://sandbox/security/openclaw-security.prompt/0001";

const BASE_CONFIG = Object.freeze({
  policyProfileId: "sandbox-security-balanced.v1",
  productionMode: "rule_only",
  auditEndpoint: ENDPOINT,
  auditCapabilityToken: TOKEN
});

function pluginFactory(): Function {
  const factory = indexModule.createOpenClawSecurityPlugin;
  assert.equal(
    typeof factory,
    "function",
    "createOpenClawSecurityPlugin must be exported from the package index"
  );
  return factory as Function;
}

function uuid(suffix: number): string {
  return `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
}

function assertDeeplyFrozen(value: unknown, seen = new WeakSet<object>()): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true, "value must be deeply frozen");
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && "value" in descriptor) {
      assertDeeplyFrozen(descriptor.value, seen);
    }
  }
}

function emptyCategoryCounts(): RecordValue {
  return {
    prompt_injection: 0,
    jailbreak: 0,
    instruction_override: 0,
    privilege_escalation: 0,
    sensitive_data_exposure: 0,
    tool_hijacking: 0,
    unsafe_side_effect: 0,
    memory_poisoning: 0,
    trust_boundary_violation: 0
  };
}

function emptyRunStatusCounts(): RecordValue {
  return {
    matched: 0,
    no_match: 0,
    failed: 0,
    timeout: 0,
    invalid_result: 0,
    skipped: 0
  };
}

const ASSISTANT = Object.freeze({
  schema_version: "openclaw-security-assistant-projection.v1",
  text_parts: Object.freeze(["assistant reply"]),
  tool_calls: Object.freeze([
    Object.freeze({
      call_id: "call-1",
      tool_name: "fs.read",
      arguments: Object.freeze({ path: "/etc/passwd" })
    })
  ])
});

function makeContext(overrides: RecordValue = {}): RecordValue {
  return {
    schema_version: "openclaw-security-turn-context.v1",
    prompt: SECRET_PROMPT,
    runId: "run-1",
    sessionKey: "session-1",
    ...overrides
  };
}

function makeEvent(point: HookName, overrides: RecordValue = {}): RecordValue {
  const base: RecordValue = {
    schema_version: "openclaw-security-hook-event.v1",
    runId: "run-1",
    sessionKey: "session-1"
  };
  if (point === "before_model_output_delivery") {
    base.assistant = ASSISTANT;
  } else if (point === "before_tool_execution") {
    base.callId = "call-1";
    base.assistant = ASSISTANT;
    base.tool = {
      call_id: "call-1",
      tool_name: "fs.read",
      arguments: { path: "/etc/passwd" }
    };
  } else if (point === "before_message_delivery") {
    base.outbound = "outbound message";
  }
  return { ...base, ...overrides };
}

function makeDecision(overrides: RecordValue = {}): RecordValue {
  return {
    schema_version: "sandbox-security-decision.v1",
    decision_id: "decision:0001",
    request_id: `request:${uuid(1)}`,
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

function stageFor(point: HookName): string {
  switch (point) {
    case "before_agent_run":
      return "user_input";
    case "before_tool_execution":
      return "tool_request";
    default:
      return "model_output";
  }
}

class RecordingApi {
  readonly registrations: Array<{
    name: string;
    handler: (event: unknown, context: unknown) => Promise<unknown>;
    options: RecordValue;
  }> = [];

  on(
    name: string,
    handler: (event: unknown, context: unknown) => Promise<unknown>,
    options: RecordValue
  ): void {
    this.registrations.push({ name, handler, options });
  }

  handler(name: HookName): (event: unknown, context: unknown) => Promise<unknown> {
    const found = this.registrations.filter(
      (registration) => registration.name === name
    );
    assert.equal(found.length, 1, `exactly one ${name} registration required`);
    return found[0].handler;
  }
}

type Harness = {
  plugin: RecordValue;
  api: RecordingApi;
  posts: Array<{ url: string; bearer_token: string; body: Uint8Array }>;
  auditRequests: RecordValue[];
  evaluatedRequests: RecordValue[];
  requestIdCalls: number;
  auditIdCalls: number;
  handler: (point: HookName) => (event: unknown, context: unknown) => Promise<unknown>;
};

async function createHarness(options: {
  decision?: (request: RecordValue) => unknown;
  evaluate?: (request: RecordValue, signal: AbortSignal) => Promise<unknown>;
  transportStatus?: number;
  transportThrows?: boolean;
  nextEvaluationRequestId?: () => unknown;
  nextAuditEventId?: () => unknown;
  config?: unknown;
  register?: boolean;
} = {}): Promise<Harness> {
  const posts: Array<{ url: string; bearer_token: string; body: Uint8Array }> = [];
  const auditRequests: RecordValue[] = [];
  const evaluatedRequests: RecordValue[] = [];
  const state = { requestIdCalls: 0, auditIdCalls: 0 };

  const transport = {
    post: async (input: {
      url: string;
      bearer_token: string;
      body: Uint8Array;
      signal: AbortSignal;
    }) => {
      posts.push({
        url: input.url,
        bearer_token: input.bearer_token,
        body: input.body
      });
      const parsed = JSON.parse(new TextDecoder().decode(input.body)) as RecordValue;
      auditRequests.push(parsed);
      if (options.transportThrows === true) {
        throw new Error("transport unavailable");
      }
      const status = options.transportStatus ?? 201;
      if (status !== 200 && status !== 201) {
        return { status, body: new TextEncoder().encode("{}") };
      }
      const ack = {
        success: true,
        message: "accepted",
        data: {
          schema_version: "sandbox-security-enforcement-audit-ack.v1",
          event_id: parsed.event_id,
          status: status === 201 ? "accepted" : "replayed",
          occurred_at: "2026-08-07T00:00:00.000Z"
        },
        error_code: null,
        request_id: "req-audit-1"
      };
      return {
        status,
        body: new TextEncoder().encode(JSON.stringify(ack))
      };
    }
  };

  let monotonic = 0;
  const ports = {
    internalAuditOrigins: [LOOPBACK_ORIGIN],
    nextEvaluationRequestId:
      options.nextEvaluationRequestId ??
      (() => {
        state.requestIdCalls += 1;
        return `request:${uuid(state.requestIdCalls)}`;
      }),
    nextAuditEventId:
      options.nextAuditEventId ??
      (() => {
        state.auditIdCalls += 1;
        return `audit:${uuid(state.auditIdCalls)}`;
      }),
    now: () => "2026-08-07T00:00:00.000Z",
    nextDecisionId: () => "decision:0001",
    monotonicNowMs: () => {
      monotonic += 5;
      return monotonic;
    },
    scheduleTimeout: (_delayMs: number, _callback: () => void) => () => {}
  };

  const engineFactory = async () => ({
    evaluate: async (request: RecordValue, signal: AbortSignal) => {
      evaluatedRequests.push(request);
      if (options.evaluate !== undefined) {
        return options.evaluate(request, signal);
      }
      const submission = request.submission as RecordValue;
      const base = makeDecision({
        request_id: submission.request_id,
        stage: submission.stage
      });
      return options.decision === undefined ? base : options.decision(base);
    }
  });

  const plugin = (await pluginFactory()({
    config: options.config ?? BASE_CONFIG,
    runtime_ports: ports,
    audit_transport: transport,
    engine_factory: engineFactory
  })) as RecordValue;

  const api = new RecordingApi();
  if (options.register !== false) {
    (plugin.register as Function)(api);
  }

  return {
    plugin,
    api,
    posts,
    auditRequests,
    evaluatedRequests,
    get requestIdCalls() {
      return state.requestIdCalls;
    },
    get auditIdCalls() {
      return state.auditIdCalls;
    },
    handler: (point: HookName) => api.handler(point)
  };
}

test("REQ-SBX-GENERAL-004 P3-T5 registers exactly four hooks at fixed priority and timeout after startup", async () => {
  const harness = await createHarness();

  assert.deepEqual(
    harness.api.registrations.map((registration) => registration.name),
    [...HOOK_NAMES]
  );
  for (const registration of harness.api.registrations) {
    assert.deepEqual(Object.keys(registration.options).sort(), [
      "priority",
      "timeoutMs"
    ]);
    assert.equal(registration.options.priority, 1000);
    assert.equal(registration.options.timeoutMs, 10000);
  }

  assert.deepEqual((harness.plugin.health as Function)(), {
    enforcement: "healthy",
    audit: "healthy"
  });
  assert.deepEqual((harness.plugin.inspectOpaqueState as Function)(), []);
});

test("REQ-SBX-GENERAL-004 P3-T5 rejects duplicate registration and an invalid host API", async () => {
  const harness = await createHarness();
  assert.throws(() => (harness.plugin.register as Function)(new RecordingApi()));

  const second = await createHarness({ register: false });
  assert.throws(() => (second.plugin.register as Function)({}));
  assert.throws(() => (second.plugin.register as Function)(null));
});

test("REQ-SBX-GENERAL-004 P3-T5 rejects invalid startup config before registering hooks", async () => {
  await assert.rejects(() =>
    createHarness({ config: { ...BASE_CONFIG, productionMode: "invalid" } })
  );
  await assert.rejects(() =>
    createHarness({ config: { ...BASE_CONFIG, extra: true } })
  );
});

test("REQ-SBX-GENERAL-004 P3-T5 returns the exact frozen envelope for every point on allow", async () => {
  for (const point of HOOK_NAMES) {
    const harness = await createHarness();
    const result = (await harness.handler(point)(
      makeEvent(point),
      makeContext()
    )) as RecordValue;

    assert.deepEqual(Object.keys(result).sort(), [
      "barrier",
      "correlation",
      "health",
      "schema_version"
    ]);
    assert.equal(result.schema_version, "openclaw-security-hook-result.v1");
    assert.deepEqual(result.correlation, {
      runId: "run-1",
      sessionKey: "session-1",
      callId: point === "before_tool_execution" ? "call-1" : null
    });
    assert.deepEqual(Object.keys(result.correlation as RecordValue).sort(), [
      "callId",
      "runId",
      "sessionKey"
    ]);
    assert.deepEqual(result.health, {
      enforcement: "healthy",
      audit: "healthy"
    });
    assert.deepEqual(result.barrier, { outcome: "pass" });
    assertDeeplyFrozen(result);
  }
});

test("REQ-SBX-GENERAL-004 P3-T5 maps every action to the fixed barrier per point", async () => {
  const expectations = [
    { action: "allow", barrier: { outcome: "pass" } },
    { action: "alert", barrier: { outcome: "pass" } },
    {
      action: "ask",
      barrier: {
        outcome: "replace",
        replacement_code: "security_review_required",
        replacement_text:
          "Security review required. This action was not completed."
      }
    },
    {
      action: "deny",
      barrier: {
        outcome: "replace",
        replacement_code: "sandbox_security_policy_blocked",
        replacement_text: "Blocked by sandbox security policy."
      }
    }
  ] as const;

  for (const point of HOOK_NAMES) {
    for (const expectation of expectations) {
      const harness = await createHarness({
        decision: (base) => ({
          ...base,
          action: expectation.action,
          verdict:
            expectation.action === "allow" ? "no_detected_risk" : "risk_detected",
          risk_level: expectation.action === "allow" ? "info" : "medium"
        })
      });
      const result = (await harness.handler(point)(
        makeEvent(point),
        makeContext()
      )) as RecordValue;
      assert.deepEqual(result.barrier, expectation.barrier);
      assert.equal(
        "replacement_provenance" in (result.barrier as RecordValue),
        false
      );
      assert.deepEqual(result.health, {
        enforcement: "healthy",
        audit: "healthy"
      });
    }
  }
});

test("REQ-SBX-GENERAL-004 P3-T5 issues one evaluation request ID per evaluation and threads it through Engine and audit", async () => {
  const harness = await createHarness();
  await harness.handler("before_agent_run")(
    makeEvent("before_agent_run"),
    makeContext()
  );

  assert.equal(harness.requestIdCalls, 1);
  assert.equal(harness.evaluatedRequests.length, 1);
  const submission = (harness.evaluatedRequests[0] as RecordValue)
    .submission as RecordValue;
  const issued = submission.request_id as string;
  assert.match(issued, REQUEST_ID_PATTERN);
  assert.equal(harness.auditRequests.length, 1);
  assert.equal(harness.auditRequests[0].request_id, issued);
  assert.match(harness.auditRequests[0].event_id as string, AUDIT_EVENT_ID_PATTERN);
  assert.equal(harness.auditIdCalls, 1);
});

test("REQ-SBX-GENERAL-004 P3-T5 keeps evaluation request IDs unique across successive and concurrent evaluations", async () => {
  const harness = await createHarness();
  await harness.handler("before_agent_run")(
    makeEvent("before_agent_run"),
    makeContext()
  );
  await harness.handler("before_agent_run")(
    makeEvent("before_agent_run"),
    makeContext()
  );

  const concurrent = await Promise.all([
    harness.handler("before_agent_run")(
      makeEvent("before_agent_run", { runId: "run-2" }),
      makeContext({ runId: "run-2" })
    ),
    harness.handler("before_agent_run")(
      makeEvent("before_agent_run", { runId: "run-3" }),
      makeContext({ runId: "run-3" })
    )
  ]);
  assert.equal(concurrent.length, 2);

  const issuedIds = harness.auditRequests.map((request) => request.request_id);
  assert.equal(new Set(issuedIds).size, issuedIds.length);
  const auditIds = harness.auditRequests.map((request) => request.event_id);
  assert.equal(new Set(auditIds).size, auditIds.length);
});

test("REQ-SBX-GENERAL-004 P3-T5 fails closed before evaluation when request-ID issuance fails", async () => {
  for (const point of HOOK_NAMES) {
    const harness = await createHarness({
      nextEvaluationRequestId: () => {
        throw new Error("issuer offline");
      }
    });
    const result = (await harness.handler(point)(
      makeEvent(point),
      makeContext()
    )) as RecordValue;

    assert.deepEqual(result.barrier, {
      outcome: "replace",
      replacement_code: "sandbox_security_evaluation_unavailable",
      replacement_text:
        "Security evaluation unavailable. This action was not completed."
    });
    assert.deepEqual(result.health, {
      enforcement: "failed",
      audit: "healthy"
    });
    assert.equal(harness.evaluatedRequests.length, 0);
    assert.equal(harness.posts.length, 0);
    assert.equal(harness.auditIdCalls, 0);
    assert.deepEqual((harness.plugin.inspectOpaqueState as Function)(), []);
  }
});

test("REQ-SBX-GENERAL-004 P3-T5 rejects an invalid request-ID grammar without touching Engine or audit", async () => {
  const harness = await createHarness({
    nextEvaluationRequestId: () => "request:not-a-uuid"
  });
  const result = (await harness.handler("before_agent_run")(
    makeEvent("before_agent_run"),
    makeContext()
  )) as RecordValue;

  assert.deepEqual(result.health, { enforcement: "failed", audit: "healthy" });
  assert.equal((result.barrier as RecordValue).outcome, "replace");
  assert.equal(harness.evaluatedRequests.length, 0);
  assert.equal(harness.posts.length, 0);
});

test("REQ-SBX-GENERAL-004 P3-T5 rejects correlation drift between event and turn context", async () => {
  const harness = await createHarness();
  const result = (await harness.handler("before_agent_run")(
    makeEvent("before_agent_run", { runId: "run-1" }),
    makeContext({ runId: "run-mismatch" })
  )) as RecordValue;

  assert.equal((result.barrier as RecordValue).outcome, "replace");
  assert.equal(
    (result.barrier as RecordValue).replacement_code,
    "sandbox_security_evaluation_unavailable"
  );
  assert.equal(harness.evaluatedRequests.length, 0);
});

test("REQ-SBX-GENERAL-004 P3-T5 rejects unsupported and malformed host input per point", async () => {
  const cases: Array<{ point: HookName; event: RecordValue; context?: RecordValue }> = [
    {
      point: "before_agent_run",
      event: makeEvent("before_agent_run", { unexpected: true })
    },
    {
      point: "before_agent_run",
      event: makeEvent("before_agent_run"),
      context: makeContext({ schema_version: "wrong.v1" })
    },
    {
      point: "before_agent_run",
      event: makeEvent("before_agent_run"),
      context: makeContext({ prompt: 42 })
    },
    {
      point: "before_tool_execution",
      event: makeEvent("before_tool_execution", { callId: "call-other" })
    },
    {
      point: "before_model_output_delivery",
      event: makeEvent("before_model_output_delivery", {
        assistant: { schema_version: "wrong", text_parts: [], tool_calls: [] }
      })
    },
    {
      point: "before_message_delivery",
      event: makeEvent("before_message_delivery", { outbound: undefined })
    }
  ];

  for (const testCase of cases) {
    const harness = await createHarness();
    const result = (await harness.handler(testCase.point)(
      testCase.event,
      testCase.context ?? makeContext()
    )) as RecordValue;
    assert.equal(
      (result.barrier as RecordValue).replacement_code,
      "sandbox_security_evaluation_unavailable"
    );
    assert.equal(harness.evaluatedRequests.length, 0);
    assert.equal(harness.posts.length, 0);
  }
});

test("REQ-SBX-GENERAL-004 P3-T5 applies the per-point fail-closed floor when the Engine fails", async () => {
  for (const point of HOOK_NAMES) {
    const harness = await createHarness({
      evaluate: async () => {
        throw new Error("engine exploded");
      }
    });
    const result = (await harness.handler(point)(
      makeEvent(point),
      makeContext()
    )) as RecordValue;

    assert.deepEqual(result.barrier, {
      outcome: "replace",
      replacement_code: "sandbox_security_evaluation_unavailable",
      replacement_text:
        "Security evaluation unavailable. This action was not completed."
    });
    assert.equal(harness.auditRequests.length, 1);
    const audited = harness.auditRequests[0];
    assert.equal(audited.event_type, "enforcement_interrupted");
    assert.equal(audited.interruption_code, "engine_error");
    assert.equal(
      audited.applied_fail_closed_action,
      point === "before_tool_execution" ? "deny" : "ask"
    );
    assert.equal(audited.enforcement_point, point);
    assert.equal(audited.stage, stageFor(point));
  }
});

test("REQ-SBX-GENERAL-004 P3-T5 sends one exact content-free completed audit projection", async () => {
  const harness = await createHarness({
    decision: (base) => ({
      ...base,
      action: "deny",
      verdict: "risk_detected",
      risk_level: "high",
      findings: [
        {
          finding_id: FINDING_ID,
          detector_id: DETECTOR_ID,
          detector_version: "1.0.0",
          category: "prompt_injection",
          severity: "high",
          confidence: 0.9,
          reason_code: "sandbox_security_prompt_injection",
          subject_refs: [
            {
              kind: "content_source",
              source_token: SOURCE_TOKEN,
              locator: { kind: "whole_source" }
            }
          ],
          evidence_refs: []
        }
      ],
      detector_runs: [
        {
          detector_id: DETECTOR_ID,
          detector_version: "1.0.0",
          detector_kind: "rule",
          obligation: "profile_required",
          elapsed_ms: 3,
          status: "matched",
          finding_ids: [FINDING_ID]
        }
      ]
    })
  });

  await harness.handler("before_tool_execution")(
    makeEvent("before_tool_execution"),
    makeContext()
  );

  assert.equal(harness.auditRequests.length, 1);
  const audited = harness.auditRequests[0];
  assert.deepEqual(Object.keys(audited).sort(), [
    "action",
    "category_counts",
    "composition_binding",
    "detector_run_status_counts",
    "elapsed_ms",
    "enforcement_point",
    "event_id",
    "event_type",
    "host_outcome",
    "policy_profile_id",
    "request_id",
    "risk_level",
    "schema_version",
    "stage",
    "verdict"
  ]);
  assert.equal(
    audited.schema_version,
    "sandbox-security-enforcement-audit-request.v1"
  );
  assert.equal(audited.event_type, "enforcement_completed");
  assert.equal(audited.enforcement_point, "before_tool_execution");
  assert.equal(audited.stage, "tool_request");
  assert.equal(audited.policy_profile_id, "sandbox-security-balanced.v1");
  assert.equal(
    audited.composition_binding,
    "sandbox-security-production-composition.v1:rule_only"
  );
  assert.equal(audited.action, "deny");
  assert.equal(audited.host_outcome, "replaced");
  assert.equal(audited.verdict, "risk_detected");
  assert.equal(audited.risk_level, "high");
  assert.deepEqual(audited.category_counts, {
    ...emptyCategoryCounts(),
    prompt_injection: 1
  });
  assert.deepEqual(audited.detector_run_status_counts, {
    ...emptyRunStatusCounts(),
    matched: 1
  });
  assert.equal(typeof audited.elapsed_ms, "number");
  assert.equal(Number.isSafeInteger(audited.elapsed_ms), true);
  assert.equal((audited.elapsed_ms as number) >= 0, true);

  const serialized = JSON.stringify(harness.auditRequests);
  for (const forbidden of [
    "secret",
    "/etc/passwd",
    "fs.read",
    "assistant reply",
    "outbound message",
    "call-1",
    "run-1",
    "session-1",
    FINDING_ID,
    DETECTOR_ID,
    TOKEN,
    "Blocked by sandbox security policy."
  ]) {
    assert.equal(
      serialized.includes(forbidden),
      false,
      `audit payload must not contain ${forbidden}`
    );
  }
});

test("REQ-SBX-GENERAL-004 P3-T5 posts audit to the configured endpoint with the capability token", async () => {
  const harness = await createHarness();
  await harness.handler("before_agent_run")(
    makeEvent("before_agent_run"),
    makeContext()
  );
  assert.equal(harness.posts.length, 1);
  assert.equal(harness.posts[0].url, ENDPOINT);
  assert.equal(harness.posts[0].bearer_token, TOKEN);
});

test("REQ-SBX-GENERAL-004 P3-T5 degrades audit health without changing the selected action", async () => {
  for (const point of HOOK_NAMES) {
    const harness = await createHarness({
      transportThrows: true,
      decision: (base) => ({
        ...base,
        action: "ask",
        verdict: "risk_detected",
        risk_level: "medium"
      })
    });
    const result = (await harness.handler(point)(
      makeEvent(point),
      makeContext()
    )) as RecordValue;

    assert.deepEqual(result.barrier, {
      outcome: "replace",
      replacement_code: "security_review_required",
      replacement_text:
        "Security review required. This action was not completed."
    });
    assert.deepEqual(result.health, {
      enforcement: "healthy",
      audit: "degraded"
    });
  }
});

test("REQ-SBX-GENERAL-004 P3-T5 treats an audit HTTP rejection as audit-only degradation", async () => {
  const harness = await createHarness({ transportStatus: 503 });
  const result = (await harness.handler("before_agent_run")(
    makeEvent("before_agent_run"),
    makeContext()
  )) as RecordValue;

  assert.deepEqual(result.barrier, { outcome: "pass" });
  assert.deepEqual(result.health, {
    enforcement: "healthy",
    audit: "degraded"
  });
});

test("REQ-SBX-GENERAL-004 P3-T5 degrades audit only when audit-event-ID issuance fails after action selection", async () => {
  const harness = await createHarness({
    nextAuditEventId: () => {
      throw new Error("audit id offline");
    },
    decision: (base) => ({
      ...base,
      action: "deny",
      verdict: "risk_detected",
      risk_level: "high"
    })
  });
  const result = (await harness.handler("before_tool_execution")(
    makeEvent("before_tool_execution"),
    makeContext()
  )) as RecordValue;

  assert.deepEqual(result.barrier, {
    outcome: "replace",
    replacement_code: "sandbox_security_policy_blocked",
    replacement_text: "Blocked by sandbox security policy."
  });
  assert.deepEqual(result.health, {
    enforcement: "healthy",
    audit: "degraded"
  });
  assert.equal(harness.posts.length, 0);
  assert.equal(harness.evaluatedRequests.length, 1);
});

test("REQ-SBX-GENERAL-004 P3-T5 rejects a host-supplied audit or evaluation identifier", async () => {
  const harness = await createHarness();
  await harness.handler("before_agent_run")(
    makeEvent("before_agent_run", {
      event_id: `audit:${uuid(999)}`,
      request_id: `request:${uuid(999)}`
    }),
    makeContext()
  );
  assert.equal(harness.evaluatedRequests.length, 0);
  assert.equal(harness.posts.length, 0);
});

test("REQ-SBX-GENERAL-004 P3-T5 returns the fixed unavailable barrier when enforcement health has failed", async () => {
  const harness = await createHarness({
    nextEvaluationRequestId: (() => {
      let calls = 0;
      return () => {
        calls += 1;
        if (calls === 1) return "request:broken";
        return `request:${uuid(calls)}`;
      };
    })()
  });

  const first = (await harness.handler("before_agent_run")(
    makeEvent("before_agent_run"),
    makeContext()
  )) as RecordValue;
  assert.equal((first.health as RecordValue).enforcement, "failed");

  const second = (await harness.handler("before_agent_run")(
    makeEvent("before_agent_run"),
    makeContext()
  )) as RecordValue;
  assert.deepEqual(second.health, {
    enforcement: "failed",
    audit: "healthy"
  });
  assert.deepEqual(second.barrier, {
    outcome: "replace",
    replacement_code: "sandbox_security_evaluation_unavailable",
    replacement_text:
      "Security evaluation unavailable. This action was not completed."
  });
});

test("REQ-SBX-GENERAL-004 P3-T5 exposes only opaque in-flight state and clears it at terminal delivery", async () => {
  let release: (() => void) | null = null;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const harness = await createHarness({
    evaluate: async (request) => {
      await gate;
      const submission = request.submission as RecordValue;
      return makeDecision({
        request_id: submission.request_id,
        stage: submission.stage
      });
    }
  });

  const pending = harness.handler("before_tool_execution")(
    makeEvent("before_tool_execution"),
    makeContext()
  );
  await new Promise((resolve) => setImmediate(resolve));

  const snapshot = (harness.plugin.inspectOpaqueState as Function)() as RecordValue[];
  assert.deepEqual(snapshot, [
    {
      runId: "run-1",
      sessionKey: "session-1",
      state: "active",
      callIds: ["call-1"]
    }
  ]);
  const serialized = JSON.stringify(snapshot);
  assert.equal(serialized.includes("secret"), false);
  assert.equal(serialized.includes("/etc/passwd"), false);
  assert.equal(serialized.includes(TOKEN), false);
  assertDeeplyFrozen(snapshot);

  (release as unknown as () => void)();
  await pending;
  assert.deepEqual((harness.plugin.inspectOpaqueState as Function)(), []);
});

test("REQ-SBX-GENERAL-004 P3-T5 echoes correlation correctly for concurrent same-session runs", async () => {
  const harness = await createHarness();
  const [first, second] = (await Promise.all([
    harness.handler("before_tool_execution")(
      makeEvent("before_tool_execution", { runId: "run-a", callId: "call-1" }),
      makeContext({ runId: "run-a" })
    ),
    harness.handler("before_agent_run")(
      makeEvent("before_agent_run", { runId: "run-b" }),
      makeContext({ runId: "run-b" })
    )
  ])) as RecordValue[];

  assert.deepEqual(first.correlation, {
    runId: "run-a",
    sessionKey: "session-1",
    callId: "call-1"
  });
  assert.deepEqual(second.correlation, {
    runId: "run-b",
    sessionKey: "session-1",
    callId: null
  });
  assert.deepEqual((harness.plugin.inspectOpaqueState as Function)(), []);
});

test("REQ-SBX-GENERAL-004 P3-T5 manifest declares only the four immutable config keys and no tool or route", async () => {
  const manifest = (await import(
    "../openclaw.plugin.json",
    { with: { type: "json" } }
  )) as { default: RecordValue };
  const plugin = manifest.default;

  assert.equal(plugin.id, "agent-security-sandbox-general");
  const schema = plugin.configSchema as RecordValue;
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual((schema.required as string[]).sort(), [
    "auditCapabilityToken",
    "auditEndpoint",
    "policyProfileId",
    "productionMode"
  ]);
  assert.deepEqual(Object.keys(schema.properties as RecordValue).sort(), [
    "auditCapabilityToken",
    "auditEndpoint",
    "policyProfileId",
    "productionMode"
  ]);
  assert.equal("tools" in plugin, false);
  assert.equal("routes" in plugin, false);
  assert.equal("commands" in plugin, false);
  assert.deepEqual(plugin.hooks, [...HOOK_NAMES]);
  assert.deepEqual(plugin.capabilities, { conversationAccess: true });
});
