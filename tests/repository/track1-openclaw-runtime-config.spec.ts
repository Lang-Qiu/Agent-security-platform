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
    list: Array<{ id: string; model: string }>;
  };

  assert.deepEqual(
    agents.list.map((agent) => agent.id),
    [
      "agent-track1-prompt-injection",
      "agent-track1-tool-hijack",
      "agent-track1-memory-poison"
    ]
  );
  for (const agent of agents.list) {
    assert.equal(agent.model, "openai-compat/${OPENCLAW_MODEL_ID}");
  }

  // Real OpenClaw 2026.6.10 schema has no `tools.builtins`/`tools.channels`
  // keys; the closed tool surface is enforced via `tools.profile: "minimal"`
  // (denies every built-in tool) plus an explicit plugin-tool allowlist.
  const tools = config.tools as { profile: string; allow: string[] };
  assert.equal(tools.profile, "minimal");
  assert.deepEqual(tools.allow.slice().sort(), [
    "call_api",
    "read_file",
    "send_email",
    "write_file"
  ]);

  const skills = config.skills as { allowBundled: string[] };
  const plugins = config.plugins as {
    load: { paths: string[] };
    entries: Record<
      string,
      { enabled: boolean; hooks: { allowConversationAccess: boolean } }
    >;
  };
  const logging = config.logging as { level: string; redactSensitive: string };
  const agentsBlock = config.agents as { defaults: { workspace: string } };
  const session = config.session as { store: string };

  assert.deepEqual(skills.allowBundled, []);
  assert.equal(plugins.entries["agent-security-track1"].enabled, true);
  assert.equal(
    plugins.entries["agent-security-track1"].hooks.allowConversationAccess,
    true
  );
  assert.equal(logging.redactSensitive, "tools");
  assert.equal(logging.level, "info");
  assert.equal(agentsBlock.defaults.workspace, "/workspace");
  assert.equal(session.store, "/tmp/openclaw/sessions.json");
});

test("REQ-T1-DEMO-010 OpenClaw config rejects unapproved keys", () => {
  const config = loadJson5("integrations/openclaw/config/openclaw.json5");
  assert.deepEqual(
    Object.keys(config).sort(),
    [
      "agents",
      "gateway",
      "logging",
      "models",
      "plugins",
      "session",
      "skills",
      "tools"
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

test("REQ-T1-DEMO-010 gateway and runner configs use password-authenticated non-embedded routing", () => {
  const gateway = loadJson5("integrations/openclaw/config/openclaw.json5");
  const runner = loadJson5("deploy/track1/config/openclaw-runner.json5");
  const gatewayBlock = gateway.gateway as {
    mode: string;
    auth: { mode: string; password: string };
  };
  const runnerBlock = runner.gateway as {
    mode: string;
    remote: { transport: string; url: string; password: string };
  };

  assert.equal(gatewayBlock.mode, "local");
  assert.equal(gatewayBlock.auth.mode, "password");
  assert.equal(
    gatewayBlock.auth.password,
    "${OPENCLAW_GATEWAY_PASSWORD}"
  );
  assert.equal(runnerBlock.mode, "remote");
  assert.deepEqual(runnerBlock.remote, {
    transport: "direct",
    url: "ws://127.0.0.1:19001",
    password: "${OPENCLAW_GATEWAY_PASSWORD}"
  });
  assert.equal("models" in runner, false);
});

test("REQ-T1-DEMO-010 OpenClaw image pins base digest and exact package", () => {
  const dockerfile = readText("deploy/track1/Dockerfile.openclaw");
  assert.match(
    dockerfile,
    /^FROM node:22\.19\.0-bookworm-slim@sha256:[a-f0-9]{64}$/m
  );
  assert.equal(dockerfile.includes("openclaw@2026.6.10"), true);
  assert.equal(dockerfile.includes("npm run build"), true);
  assert.equal(
    dockerfile.includes("COPY integrations/openclaw/dist"),
    false
  );
  assert.equal(/ARG .*KEY|ARG .*TOKEN/i.test(dockerfile), false);
  assert.equal(dockerfile.includes(":latest"), false);
});

test("REQ-T1-DEMO-010 OpenClaw image never accepts a credential build argument", () => {
  const dockerfile = readText("deploy/track1/Dockerfile.openclaw");
  assert.equal(/^ARG\s+/m.test(dockerfile), false);
});
