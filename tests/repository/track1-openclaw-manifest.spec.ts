import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import YAML from "yaml";

const ROOT = new URL("../../", import.meta.url);
const readText = (path: string) =>
  readFileSync(new URL(path, ROOT), "utf8");

const EXPECTED = [
  ["agent:track1:prompt-injection", "T1-SC-001", "T1-SC-001-C001", "deny",
    "ff58240ac3ec34c16e3c3f1d3ffe2d182f56df8942d6eba7c8cf1d121da93c27"],
  ["agent:track1:prompt-injection", "T1-SC-001", "T1-SC-001-C002", "deny",
    "91e89954fa073dfd9eedc0023139f03a0d598174fd13529365d40f40ab5be8da"],
  ["agent:track1:prompt-injection", "T1-SC-001", "T1-SC-001-C003", "allow",
    "665ab3c0c155edd33d1da25089fdc71f502139e0b19be0f259d2a56802dc75e3"],
  ["agent:track1:tool-hijack", "T1-SC-002", "T1-SC-002-C001", "deny",
    "4434309a79c9c0fd66a5e375df6b222990025c2d456e2ec1db757a2da7b214ac"],
  ["agent:track1:tool-hijack", "T1-SC-002", "T1-SC-002-C002", "ask",
    "9c621ec7fa7385c3ba3ded37d9e4f9a4c1ea6a0f9b22f23be7a4f09d2d8eac99"],
  ["agent:track1:tool-hijack", "T1-SC-002", "T1-SC-002-C003", "deny",
    "7b954fa3ecb88d99556338bae19171c0da7fdafe2294486bd0213523f663838a"],
  ["agent:track1:memory-poison", "T1-SC-003", "T1-SC-003-C001", "ask",
    "0f855bcc2204b38d306a854bb625138339b904001e15fdf0542fc1ddd8453a32"],
  ["agent:track1:memory-poison", "T1-SC-003", "T1-SC-003-C002", "deny",
    "42d546f705958a954533556c156b1919821f7f4cc9c585ecb328dd971784e2bf"],
  ["agent:track1:memory-poison", "T1-SC-003", "T1-SC-003-C003", "allow",
    "d254cd494bf2d99fdf4af76aa6c3cba834ff23488f0a2b5fbbfcd8e40b18750a"]
] as const;

test("REQ-T1-DEMO-010 manifest pins workspace and runtime versions", () => {
  const workspace = YAML.parse(readText("pnpm-workspace.yaml"));
  assert.ok(workspace.packages.includes("integrations/*"));

  const pkg = JSON.parse(readText("integrations/openclaw/package.json"));
  assert.equal(pkg.name, "@agent-security-platform/openclaw-integration");
  assert.equal(pkg.private, true);
  assert.equal(pkg.dependencies.openclaw, "2026.6.10");
  assert.equal(pkg.dependencies.typebox, "1.1.38");
});

test("REQ-T1-DEMO-010 manifest fixes three agents and nine cases", () => {
  const manifest = JSON.parse(
    readText("samples/track1/openclaw/campaign.v1.json")
  );
  assert.equal(manifest.schema_version, "track1-openclaw-campaign.v1");
  assert.equal(manifest.max_attempts, 2);
  assert.equal(manifest.agents.length, 3);
  assert.equal(manifest.cases.length, 9);
  assert.deepEqual(
    manifest.cases.map((entry: Record<string, unknown>) => [
      entry.agent_id,
      entry.scenario_id,
      entry.case_id,
      entry.expected_action,
      entry.case_sha256
    ]),
    EXPECTED
  );
});

test("REQ-T1-DEMO-010 manifest hashes every canonical case file", () => {
  const manifest = JSON.parse(
    readText("samples/track1/openclaw/campaign.v1.json")
  );
  for (const entry of manifest.cases) {
    const bytes = readText(entry.case_ref);
    const actual = createHash("sha256").update(bytes).digest("hex");
    assert.equal(actual, entry.case_sha256, entry.case_id);
  }
});

