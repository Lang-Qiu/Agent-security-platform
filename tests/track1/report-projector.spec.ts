import assert from "node:assert/strict";
import test from "node:test";

import { projectTrack1ReportModel } from "../../scripts/track1/report/report-projector.ts";
import {
  makeCompletedCampaignReportSource,
  makeRuntimeContentMutations
} from "./fixtures/report-evidence.fixture.ts";

test("REQ-T1-DEMO-010 report model derives all metrics from normalized evidence", () => {
  const source = makeCompletedCampaignReportSource();
  const model = projectTrack1ReportModel({
    ...source,
    metrics: {
      final_pass_count: 0,
      retry_count: 99,
      blocked_count: 0
    }
  });

  assert.equal(model.metrics.agent_count, 3);
  assert.equal(model.metrics.case_count, 9);
  assert.equal(model.metrics.final_pass_count, 9);
  assert.equal(model.metrics.final_fail_count, 0);
  assert.equal(model.metrics.retry_count, 1);
  assert.equal(model.metrics.attempt_count, 10);
  assert.equal(model.metrics.allow_count, 2);
  assert.equal(model.metrics.deny_count, 5);
  assert.equal(model.metrics.ask_count, 2);
  assert.equal(model.metrics.blocked_count, 5);
  assert.equal(model.metrics.intercepted_tool_count, 10);
  assert.equal(model.metrics.executed_simulated_tool_count, 2);
  assert.equal(model.metrics.real_side_effect_count, 0);
  assert.deepEqual(
    model.cases.map((row) => row.case_id),
    [
      "T1-SC-001-C001",
      "T1-SC-001-C002",
      "T1-SC-001-C003",
      "T1-SC-002-C001",
      "T1-SC-002-C002",
      "T1-SC-002-C003",
      "T1-SC-003-C001",
      "T1-SC-003-C002",
      "T1-SC-003-C003"
    ]
  );
});

test("REQ-T1-DEMO-010 report projector derives action from final session decisions", () => {
  const source = makeCompletedCampaignReportSource();
  const input = {
    ...source,
    final_action: "allow",
    passed: false
  };

  const model = projectTrack1ReportModel(input);
  assert.equal(model.cases[0]?.actual_action, "deny");
  assert.equal(model.cases[0]?.passed, true);
});

test("REQ-T1-DEMO-010 report projector rejects incomplete coverage", () => {
  const source = makeCompletedCampaignReportSource();
  source.campaign.agents.pop();

  assert.throws(
    () => projectTrack1ReportModel(source),
    /track1_report_source_invalid/
  );
});

test("REQ-T1-DEMO-010 report projector rejects missing session evidence", () => {
  const source = makeCompletedCampaignReportSource();
  source.sessions.pop();

  assert.throws(
    () => projectTrack1ReportModel(source),
    /track1_report_source_invalid/
  );
});

test("REQ-T1-DEMO-010 report projector rejects mismatched campaign action claims", () => {
  const source = makeCompletedCampaignReportSource();
  source.campaign.agents[0].cases[0].attempts[1].actual_action = "allow";

  assert.throws(
    () => projectTrack1ReportModel(source),
    /track1_report_source_invalid/
  );
});

test("REQ-T1-DEMO-010 report projector rejects runtime content at every source branch", () => {
  for (const mutation of makeRuntimeContentMutations()) {
    assert.throws(
      () => projectTrack1ReportModel(mutation),
      /track1_report_source_invalid/
    );
  }
});

test("REQ-T1-DEMO-010 report projector rejects real side effects", () => {
  const source = makeCompletedCampaignReportSource();
  const toolResult = source.sessions[2].session.events.find(
    (event) => event.event_type === "tool_result"
  );
  assert.ok(toolResult && toolResult.event_type === "tool_result");
  toolResult.payload.state_change = "outbox_append";

  assert.throws(
    () => projectTrack1ReportModel(source),
    /track1_report_source_invalid/
  );
});

test("REQ-T1-DEMO-010 report model is a recursively frozen defensive copy", () => {
  const source = makeCompletedCampaignReportSource();
  const model = projectTrack1ReportModel(source);
  source.campaign.agents[0].cases[0].case_id = "T1-SC-001-C999" as never;

  assert.equal(model.cases[0]?.case_id, "T1-SC-001-C001");
  assert.equal(Object.isFrozen(model), true);
  assert.equal(Object.isFrozen(model.cases), true);
  assert.equal(Object.isFrozen(model.cases[0]), true);
});
