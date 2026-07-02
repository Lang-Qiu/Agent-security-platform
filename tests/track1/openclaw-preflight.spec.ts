import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeTrack1CloudModelConfig,
  runTrack1Preflight
} from "../../scripts/track1/preflight.ts";
import {
  makeCampaignPreflightPorts,
  makeValidTrack1Environment
} from "./fixtures/openclaw-runner.fixture.ts";

test("REQ-T1-DEMO-010 preflight accepts only closed cloud model configuration", () => {
  const config = normalizeTrack1CloudModelConfig(makeValidTrack1Environment());
  assert.equal(config.base_url, "https://model.example.test/v1");
  assert.equal(config.model_id, "provider/model-safe");
});

test("REQ-T1-DEMO-010 preflight rejects unsafe model endpoints", () => {
  for (const baseUrl of [
    "http://model.example.test/v1",
    "https://user:pass@model.example.test/v1",
    "https://model.example.test/v1?token=x",
    "https://model.example.test/v1#fragment",
    "https://model.example.test/../admin"
  ]) {
    assert.throws(
      () =>
        normalizeTrack1CloudModelConfig({
          ...makeValidTrack1Environment(),
          OPENCLAW_MODEL_BASE_URL: baseUrl
        }),
      /track1_environment_invalid/
    );
  }
});

test("REQ-T1-DEMO-010 preflight rejects missing or malformed required variables", () => {
  const base = makeValidTrack1Environment();

  assert.throws(
    () =>
      normalizeTrack1CloudModelConfig({ ...base, OPENCLAW_MODEL_BASE_URL: undefined }),
    /track1_environment_invalid/
  );
  assert.throws(
    () => normalizeTrack1CloudModelConfig({ ...base, OPENCLAW_MODEL_API_KEY: "" }),
    /track1_environment_invalid/
  );
  assert.throws(
    () => normalizeTrack1CloudModelConfig({ ...base, OPENCLAW_MODEL_API_KEY: "   " }),
    /track1_environment_invalid/
  );
  assert.throws(
    () => normalizeTrack1CloudModelConfig({ ...base, OPENCLAW_MODEL_ID: "" }),
    /track1_environment_invalid/
  );
  assert.throws(
    () => normalizeTrack1CloudModelConfig({ ...base, OPENCLAW_MODEL_ID: "bad id" }),
    /track1_environment_invalid/
  );
  assert.throws(
    () => normalizeTrack1CloudModelConfig({ ...base, OPENCLAW_MODEL_ID: "no-slash" }),
    /track1_environment_invalid/
  );
  assert.throws(
    () =>
      normalizeTrack1CloudModelConfig({
        ...base,
        TRACK1_INGEST_TOKEN: "too-short"
      }),
    /track1_environment_invalid/
  );
  assert.throws(
    () =>
      normalizeTrack1CloudModelConfig({ ...base, TRACK1_INGEST_TOKEN: undefined }),
    /track1_environment_invalid/
  );
});

test("REQ-T1-DEMO-010 preflight completes before any campaign creation", async () => {
  const ports = makeCampaignPreflightPorts();
  const result = await runTrack1Preflight(makeValidTrack1Environment(), ports);

  assert.deepEqual(ports.calls, [
    "docker",
    "openclaw",
    "plugin",
    "backend",
    "manifest"
  ]);
  assert.equal(result.openclaw_version, "2026.6.10");
  assert.equal(JSON.stringify(result).includes("API_KEY_SENTINEL"), false);
});

test("REQ-T1-DEMO-010 failed preflight stops before the next check", async () => {
  const ports = makeCampaignPreflightPorts({ pluginProbeFails: true });
  await assert.rejects(
    () => runTrack1Preflight(makeValidTrack1Environment(), ports),
    /track1_preflight_failed/
  );
  assert.deepEqual(ports.calls, ["docker", "openclaw", "plugin"]);
});

test("REQ-T1-DEMO-010 preflight stops at docker capability failure", async () => {
  const ports = makeCampaignPreflightPorts({ dockerFails: true });
  await assert.rejects(
    () => runTrack1Preflight(makeValidTrack1Environment(), ports),
    /track1_preflight_failed/
  );
  assert.deepEqual(ports.calls, ["docker"]);
});

test("REQ-T1-DEMO-010 preflight stops when Compose v2 is unavailable", async () => {
  const ports = makeCampaignPreflightPorts({ composeV2: false });
  await assert.rejects(
    () => runTrack1Preflight(makeValidTrack1Environment(), ports),
    /track1_preflight_failed/
  );
  assert.deepEqual(ports.calls, ["docker"]);
});

test("REQ-T1-DEMO-010 preflight stops at OpenClaw version mismatch", async () => {
  const ports = makeCampaignPreflightPorts({ openclawVersion: "2025.1.1" });
  await assert.rejects(
    () => runTrack1Preflight(makeValidTrack1Environment(), ports),
    /track1_preflight_failed/
  );
  assert.deepEqual(ports.calls, ["docker", "openclaw"]);
});

test("REQ-T1-DEMO-010 preflight stops when the plugin probe reports diagnostics", async () => {
  const ports = makeCampaignPreflightPorts({
    pluginDiagnostics: [{ code: "test_diagnostic", message: "test" }]
  });
  await assert.rejects(
    () => runTrack1Preflight(makeValidTrack1Environment(), ports),
    /track1_preflight_failed/
  );
  assert.deepEqual(ports.calls, ["docker", "openclaw", "plugin"]);
});

test("REQ-T1-DEMO-010 preflight stops when backend public health fails", async () => {
  const ports = makeCampaignPreflightPorts({ publicReady: false });
  await assert.rejects(
    () => runTrack1Preflight(makeValidTrack1Environment(), ports),
    /track1_preflight_failed/
  );
  assert.deepEqual(ports.calls, ["docker", "openclaw", "plugin", "backend"]);
});

test("REQ-T1-DEMO-010 preflight stops when backend internal health fails", async () => {
  const ports = makeCampaignPreflightPorts({ internalReady: false });
  await assert.rejects(
    () => runTrack1Preflight(makeValidTrack1Environment(), ports),
    /track1_preflight_failed/
  );
  assert.deepEqual(ports.calls, ["docker", "openclaw", "plugin", "backend"]);
});

test("REQ-T1-DEMO-010 preflight stops when manifest loading fails", async () => {
  const ports = makeCampaignPreflightPorts({ manifestFails: true });
  await assert.rejects(
    () => runTrack1Preflight(makeValidTrack1Environment(), ports),
    /track1_preflight_failed/
  );
  assert.deepEqual(ports.calls, ["docker", "openclaw", "plugin", "backend", "manifest"]);
});

test("REQ-T1-DEMO-010 preflight result never leaks the API key or ingest token", async () => {
  const ports = makeCampaignPreflightPorts();
  const result = await runTrack1Preflight(makeValidTrack1Environment(), ports);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("API_KEY_SENTINEL"), false);
  assert.equal(serialized.includes("0123456789abcdef0123456789abcdef"), false);
});
