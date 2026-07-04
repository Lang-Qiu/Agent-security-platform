import assert from "node:assert/strict";
import test from "node:test";

import {
  executeTrack1CampaignEntrypoint
} from "../../scripts/track1/campaign-entrypoint.ts";
import {
  makeCampaignRunnerPorts,
  makeValidTrack1Environment
} from "./fixtures/openclaw-runner.fixture.ts";

test("REQ-T1-DEMO-010 campaign entrypoint runs the real fixed campaign instead of stopping after preflight", async () => {
  const ports = makeCampaignRunnerPorts();
  const lines: string[] = [];
  const result = await executeTrack1CampaignEntrypoint(
    makeValidTrack1Environment(),
    ports,
    (line) => lines.push(line)
  );

  assert.equal(result.completed, true);
  assert.equal(result.agent_count, 3);
  assert.equal(result.case_count, 9);
  assert.equal(ports.calls.includes("create-campaign"), true);
  assert.equal(ports.calls.includes("finalize-campaign"), true);
  assert.equal(lines.some((line) => line.includes(result.campaign_id)), true);
  assert.equal(lines.join("\n").includes("OPENCLAW_MODEL_API_KEY"), false);
});

test("REQ-T1-DEMO-010 campaign entrypoint rejects invalid environment before campaign creation", async () => {
  const ports = makeCampaignRunnerPorts();

  await assert.rejects(
    () => executeTrack1CampaignEntrypoint({}, ports, () => undefined),
    /track1_environment_invalid/
  );
  assert.equal(ports.calls.length, 0);
});
