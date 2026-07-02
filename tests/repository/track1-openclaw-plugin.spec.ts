import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import test from "node:test";

const ROOT = new URL("../../", import.meta.url);
const readText = (path: string) =>
  readFileSync(new URL(path, ROOT), "utf8");

const PHASE_3_SPECS = [
  "integrations/openclaw/tests/plugin-contract.spec.ts",
  "integrations/openclaw/tests/campaign-context.spec.ts",
  "integrations/openclaw/tests/ingest-client.spec.ts",
  "integrations/openclaw/tests/plugin-hooks.spec.ts",
  "integrations/openclaw/tests/plugin-runtime-probe.spec.ts"
];

test("REQ-T1-DEMO-010 root gates permanently execute the OpenClaw integration", () => {
  const pkg = JSON.parse(readText("package.json")) as {
    scripts: Record<string, string>;
  };
  const integration = pkg.scripts["test:integration:openclaw"];

  assert.equal(typeof integration, "string");
  for (const spec of PHASE_3_SPECS) {
    assert.ok(integration.includes(spec), `missing integration test: ${spec}`);
  }
  assert.ok(pkg.scripts["test:all"].includes("npm run test:integration:openclaw"));
  assert.ok(
    pkg.scripts["test:engine:sandbox"].includes(
      "engines/sandbox/tests/attack-monitor-observed-session.spec.ts"
    )
  );
  assert.ok(
    pkg.scripts["test:repo"].includes(
      "tests/repository/track1-openclaw-plugin.spec.ts"
    )
  );
});

test("REQ-T1-DEMO-010 published package points only to a built default entry", () => {
  const pkg = JSON.parse(readText("integrations/openclaw/package.json"));
  const manifest = JSON.parse(
    readText("integrations/openclaw/openclaw.plugin.json")
  );
  const indexSource = readText("integrations/openclaw/src/index.ts");

  assert.deepEqual(pkg.openclaw.extensions, ["./dist/index.js"]);
  assert.deepEqual(pkg.files, ["dist", "openclaw.plugin.json"]);
  assert.equal(pkg.scripts.prepack, "npm run build");
  assert.equal(manifest.main, "./dist/index.js");
  assert.match(indexSource, /export\s+\{\s*default\s*\}\s+from\s+"\.\/plugin\.ts"/);
});

test("REQ-T1-DEMO-010 production decision path uses REQ-008 without oracle fields", () => {
  const pluginSource = readText("integrations/openclaw/src/plugin.ts");
  assert.ok(pluginSource.includes("new RuleBasedDecisionProvider()"));

  for (const path of [
    "integrations/openclaw/src/plugin.ts",
    "integrations/openclaw/src/tool-adapters.ts",
    "engines/sandbox/src/monitoring/observed-session.ts"
  ]) {
    const source = readText(path);
    assert.equal(source.includes("expected_action"), false, path);
    assert.equal(source.includes("expected_outcome"), false, path);
    assert.equal(source.includes("campaign.v1"), false, path);
  }
});

test("REQ-T1-DEMO-010 source trees contain no checked-in TypeScript build artifacts", () => {
  const roots = [
    "shared",
    "engines/sandbox/src/monitoring",
    "engines/sandbox/src/simulated-tools"
  ];
  const generated: string[] = [];

  const scan = (path: string) => {
    for (const entry of readdirSync(new URL(path, ROOT))) {
      const child = `${path}/${entry}`;
      if (statSync(new URL(child, ROOT)).isDirectory()) {
        scan(child);
      } else if (entry.endsWith(".js")) {
        generated.push(child);
      }
    }
  };
  roots.forEach(scan);
  assert.deepEqual(generated, []);
});
