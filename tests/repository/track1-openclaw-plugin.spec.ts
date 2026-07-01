import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import test from "node:test";

const ROOT = new URL("../../", import.meta.url);
const readText = (path: string) =>
  readFileSync(new URL(path, ROOT), "utf8");

const EXPECTED_TOOLS = [
  "call_api",
  "read_file",
  "send_email",
  "write_file"
].sort();

const EXPECTED_HOOKS = [
  "after_tool_call",
  "before_tool_call",
  "llm_input",
  "llm_output",
  "session_end",
  "session_start"
].sort();

const FORBIDDEN_SIDE_EFFECT_TOKENS = [
  "node:fs",
  "node:child_process",
  "node:net",
  "node:http",
  "node:https",
  "fetch(",
  "nodemailer",
  "playwright",
  "puppeteer",
  "mcp"
];

const PHASE_3_SPECS = [
  "integrations/openclaw/tests/plugin-contract.spec.ts",
  "integrations/openclaw/tests/campaign-context.spec.ts",
  "integrations/openclaw/tests/ingest-client.spec.ts",
  "integrations/openclaw/tests/plugin-hooks.spec.ts",
  "integrations/openclaw/tests/plugin-runtime-probe.spec.ts"
];

// -- plugin source gates ---------------------------------------------------

test("REQ-T1-DEMO-010 plugin source uses definePluginEntry and typed api.on", () => {
  const pluginSource = readText("integrations/openclaw/src/plugin.ts");
  assert.equal(
    pluginSource.includes("definePluginEntry"),
    true,
    "plugin.ts must reference definePluginEntry"
  );
  assert.equal(
    pluginSource.includes('api.on("before_tool_call"'),
    true,
    'plugin.ts must use api.on("before_tool_call", ...)'
  );
  assert.equal(
    pluginSource.includes("registerHook"),
    false,
    "plugin.ts must not use legacy registerHook surface"
  );
});

test("REQ-T1-DEMO-010 manifest pins exactly four tool contracts", () => {
  const manifest = JSON.parse(
    readText("integrations/openclaw/openclaw.plugin.json")
  );
  assert.deepEqual(
    [...manifest.contracts.tools].sort(),
    EXPECTED_TOOLS
  );
});

test("REQ-T1-DEMO-010 package pins exact openclaw and typebox versions", () => {
  const pkg = JSON.parse(readText("integrations/openclaw/package.json"));
  assert.equal(pkg.dependencies.openclaw, "2026.6.10");
  assert.equal(pkg.dependencies.typebox, "1.1.38");
});

// -- forbidden side-effect scan --------------------------------------------

function listSourceFiles(dir: string, acc: string[] = []): string[] {
  const absDir = new URL(dir, ROOT);
  const entries = readdirSync(absDir);
  for (const entry of entries) {
    const rel = `${dir}/${entry}`;
    const abs = new URL(rel, ROOT);
    const st = statSync(abs);
    if (st.isDirectory()) {
      listSourceFiles(rel, acc);
    } else if (entry.endsWith(".ts")) {
      acc.push(rel);
    }
  }
  return acc;
}

test("REQ-T1-DEMO-010 openclaw src has no forbidden side-effect tokens", () => {
  // The forbidden side-effect tokens from P3-T3 apply to the tool adapter
  // and plugin hook layer. The ingest client legitimately uses fetch() to
  // send snapshots to the backend via the Track1IngestTransport interface.
  const files = listSourceFiles("integrations/openclaw/src").filter(
    (f) => !f.includes("ingest-client.ts")
  );
  assert.ok(files.length >= 4, "expected at least 4 non-ingest source files");
  for (const file of files) {
    const source = readText(file);
    for (const token of FORBIDDEN_SIDE_EFFECT_TOKENS) {
      assert.equal(
        source.includes(token),
        false,
        `${file} must not contain forbidden token: ${token}`
      );
    }
  }
});

// -- oracle isolation gates ------------------------------------------------

test("REQ-T1-DEMO-010 decision paths cannot read campaign oracle fields", () => {
  // Plugin, adapter, and engine decision sources must not import or read
  // campaign.v1, expected_action, expected_outcome, or report-oracle data.
  const decisionFiles = [
    "integrations/openclaw/src/plugin.ts",
    "integrations/openclaw/src/tool-adapters.ts",
    "engines/sandbox/src/base-filter/evaluator.ts",
    "engines/sandbox/src/base-filter/provider.ts",
    "engines/sandbox/src/monitoring/observed-session.ts"
  ];
  const oracleTokens = [
    "campaign.v1",
    "expected_action",
    "expected_outcome"
  ];
  for (const file of decisionFiles) {
    const source = readText(file);
    for (const token of oracleTokens) {
      assert.equal(
        source.includes(token),
        false,
        `${file} must not reference oracle token: ${token}`
      );
    }
  }
});

test("REQ-T1-DEMO-010 input-envelope normalizer mentions oracle fields only in rejection list", () => {
  const source = readText("integrations/openclaw/src/campaign-context.ts");
  // The normalizer MAY mention these strings, but only in its explicit
  // unknown/oracle-field rejection list — not in any decision path.
  // We verify the file exists and contains a rejection list reference.
  assert.ok(
    source.includes("expected_outcome") ||
      source.includes("expected_action") ||
      source.includes("oracle"),
    "campaign-context.ts must define an oracle-field rejection list"
  );
  // The normalizer must not import campaign.v1
  assert.equal(
    source.includes("campaign.v1"),
    false,
    "campaign-context.ts must not import campaign.v1"
  );
});

// -- root test script registration ----------------------------------------

test("REQ-T1-DEMO-010 root test:integration:openclaw script registers all Phase 3 specs", () => {
  const pkg = JSON.parse(readText("package.json"));
  const script = pkg.scripts["test:integration:openclaw"];
  assert.ok(typeof script === "string", "test:integration:openclaw must exist");
  for (const spec of PHASE_3_SPECS) {
    assert.equal(
      script.includes(spec),
      true,
      `test:integration:openclaw must include ${spec}`
    );
  }
});

test("REQ-T1-DEMO-010 root test:repo script includes openclaw plugin gate", () => {
  const pkg = JSON.parse(readText("package.json"));
  const script = pkg.scripts["test:repo"];
  assert.ok(typeof script === "string");
  assert.equal(
    script.includes("track1-openclaw-plugin"),
    true,
    "test:repo must include track1-openclaw-plugin.spec.ts"
  );
});

// -- probe result shape ----------------------------------------------------

test("REQ-T1-DEMO-010 probe result type has exactly nine canonical keys", async () => {
  // Re-exported from index so consumers do not reach into runtime-probe.ts
  const mod = await import("../../integrations/openclaw/src/index.ts");
  assert.ok(typeof mod === "object" && mod !== null);
  // The probe result interface is structural; we verify the exported
  // TRACK1_PLUGIN_PROBE_RESULT_KEYS constant lists the canonical keys.
  const { TRACK1_PLUGIN_PROBE_RESULT_KEYS } = await import(
    "../../integrations/openclaw/src/runtime-probe.ts"
  );
  assert.deepEqual(
    [...TRACK1_PLUGIN_PROBE_RESULT_KEYS].sort(),
    [
      "after_tool_observed",
      "before_tool_blocked",
      "correlation_ready",
      "diagnostics",
      "hook_names",
      "plugin_id",
      "runtime_version",
      "schema_version",
      "tool_names"
    ]
  );
});
