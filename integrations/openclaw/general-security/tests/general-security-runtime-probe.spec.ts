import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

type RecordValue = Record<string, unknown>;

const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..");
const OPENCLAW_VERSION = "2026.6.34";
const PLUGIN_ID = "agent-security-sandbox-general";
const HOOKS = [
  "before_agent_run",
  "before_model_output_delivery",
  "before_tool_execution",
  "before_message_delivery"
] as const;

const COMPLETE_INSPECT = Object.freeze({
  id: PLUGIN_ID,
  name: "Agent Security Sandbox General",
  runtime_version: OPENCLAW_VERSION,
  plugin_count: 1,
  registration_count: 1,
  hooks: [...HOOKS],
  diagnostics: []
});

const COMPLETE_DYNAMIC = Object.freeze({
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
});

async function loadProbe(): Promise<RecordValue> {
  return (await import("../src/general-security/runtime-probe.ts").catch(() => ({}))) as RecordValue;
}

function fakeExec(output: RecordValue, calls: Array<RecordValue>) {
  return ((file: string, args: readonly string[], options: RecordValue) => {
    calls.push({ file, args: [...args], options });
    return JSON.stringify(output);
  }) as typeof execFileSync;
}

test("REQ-SBX-GENERAL-004 P4-T8 resolves and invokes only the nested pinned OpenClaw CLI", async () => {
  const probe = await loadProbe();
  const resolveCli = probe.resolveNestedOpenClawCli;
  assert.equal(typeof resolveCli, "function", "nested CLI resolver must be exported");

  const cliPath = (resolveCli as Function)(PACKAGE_ROOT) as string;
  assert.equal(cliPath, path.join(PACKAGE_ROOT, "node_modules/openclaw/openclaw.mjs"));

  const calls: Array<RecordValue> = [];
  const runProbe = probe.runOpenClawSecurityRuntimeProbe;
  assert.equal(typeof runProbe, "function", "runtime probe must be exported");

  await (runProbe as Function)({
    packageRoot: PACKAGE_ROOT,
    execFileSync: fakeExec(COMPLETE_INSPECT, calls),
    dynamicProbe: async () => COMPLETE_DYNAMIC,
    env: { PATH: "", OPENCLAW_STATE_DIR: "/tmp/g4-probe-state" }
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].file, process.execPath);
  assert.deepEqual(calls[0].args, [
    cliPath,
    "plugins",
    "inspect",
    PLUGIN_ID,
    "--runtime",
    "--json"
  ]);
  assert.equal((calls[0].options as RecordValue).cwd, PACKAGE_ROOT);
  assert.equal(
    ((calls[0].options as RecordValue).env as RecordValue).PATH,
    "",
    "the probe must not depend on a global PATH executable"
  );
});

test("REQ-SBX-GENERAL-004 P4-T8 returns the closed four-barrier probe result", async () => {
  const probe = await loadProbe();
  const runProbe = probe.runOpenClawSecurityRuntimeProbe;
  assert.equal(typeof runProbe, "function", "runtime probe must be exported");

  const result = (await (runProbe as Function)({
    packageRoot: PACKAGE_ROOT,
    execFileSync: fakeExec(COMPLETE_INSPECT, []),
    dynamicProbe: async () => COMPLETE_DYNAMIC
  })) as RecordValue;

  assert.deepEqual(Object.keys(result).sort(), [
    "audit_content_free",
    "barrier_names",
    "engine_failure_closed",
    "fixed_replacement_host_only",
    "input_correlated",
    "input_ordered",
    "model_output_correlated",
    "model_output_ordered",
    "outbound_correlated",
    "outbound_ordered",
    "plugin_id",
    "plugin_registration_count",
    "runtime_version",
    "schema_version",
    "tool_correlated",
    "tool_ordered",
    "diagnostics"
  ].sort());
  assert.equal(result.schema_version, "openclaw-security-runtime-probe.v1");
  assert.equal(result.plugin_id, PLUGIN_ID);
  assert.equal(result.runtime_version, OPENCLAW_VERSION);
  assert.equal(result.plugin_registration_count, 1);
  assert.deepEqual(result.barrier_names, HOOKS);
  assert.deepEqual(result.diagnostics, []);
  for (const key of Object.keys(COMPLETE_DYNAMIC)) {
    assert.equal(result[key], true, `${key} must be true`);
  }
});

test("REQ-SBX-GENERAL-004 P4-T8 rejects every static or dynamic capability mutation", async () => {
  const probe = await loadProbe();
  const runProbe = probe.runOpenClawSecurityRuntimeProbe;
  assert.equal(typeof runProbe, "function", "runtime probe must be exported");

  const mutations: Array<{ name: string; inspect?: RecordValue; dynamic?: RecordValue }> = [
    { name: "wrong version", inspect: { ...COMPLETE_INSPECT, runtime_version: "2026.6.10" } },
    { name: "missing hook", inspect: { ...COMPLETE_INSPECT, hooks: HOOKS.slice(1) } },
    { name: "duplicate hook", inspect: { ...COMPLETE_INSPECT, hooks: [...HOOKS, HOOKS[0]] } },
    { name: "duplicate plugin", inspect: { ...COMPLETE_INSPECT, plugin_count: 2 } },
    { name: "diagnostic", inspect: { ...COMPLETE_INSPECT, diagnostics: [{ code: "unexpected", message: "opaque" }] } },
    { name: "ordering", dynamic: { ...COMPLETE_DYNAMIC, outbound_ordered: false } },
    { name: "correlation", dynamic: { ...COMPLETE_DYNAMIC, tool_correlated: false } },
    { name: "host replacement", dynamic: { ...COMPLETE_DYNAMIC, fixed_replacement_host_only: false } },
    { name: "engine failure", dynamic: { ...COMPLETE_DYNAMIC, engine_failure_closed: false } },
    { name: "audit content", dynamic: { ...COMPLETE_DYNAMIC, audit_content_free: false } }
  ];

  for (const mutation of mutations) {
    await assert.rejects(
      () => (runProbe as Function)({
        packageRoot: PACKAGE_ROOT,
        execFileSync: fakeExec(mutation.inspect ?? COMPLETE_INSPECT, []),
        dynamicProbe: async () => mutation.dynamic ?? COMPLETE_DYNAMIC
      }),
      `${mutation.name} must fail closed`
    );
  }
});

test("REQ-SBX-GENERAL-004 P4-T8 rejects a changed production patch identity before runtime checks", async () => {
  const probe = await loadProbe();
  const runProbe = probe.runOpenClawSecurityRuntimeProbe;
  assert.equal(typeof runProbe, "function", "runtime probe must be exported");

  const manifest = JSON.parse(
    readFileSync(
      path.join(PACKAGE_ROOT, "patches/openclaw-2026.6.34-general-security.manifest.json"),
      "utf8"
    )
  ) as RecordValue;
  const verifyIdentity = probe.verifyProductionRuntimeIdentity;
  assert.equal(typeof verifyIdentity, "function", "production identity verifier must be exported");

  assert.throws(
    () =>
      (verifyIdentity as Function)({
        packageRoot: PACKAGE_ROOT,
        manifest: { ...manifest, patch_sha256: "0".repeat(64) }
      }),
    "a changed patch identity must fail closed"
  );
});
