import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeTrack1CloudModelConfig,
  Track1EnvironmentError
} from "../../scripts/track1/environment.ts";
import {
  runTrack1Preflight,
  Track1PreflightError
} from "../../scripts/track1/preflight.ts";
import {
  makeCampaignPreflightPorts,
  makeValidTrack1Environment
} from "./fixtures/openclaw-runner.fixture.ts";

test("REQ-T1-DEMO-010 preflight accepts only closed cloud model configuration", () => {
  const config = normalizeTrack1CloudModelConfig(makeValidTrack1Environment());
  assert.equal(config.base_url, "https://model.example.test/v1");
  assert.equal(config.model_id, "provider/model-safe");
  assert.equal(config.api_key, "test-only-key-0123456789");
  assert.equal(config.ingest_token, "0123456789abcdef0123456789abcdef");
});

test("REQ-T1-DEMO-010 preflight rejects unsafe model endpoints", () => {
  for (const baseUrl of [
    "http://model.example.test/v1",
    "https://user:pass@model.example.test/v1",
    "https://model.example.test/v1?token=x",
    "https://model.example.test/v1#fragment",
    "https://model.example.test/../admin",
    "https://model.example.test:8443/v1"
  ]) {
    assert.throws(
      () =>
        normalizeTrack1CloudModelConfig({
          ...makeValidTrack1Environment(),
          OPENCLAW_MODEL_BASE_URL: baseUrl
        }),
      Track1EnvironmentError
    );
  }
});

test("REQ-T1-DEMO-010 preflight rejects a malformed model id grammar", () => {
  assert.throws(
    () =>
      normalizeTrack1CloudModelConfig({
        ...makeValidTrack1Environment(),
        OPENCLAW_MODEL_ID: "Provider/Model With Spaces"
      }),
    Track1EnvironmentError
  );
  assert.throws(
    () =>
      normalizeTrack1CloudModelConfig({
        ...makeValidTrack1Environment(),
        OPENCLAW_MODEL_ID: "no-slash-here"
      }),
    Track1EnvironmentError
  );
});

test("REQ-T1-DEMO-010 preflight rejects an empty api key", () => {
  assert.throws(
    () =>
      normalizeTrack1CloudModelConfig({
        ...makeValidTrack1Environment(),
        OPENCLAW_MODEL_API_KEY: ""
      }),
    Track1EnvironmentError
  );
});

test("REQ-T1-DEMO-010 preflight rejects an ingest token shorter than 32 bytes", () => {
  assert.throws(
    () =>
      normalizeTrack1CloudModelConfig({
        ...makeValidTrack1Environment(),
        TRACK1_INGEST_TOKEN: "too-short"
      }),
    Track1EnvironmentError
  );
});

test("REQ-T1-DEMO-010 preflight rejects a missing required variable", () => {
  for (const key of [
    "OPENCLAW_MODEL_BASE_URL",
    "OPENCLAW_MODEL_ID",
    "OPENCLAW_MODEL_API_KEY",
    "TRACK1_INGEST_TOKEN"
  ] as const) {
    const environment = makeValidTrack1Environment();
    delete environment[key];
    assert.throws(
      () => normalizeTrack1CloudModelConfig(environment),
      Track1EnvironmentError,
      key
    );
  }
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
  assert.equal(
    JSON.stringify(result).includes("test-only-key-0123456789"),
    false
  );
  assert.equal(
    JSON.stringify(result).includes("0123456789abcdef0123456789abcdef"),
    false
  );
});

test("REQ-T1-DEMO-010 failed preflight stops before the next check", async () => {
  const ports = makeCampaignPreflightPorts({ pluginProbeFails: true });
  await assert.rejects(
    () => runTrack1Preflight(makeValidTrack1Environment(), ports),
    Track1PreflightError
  );
  assert.deepEqual(ports.calls, ["docker", "openclaw", "plugin"]);
});

test("REQ-T1-DEMO-010 preflight rejects a non-compose-v2 docker daemon", async () => {
  const ports = makeCampaignPreflightPorts({ dockerFails: true });
  await assert.rejects(
    () => runTrack1Preflight(makeValidTrack1Environment(), ports),
    Track1PreflightError
  );
  assert.deepEqual(ports.calls, ["docker"]);
});

test("REQ-T1-DEMO-010 preflight rejects a mismatched OpenClaw version", async () => {
  const ports = makeCampaignPreflightPorts({ openclawVersionMismatch: true });
  await assert.rejects(
    () => runTrack1Preflight(makeValidTrack1Environment(), ports),
    Track1PreflightError
  );
  assert.deepEqual(ports.calls, ["docker", "openclaw"]);
});

test("REQ-T1-DEMO-010 preflight rejects a not-ready backend", async () => {
  const ports = makeCampaignPreflightPorts({ backendFails: true });
  await assert.rejects(
    () => runTrack1Preflight(makeValidTrack1Environment(), ports),
    Track1PreflightError
  );
  assert.deepEqual(ports.calls, ["docker", "openclaw", "plugin", "backend"]);
});

test("REQ-T1-DEMO-010 preflight rejects a manifest hash mismatch", async () => {
  const ports = makeCampaignPreflightPorts({ manifestMismatch: true });
  await assert.rejects(
    () => runTrack1Preflight(makeValidTrack1Environment(), ports),
    Track1PreflightError
  );
  assert.deepEqual(ports.calls, [
    "docker",
    "openclaw",
    "plugin",
    "backend",
    "manifest"
  ]);
});

test("REQ-T1-DEMO-010 preflight result contains only safe keys", async () => {
  const ports = makeCampaignPreflightPorts();
  const result = await runTrack1Preflight(makeValidTrack1Environment(), ports);
  assert.deepEqual(
    Object.keys(result).sort(),
    [
      "backend_internal_ready",
      "backend_public_ready",
      "campaign_manifest_sha256",
      "compose_v2",
      "model_ref",
      "openclaw_package_integrity",
      "openclaw_version",
      "plugin_probe",
      "schema_version"
    ].sort()
  );
});