test("REQ-T1-DEMO-010 policy sources cannot import the campaign oracle", () => {
  const forbiddenFiles = [
    "engines/sandbox/src/base-filter/evaluator.ts",
    "engines/sandbox/src/base-filter/provider.ts"
  ];
  for (const file of forbiddenFiles) {
    const source = readText(file);
    assert.doesNotMatch(source, /campaign\.v1|expected_action/);
  }
  const rootPackage = JSON.parse(readText("package.json"));
  assert.match(rootPackage.scripts["test:shared"], /campaign-supervision-contract/);
  assert.match(rootPackage.scripts["test:shared"], /campaign-ingest-contract/);
  assert.match(rootPackage.scripts["test:repo"], /track1-openclaw-manifest/);
});

test("REQ-T1-DEMO-010 pins Node baseline >=22.19.0 for OpenClaw compatibility", () => {
  const rootPackage = JSON.parse(readText("package.json"));
  const engines = rootPackage.engines ?? {};
  assert.match(
    engines.node ?? "",
    /^>=?22\.(19|2\d|\d\d)|^>=?2[3-9]|^>=?\d{3,}/,
    "engines.node must require at least 22.19.0 to satisfy openclaw@2026.6.10"
  );
  const nvmrc = readText(".nvmrc").trim();
  const parts = nvmrc.split(".").map((p) => Number(p));
  assert.ok(
    parts[0] > 22 || (parts[0] === 22 && parts[1] >= 19),
    `.nvmrc must be >=22.19.0 but got ${nvmrc}`
  );
});

const EXPECTED_CASE_REFS = [
  "samples/track1/cases/T1-SC-001/T1-SC-001-C001.json",
  "samples/track1/cases/T1-SC-001/T1-SC-001-C002.json",
  "samples/track1/cases/T1-SC-001/T1-SC-001-C003.json",
  "samples/track1/cases/T1-SC-002/T1-SC-002-C001.json",
  "samples/track1/cases/T1-SC-002/T1-SC-002-C002.json",
  "samples/track1/cases/T1-SC-002/T1-SC-002-C003.json",
  "samples/track1/cases/T1-SC-003/T1-SC-003-C001.json",
  "samples/track1/cases/T1-SC-003/T1-SC-003-C002.json",
  "samples/track1/cases/T1-SC-003/T1-SC-003-C003.json"
] as const;

test("REQ-T1-DEMO-010 manifest fixes exact case_ref values", () => {
  const manifest = JSON.parse(
    readText("samples/track1/openclaw/campaign.v1.json")
  );
  assert.deepEqual(
    manifest.cases.map((entry: Record<string, unknown>) => entry.case_ref),
    EXPECTED_CASE_REFS
  );
});

test("REQ-T1-DEMO-010 manifest enforces unique agent_ids and scenario_ids", () => {
  const manifest = JSON.parse(
    readText("samples/track1/openclaw/campaign.v1.json")
  );
  const agentIds = manifest.agents.map((a: Record<string, unknown>) => a.agent_id);
  assert.equal(new Set(agentIds).size, agentIds.length);
  const scenarioIds = manifest.agents.map((a: Record<string, unknown>) => a.scenario_id);
  assert.equal(new Set(scenarioIds).size, scenarioIds.length);
});

test("REQ-T1-DEMO-010 manifest enforces consistent agent/scenario/case mapping", () => {
  const manifest = JSON.parse(
    readText("samples/track1/openclaw/campaign.v1.json")
  );
  const agentToScenario = new Map<string, string>();
  for (const agent of manifest.agents) {
    agentToScenario.set(agent.agent_id, agent.scenario_id);
  }
  const scenarioToAgent = new Map<string, string>();
  for (const agent of manifest.agents) {
    scenarioToAgent.set(agent.scenario_id, agent.agent_id);
  }
  for (const entry of manifest.cases) {
    assert.equal(
      entry.scenario_id,
      agentToScenario.get(entry.agent_id),
      `case ${entry.case_id} agent/scenario mismatch`
    );
    const prefix = entry.scenario_id;
    assert.ok(
      entry.case_id.startsWith(prefix + "-C"),
      `case ${entry.case_id} does not match scenario ${entry.scenario_id}`
    );
  }
});

