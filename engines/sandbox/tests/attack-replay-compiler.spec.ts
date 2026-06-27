import assert from "node:assert/strict";
import test from "node:test";

import { normalizeBaseResult } from "../../../shared/contracts/result.ts";
import type { SandboxRunResultDetails } from "../../../shared/types/result.ts";
import type { SandboxPolicyAction } from "../../../shared/types/sandbox.ts";
import {
  TRACK1_SCENARIO_IDS,
  Track1ReplayError,
  loadTrack1ReplayScenario
} from "../src/replay/index.ts";

// Dynamic import for files that don't exist yet (RED phase)
async function tryImportCompiler() {
  try {
    return await import("../src/replay/compiler.ts");
  } catch {
    return null;
  }
}

async function tryImportDeterministic() {
  try {
    return await import("../src/replay/deterministic.ts");
  } catch {
    return null;
  }
}

// -- expected action mapping ---------------------------------------------

const expectedActionMapping: Record<
  SandboxPolicyAction,
  { status: string; risk_level: string; blocked: boolean; alerts: number; blocked_records: number }
> = {
  allow: { status: "finished", risk_level: "info", blocked: false, alerts: 0, blocked_records: 0 },
  ask: { status: "finished", risk_level: "medium", blocked: false, alerts: 0, blocked_records: 0 },
  alert: { status: "finished", risk_level: "high", blocked: false, alerts: 1, blocked_records: 0 },
  deny: { status: "blocked", risk_level: "high", blocked: true, alerts: 0, blocked_records: 1 }
};

// -- load all fixtures for testing ---------------------------------------

function loadAllBundles() {
  return TRACK1_SCENARIO_IDS.map((id) => loadTrack1ReplayScenario(id));
}

// -- compiler tests ------------------------------------------------------

test("REQ-T1-ATTACK-REPLAY-006: compiler - deterministic primitives exist and are stable", async () => {
  const det = await tryImportDeterministic();
  assert.ok(det, "deterministic module must exist");

  assert.equal(typeof det.sha256, "function");
  assert.equal(typeof det.replayId, "function");
  assert.equal(typeof det.replayEvidenceRef, "function");
  assert.equal(typeof det.replayTimestamp, "function");

  // sha256 determinism
  const h1 = det.sha256("hello");
  const h2 = det.sha256("hello");
  assert.equal(h1, h2);
  assert.equal(h1.length, 64);

  // Different inputs produce different hashes
  assert.notEqual(det.sha256("hello"), det.sha256("world"));

  // replayId
  assert.equal(det.replayId("event", "T1-SC-001-C001"), "event:T1-SC-001-C001");
  assert.equal(
    det.replayId("event", "T1-SC-001-C001", 1),
    "event:T1-SC-001-C001:001"
  );
  assert.equal(
    det.replayId("event", "T1-SC-001-C001", 42),
    "event:T1-SC-001-C001:042"
  );

  // replayEvidenceRef
  const ref = det.replayEvidenceRef("prompt-sample", "T1-SC-001-C001");
  assert.equal(ref, "evidence://track1/T1-SC-001-C001/prompt-sample");

  // replayTimestamp
  const ts = det.replayTimestamp(0);
  assert.ok(ts.includes("2026-06-28T00:00:00"));
  const ts2 = det.replayTimestamp(5);
  assert.ok(ts2.includes("2026-06-28T00:00:05"));

  // Reject negative sequences
  assert.throws(() => det.replayTimestamp(-1));
  assert.throws(() => det.replayTimestamp(1.5));
});

