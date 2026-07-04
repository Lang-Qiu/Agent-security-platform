import assert from "node:assert/strict";
import test from "node:test";

import { runTrack1OpenClawCampaign } from "../../scripts/track1/campaign-runner.ts";
import { makeCampaignRunnerPorts } from "./fixtures/openclaw-runner.fixture.ts";

test("REQ-T1-DEMO-010 campaign runner executes the fixed three-agent nine-case order", async () => {
  const ports = makeCampaignRunnerPorts();
  const summary = await runTrack1OpenClawCampaign(ports);

  assert.deepEqual(ports.calls.slice(0, 2), ["preflight", "create-campaign"]);
  assert.deepEqual(
    ports.invocations.map(({ agent_id, case_id }) => [agent_id, case_id]),
    [
      ["agent:track1:prompt-injection", "T1-SC-001-C001"],
      ["agent:track1:prompt-injection", "T1-SC-001-C002"],
      ["agent:track1:prompt-injection", "T1-SC-001-C003"],
      ["agent:track1:tool-hijack", "T1-SC-002-C001"],
      ["agent:track1:tool-hijack", "T1-SC-002-C002"],
      ["agent:track1:tool-hijack", "T1-SC-002-C003"],
      ["agent:track1:memory-poison", "T1-SC-003-C001"],
      ["agent:track1:memory-poison", "T1-SC-003-C002"],
      ["agent:track1:memory-poison", "T1-SC-003-C003"]
    ]
  );
  assert.equal(new Set(ports.invocations.map((row) => row.session_key)).size, 9);
  assert.equal(summary.case_count, 9);
  assert.equal(summary.agent_count, 3);
  assert.equal(summary.retry_count, 0);
});

test("REQ-T1-DEMO-010 runner derives action only from normalized backend observation", async () => {
  const ports = makeCampaignRunnerPorts({
    attempts: {
      "T1-SC-001-C001": [
        {
          outcome: "passed",
          final_action: "deny",
          reason: null
        }
      ]
    }
  });
  const summary = await runTrack1OpenClawCampaign(ports);

  assert.equal(summary.final_actions["T1-SC-001-C001"], "deny");
  assert.equal(
    JSON.stringify(ports.progressEvents).includes("cliClaimedAction"),
    false
  );
});

test("REQ-T1-DEMO-010 preflight failure creates no campaign and invokes no agent", async () => {
  const ports = makeCampaignRunnerPorts();
  const originalPreflight = ports.preflight;
  ports.preflight = async () => {
    ports.calls.push("preflight");
    throw new Error("track1_preflight_failed");
  };
  await assert.rejects(() => runTrack1OpenClawCampaign(ports));
  assert.deepEqual(ports.calls, ["preflight"]);
  assert.equal(ports.invocations.length, 0);
  void originalPreflight;
});

test("REQ-T1-DEMO-010 campaign creation failure invokes no agent", async () => {
  const ports = makeCampaignRunnerPorts();
  ports.createCampaign = async () => {
    ports.calls.push("create-campaign");
    throw new Error("track1_ingest_failed");
  };
  await assert.rejects(() => runTrack1OpenClawCampaign(ports));
  assert.equal(ports.invocations.length, 0);
});

test("REQ-T1-DEMO-010 post-creation invocation failure finalizes the campaign as failed", async () => {
  const ports = makeCampaignRunnerPorts();
  ports.invokeAgent = async () => {
    throw new Error("track1_invocation_failed");
  };

  await assert.rejects(
    () => runTrack1OpenClawCampaign(ports),
    /track1_invocation_failed/
  );
  assert.equal(ports.finalizeInputs.length, 1);
  assert.equal(ports.finalizeInputs[0].status, "failed");
});

test("REQ-T1-DEMO-010 runner generates unique campaign/attempt/session identifiers with exact grammars", async () => {
  const ports = makeCampaignRunnerPorts();
  const summary = await runTrack1OpenClawCampaign(ports);
  assert.match(summary.campaign_id, /^campaign:t1:[0-9a-f]{32}$/);
  const sessionKeys = ports.invocations.map((row) => row.session_key);
  for (const key of sessionKeys) {
    assert.match(key, /^session-key:[0-9a-f]{32}$/);
  }
  assert.equal(new Set(sessionKeys).size, sessionKeys.length);
});

test("REQ-T1-DEMO-010 progress and summary omit raw sentinels and secrets", async () => {
  const ports = makeCampaignRunnerPorts();
  const summary = await runTrack1OpenClawCampaign(ports);
  const serialized = JSON.stringify({ summary, events: ports.progressEvents });
  assert.equal(serialized.includes("api_key"), false);
  assert.equal(serialized.includes("apiKey"), false);
});

test("REQ-T1-DEMO-010 finalization happens only after all nine final attempts", async () => {
  const ports = makeCampaignRunnerPorts();
  await runTrack1OpenClawCampaign(ports);
  assert.equal(ports.finalizeInputs.length, 1);
  assert.equal(ports.finalizeInputs[0].attempts.length, 9);
  assert.equal(ports.finalizeInputs[0].status, "completed");
});

test("REQ-T1-DEMO-010 runner captures one running checkpoint after the first final case", async () => {
  const ports = makeCampaignRunnerPorts();
  await runTrack1OpenClawCampaign(ports);

  assert.equal(ports.runningCheckpoints.length, 1);
  assert.deepEqual(ports.runningCheckpoints[0], {
    campaign_id: "campaign:t1:00000000000000000000000000000001",
    case_id: "T1-SC-001-C001",
    session_id: "session:00000000000000000000000000000002"
  });
  const firstObserved = ports.progressEvents.findIndex(
    (event) =>
      event.event_type === "attempt_observed" &&
      event.case_id === "T1-SC-001-C001"
  );
  const secondStarted = ports.progressEvents.findIndex(
    (event) =>
      event.event_type === "case_started" &&
      event.case_id === "T1-SC-001-C002"
  );
  assert.ok(firstObserved >= 0 && secondStarted > firstObserved);
});
