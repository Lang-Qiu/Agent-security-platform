import assert from "node:assert/strict";
import test from "node:test";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

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
  const probeIndex = dockerfile.indexOf("runOpenClawSecurityRuntimeProbe");
  const gatewayIndex = dockerfile.indexOf("'gateway'");
  assert.ok(probeIndex >= 0, "startup must invoke the sealed runtime probe");
  assert.ok(gatewayIndex > probeIndex, "gateway must start only after the probe resolves");
  assert.match(dockerfile, /spawnSync\(process\.execPath/);
  assert.match(dockerfile, /process\.exitCode = child\.status/);
  assert.match(dockerfile, /ENV TMPDIR=\/tmp\/openclaw/);
  assert.match(dockerfile, /ENV OPENCLAW_STATE_DIR=\/run\/openclaw-security/);
  assert.match(dockerfile, /USER node/);
});
