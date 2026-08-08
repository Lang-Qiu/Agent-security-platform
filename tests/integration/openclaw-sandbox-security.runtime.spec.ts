import assert from "node:assert/strict";
import test from "node:test";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createOpenClawSecurityPlugin,
  OPENCLAW_SECURITY_HOOK_EVENT_SCHEMA,
  OPENCLAW_SECURITY_HOOK_NAMES,
  OPENCLAW_SECURITY_HOOK_RESULT_SCHEMA,
  OPENCLAW_SECURITY_TURN_CONTEXT_SCHEMA
} from "../../integrations/openclaw/general-security/src/general-security/plugin.ts";
import type {
  OpenClawSecurityRuntimePorts
} from "../../integrations/openclaw/general-security/src/general-security/runtime.ts";
import type {
  SandboxSecurityAction,
  SandboxSecurityDecision,
  SandboxSecurityEvaluationRequest
} from "../../shared/index.ts";
import {
  scanManagedArtifacts,
  type PrivacyArtifact
} from "../repository/helpers/sandbox-security-openclaw-privacy.ts";

type RecordValue = Record<string, unknown>;

const PACKAGE_ROOT = path.resolve(
  import.meta.dirname,
  "../../integrations/openclaw/general-security"
);
const PLUGIN_ID = "agent-security-sandbox-general";
const OPENCLAW_VERSION = "2026.6.34";
const DOCKERFILE_PATH = path.resolve(
  import.meta.dirname,
  "../../deploy/sandbox-security/Dockerfile.openclaw"
);
const COMPOSE_PATH = path.resolve(
  import.meta.dirname,
  "../../deploy/sandbox-security/compose.openclaw-security.yml"
);
const RUNBOOK_PATH = path.resolve(
  import.meta.dirname,
  "../../deploy/sandbox-security/README.md"
);

test("REQ-SBX-GENERAL-004 P4-T8 real nested CLI probe accepts the patched general-security runtime", async () => {
  const probe = (await import(
    "../../integrations/openclaw/general-security/src/general-security/runtime-probe.ts"
  ).catch(() => ({}))) as RecordValue;
  const runProbe = probe.runOpenClawSecurityRuntimeProbe;
  assert.equal(typeof runProbe, "function", "runtime probe must be exported");

  const result = (await (runProbe as Function)({ packageRoot: PACKAGE_ROOT })) as RecordValue;
  assert.equal(result.schema_version, "openclaw-security-runtime-probe.v1");
  assert.equal(result.plugin_id, PLUGIN_ID);
  assert.equal(result.runtime_version, OPENCLAW_VERSION);
  assert.equal(result.plugin_registration_count, 1);
  assert.deepEqual(result.barrier_names, [
    "before_agent_run",
    "before_model_output_delivery",
    "before_tool_execution",
    "before_message_delivery"
  ]);
  assert.deepEqual(result.diagnostics, []);
  for (const key of [
    "input_ordered",
    "model_output_ordered",
    "tool_ordered",
    "outbound_ordered",
    "input_correlated",
    "model_output_correlated",
    "tool_correlated",
    "outbound_correlated",
    "fixed_replacement_host_only",
    "engine_failure_closed",
    "audit_content_free"
  ]) {
    assert.equal(result[key], true, `${key} must pass in the real runtime probe`);
  }
});

test("REQ-SBX-GENERAL-004 P4-T8 runtime probe identity is tied to the standalone package", async () => {
  const packageManifest = JSON.parse(
    readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8")
  ) as RecordValue;
  const openclawManifest = JSON.parse(
    readFileSync(
      path.join(PACKAGE_ROOT, "node_modules/openclaw/package.json"),
      "utf8"
    )
  ) as RecordValue;

  assert.equal(packageManifest.name, "@agent-security-platform/openclaw-general-security");
  assert.equal(openclawManifest.name, "openclaw");
  assert.equal(openclawManifest.version, OPENCLAW_VERSION);
  assert.equal(
    (openclawManifest.bin as RecordValue).openclaw,
    "openclaw.mjs"
  );
});