test("REQ-T1-ATTACK-REPLAY-006: compiler - compileTrack1ReplayCase exists and produces results", async () => {
  const compiler = await tryImportCompiler();
  assert.ok(compiler, "compiler module must exist");
  assert.equal(typeof compiler.compileTrack1ReplayCase, "function");

  const bundles = loadAllBundles();
  const allResults: unknown[] = [];

  for (const bundle of bundles) {
    for (const fixture of bundle.cases) {
      const result = compiler.compileTrack1ReplayCase(bundle.scenario, fixture);
      assert.ok(result, `must produce a result for ${fixture.case_id}`);

      // Verify result shape
      assert.equal(result.task_type, "sandbox_run");
      assert.equal(result.engine_type, "sandbox");
      assert.ok(result.task_id);
      assert.ok(result.status);
      assert.ok(result.risk_level);
      assert.ok(result.summary);
      assert.ok(result.details);

      const details = result.details as SandboxRunResultDetails;

      // Every result has exactly one model_input and one model_output
      const modelInputs = details.events?.filter(
        (e) => e.event_type === "model_input"
      ) ?? [];
      const modelOutputs = details.events?.filter(
        (e) => e.event_type === "model_output"
      ) ?? [];
      assert.equal(modelInputs.length, 1, `${fixture.case_id}: must have 1 model_input`);
      assert.equal(modelOutputs.length, 1, `${fixture.case_id}: must have 1 model_output`);

      // Every result has exactly one primary policy_decision event
      const policyDecisions = details.events?.filter(
        (e) => e.event_type === "policy_decision"
      ) ?? [];
      assert.equal(
        policyDecisions.length,
        1,
        `${fixture.case_id}: must have 1 policy_decision event`
      );

      // Action mapping
      const action = fixture.expected_outcome.policy_action;
      const expected = expectedActionMapping[action];
      assert.equal(result.status, expected.status, `${fixture.case_id}: status`);
      assert.equal(result.risk_level, expected.risk_level, `${fixture.case_id}: risk_level`);
      assert.equal(details.blocked, expected.blocked, `${fixture.case_id}: blocked`);
      assert.equal(
        details.alerts?.length ?? 0,
        expected.alerts,
        `${fixture.case_id}: alerts count`
      );
      assert.equal(
        details.blocked_records?.length ?? 0,
        expected.blocked_records,
        `${fixture.case_id}: blocked_records count`
      );

      // Tool-bearing cases target tool_request
      if (fixture.input.proposed_tool_call !== null) {
        const toolRequests = details.events?.filter(
          (e) => e.event_type === "tool_request"
        ) ?? [];
        assert.equal(
          toolRequests.length,
          1,
          `${fixture.case_id}: must have tool_request`
        );
      }

      // Tool-free cases have no tool_request
      if (fixture.input.proposed_tool_call === null) {
        const toolRequests = details.events?.filter(
          (e) => e.event_type === "tool_request"
        ) ?? [];
        assert.equal(
          toolRequests.length,
          0,
          `${fixture.case_id}: must not have tool_request`
        );
      }

      // Event sequences are positive, unique, strictly increasing
      if (details.events) {
        const seqs = details.events.map((e) => e.sequence);
        for (const seq of seqs) {
          assert.ok(seq > 0, `${fixture.case_id}: sequence must be positive`);
        }
        const uniqueSeqs = new Set(seqs);
        assert.equal(
          uniqueSeqs.size,
          seqs.length,
          `${fixture.case_id}: sequences must be unique`
        );
        for (let i = 1; i < seqs.length; i++) {
          assert.ok(
            seqs[i] > seqs[i - 1],
            `${fixture.case_id}: sequences must be strictly increasing`
          );
        }
      }

      // Policy decision event payload matches policy_decisions[0]
      if (details.policy_decisions && details.policy_decisions.length > 0) {
        const pdEvent = details.events?.find(
          (e) => e.event_type === "policy_decision"
        );
        assert.ok(pdEvent, `${fixture.case_id}: must have policy_decision event`);
        const pdMaterialized = details.policy_decisions[0];
        assert.deepEqual(pdEvent?.payload, pdMaterialized);
      }

      // Evidence requirements appear exactly once and retain declaration order
      const evChecks = (result.metadata as Record<string, unknown>)?.replay as Record<string, unknown>;
      if (evChecks?.evidence_checks) {
        const checks = evChecks.evidence_checks as Array<{ requirement: string }>;
        const reqs = checks.map((c) => c.requirement);
        const uniqueReqs = new Set(reqs);
        assert.equal(
          uniqueReqs.size,
          reqs.length,
          `${fixture.case_id}: evidence checks must be unique`
        );

        // Must match fixture order
        for (let i = 0; i < fixture.expected_outcome.evidence_requirements.length; i++) {
          assert.equal(
            reqs[i],
            fixture.expected_outcome.evidence_requirements[i],
            `${fixture.case_id}: evidence check order mismatch at index ${i}`
          );
        }
      }

      allResults.push(result);
    }
  }

  // All 9 fixtures compiled
  assert.equal(allResults.length, 9, "must compile all 9 fixtures");
});

