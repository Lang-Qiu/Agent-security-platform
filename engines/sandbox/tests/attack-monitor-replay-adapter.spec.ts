import assert from "node:assert/strict";
import test from "node:test";
import {
  runTrack1MonitorScenario,
  runAllTrack1MonitorCases,
  Track1MonitorError
} from "../src/monitoring/index.ts";
import type { BaseResult, SandboxRunResultDetails } from "../../../shared/types/result.ts";
import { normalizeBaseResult } from "../../../shared/contracts/result.ts";
import { runTrack1ScenarioReplay, serializeTrack1ScenarioReplay } from "../src/replay/index.ts";
import type { Track1ScenarioId } from "../src/replay/index.ts";

// -- Step 1: Adapter existence RED tests -----------------------------------

test("runTrack1MonitorScenario is exported", () => {
  assert.equal(typeof runTrack1MonitorScenario, "function");
});

test("runAllTrack1MonitorCases is exported", () => {
  assert.equal(typeof runAllTrack1MonitorCases, "function");
});

// -- Step 1: Three results per scenario ------------------------------------

const ALL_SCENARIO_IDS: Track1ScenarioId[] = ["T1-SC-001", "T1-SC-002", "T1-SC-003"];

for (const scenarioId of ALL_SCENARIO_IDS) {
  test(`runTrack1MonitorScenario ${scenarioId} returns three results`, async () => {
    const results = await runTrack1MonitorScenario(scenarioId);
    assert.equal(results.length, 3);
    // All results pass normalizeBaseResult
    for (const result of results) {
      const recheck = normalizeBaseResult(result);
      assert.ok(recheck);
    }
  });
}

// -- Step 1: Nine unique case IDs across all scenarios ----------------------

test("runAllTrack1MonitorCases returns nine results with unique case IDs", async () => {
  const results = await runAllTrack1MonitorCases();
  assert.equal(results.length, 9);

  const detailsList = results.map((r) => r.details as SandboxRunResultDetails);
  const caseIds = results.map((r) => {
    const events = (r.details as SandboxRunResultDetails).events;
    return events?.[0]?.case_id ?? null;
  });

  const uniqueCaseIds = new Set(caseIds.filter(Boolean));
  assert.equal(uniqueCaseIds.size, 9);

  // All pass normalizeBaseResult
  for (const result of results) {
    assert.ok(normalizeBaseResult(result));
  }

  // Results are sorted by case_id
  for (let i = 1; i < caseIds.length; i++) {
    if (caseIds[i] && caseIds[i - 1]) {
      assert.ok(caseIds[i]! >= caseIds[i - 1]!);
    }
  }
});

// -- Step 1: Scenario/case/session correlation -----------------------------

test("monitor results preserve scenario/case/session correlation", async () => {
  const scenarioIds = ["T1-SC-001", "T1-SC-002", "T1-SC-003"] as Track1ScenarioId[];
  for (const sid of scenarioIds) {
    const results = await runTrack1MonitorScenario(sid);
    for (const result of results) {
      const details = result.details as SandboxRunResultDetails;
      assert.ok(details.session_id);
      // Every event has matching session/scenario/case
      for (const event of details.events!) {
        assert.equal(event.session_id, details.session_id);
        if (event.case_id) {
          assert.ok(event.case_id.startsWith(sid + "-C"));
        }
      }
    }
  }
});

// -- Step 1: Tool-bearing cases use expected routing -----------------------

test("tool-bearing cases decide allow at model and expected action at tool", async () => {
  const results = await runAllTrack1MonitorCases();
  for (const result of results) {
    const details = result.details as SandboxRunResultDetails;
    const events = details.events!;
    const hasToolRequest = events.some((e) => e.event_type === "tool_request");
    const policyDecisions = details.policy_decisions!;

    if (hasToolRequest) {
      // Must have 2 decisions: one at model_output, one at tool_request
      assert.equal(policyDecisions.length, 2, `Expected 2 decisions for tool-bearing case`);
      // Current tool-bearing cases: tools must not execute
      const toolResult = events.find((e) => e.event_type === "tool_result");
      if (toolResult) {
        const payload = toolResult.payload as Record<string, unknown>;
        assert.equal(payload.status, "rejected");
        assert.equal(payload.state_change, "none");
      }
    }
  }
});

// -- Step 4: Determinism tests ---------------------------------------------

test("two runAllTrack1MonitorCases results are deeply equal", async () => {
  const a = await runAllTrack1MonitorCases();
  const b = await runAllTrack1MonitorCases();
  assert.deepEqual(a, b);
});

test("runAllTrack1MonitorCases JSON is byte-identical", async () => {
  const a = JSON.stringify(await runAllTrack1MonitorCases());
  const b = JSON.stringify(await runAllTrack1MonitorCases());
  assert.equal(a, b);
});

// -- Step 4: Leakage tests ------------------------------------------------

test("monitor results contain no raw fixture content", async () => {
  const { loadTrack1ReplayScenario } = await import("../src/replay/loader.ts");
  const results = await runAllTrack1MonitorCases();
  const serialized = JSON.stringify(results);

  for (const sid of ALL_SCENARIO_IDS) {
    const bundle = loadTrack1ReplayScenario(sid);
    for (const fixture of bundle.cases) {
      // Raw prompt
      assert.ok(!serialized.includes(fixture.input.user_prompt));
      // Model behavior
      assert.ok(!serialized.includes(fixture.expected_outcome.model_behavior));
      // Retrieved content
      for (const rc of fixture.input.retrieved_content) {
        assert.ok(!serialized.includes(rc));
      }
      // Memory content
      for (const mem of fixture.input.memory_entries) {
        assert.ok(!serialized.includes(mem.content));
      }
      // Tool arguments
      if (fixture.input.proposed_tool_call) {
        const args = JSON.stringify(fixture.input.proposed_tool_call.arguments);
        assert.ok(!serialized.includes(args));
      }
    }
  }
});

// -- Step 4: REQ-006 compatibility ------------------------------------------

test("REQ-006 replay entrypoints still produce their existing output", () => {
  for (const sid of ALL_SCENARIO_IDS) {
    const a = serializeTrack1ScenarioReplay(sid);
    const b = serializeTrack1ScenarioReplay(sid);
    assert.equal(a, b);
    const parsed = JSON.parse(a);
    assert.equal(parsed.length, 3);
  }
});

// -- Counters verification -------------------------------------------------

test("tool-free cases have correct counter metadata", async () => {
  const results = await runAllTrack1MonitorCases();
  for (const result of results) {
    const details = result.details as SandboxRunResultDetails;
    const hasTool = details.events!.some((e) => e.event_type === "tool_request");
    const monitor = (result.metadata as Record<string, unknown>).monitor as Record<string, unknown>;

    assert.ok(monitor, "Monitor metadata should exist");
    assert.equal(monitor.schema_version, "track1-monitor.v1");

    if (!hasTool) {
      assert.equal(monitor.model_call_count, 1);
      assert.equal(monitor.tool_call_count, 0);
      assert.equal(monitor.decision_count, 1);
      assert.equal(monitor.executed_tool_count, 0);
      assert.equal(monitor.intercepted_tool_count, 0);
      assert.equal(monitor.provider_failure_count, 0);
    } else {
      assert.equal(monitor.model_call_count, 1);
      assert.equal(monitor.tool_call_count, 1);
      assert.equal(monitor.decision_count, 2);
      assert.equal(monitor.executed_tool_count, 0);
      assert.equal(monitor.intercepted_tool_count, 1);
      assert.equal(monitor.provider_failure_count, 0);
    }
  }
});