test("REQ-T1-DEMO-010 schema enforces unique agents and cases via uniqueItems", () => {
  const schema = JSON.parse(
    readText("samples/track1/openclaw/campaign.schema.json")
  );
  assert.equal(
    schema.properties.agents.uniqueItems,
    true,
    "agents array must declare uniqueItems:true"
  );
  assert.equal(
    schema.properties.cases.uniqueItems,
    true,
    "cases array must declare uniqueItems:true"
  );
});

// -- P1-3 rework: Node baseline in AGENTS.md and Phase plans -------------------

test("REQ-T1-DEMO-010 AGENTS.md and Phase 4 plan pin Node >=22.19.0", () => {
  // The Phase 1 review found the Node baseline bump from 22.17.0 to 22.19.0
  // was not closed: AGENTS.md and the Phase 4 Docker plan still referenced
  // 22.17.x. Every artifact that names the Node baseline must be aligned.
  const agents = readText("AGENTS.md");
  assert.doesNotMatch(
    agents,
    /22\.17\.0/,
    "AGENTS.md must not reference the old 22.17.0 baseline"
  );
  assert.match(
    agents,
    /22\.19\.0/,
    "AGENTS.md must reference the new 22.19.0 baseline"
  );

  const phase4 = readText(
    "docs/superpowers/plans/2026-06-30-track1-demo-010-phase-4-runtime-orchestration.md"
  );
  assert.doesNotMatch(
    phase4,
    /22\.17\.0/,
    "Phase 4 plan must not reference the old 22.17.0 baseline"
  );
  assert.match(
    phase4,
    /22\.19\.0/,
    "Phase 4 plan must reference the new 22.19.0 baseline"
  );
});

// -- P2-5: schema fixed mapping (agent/scenario/case constraints) --------------

test("REQ-T1-DEMO-010 schema pins each agent to its fixed scenario_id", () => {
  // uniqueItems alone cannot prevent wrong agent/scenario pairings. The
  // schema must express the fixed mapping by constraining each agent entry
  // to exactly one (agent_id, scenario_id) pair via const or a tuple of
  // oneOf branch schemas.
  const schema = JSON.parse(
    readText("samples/track1/openclaw/campaign.schema.json")
  );
  const agentsItem = schema.properties.agents.items;
  // The schema must constrain agent_id and scenario_id to a fixed pair, not
  // just an open enum. We accept either a `oneOf` tuple of const objects, or
  // per-agent branch schemas with `const` values.
  assert.ok(
    agentsItem.oneOf || (agentsItem.properties &&
      (agentsItem.properties.agent_id.const ||
       agentsItem.properties.scenario_id.const)),
    "agents.items must constrain (agent_id, scenario_id) to a fixed pair via oneOf or const"
  );
});

test("REQ-T1-DEMO-010 schema pins each case to its fixed (agent, scenario, case) triple", () => {
  const schema = JSON.parse(
    readText("samples/track1/openclaw/campaign.schema.json")
  );
  const casesItem = schema.properties.cases.items;
  // As with agents, the cases must be constrained to fixed triples via oneOf
  // or const, so that a wrong (agent_id, scenario_id, case_id) combination is
  // rejected by JSON Schema validation, not just by runtime normalizers.
  assert.ok(
    casesItem.oneOf || (casesItem.properties &&
      (casesItem.properties.case_id.const ||
       casesItem.properties.agent_id.const)),
    "cases.items must constrain (agent_id, scenario_id, case_id) to a fixed triple via oneOf or const"
  );
});
