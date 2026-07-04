import assert from "node:assert/strict";
import test from "node:test";

import { runTrack1CredentialedE2E } from "../../scripts/track1/credentialed-e2e.ts";
import {
  makeCredentialedE2EPorts,
  makeValidTrack1Environment
} from "./fixtures/credentialed-e2e.fixture.ts";

test("REQ-T1-DEMO-010 credentialed E2E fails before ports when credentials are missing", async () => {
  const ports = makeCredentialedE2EPorts();
  await assert.rejects(
    () => runTrack1CredentialedE2E({}, ports),
    /track1_e2e_credentials_missing/
  );
  assert.deepEqual(ports.calls, []);
});

test("REQ-T1-DEMO-010 credentialed E2E rejects Phase 4-invalid model settings before ports", async () => {
  const invalidEnvironments = [
    {
      OPENCLAW_MODEL_BASE_URL: "https://model.example.invalid:8443/v1"
    },
    {
      OPENCLAW_MODEL_BASE_URL:
        "https://model.example.invalid/tenant/../v1"
    },
    {
      OPENCLAW_MODEL_ID: "Model With Spaces"
    }
  ];
  for (const mutation of invalidEnvironments) {
    const ports = makeCredentialedE2EPorts();
    await assert.rejects(
      () =>
        runTrack1CredentialedE2E(
          { ...makeValidTrack1Environment(), ...mutation },
          ports
        ),
      /track1_e2e_credentials_missing/
    );
    assert.deepEqual(ports.calls, []);
  }
});

test("REQ-T1-DEMO-010 credentialed E2E runs complete fixed order and always cleans up", async () => {
  const ports = makeCredentialedE2EPorts();
  const result = await runTrack1CredentialedE2E(
    makeValidTrack1Environment(),
    ports
  );
  assert.deepEqual(ports.calls, [
    "clean",
    "build",
    "start",
    "health",
    "inspect-plugin",
    "run-campaign",
    "build-evidence",
    "read-acceptance-source",
    "collect-safe-logs",
    "stop"
  ]);
  assert.equal(result.campaign_id, ports.campaignId);
  assert.equal(result.evidence_manifest_sha256, ports.manifestHash);
  assert.equal(Object.isFrozen(result), true);
});

test("REQ-T1-DEMO-010 credentialed E2E stops runtime after campaign failure", async () => {
  const ports = makeCredentialedE2EPorts({ failAt: "run-campaign" });
  await assert.rejects(
    () => runTrack1CredentialedE2E(makeValidTrack1Environment(), ports),
    (error: unknown) => {
      assert.equal(String(error).includes("SECRET_E2E_FAILURE"), false);
      return String(error).includes("track1_e2e_failed");
    }
  );
  assert.equal(ports.calls.at(-1), "stop");
});

test("REQ-T1-DEMO-010 credentialed E2E rejects mismatched evidence and unsafe log summary", async () => {
  for (const ports of [
    makeCredentialedE2EPorts({ campaignIdMismatch: true }),
    makeCredentialedE2EPorts({ unsafeLogs: true })
  ]) {
    await assert.rejects(
      () => runTrack1CredentialedE2E(makeValidTrack1Environment(), ports),
      /track1_e2e_failed/
    );
    assert.equal(ports.calls.at(-1), "stop");
  }
});