test("REQ-T1-ATTACK-REPLAY-006: compiler - determinism: two compilations are deeply equal", async () => {
  const compiler = await tryImportCompiler();
  assert.ok(compiler);

  const bundle = loadTrack1ReplayScenario("T1-SC-001");
  const fixture = bundle.cases[0];

  const r1 = compiler.compileTrack1ReplayCase(bundle.scenario, fixture);
  const r2 = compiler.compileTrack1ReplayCase(bundle.scenario, fixture);

  assert.deepEqual(r1, r2);
  const json1 = JSON.stringify(r1);
  const json2 = JSON.stringify(r2);
  assert.equal(json1, json2);
});

test("REQ-T1-ATTACK-REPLAY-006: compiler - normalizeBaseResult validates all compiled results", async () => {
  const compiler = await tryImportCompiler();
  assert.ok(compiler);

  const bundles = loadAllBundles();

  for (const bundle of bundles) {
    for (const fixture of bundle.cases) {
      const result = compiler.compileTrack1ReplayCase(bundle.scenario, fixture);
      const normalized = normalizeBaseResult(result);
      assert.ok(normalized, `${fixture.case_id}: must pass normalizeBaseResult`);
      assert.deepEqual(normalized, result);
    }
  }
});

test("REQ-T1-ATTACK-REPLAY-006: compiler - memory events appear correctly", async () => {
  const compiler = await tryImportCompiler();
  assert.ok(compiler);

  // SC-003-C001 has no memory entries, SC-003-C002 and C003 have memory
  const bundle = loadTrack1ReplayScenario("T1-SC-003");

  for (const fixture of bundle.cases) {
    const result = compiler.compileTrack1ReplayCase(bundle.scenario, fixture);
    const details = result.details as SandboxRunResultDetails;
    const memoryWrites = details.events?.filter((e) => e.event_type === "memory_write") ?? [];
    const memoryReads = details.events?.filter((e) => e.event_type === "memory_read") ?? [];

    if (fixture.input.memory_entries.length > 0) {
      assert.equal(
        memoryWrites.length,
        fixture.input.memory_entries.length,
        `${fixture.case_id}: memory_write count must match memory_entries`
      );
      assert.equal(
        memoryReads.length,
        fixture.input.memory_entries.length,
        `${fixture.case_id}: memory_read count must match memory_entries`
      );
      // memory_write precedes memory_read for each entry
      for (let i = 0; i < fixture.input.memory_entries.length; i++) {
        const writeIdx = details.events?.findIndex(
          (e) => e.event_type === "memory_write"
            && e.event_id.includes(fixture.input.memory_entries[i].memory_id)
        ) ?? -1;
        const readIdx = details.events?.findIndex(
          (e) => e.event_type === "memory_read"
            && e.event_id.includes(fixture.input.memory_entries[i].memory_id)
        ) ?? -1;
        if (writeIdx >= 0 && readIdx >= 0) {
          assert.ok(writeIdx < readIdx, `${fixture.case_id}: memory_write must precede memory_read`);
        }
      }
    } else {
      assert.equal(memoryWrites.length, 0, `${fixture.case_id}: no memory_write for empty memory`);
      assert.equal(memoryReads.length, 0, `${fixture.case_id}: no memory_read for empty memory`);
    }
  }
});

test("REQ-T1-ATTACK-REPLAY-006: compiler - SC-002 tool-bearing cases emit rejected tool_result", async () => {
  const compiler = await tryImportCompiler();
  assert.ok(compiler);

  const bundle = loadTrack1ReplayScenario("T1-SC-002");

  for (const fixture of bundle.cases) {
    const result = compiler.compileTrack1ReplayCase(bundle.scenario, fixture);
    const details = result.details as SandboxRunResultDetails;

    if (fixture.input.proposed_tool_call !== null) {
      const toolResults = details.events?.filter((e) => e.event_type === "tool_result") ?? [];
      assert.equal(
        toolResults.length,
        1,
        `${fixture.case_id}: must emit tool_result`
      );
      const tr = toolResults[0];
      assert.equal(tr.payload.status, "rejected");
      assert.equal(tr.payload.state_change, "none");
    }
  }
});

