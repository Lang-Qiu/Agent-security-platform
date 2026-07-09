import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReportRunnerComposeArgs,
  createProductionCredentialedE2EPorts,
  deriveBackendHealthUrl,
  deriveFrontendHealthUrl
} from "../../scripts/track1/credentialed-e2e.ts";
import { makeValidTrack1Environment } from "./fixtures/credentialed-e2e.fixture.ts";

test("REQ-T1-DEMO-010 deriveBackendHealthUrl replaces /api suffix with /health", () => {
  assert.equal(
    deriveBackendHealthUrl("http://127.0.0.1:3000/api"),
    "http://127.0.0.1:3000/health"
  );
});

test("REQ-T1-DEMO-010 deriveBackendHealthUrl supports a non-default host port", () => {
  assert.equal(
    deriveBackendHealthUrl("http://127.0.0.1:13000/api"),
    "http://127.0.0.1:13000/health"
  );
});

test("REQ-T1-DEMO-010 deriveBackendHealthUrl strips a trailing slash before /api", () => {
  assert.equal(
    deriveBackendHealthUrl("http://127.0.0.1:13000/api/"),
    "http://127.0.0.1:13000/health"
  );
});

test("REQ-T1-DEMO-010 deriveFrontendHealthUrl returns the origin with a root path", () => {
  assert.equal(
    deriveFrontendHealthUrl("http://127.0.0.1:5173/sandbox-alerts"),
    "http://127.0.0.1:5173/"
  );
});

test("REQ-T1-DEMO-010 deriveFrontendHealthUrl supports a non-default host port", () => {
  assert.equal(
    deriveFrontendHealthUrl("http://127.0.0.1:15173/sandbox-alerts"),
    "http://127.0.0.1:15173/"
  );
});

test("REQ-T1-DEMO-010 buildReportRunnerComposeArgs runs the report script inside the campaign-runner container", () => {
  const args = buildReportRunnerComposeArgs(
    "abc123",
    "/host/artifacts/track1"
  );
  assert.deepEqual(args, [
    "run",
    "--rm",
    "-v",
    "/host/artifacts/track1:/data",
    "-e",
    "TRACK1_PRECAPTURED_SCREENSHOT_ROOT=/data/.checkpoints/abc123",
    "campaign-runner",
    "node",
    "--experimental-strip-types",
    "scripts/track1/build-security-risk-report.ts",
    "--campaign-id",
    "campaign:t1:abc123"
  ]);
});

test("REQ-T1-DEMO-010 buildReportRunnerComposeArgs does not pass host-side ingest or backend URLs", () => {
  const args = buildReportRunnerComposeArgs(
    "deadbeef",
    "/host/artifacts/track1"
  );
  const envFlags = args.filter((value) => value === "-e");
  assert.equal(envFlags.length, 1);
  assert.ok(
    !args.some(
      (value) =>
        value.startsWith("TRACK1_INGEST_BASE_URL=") ||
        value.startsWith("TRACK1_BACKEND_URL=")
    ),
    "host-side URLs must not override the compose service environment"
  );
});

// Bug #10: runCampaign creates a floating Promise (runner) that can reject
// while waitForCampaign() is still pending. Without an early rejection
// handler, the rejection becomes an unhandledRejection, which the Node.js
// test runner treats as a hard test failure (failureType: 'unhandledRejection')
// even though runTrack1CredentialedE2E's catch block would otherwise catch
// the surfaced error at `await runner`. This test verifies that runCampaign
// does not leak an unhandled rejection when the compose subprocess fails fast.
test("REQ-T1-DEMO-010 runCampaign does not leak unhandled rejection when compose fails fast", async () => {
  const ports = createProductionCredentialedE2EPorts(
    {
      ...makeValidTrack1Environment(),
      // Point at a closed port so waitForCampaign's fetch fails immediately.
      TRACK1_BACKEND_URL: "http://127.0.0.1:1/api"
    },
    {
      // Simulate `docker-compose run campaign-runner` failing immediately.
      runProcess: async () => {
        throw new Error("track1_e2e_process_failed");
      },
      // Fail fast: one poll, then throw track1_e2e_campaign_discovery_failed.
      waitForCampaignMaxPolls: 1
    }
  );
  // If runCampaign leaks an unhandled rejection, the Node.js test runner
  // fails this test with failureType 'unhandledRejection' before the
  // assert.rejects body runs. The expected (fixed) behavior is that
  // runCampaign surfaces a real error (either track1_e2e_process_failed
  // from the runner Promise, or track1_e2e_campaign_discovery_failed
  // from waitForCampaign's timeout) without leaking an unhandled rejection.
  await assert.rejects(
    () => ports.runCampaign(),
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      return (
        message === "track1_e2e_process_failed" ||
        message === "track1_e2e_campaign_discovery_failed"
      );
    }
  );
  // Give the microtask queue a chance to surface any leaked rejection.
  await new Promise((resolve) => setImmediate(resolve));
});
