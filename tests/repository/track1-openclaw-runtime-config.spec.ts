import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import JSON5 from "json5";

async function loadJson5(relativePath: string): Promise<any> {
  const fullPath = resolve(import.meta.dirname, "../../", relativePath);
  const content = await readFile(fullPath, "utf8");
  return JSON5.parse(content);
}

test("REQ-T1-DEMO-010 OpenClaw config exposes only three agents and four tools", async () => {
  const config = await loadJson5("integrations/openclaw/config/openclaw.json5");
  const agents = await loadJson5("integrations/openclaw/config/agents.json5");

  assert.deepEqual(
    agents.agents.map((agent: { id: string }) => agent.id),
    [
      "agent:track1:prompt-injection",
      "agent:track1:tool-hijack",
      "agent:track1:memory-poison"
    ]
  );
  assert.deepEqual(config.tools.allow.slice().sort(), [
    "call_api",
    "read_file",
    "send_email",
    "write_file"
  ]);
  assert.equal(config.skills.enabled, false);
  assert.equal(config.marketplace.enabled, false);
  assert.equal(config.logging.persistTranscripts, false);
  assert.equal(config.logging.redactSensitiveToolData, true);
});

test("REQ-T1-DEMO-010 OpenClaw config denies all unsafe capabilities", async () => {
  const config = await loadJson5("integrations/openclaw/config/openclaw.json5");

  assert.equal(config.tools.shell?.enabled, false);
  assert.equal(config.tools.process?.enabled, false);
  assert.equal(config.tools.browser?.enabled, false);
  assert.equal(config.tools.node?.enabled, false);
  assert.equal(config.tools.messaging?.enabled, false);
  assert.equal(config.tools.network?.enabled, false);
  assert.equal(config.mcp?.enabled, false);
  assert.equal(config.channels?.enabled, false);
  assert.equal(config.thirdPartyPlugins?.enabled, false);
});

test("REQ-T1-DEMO-010 OpenClaw config uses tmpfs paths for workspace and sessions", async () => {
  const config = await loadJson5("integrations/openclaw/config/openclaw.json5");

  assert.match(config.workspaceDir, /^\/run\/track1\//);
  assert.match(config.sessionDir, /^\/tmp\/openclaw\//);
});

test("REQ-T1-DEMO-010 OpenClaw image pins base digest and exact package", async () => {
  const dockerfile = await readFile(
    resolve(import.meta.dirname, "../../deploy/track1/Dockerfile.openclaw"),
    "utf8"
  );
  assert.match(
    dockerfile,
    /^FROM node:22\.19\.0-bookworm-slim@sha256:[a-f0-9]{64}$/m
  );
  assert.equal(dockerfile.includes("openclaw@2026.6.10"), true);
  assert.equal(/ARG .*KEY|ARG .*TOKEN/i.test(dockerfile), false);
  assert.equal(/ARG .*SECRET/i.test(dockerfile), false);
});

test("REQ-T1-DEMO-010 OpenClaw agents match Phase 1 fixed assignments", async () => {
  const agents = await loadJson5("integrations/openclaw/config/agents.json5");

  assert.equal(agents.agents.length, 3);
  const [promptInjection, toolHijack, memoryPoison] = agents.agents;

  assert.equal(promptInjection.id, "agent:track1:prompt-injection");
  assert.equal(promptInjection.scenario, "T1-SC-001");

  assert.equal(toolHijack.id, "agent:track1:tool-hijack");
  assert.equal(toolHijack.scenario, "T1-SC-002");

  assert.equal(memoryPoison.id, "agent:track1:memory-poison");
  assert.equal(memoryPoison.scenario, "T1-SC-003");
});
