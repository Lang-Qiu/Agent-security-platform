import assert from "node:assert/strict";
import test from "node:test";

import {
  runTrack1OpenClawCampaign,
  Track1CampaignError,
  TRACK1_RETRYABLE_REASONS,
  TRACK1_TERMINAL_FAILURE_REASONS
} from "../../scripts/track1/campaign-runner.ts";
import {
  makeCampaignRunnerPorts,
  makeRetryableAttemptObservation,
  makeSuccessfulAttemptObservation,
  makeTerminalAttemptObservation
} from "./fixtures/openclaw-runner.fixture.ts";

test("REQ-T1-DEMO-010 runner retries each permitted reason exactly once", async () => {
  for (const reason of TRACK1_RETRYABLE_REASONS) {
    const ports = makeCampaignRunnerPorts({
      attempts: {
        "T1-SC-001-C001": [
          makeRetryableAttemptObservation(reason),
          makeSuccessfulAttemptObservation()
        ]
      }
    });
    const summary = await runTrack1OpenClawCampaign(ports);
    assert.equal(summary.retry_count, 1, reason);
    assert.deepEqual(
      ports.attemptsFor("T1-SC-001-C001").map((attempt) => attempt.attempt_index),
      [1, 2],
      reason
    );
  }
});

test("REQ-T1-DEMO-010 non-retryable failure invokes no second attempt", async () => {
  for (const reason of TRACK1_TERMINAL_FAILURE_REASONS.filter(
    (r) => r !== "preflight_failed" && r !== "manifest_invalid"
  )) {
    const ports = makeCampaignRunnerPorts({
      attempts: {
        "T1-SC-001-C001": [makeTerminalAttemptObservation(reason)]
      }
    });
    await assert.rejects(
      () => runTrack1OpenClawCampaign(ports),
      Track1CampaignError,
      reason
    );
    assert.equal(ports.attemptsFor("T1-SC-001-C001").length, 1, reason);
  }
});

test("REQ-T1-DEMO-010 retry keeps both attempts in finalization evidence", async () => {
  const ports = makeCampaignRunnerPorts({
    attempts: {
      "T1-SC-001-C001": [
        makeRetryableAttemptObservation("derived_action_mismatch"),
        makeSuccessfulAttemptObservation()
      ]
    }
  });
  await runTrack1OpenClawCampaign(ports);

  const finalized = ports.finalizeInputs[0];
  const attempts = finalized?.attempts.filter(
    (attempt) => attempt.case_id === "T1-SC-001-C001"
  );
  assert.deepEqual(attempts?.map((attempt) => attempt.attempt_index), [1, 2]);
  assert.deepEqual(attempts?.map((attempt) => attempt.final), [false, true]);
});

test("REQ-T1-DEMO-010 second failed attempt is terminal and cannot retry again", async () => {
  const ports = makeCampaignRunnerPorts({
    attempts: {
      "T1-SC-001-C001": [
        makeRetryableAttemptObservation("provider_transport_failed"),
        makeRetryableAttemptObservation("provider_transport_failed")
      ]
    }
  });
  await assert.rejects(
    () => runTrack1OpenClawCampaign(ports),
    Track1CampaignError
  );
  assert.equal(ports.attemptsFor("T1-SC-001-C001").length, 2);
  assert.equal(ports.finalizeInputs[0]?.status, "failed");
});

test("REQ-T1-DEMO-010 a retried case still resolves the campaign as completed when all other cases pass", async () => {
  const ports = makeCampaignRunnerPorts({
    attempts: {
      "T1-SC-002-C002": [
        makeRetryableAttemptObservation("model_protocol_invalid"),
        makeSuccessfulAttemptObservation()
      ]
    }
  });
  const summary = await runTrack1OpenClawCampaign(ports);
  assert.equal(summary.retry_count, 1);
  assert.equal(ports.finalizeInputs[0]?.status, "completed");
  assert.equal(ports.finalizeInputs[0]?.attempts.length, 10);
});
