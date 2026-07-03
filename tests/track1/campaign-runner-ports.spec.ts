import assert from "node:assert/strict";
import test from "node:test";
import { createProductionPorts } from "../../scripts/track1/campaign-runner-ports.ts";

// Test suite for campaign runner port implementations
// Validates that production ports conform to Track1CampaignRunnerPorts interface

// Minimal test configuration for port initialization
const testConfig = {
  ingestBaseUrl: "http://localhost:3001/internal/track1",
  ingestToken: "test-token-12345",
  publicApiBaseUrl: "http://localhost:3000/api",
  progressCallback: undefined
};

test("Port implementation returns all required methods", () => {
  const ports = createProductionPorts(testConfig);

  const requiredMethods = [
    "randomHex32",
    "compilePrompt",
    "invokeAgent",
    "awaitAttempt",
    "recordCampaign",
    "recordAttempt",
    "finalizeCampaign"
  ];

  for (const method of requiredMethods) {
    assert.ok(
      method in ports && typeof ports[method as keyof typeof ports] === "function",
      `Port must implement ${method}`
    );
  }
});

test("randomHex32 returns 32-character hex string", () => {
  const ports = createProductionPorts(testConfig);
  const hex = ports.randomHex32();

  assert.equal(hex.length, 32);
  assert.match(hex, /^[0-9a-f]{32}$/);
});

test("randomHex32 generates unique values", () => {
  const ports = createProductionPorts(testConfig);
  const values = new Set();

  for (let i = 0; i < 100; i++) {
    values.add(ports.randomHex32());
  }

  assert.equal(values.size, 100, "Should generate 100 unique values");
});

test("preflight returns structured result", async () => {
  const ports = createProductionPorts(testConfig);

  // This requires Docker, OpenClaw, and backend to be running
  // Skip if not in integration environment
  const hasDocker = process.env.CI || process.env.INTEGRATION_TEST;
  if (!hasDocker) {
    console.log("⊘ Skipping preflight test (requires Docker/OpenClaw/backend)");
    return;
  }

  const result = await ports.preflight();

  // Validate result structure
  assert.ok(result.docker, "Should have docker info");
  assert.ok(result.openclaw, "Should have openclaw info");
  assert.ok(result.backend, "Should have backend info");
  assert.ok(result.manifest, "Should have manifest info");
  assert.ok(typeof result.docker.compose_v2 === "boolean");
  assert.ok(typeof result.openclaw.version === "string");
});

test("compilePrompt requires case_id field", async () => {
  const ports = createProductionPorts(testConfig);
  const randomHex = ports.randomHex32();

  await assert.rejects(
    async () => {
      await ports.compilePrompt({
        campaign_id: `campaign:t1:${randomHex}`,
        agent_id: "agent:track1:prompt-injection",
        scenario_id: "T1-SC-001",
        case_id: "T1-SC-001-NONEXISTENT", // Non-existent case
        attempt_id: "attempt:t1-sc-001-nonexistent:1",
        attempt_index: 1,
        session_id: `session:${ports.randomHex32()}`
      });
    },
    /not found in manifest/,
    "Should reject when case is not found in manifest"
  );
});

test("compilePrompt successfully compiles valid case", async () => {
  const ports = createProductionPorts(testConfig);

  const result = await ports.compilePrompt({
    campaign_id: `campaign:t1:${ports.randomHex32()}`,
    agent_id: "agent:track1:prompt-injection",
    scenario_id: "T1-SC-001",
    case_id: "T1-SC-001-C001", // Valid case from manifest
    attempt_id: "attempt:t1-sc-001-c001:1",
    attempt_index: 1,
    session_id: `session:${ports.randomHex32()}`
  });

  // Validate compiled prompt structure (Track1CompiledPrompt interface)
  assert.equal(result.case_id, "T1-SC-001-C001");
  assert.equal(result.scenario_id, "T1-SC-001");
  assert.ok(result.relative_tmpfs_path.startsWith("/run/track1/"));
  assert.ok(result.content_sha256.match(/^[0-9a-f]{64}$/), "Should have valid SHA-256");
  assert.ok(result.utf8 instanceof Uint8Array, "Should have Uint8Array");
  assert.ok(result.utf8.length > 0, "Should have non-empty content");
});

test("recordCampaign sends campaign data to ingest API", async () => {
  const ports = createProductionPorts(testConfig);

  // This will fail in test environment (no backend running)
  // but validates the method exists and has correct signature
  await assert.rejects(
    async () => {
      await ports.recordCampaign({
        campaign_id: "campaign:test:001",
        campaign_manifest_sha256: "a".repeat(64),
        agent_configs: [],
        total_cases: 0
      });
    },
    /ECONNREFUSED|fetch failed/,
    "Should attempt to connect to backend"
  );
});

test("recordAttempt sends attempt data to ingest API", async () => {
  const ports = createProductionPorts(testConfig);

  await assert.rejects(
    async () => {
      await ports.recordAttempt({
        campaign_id: "campaign:test:001",
        attempt_id: "attempt:test:001",
        agent_id: "agent:track1:prompt-injection",
        scenario_id: "T1-SC-001",
        case_id: "T1-SC-001-C001",
        attempt_index: 1,
        session_id: "session:001",
        status: "running"
      } as any);
    },
    /ECONNREFUSED|fetch failed/,
    "Should attempt to connect to backend"
  );
});

test("finalizeCampaign sends finalize request", async () => {
  const ports = createProductionPorts(testConfig);

  await assert.rejects(
    async () => {
      await ports.finalizeCampaign({
        campaign_id: "campaign:test:001",
        total_attempts: 0,
        completed_cases: 0,
        finalized_at: new Date().toISOString()
      } as any);
    },
    /ECONNREFUSED|fetch failed/,
    "Should attempt to connect to backend"
  );
});