test("REQ-SBX-GENERAL-004 P5-T1 rejects a tampered patch before runtime registration", async () => {
  const probe = (await import(
    "../../integrations/openclaw/general-security/src/general-security/runtime-probe.ts"
  )) as RecordValue;
  const runProbe = probe.runOpenClawSecurityRuntimeProbe;
  assert.equal(typeof runProbe, "function", "runtime probe must be exported");

  const sourceManifest = JSON.parse(
    readFileSync(
      path.join(
        PACKAGE_ROOT,
        "patches/openclaw-2026.6.34-general-security.manifest.json"
      ),
      "utf8"
    )
  ) as RecordValue;
  const patchEntries = sourceManifest.files as Array<RecordValue>;
  const tempRoot = mkdtempSync(path.join(tmpdir(), "g4-p5t1-tamper-"));
  const packageRoot = path.join(tempRoot, "package");
  const openclawRoot = path.join(packageRoot, "node_modules", "openclaw");
  try {
    mkdirSync(path.join(packageRoot, "patches"), { recursive: true });
    mkdirSync(path.join(openclawRoot, "dist", "plugin-sdk"), {
      recursive: true
    });
    cpSync(
      path.join(PACKAGE_ROOT, "patches/openclaw-2026.6.34-general-security.manifest.json"),
      path.join(packageRoot, "patches/openclaw-2026.6.34-general-security.manifest.json")
    );
    cpSync(
      path.join(PACKAGE_ROOT, "patches/openclaw-2026.6.34-general-security.patch"),
      path.join(packageRoot, "patches/openclaw-2026.6.34-general-security.patch")
    );
    cpSync(
      path.join(PACKAGE_ROOT, "node_modules/openclaw/package.json"),
      path.join(openclawRoot, "package.json")
    );
    cpSync(
      path.join(PACKAGE_ROOT, "node_modules/openclaw/openclaw.mjs"),
      path.join(openclawRoot, "openclaw.mjs")
    );
    for (const entry of patchEntries) {
      const relativePath = String(entry.path);
      const source = path.join(PACKAGE_ROOT, "node_modules/openclaw", relativePath);
      const target = path.join(openclawRoot, relativePath);
      mkdirSync(path.dirname(target), { recursive: true });
      cpSync(source, target);
    }

    const patchPath = path.join(
      packageRoot,
      "patches/openclaw-2026.6.34-general-security.patch"
    );
    writeFileSync(
      patchPath,
      Buffer.concat([readFileSync(patchPath), Buffer.from("\n")])
    );
    const registrationCalls: unknown[] = [];

    await assert.rejects(
      () =>
        (runProbe as Function)({
          packageRoot,
          execFileSync: (...args: unknown[]) => {
            registrationCalls.push(args);
            return "{}";
          },
          dynamicProbe: async () => ({})
        }),
      /patch digest does not match the sealed manifest/
    );
    assert.deepEqual(
      registrationCalls,
      [],
      "tampered patch must fail before the nested CLI can register the plugin"
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("REQ-SBX-GENERAL-004 P5-T2 gates gateway startup behind the four-barrier probe", () => {
  const dockerfile = readFileSync(DOCKERFILE_PATH, "utf8");
  const runtimeCommand = dockerfile.slice(dockerfile.lastIndexOf("CMD ["));
  const probeIndex = runtimeCommand.indexOf("runOpenClawSecurityRuntimeProbe");
  const gatewayIndex = runtimeCommand.indexOf("'gateway'");
  assert.ok(probeIndex >= 0, "startup must invoke the sealed runtime probe");
  assert.ok(gatewayIndex > probeIndex, "gateway must start only after the probe resolves");
  assert.match(runtimeCommand, /configPath: process\.env\.OPENCLAW_CONFIG_PATH/);
  assert.match(
    runtimeCommand,
    /SANDBOX_SECURITY_AUDIT_ENDPOINT: process\.env\.SANDBOX_SECURITY_AUDIT_ENDPOINT/
  );
  assert.match(dockerfile, /spawnSync\(process\.execPath/);
  assert.match(dockerfile, /process\.exitCode = child\.status/);
  assert.match(dockerfile, /ENV TMPDIR=\/tmp\/openclaw/);
  assert.match(dockerfile, /ENV OPENCLAW_STATE_DIR=\/run\/openclaw-security/);
  assert.match(dockerfile, /USER node/);
});

test("REQ-SBX-GENERAL-004 P5-T3 configured runtime probes reject missing config before the nested CLI", async () => {
  const probe = (await import(
    "../../integrations/openclaw/general-security/src/general-security/runtime-probe.ts"
  )) as RecordValue;
  const runProbe = probe.runOpenClawSecurityRuntimeProbe;
  assert.equal(typeof runProbe, "function", "runtime probe must be exported");

  const stateDir = mkdtempSync(path.join(tmpdir(), "g4-p5t3-configured-state-"));
  const missingConfigPath = path.join(stateDir, "missing-openclaw.json5");
  const execCalls: unknown[] = [];
  try {
    await assert.rejects(
      () =>
        (runProbe as Function)({
          packageRoot: PACKAGE_ROOT,
          configPath: missingConfigPath,
          env: {
            OPENCLAW_CONFIG_PATH: missingConfigPath,
            OPENCLAW_STATE_DIR: stateDir,
            SANDBOX_SECURITY_POLICY_PROFILE_ID: "sandbox-security-balanced.v1",
            SANDBOX_SECURITY_PRODUCTION_MODE: "rule_only",
            SANDBOX_SECURITY_AUDIT_ENDPOINT:
              "http://sandbox-security-backend:3001/internal/sandbox/security/enforcement-events",
            SANDBOX_SECURITY_AUDIT_CAPABILITY_TOKEN:
              `sbxcap_v1.${"A".repeat(43)}`
          },
          execFileSync: (...args: unknown[]) => {
            execCalls.push(args);
            return JSON.stringify({
              plugin: { id: PLUGIN_ID, status: "loaded" },
              typedHooks: OPENCLAW_SECURITY_HOOK_NAMES.map((name) => ({ name })),
              diagnostics: []
            });
          },
          dynamicProbe: () => ({
            input_ordered: true,
            model_output_ordered: true,
            tool_ordered: true,
            outbound_ordered: true,
            input_correlated: true,
            model_output_correlated: true,
            tool_correlated: true,
            outbound_correlated: true,
            fixed_replacement_host_only: true,
            engine_failure_closed: true,
            audit_content_free: true
          })
        }),
      /configured runtime config path/
    );
    assert.deepEqual(execCalls, [], "missing configured config must fail before CLI registration");

    const configuredConfigPath = path.join(stateDir, "openclaw.json5");
    writeFileSync(configuredConfigPath, "{}", "utf8");
    let observedEnvironment: RecordValue | undefined;
    await (runProbe as Function)({
      packageRoot: PACKAGE_ROOT,
      configPath: configuredConfigPath,
      env: {
        OPENCLAW_STATE_DIR: stateDir,
        SANDBOX_SECURITY_POLICY_PROFILE_ID: "sandbox-security-balanced.v1",
        SANDBOX_SECURITY_PRODUCTION_MODE: "rule_only",
        SANDBOX_SECURITY_AUDIT_ENDPOINT:
          "http://sandbox-security-backend:3001/internal/sandbox/security/enforcement-events",
        SANDBOX_SECURITY_AUDIT_CAPABILITY_TOKEN: `sbxcap_v1.${"A".repeat(43)}`
      },
      execFileSync: (_file: unknown, _args: unknown, options: RecordValue) => {
        observedEnvironment = options.env as RecordValue;
        return JSON.stringify({
          plugin: { id: PLUGIN_ID, status: "loaded" },
          typedHooks: OPENCLAW_SECURITY_HOOK_NAMES.map((name) => ({ name })),
          diagnostics: []
        });
      },
      dynamicProbe: () => ({
        input_ordered: true,
        model_output_ordered: true,
        tool_ordered: true,
        outbound_ordered: true,
        input_correlated: true,
        model_output_correlated: true,
        tool_correlated: true,
        outbound_correlated: true,
        fixed_replacement_host_only: true,
        engine_failure_closed: true,
        audit_content_free: true
      })
    });
    assert.equal(observedEnvironment?.OPENCLAW_CONFIG_PATH, configuredConfigPath);
    assert.equal(
      observedEnvironment?.SANDBOX_SECURITY_AUDIT_CAPABILITY_TOKEN,
      `sbxcap_v1.${"A".repeat(43)}`
    );
  } finally {
    rmSync(stateDir, { recursive: true, force: true });
  }
});

test("REQ-SBX-GENERAL-004 P5-T2 rejects a failed barrier probe before readiness", async () => {
  const probe = (await import(
    "../../integrations/openclaw/general-security/src/general-security/runtime-probe.ts"
  )) as RecordValue;
  const runProbe = probe.runOpenClawSecurityRuntimeProbe;
  const inspectCalls: unknown[] = [];
  await assert.rejects(
    () =>
      (runProbe as Function)({
        packageRoot: PACKAGE_ROOT,
        execFileSync: (...args: unknown[]) => {
          inspectCalls.push(args);
          return JSON.stringify({
            plugin: { id: PLUGIN_ID, status: "loaded" },
            typedHooks: OPENCLAW_SECURITY_HOOK_NAMES.map((name) => ({ name })),
            diagnostics: []
          });
        },
        dynamicProbe: () => ({
          input_ordered: false,
          model_output_ordered: true,
          tool_ordered: true,
          outbound_ordered: true,
          input_correlated: true,
          model_output_correlated: true,
          tool_correlated: true,
          outbound_correlated: true,
          fixed_replacement_host_only: true,
          engine_failure_closed: true,
          audit_content_free: true
        })
      }),
    /one or more dynamic barrier checks failed/
  );
  assert.equal(inspectCalls.length, 1, "readiness must not succeed after a failed barrier probe");
});

test("REQ-SBX-GENERAL-004 P5-T2 lifecycle contract uses SIGTERM and removes all durable runtime state", () => {
  const compose = readFileSync(COMPOSE_PATH, "utf8");
  const runbook = readFileSync(RUNBOOK_PATH, "utf8");

  assert.match(compose, /stop_signal:\s*SIGTERM/);
  assert.match(compose, /init:\s*true/);
  assert.match(compose, /tmpfs:[\s\S]*\/run\/openclaw-security/);
  assert.match(compose, /tmpfs:[\s\S]*\/tmp\/openclaw/);
  assert.match(compose, /tmpfs:[\s\S]*\/workspace/);
  assert.doesNotMatch(compose, /(?:^|\n)\s*(?:ports|volumes):/);
  assert.match(runbook, /down --remove-orphans/);
  assert.match(runbook, /docker volume ls/);
});

const PRIVACY_REPLACEMENT_TEXTS = new Set([
  "Blocked by sandbox security policy.",
  "Security review required. This action was not completed.",
  "Security evaluation unavailable. This action was not completed."
]);

type PrivacyBarrierFixture = Readonly<{
  handlers: ReadonlyMap<string, (event: unknown, context: unknown) => Promise<unknown>>;
  auditBodies: readonly Uint8Array[];
  sentinels: Readonly<Record<string, string>>;
  health: () => Readonly<{ enforcement: string; audit: string }>;
}>;

function probeUuid(counter: number): string {
  return `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`;
}

function privacyDecision(
  request: Readonly<SandboxSecurityEvaluationRequest>,
  action: SandboxSecurityAction
): SandboxSecurityDecision {
  const submission = request.submission;
  return {
    schema_version: "sandbox-security-decision.v1",
    decision_id: "decision:00000000-0000-4000-8000-000000000001",
    request_id: submission.request_id,
    evaluation_mode: "enforcement",
    stage: submission.stage,
    policy_profile_id: submission.policy_profile_id,
    verdict: action === "allow" ? "no_detected_risk" : "risk_detected",
    action,
    risk_level: action === "allow" ? "info" : "high",
    findings: [],
    detector_runs: [],
    evidence_refs: [],
    created_at: "2026-08-08T00:00:00.000Z"
  };
}

async function createPrivacyBarrierFixture(input: Readonly<{
  engineFailure?: boolean;
  auditMode?: "accepted" | "rejected" | "malformed";
  actionByStage?: Partial<
    Record<"user_input" | "model_output" | "tool_request", SandboxSecurityAction>
  >;
}> = {}): Promise<PrivacyBarrierFixture> {
  const auditBodies: Uint8Array[] = [];
  const sentinels = {
    prompt: "G4-P5T3-Prompt-Sentinel-0a91",
    assistant: "G4-P5T3-Assistant-Sentinel-7b42",
    tool: "G4-P5T3-Tool-Sentinel-3c73",
    outbound: "G4-P5T3-Outbound-Sentinel-5d64"
  } as const;
  let requestCounter = 0;
  let auditCounter = 0;
  let monotonic = 0;
  const runtimePorts: OpenClawSecurityRuntimePorts = {
    internalAuditOrigins: ["http://sandbox-security-backend:3001"],
    nextEvaluationRequestId: () => `request:${probeUuid(++requestCounter)}`,
    nextAuditEventId: () => `audit:${probeUuid(++auditCounter)}`,
    nextDecisionId: () => `decision:${probeUuid(1)}`,
    now: () => "2026-08-08T00:00:00.000Z",
    monotonicNowMs: () => (monotonic += 5),
    scheduleTimeout: (delayMs, callback) => {
      const timer = setTimeout(callback, delayMs);
      return () => clearTimeout(timer);
    }
  };
  const auditTransport = {
    async post(transportInput: Readonly<{ body: Uint8Array }>) {
      const body = new Uint8Array(transportInput.body);
      auditBodies.push(body);
      if (input.auditMode === "rejected") {
        throw new Error("audit transport rejected");
      }
      if (input.auditMode === "malformed") {
        return { status: 201, body: new TextEncoder().encode("{}") };
      }
      const parsed = JSON.parse(new TextDecoder().decode(body)) as RecordValue;
      return {
        status: 201,
        body: new TextEncoder().encode(
          JSON.stringify({
            success: true,
            message: "accepted",
            data: {
              schema_version: "sandbox-security-enforcement-audit-ack.v1",
              event_id: parsed.event_id,
              status: "accepted",
              occurred_at: "2026-08-08T00:00:00.000Z"
            },
            error_code: null,
            request_id: "request:audit-probe"
          })
        )
      };
    }
  };
  const actionByStage: Readonly<Record<string, SandboxSecurityAction>> = {
    user_input: "allow",
    model_output: "alert",
    tool_request: "ask",
    ...(input.actionByStage ?? {})
  };
  const plugin = await createOpenClawSecurityPlugin({
    config: {
      policyProfileId: "sandbox-security-balanced.v1",
      productionMode: "rule_only",
      auditEndpoint:
        "http://sandbox-security-backend:3001/internal/sandbox/security/enforcement-events",
      auditCapabilityToken: `sbxcap_v1.${"A".repeat(43)}`
    },
    runtime_ports: runtimePorts,
    audit_transport: auditTransport,
    engine_factory: async () => ({
      evaluate: async (request: Readonly<SandboxSecurityEvaluationRequest>) => {
        if (input.engineFailure === true) throw new Error("engine failed");
        const action = actionByStage[request.submission.stage] ?? "deny";
        return privacyDecision(request, action);
      }
    })
  });
  const handlers = new Map<string, (event: unknown, context: unknown) => Promise<unknown>>();
  plugin.register({
    on: (name: string, handler: (event: unknown, context: unknown) => Promise<unknown>) => {
      handlers.set(name, handler);
    }
  });
  return {
    handlers,
    auditBodies,
    sentinels,
    health: plugin.health
  };
}

function privacyContext(sentinel: string, runId = "run-p5t3"): RecordValue {
  return {
    schema_version: OPENCLAW_SECURITY_TURN_CONTEXT_SCHEMA,
    prompt: sentinel,
    runId,
    sessionKey: "session-p5t3"
  };
}

function privacyAssistant(sentinel: string, toolSentinel: string): RecordValue {
  return {
    schema_version: "openclaw-security-assistant-projection.v1",
    text_parts: [sentinel],
    tool_calls: [
      {
        call_id: "call-p5t3",
        tool_name: "fs.read",
        arguments: { payload: toolSentinel }
      }
    ]
  };
}

function privacyEvent(
  name: string,
  sentinels: Readonly<Record<string, string>>,
  runId = "run-p5t3"
): RecordValue {
  const base: RecordValue = {
    schema_version: OPENCLAW_SECURITY_HOOK_EVENT_SCHEMA,
    runId,
    sessionKey: "session-p5t3"
  };
  if (name === "before_agent_run") return base;
  if (name === "before_model_output_delivery") {
    return {
      ...base,
      assistant: privacyAssistant(sentinels.assistant, sentinels.tool)
    };
  }
  if (name === "before_tool_execution") {
    return {
      ...base,
      callId: "call-p5t3",
      assistant: privacyAssistant(sentinels.assistant, sentinels.tool),
      tool: {
        call_id: "call-p5t3",
        tool_name: "fs.read",
        arguments: { payload: sentinels.tool }
      }
    };
  }
  return { ...base, outbound: sentinels.outbound };
}

function privacyArtifacts(
  fixture: PrivacyBarrierFixture,
  results: readonly unknown[]
): readonly PrivacyArtifact[] {
  return [
    { id: "host-results", bytes: Buffer.from(JSON.stringify(results), "utf8") },
    {
      id: "audit-requests",
      bytes: Buffer.concat(fixture.auditBodies.map((body) => Buffer.from(body)))
    },
    { id: "health", bytes: Buffer.from(JSON.stringify(fixture.health()), "utf8") },
    { id: "opaque-runtime-state", bytes: Buffer.from("[]", "ascii") },
    { id: "stdout", bytes: Buffer.alloc(0) },
    { id: "stderr", bytes: Buffer.alloc(0) },
    { id: "metrics", bytes: Buffer.from(JSON.stringify({ count: results.length }), "utf8") }
  ];
}

test("REQ-SBX-GENERAL-004 P5-T3 real local barriers keep raw and transformed sentinels out of managed surfaces", async () => {
  const fixture = await createPrivacyBarrierFixture();
  const results: unknown[] = [];
  for (const name of OPENCLAW_SECURITY_HOOK_NAMES) {
    const handler = fixture.handlers.get(name);
    assert.ok(handler, `${name} must be registered exactly once`);
    results.push(
      await handler(
        privacyEvent(name, fixture.sentinels),
        privacyContext(fixture.sentinels.prompt)
      )
    );
  }

  assert.equal(results.length, 4);
  for (const result of results) {
    const envelope = result as RecordValue;
    assert.equal(envelope.schema_version, OPENCLAW_SECURITY_HOOK_RESULT_SCHEMA);
    const barrier = envelope.barrier as RecordValue;
    if (barrier.outcome === "replace") {
      assert.equal(PRIVACY_REPLACEMENT_TEXTS.has(String(barrier.replacement_text)), true);
    }
  }

  const artifacts = privacyArtifacts(fixture, results);
  for (const [name, sentinel] of Object.entries(fixture.sentinels)) {
    assert.deepEqual(
      scanManagedArtifacts(artifacts, sentinel),
      [],
      `${name} sentinel leaked from a managed surface`
    );
  }
  assert.equal(fixture.health().enforcement, "healthy");
  assert.equal(fixture.health().audit, "healthy");
});

test("REQ-SBX-GENERAL-004 P5-T3 deny is exercised at every barrier without returning original content", async () => {
  const fixture = await createPrivacyBarrierFixture({
    actionByStage: {
      user_input: "deny",
      model_output: "deny",
      tool_request: "deny"
    }
  });
  const results: unknown[] = [];
  for (const name of OPENCLAW_SECURITY_HOOK_NAMES) {
    const handler = fixture.handlers.get(name);
    assert.ok(handler, `${name} must be registered exactly once`);
    const result = await handler(
      privacyEvent(name, fixture.sentinels),
      privacyContext(fixture.sentinels.prompt)
    );
    results.push(result);
    const barrier = (result as RecordValue).barrier as RecordValue;
    assert.equal(barrier.outcome, "replace");
    assert.equal(barrier.replacement_text, "Blocked by sandbox security policy.");
  }

  for (const sentinel of Object.values(fixture.sentinels)) {
    assert.deepEqual(scanManagedArtifacts(privacyArtifacts(fixture, results), sentinel), []);
  }
});

test("REQ-SBX-GENERAL-004 P5-T3 failure, correlation, and audit-degraded paths stay content-free", async () => {
  const failedFixture = await createPrivacyBarrierFixture({ engineFailure: true });
  const failedHandler = failedFixture.handlers.get("before_agent_run");
  assert.ok(failedHandler);
  const failedResult = await failedHandler(
    privacyEvent("before_agent_run", failedFixture.sentinels),
    privacyContext(failedFixture.sentinels.prompt)
  );
  assert.equal(
    ((failedResult as RecordValue).barrier as RecordValue).replacement_text,
    "Security evaluation unavailable. This action was not completed."
  );

  const degradedFixture = await createPrivacyBarrierFixture({ auditMode: "malformed" });
  const degradedHandler = degradedFixture.handlers.get("before_agent_run");
  assert.ok(degradedHandler);
  await degradedHandler(
    privacyEvent("before_agent_run", degradedFixture.sentinels),
    privacyContext(degradedFixture.sentinels.prompt)
  );
  assert.equal(degradedFixture.health().enforcement, "healthy");
  assert.equal(degradedFixture.health().audit, "degraded");

  const driftHandler = degradedFixture.handlers.get("before_agent_run");
  assert.ok(driftHandler);
  const driftResult = await driftHandler(
    privacyEvent("before_agent_run", degradedFixture.sentinels, "run-drift"),
    privacyContext(degradedFixture.sentinels.prompt, "run-p5t3")
  );
  assert.equal(
    ((driftResult as RecordValue).barrier as RecordValue).replacement_text,
    "Security evaluation unavailable. This action was not completed."
  );

  const rejectedFixture = await createPrivacyBarrierFixture({ auditMode: "rejected" });
  const rejectedHandler = rejectedFixture.handlers.get("before_agent_run");
  assert.ok(rejectedHandler);
  await rejectedHandler(
    privacyEvent("before_agent_run", rejectedFixture.sentinels),
    privacyContext(rejectedFixture.sentinels.prompt)
  );
  assert.equal(rejectedFixture.health().enforcement, "healthy");
  assert.equal(rejectedFixture.health().audit, "degraded");

  const allArtifacts = [
    ...privacyArtifacts(failedFixture, [failedResult]),
    ...privacyArtifacts(degradedFixture, [driftResult]),
    ...privacyArtifacts(rejectedFixture, [])
  ];
  for (const sentinel of Object.values(failedFixture.sentinels)) {
    assert.deepEqual(scanManagedArtifacts(allArtifacts, sentinel), []);
  }
  for (const sentinel of Object.values(degradedFixture.sentinels)) {
    assert.deepEqual(scanManagedArtifacts(allArtifacts, sentinel), []);
  }

  const ephemeral = mkdtempSync(path.join(tmpdir(), "g4-p5t3-ephemeral-"));
  rmSync(ephemeral, { recursive: true, force: true });
  assert.equal(existsSync(ephemeral), false);
});
