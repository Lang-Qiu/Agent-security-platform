import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

type RecordValue = Record<string, unknown>;

const PACKAGE_ROOT = path.resolve(
  import.meta.dirname,
  "../../integrations/openclaw/general-security"
);
const PLUGIN_ID = "agent-security-sandbox-general";
const OPENCLAW_VERSION = "2026.6.34";

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
