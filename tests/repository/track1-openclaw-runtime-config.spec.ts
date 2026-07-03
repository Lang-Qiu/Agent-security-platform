import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ROOT = new URL("../../", import.meta.url);

function readText(path: string): string {
  return readFileSync(new URL(path, ROOT), "utf8");
}

function loadJson5(path: string): Record<string, unknown> {
  // The committed .json5 files are written as valid JSON (a strict subset
  // of JSON5), so JSON.parse is sufficient and avoids a new dependency.
  return JSON.parse(readText(path));
}

test("REQ-T1-DEMO-010 OpenClaw config exposes only three agents and four tools", () => {
  const config = loadJson5("integrations/openclaw/config/openclaw.json5");
  const agents = loadJson5("integrations/openclaw/config/agents.json5") as {
    agents: Array<{ id: string; scenario_id: string; model: string }>;
  };

  assert.deepEqual(
    agents.agents.map((agent) => agent.id),
    [
      "agent:track1:prompt-injection",
      "agent:track1:tool-hijack",
      "agent:track1:memory-poison"
    ]
  );
  assert.deepEqual(
    agents.agents.map((agent) => agent.scenario_id),
    ["T1-SC-001", "T1-SC-002", "T1-SC-003"]
  );
  for (const agent of agents.agents) {
    assert.equal(agent.model, "${OPENCLAW_MODEL_ID}");
  }

  const tools = config.tools as {
    allow: string[];
    builtins: Record<string, boolean>;
    channels: { enabled: boolean };
  };
  assert.deepEqual(tools.allow.slice().sort(), [
    "call_api",
    "read_file",
    "send_email",
    "write_file"
  ]);
  for (const key of [
    "shell",
    "process",
    "filesystemWrite",
    "browser",
    "node",
    "messaging",
    "network",
    "mcp"
  ]) {
    assert.equal(tools.builtins[key], false, key);
  }
  assert.equal(tools.channels.enabled, false);

  const skills = config.skills as { enabled: boolean };
  const marketplace = config.marketplace as { enabled: boolean };
  const plugins = config.plugins as { thirdParty: boolean };
  const logging = config.logging as {
    persistTranscripts: boolean;
    redactSensitiveToolData: boolean;
  };
  const workspace = config.workspace as { path: string };
  const session = config.session as { store: string };

  assert.equal(skills.enabled, false);
  assert.equal(marketplace.enabled, false);
  assert.equal(plugins.thirdParty, false);
  assert.equal(logging.persistTranscripts, false);
  assert.equal(logging.redactSensitiveToolData, true);
  assert.equal(workspace.path, "/workspace");
  assert.equal(session.store, "/tmp/openclaw");
});

test("REQ-T1-DEMO-010 OpenClaw config rejects unapproved keys", () => {
  const config = loadJson5("integrations/openclaw/config/openclaw.json5");
  assert.deepEqual(
    Object.keys(config).sort(),
    [
      "gateway",
      "logging",
      "marketplace",
      "models",
      "plugins",
      "schema_version",
      "session",
      "skills",
      "tools",
      "workspace"
    ].sort()
  );
});

test("REQ-T1-DEMO-010 OpenClaw model provider config has no hardcoded credential", () => {
  const config = loadJson5("integrations/openclaw/config/openclaw.json5");
  const raw = readText("integrations/openclaw/config/openclaw.json5");
  assert.equal(raw.includes("${OPENCLAW_MODEL_API_KEY}"), true);
  assert.equal(raw.includes("${OPENCLAW_MODEL_BASE_URL}"), true);
  const models = config.models as {
    providers: { "openai-compat": { apiKey: string; baseUrl: string; api: string } };
  };
  assert.equal(models.providers["openai-compat"].apiKey, "${OPENCLAW_MODEL_API_KEY}");
  assert.equal(models.providers["openai-compat"].baseUrl, "${OPENCLAW_MODEL_BASE_URL}");
  assert.equal(models.providers["openai-compat"].api, "openai-completions");
});

test("REQ-T1-DEMO-010 OpenClaw image pins base digest and exact package", () => {
  const dockerfile = readText("deploy/track1/Dockerfile.openclaw");
  assert.match(
    dockerfile,
    /^FROM node:22\.19\.0-bookworm-slim@sha256:[a-f0-9]{64}$/m
  );
  assert.equal(dockerfile.includes("openclaw@2026.6.10"), true);
  assert.equal(/ARG .*KEY|ARG .*TOKEN/i.test(dockerfile), false);
  assert.equal(dockerfile.includes(":latest"), false);
});

test("REQ-T1-DEMO-010 OpenClaw image never accepts a credential build argument", () => {
  const dockerfile = readText("deploy/track1/Dockerfile.openclaw");
  assert.equal(/^ARG\s+/m.test(dockerfile), false);
});