test("REQ-T1-ATTACK-REPLAY-006: compiler - negative-control evidence checks are absent", async () => {
  const compiler = await tryImportCompiler();
  assert.ok(compiler);

  for (const scenarioId of TRACK1_SCENARIO_IDS) {
    const bundle = loadTrack1ReplayScenario(scenarioId);
    for (const fixture of bundle.cases) {
      if (fixture.test_category === "negative_control") {
        const result = compiler.compileTrack1ReplayCase(bundle.scenario, fixture);
        const metadata = (result.metadata as Record<string, unknown>)?.replay as Record<string, unknown>;
        const checks = metadata?.evidence_checks as Array<{
          requirement: string;
          observation: string;
        }>;

        const saCheck = checks.find((c) => c.requirement === "sandbox_alert");
        const brCheck = checks.find((c) => c.requirement === "blocked_record");

        if (saCheck) {
          assert.equal(saCheck.observation, "absent", `${fixture.case_id}: sandbox_alert must be absent`);
        }
        if (brCheck) {
          assert.equal(brCheck.observation, "absent", `${fixture.case_id}: blocked_record must be absent`);
        }
      }
    }
  }
});

test("REQ-T1-ATTACK-REPLAY-006: compiler - serialized output contains no raw fixture content", async () => {
  const compiler = await tryImportCompiler();
  assert.ok(compiler);

  const bundles = loadAllBundles();

  for (const bundle of bundles) {
    for (const fixture of bundle.cases) {
      const result = compiler.compileTrack1ReplayCase(bundle.scenario, fixture);
      const json = JSON.stringify(result);

      // No raw prompt
      assert.ok(
        !json.includes(fixture.input.user_prompt),
        `${fixture.case_id}: must not contain raw prompt`
      );

      // No raw retrieved content
      for (const content of fixture.input.retrieved_content) {
        assert.ok(
          !json.includes(content),
          `${fixture.case_id}: must not contain raw retrieved content`
        );
      }

      // No raw memory content
      for (const entry of fixture.input.memory_entries) {
        assert.ok(
          !json.includes(entry.content),
          `${fixture.case_id}: must not contain raw memory content`
        );
      }

      // No raw tool argument values
      if (fixture.input.proposed_tool_call) {
        const argsJson = JSON.stringify(fixture.input.proposed_tool_call.arguments);
        // Check for individual values that are not structural
        const argValues = Object.values(fixture.input.proposed_tool_call.arguments);
        for (const val of argValues) {
          if (typeof val === "string" && val.length > 3) {
            assert.ok(
              !json.includes(val),
              `${fixture.case_id}: must not contain tool argument: ${val}`
            );
          }
        }
      }
    }
  }
});

test("REQ-T1-ATTACK-REPLAY-006: compiler - unsafe tool disposition rejects", async () => {
  const compiler = await tryImportCompiler();
  assert.ok(compiler);

  const bundle = loadTrack1ReplayScenario("T1-SC-001");
  // Find a case with a proposed tool call (T1-SC-001-C002)
  const toolCase = bundle.cases.find(
    (c) => c.input.proposed_tool_call !== null
  );
  assert.ok(toolCase, "must find a tool-bearing case");

  const modifiedFixture = {
    ...toolCase,
    expected_outcome: {
      ...toolCase.expected_outcome,
      tool_behavior: {
        ...toolCase.expected_outcome.tool_behavior,
        disposition: "not_requested" as const
      }
    }
  };

  // not_requested with a tool call should fail
  assert.throws(
    () => compiler.compileTrack1ReplayCase(bundle.scenario, modifiedFixture),
    (err: unknown) =>
      err instanceof Track1ReplayError &&
      err.code === "unsafe_tool_execution_requested"
  );
});
