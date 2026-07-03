import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeTrack1CampaignAgentSummary,
  normalizeTrack1CampaignCaseSummary,
  normalizeTrack1CampaignDetail,
  normalizeTrack1CampaignEvidenceExport,
  normalizeTrack1CampaignSummary
} from "../contracts/campaign-supervision.ts";

const VALID_SUMMARY = {
  schema_version: "track1-campaign-read.v1",
  campaign_id: "campaign:t1:0123456789abcdef0123456789abcdef",
  status: "running",
  started_at: "2026-06-30T00:00:00.000Z",
  updated_at: "2026-06-30T00:00:01.000Z",
  agent_count: 3,
  case_count: 9,
  passed_case_count: 1,
  failed_case_count: 0,
  retry_count: 0,
  alert_count: 1,
  blocked_count: 1,
  ask_count: 0,
  evidence_available: false
} as const;

test("REQ-T1-DEMO-010 normalizes a content-free campaign summary", () => {
  const normalized = normalizeTrack1CampaignSummary(VALID_SUMMARY);
  assert.deepEqual(normalized, VALID_SUMMARY);
  assert.notEqual(normalized, VALID_SUMMARY);
});

test("REQ-T1-DEMO-010 rejects unknown summary fields", () => {
  assert.equal(
    normalizeTrack1CampaignSummary({
      ...VALID_SUMMARY,
      raw_prompt: "CAMPAIGN_SUMMARY_SENTINEL"
    }),
    null
  );
});

test("REQ-T1-DEMO-010 rejects impossible counters and calendar dates", () => {
  assert.equal(
    normalizeTrack1CampaignSummary({
      ...VALID_SUMMARY,
      passed_case_count: 10
    }),
    null
  );
  assert.equal(
    normalizeTrack1CampaignSummary({
      ...VALID_SUMMARY,
      updated_at: "2026-02-31T00:00:00.000Z"
    }),
    null
  );
});

const makeValidAgentSummary = () => ({
  campaign_id: "campaign:t1:0123456789abcdef0123456789abcdef",
  agent_id: "agent:track1:prompt-injection",
  scenario_id: "T1-SC-001",
  status: "running",
  case_count: 3,
  passed_case_count: 1,
  failed_case_count: 0,
  retry_count: 0,
  alert_count: 1,
  blocked_count: 1,
  ask_count: 0,
  updated_at: "2026-06-30T00:00:01.000Z"
} as const);

test("REQ-T1-DEMO-010 normalizes a content-free campaign agent summary", () => {
  const agent = makeValidAgentSummary();
  const normalized = normalizeTrack1CampaignAgentSummary(agent);
  assert.deepEqual(normalized, agent);
  assert.notEqual(normalized, agent);
});

test("REQ-T1-DEMO-010 rejects unknown agent summary fields", () => {
  assert.equal(
    normalizeTrack1CampaignAgentSummary({
      ...makeValidAgentSummary(),
      raw_prompt: "AGENT_SUMMARY_SENTINEL"
    }),
    null
  );
});

test("REQ-T1-DEMO-010 rejects an unknown campaign agent", () => {
  assert.equal(normalizeTrack1CampaignAgentSummary({
    ...makeValidAgentSummary(),
    agent_id: "agent:track1:unknown"
  }), null);
});

const makeValidCaseSummary = () => ({
  campaign_id: "campaign:t1:0123456789abcdef0123456789abcdef",
  agent_id: "agent:track1:tool-hijack",
  scenario_id: "T1-SC-002",
  case_id: "T1-SC-002-C002",
  status: "failed",
  expected_action: "ask",
  actual_action: "deny",
  attempt_count: 2,
  current_session_id: "session:0123456789abcdef0123456789abcdef",
  updated_at: "2026-06-30T00:00:01.000Z"
} as const);

test("REQ-T1-DEMO-010 normalizes a content-free campaign case summary", () => {
  const caseSummary = makeValidCaseSummary();
  const normalized = normalizeTrack1CampaignCaseSummary(caseSummary);
  assert.deepEqual(normalized, caseSummary);
  assert.notEqual(normalized, caseSummary);
});

test("REQ-T1-DEMO-010 rejects unknown case summary fields", () => {
  assert.equal(
    normalizeTrack1CampaignCaseSummary({
      ...makeValidCaseSummary(),
      raw_prompt: "CASE_SUMMARY_SENTINEL"
    }),
    null
  );
});

test("REQ-T1-DEMO-010 rejects a case with more than two attempts", () => {
  assert.equal(normalizeTrack1CampaignCaseSummary({
    ...makeValidCaseSummary(),
    attempt_count: 3
  }), null);
});

test("REQ-T1-DEMO-010 rejects expected and actual action outside policy enum", () => {
  assert.equal(normalizeTrack1CampaignCaseSummary({
    ...makeValidCaseSummary(),
    expected_action: "block"
  }), null);
});

// P1-T3: detail and evidence contracts

const CAMPAIGN_DETAIL_ID = "campaign:t1:0123456789abcdef0123456789abcdef";
const CAMPAIGN_DETAIL_HEX = "0123456789abcdef0123456789abcdef";

const DETAIL_AGENT_DEFS = [
  {
    agent_id: "agent:track1:prompt-injection",
    scenario_id: "T1-SC-001",
    case_ids: ["T1-SC-001-C001", "T1-SC-001-C002", "T1-SC-001-C003"],
    expected_actions: ["deny", "deny", "allow"]
  },
  {
    agent_id: "agent:track1:tool-hijack",
    scenario_id: "T1-SC-002",
    case_ids: ["T1-SC-002-C001", "T1-SC-002-C002", "T1-SC-002-C003"],
    expected_actions: ["deny", "ask", "deny"]
  },
  {
    agent_id: "agent:track1:memory-poison",
    scenario_id: "T1-SC-003",
    case_ids: ["T1-SC-003-C001", "T1-SC-003-C002", "T1-SC-003-C003"],
    expected_actions: ["ask", "deny", "allow"]
  }
];

function hexSuffix(n: number): string {
  return n.toString(16).padStart(32, "0");
}

function makeValidCampaignDetail() {
  let counter = 0;
  const agents = DETAIL_AGENT_DEFS.map((def) => {
    const cases = def.case_ids.map((caseId, caseIdx) => {
      counter += 1;
      const sessionId = `session:${hexSuffix(counter)}`;
      const taskId = `task:${hexSuffix(counter + 100)}`;
      const expectedAction = def.expected_actions[caseIdx];
      const attempt = {
        campaign_id: CAMPAIGN_DETAIL_ID,
        agent_id: def.agent_id,
        scenario_id: def.scenario_id,
        case_id: caseId,
        attempt_id: `attempt:${caseId.toLowerCase()}:1`,
        attempt_index: 1,
        session_id: sessionId,
        task_id: taskId,
        status: "passed",
        policy_action: expectedAction,
        report_summary: "1 " + expectedAction,
        started_at: "2026-06-30T00:00:00.000Z",
        updated_at: "2026-06-30T00:00:01.000Z"
      };
      return {
        campaign_id: CAMPAIGN_DETAIL_ID,
        agent_id: def.agent_id,
        scenario_id: def.scenario_id,
        case_id: caseId,
        status: "passed",
        expected_action: def.expected_actions[caseIdx],
        attempt_count: 1,
        attempts: [attempt],
        updated_at: "2026-06-30T00:00:01.000Z"
      };
    });
    return {
      campaign_id: CAMPAIGN_DETAIL_ID,
      agent_id: def.agent_id,
      scenario_id: def.scenario_id,
      status: "completed",
      case_count: 3,
      cases,
      updated_at: "2026-06-30T00:00:01.000Z"
    };
  });
  return {
    schema_version: "track1-campaign-read.v1",
    campaign_id: CAMPAIGN_DETAIL_ID,
    status: "completed",
    started_at: "2026-06-30T00:00:00.000Z",
    updated_at: "2026-06-30T00:00:01.000Z",
    agent_count: 3,
    case_count: 9,
    agents
  };
}

function makeValidCampaignEvidence() {
  const detail = makeValidCampaignDetail();
  const sessionHexes: string[] = [];
  for (const agent of detail.agents) {
    for (const c of agent.cases) {
      for (const a of c.attempts) {
        sessionHexes.push(a.session_id.substring("session:".length));
      }
    }
  }
  const sessionEvidenceRefs = sessionHexes.map(
    (h) => `evidence://track1/campaign/${CAMPAIGN_DETAIL_HEX}/session/${h}`
  );
  return {
    schema_version: "track1-campaign-evidence.v1",
    campaign: detail,
    session_evidence_refs: sessionEvidenceRefs,
    artifact_manifest_ref: `artifact://track1/campaign/${CAMPAIGN_DETAIL_HEX}/manifest`
  };
}

test("REQ-T1-DEMO-010 accepts exactly three ordered agents and nine cases", () => {
  const detail = makeValidCampaignDetail();
  const normalized = normalizeTrack1CampaignDetail(detail);
  assert.ok(normalized);
  assert.equal(normalized.agents.length, 3);
  assert.equal(
    normalized.agents.flatMap((agent) => agent.cases).length,
    9
  );
});

test("REQ-T1-DEMO-010 rejects duplicate case and session identities", () => {
  const detail = makeValidCampaignDetail();
  detail.agents[1].cases[0].case_id = detail.agents[0].cases[0].case_id;
  assert.equal(normalizeTrack1CampaignDetail(detail), null);
});

test("REQ-T1-DEMO-010 rejects cross-agent attempt correlation", () => {
  const detail = makeValidCampaignDetail();
  detail.agents[1].cases[0].attempts[0].agent_id =
    "agent:track1:prompt-injection";
  assert.equal(normalizeTrack1CampaignDetail(detail), null);
});

test("REQ-T1-DEMO-010 rejects evidence with raw runtime content", () => {
  const evidence = makeValidCampaignEvidence();
  assert.equal(normalizeTrack1CampaignEvidenceExport({
    ...evidence,
    model_output: "CAMPAIGN_EVIDENCE_SENTINEL"
  }), null);
});

// -- P1-3: case summary semantic consistency + evidence completeness -----------

test("REQ-T1-DEMO-010 rejects case summary with agent/scenario mismatch", () => {
  assert.equal(normalizeTrack1CampaignCaseSummary({
    ...makeValidCaseSummary(),
    agent_id: "agent:track1:prompt-injection",
    scenario_id: "T1-SC-002",
    case_id: "T1-SC-002-C001"
  }), null);
});

test("REQ-T1-DEMO-010 rejects case summary with scenario/case mismatch", () => {
  assert.equal(normalizeTrack1CampaignCaseSummary({
    ...makeValidCaseSummary(),
    scenario_id: "T1-SC-001",
    case_id: "T1-SC-002-C001"
  }), null);
});

test("REQ-T1-DEMO-010 rejects passed case with null actual_action", () => {
  assert.equal(normalizeTrack1CampaignCaseSummary({
    ...makeValidCaseSummary(),
    status: "passed",
    expected_action: "deny",
    actual_action: null
  }), null);
});

test("REQ-T1-DEMO-010 rejects passed case where actual_action != expected_action", () => {
  assert.equal(normalizeTrack1CampaignCaseSummary({
    ...makeValidCaseSummary(),
    status: "passed",
    expected_action: "ask",
    actual_action: "deny"
  }), null);
});

test("REQ-T1-DEMO-010 rejects failed case with null actual_action", () => {
  assert.equal(normalizeTrack1CampaignCaseSummary({
    ...makeValidCaseSummary(),
    status: "failed",
    actual_action: null
  }), null);
});

test("REQ-T1-DEMO-010 rejects agent summary with agent/scenario mismatch", () => {
  assert.equal(normalizeTrack1CampaignAgentSummary({
    ...makeValidAgentSummary(),
    agent_id: "agent:track1:prompt-injection",
    scenario_id: "T1-SC-002"
  }), null);
});

test("REQ-T1-DEMO-010 rejects evidence with empty session_evidence_refs", () => {
  const evidence = makeValidCampaignEvidence();
  assert.equal(normalizeTrack1CampaignEvidenceExport({
    ...evidence,
    session_evidence_refs: []
  }), null);
});

test("REQ-T1-DEMO-010 rejects evidence with duplicate session_evidence_refs", () => {
  const evidence = makeValidCampaignEvidence();
  const dup = evidence.session_evidence_refs[0];
  evidence.session_evidence_refs.push(dup);
  assert.equal(normalizeTrack1CampaignEvidenceExport(evidence), null);
});

test("REQ-T1-DEMO-010 rejects evidence with incomplete session_evidence_refs", () => {
  const evidence = makeValidCampaignEvidence();
  evidence.session_evidence_refs.pop();
  assert.equal(normalizeTrack1CampaignEvidenceExport(evidence), null);
});

// -- P1-4: completed_at optional key handling -----------------------------------

test("REQ-T1-DEMO-010 accepts completed summary with completed_at", () => {
  const summary = {
    ...VALID_SUMMARY,
    status: "completed",
    updated_at: "2026-06-30T00:10:00.000Z",
    completed_at: "2026-06-30T00:10:00.000Z",
    passed_case_count: 9,
    failed_case_count: 0
  };
  assert.ok(normalizeTrack1CampaignSummary(summary));
});

test("REQ-T1-DEMO-010 rejects completed summary without completed_at", () => {
  assert.equal(normalizeTrack1CampaignSummary({
    ...VALID_SUMMARY,
    status: "completed"
  }), null);
});

test("REQ-T1-DEMO-010 rejects running summary with completed_at", () => {
  assert.equal(normalizeTrack1CampaignSummary({
    ...VALID_SUMMARY,
    status: "running",
    completed_at: "2026-06-30T00:10:00.000Z"
  }), null);
});

// -- P1-6: hasExactKeys prototype inheritance bypass ----------------------------

test("REQ-T1-DEMO-010 rejects object with prototype-inherited field replacing required key", () => {
  const proto = { campaign_id: "campaign:t1:0123456789abcdef0123456789abcdef" };
  const malicious = Object.create(proto);
  malicious.schema_version = "track1-campaign-read.v1";
  malicious.status = "running";
  malicious.started_at = "2026-06-30T00:00:00.000Z";
  malicious.updated_at = "2026-06-30T00:00:01.000Z";
  malicious.agent_count = 3;
  malicious.case_count = 9;
  malicious.passed_case_count = 1;
  malicious.failed_case_count = 0;
  malicious.retry_count = 0;
  malicious.alert_count = 1;
  malicious.blocked_count = 1;
  malicious.ask_count = 0;
  malicious.evidence_available = false;
  malicious.raw_prompt = "PROTO_BYPASS_SENTINEL";
  assert.equal(normalizeTrack1CampaignSummary(malicious), null);
});

// -- P1-2 rework: detail case status-action consistency + completed summary ----

test("REQ-T1-DEMO-010 rejects case detail passed when actual_action != expected_action", () => {
  const detail = makeValidCampaignDetail();
  const c = detail.agents[0].cases[0];
  // expected_action is "deny" for T1-SC-001-C001
  c.status = "passed";
  c.attempts[0].status = "passed";
  c.attempts[0].policy_action = "allow"; // mismatch with expected "deny"
  assert.equal(normalizeTrack1CampaignDetail(detail), null);
});

test("REQ-T1-DEMO-010 rejects case detail with passed status but null actual_action", () => {
  const detail = makeValidCampaignDetail();
  const c = detail.agents[0].cases[0];
  c.status = "passed";
  c.attempts[0].status = "passed";
  c.attempts[0].policy_action = null;
  assert.equal(normalizeTrack1CampaignDetail(detail), null);
});

test("REQ-T1-DEMO-010 rejects case detail with failed status but null actual_action", () => {
  const detail = makeValidCampaignDetail();
  const c = detail.agents[0].cases[0];
  c.status = "failed";
  c.attempts[0].status = "failed";
  c.attempts[0].policy_action = null;
  assert.equal(normalizeTrack1CampaignDetail(detail), null);
});

test("REQ-T1-DEMO-010 rejects completed summary when passed_case_count < 9", () => {
  // A completed campaign requires all 9 cases resolved (passed + failed = 9),
  // not merely 1 passed + 0 failed.
  const summary = {
    ...VALID_SUMMARY,
    status: "completed",
    completed_at: "2026-06-30T00:10:00.000Z",
    passed_case_count: 1,
    failed_case_count: 0
  };
  assert.equal(normalizeTrack1CampaignSummary(summary), null);
});

test("REQ-T1-DEMO-010 rejects completed summary when failed_case_count > 0", () => {
  // Rework 6: completed requires passed=9, failed=0 (not just passed+failed=9)
  const summary = {
    ...VALID_SUMMARY,
    status: "completed",
    updated_at: "2026-06-30T00:10:00.000Z",
    completed_at: "2026-06-30T00:10:00.000Z",
    passed_case_count: 8,
    failed_case_count: 1
  };
  assert.equal(normalizeTrack1CampaignSummary(summary), null);
});

test("REQ-T1-DEMO-010 rejects completed_at earlier than started_at", () => {
  const summary = {
    ...VALID_SUMMARY,
    status: "completed",
    // started_at is "2026-06-30T00:00:00.000Z"; completed_at must be >= started_at
    completed_at: "2026-06-29T23:59:59.000Z",
    passed_case_count: 9,
    failed_case_count: 0
  };
  assert.equal(normalizeTrack1CampaignSummary(summary), null);
});

test("REQ-T1-DEMO-010 accepts completed_at equal to started_at", () => {
  const summary = {
    ...VALID_SUMMARY,
    status: "completed",
    started_at: "2026-06-30T00:00:00.000Z",
    updated_at: "2026-06-30T00:00:00.000Z",
    completed_at: "2026-06-30T00:00:00.000Z",
    passed_case_count: 9,
    failed_case_count: 0
  };
  assert.ok(normalizeTrack1CampaignSummary(summary));
});

// -- P2-4: evidence ref deterministic ordering ---------------------------------

test("REQ-T1-DEMO-010 rejects evidence with session_evidence_refs in reversed order", () => {
  const evidence = makeValidCampaignEvidence();
  // Reverse the order of refs; the campaign detail traversal order is fixed
  // (agent 0 case 0 attempt 0, agent 0 case 0 attempt 1, ... agent 2 case 2).
  evidence.session_evidence_refs.reverse();
  assert.equal(normalizeTrack1CampaignEvidenceExport(evidence), null);
});

test("REQ-T1-DEMO-010 emits session_evidence_refs in campaign traversal order", () => {
  const evidence = makeValidCampaignEvidence();
  const normalized = normalizeTrack1CampaignEvidenceExport(evidence);
  assert.ok(normalized);
  // Rebuild expected order by walking the campaign detail in fixed order.
  const expected: string[] = [];
  for (const agent of evidence.campaign.agents) {
    for (const c of agent.cases) {
      for (const a of c.attempts) {
        const hex = a.session_id.substring("session:".length);
        expected.push(
          `evidence://track1/campaign/${CAMPAIGN_DETAIL_HEX}/session/${hex}`
        );
      }
    }
  }
  assert.deepEqual(normalized.session_evidence_refs, expected);
});

// -- P1-1 rework 2: cascade status consistency ---------------------------------

test("REQ-T1-DEMO-010 rejects case detail passed when final attempt is failed", () => {
  const detail = makeValidCampaignDetail();
  const c = detail.agents[0].cases[0];
  // case is "passed" but its only attempt is "failed"
  c.status = "passed";
  c.attempts[0].status = "failed";
  c.attempts[0].policy_action = c.expected_action; // satisfy action rule
  assert.equal(normalizeTrack1CampaignDetail(detail), null);
});

test("REQ-T1-DEMO-010 rejects case detail failed when final attempt is passed", () => {
  const detail = makeValidCampaignDetail();
  const c = detail.agents[0].cases[0];
  c.status = "failed";
  c.attempts[0].status = "passed";
  c.attempts[0].policy_action = c.expected_action;
  assert.equal(normalizeTrack1CampaignDetail(detail), null);
});

test("REQ-T1-DEMO-010 rejects case detail running when final attempt is passed", () => {
  const detail = makeValidCampaignDetail();
  const c = detail.agents[0].cases[0];
  c.status = "running";
  c.attempts[0].status = "passed";
  c.attempts[0].policy_action = c.expected_action;
  assert.equal(normalizeTrack1CampaignDetail(detail), null);
});

test("REQ-T1-DEMO-010 rejects agent detail running when all cases are passed", () => {
  const detail = makeValidCampaignDetail();
  // All cases passed (default fixture) but agent status is "running"
  detail.agents[0].status = "running";
  assert.equal(normalizeTrack1CampaignDetail(detail), null);
});

test("REQ-T1-DEMO-010 rejects agent detail completed when a case is running", () => {
  const detail = makeValidCampaignDetail();
  detail.agents[0].status = "completed";
  detail.agents[0].cases[0].status = "running";
  detail.agents[0].cases[0].attempts[0].status = "running";
  detail.agents[0].cases[0].attempts[0].policy_action = null;
  assert.equal(normalizeTrack1CampaignDetail(detail), null);
});

test("REQ-T1-DEMO-010 rejects campaign completed when an agent is running", () => {
  const detail = makeValidCampaignDetail();
  detail.status = "completed";
  detail.agents[0].status = "running";
  assert.equal(normalizeTrack1CampaignDetail(detail), null);
});

test("REQ-T1-DEMO-010 rejects campaign running when all agents are completed", () => {
  const detail = makeValidCampaignDetail();
  // All agents completed (default fixture) but campaign is "running"
  detail.status = "running";
  assert.equal(normalizeTrack1CampaignDetail(detail), null);
});

// -- P1-1 rework 3: complete state matrix (pending case, attempt_count 0,
//                    two-attempt predecessor failure, created/validating) ---

test("REQ-T1-DEMO-010 accepts a pending case with zero attempts", () => {
  const detail = makeValidCampaignDetail();
  const c = detail.agents[0].cases[0];
  c.status = "pending";
  c.attempt_count = 0;
  c.attempts = [];
  // parent agent must be running (not all cases terminal)
  detail.agents[0].status = "running";
  detail.status = "running";
  assert.ok(normalizeTrack1CampaignDetail(detail));
});

test("REQ-T1-DEMO-010 rejects pending case with non-zero attempt_count", () => {
  const detail = makeValidCampaignDetail();
  const c = detail.agents[0].cases[0];
  c.status = "pending";
  // attempt_count is 1 but status is pending — inconsistent
  assert.equal(normalizeTrack1CampaignDetail(detail), null);
});

test("REQ-T1-DEMO-010 rejects pending case with non-empty attempts", () => {
  const detail = makeValidCampaignDetail();
  const c = detail.agents[0].cases[0];
  c.status = "pending";
  c.attempt_count = 0;
  // attempts array still has 1 entry — inconsistent with attempt_count 0
  assert.equal(normalizeTrack1CampaignDetail(detail), null);
});

test("REQ-T1-DEMO-010 rejects non-pending case with zero attempts", () => {
  const detail = makeValidCampaignDetail();
  const c = detail.agents[0].cases[0];
  c.status = "running";
  c.attempt_count = 0;
  c.attempts = [];
  assert.equal(normalizeTrack1CampaignDetail(detail), null);
});

test("REQ-T1-DEMO-010 rejects second attempt after passed first attempt", () => {
  const detail = makeValidCampaignDetail();
  const c = detail.agents[0].cases[0];
  // first attempt passed, but there's a second attempt — invalid
  c.attempt_count = 2;
  c.attempts = [
    { ...c.attempts[0], status: "passed", policy_action: c.expected_action, report_summary: "1 " + c.expected_action },
    { ...c.attempts[0], attempt_id: `attempt:${c.case_id.toLowerCase()}:2`, attempt_index: 2, session_id: "session:feedface0000000000000000feedface", status: "failed", report_summary: "1 deny" }
  ];
  c.status = "failed";
  assert.equal(normalizeTrack1CampaignDetail(detail), null);
});

test("REQ-T1-DEMO-010 accepts second attempt only after failed first attempt", () => {
  const detail = makeValidCampaignDetail();
  const c = detail.agents[0].cases[0];
  // first attempt failed, second attempt passed — valid retry scenario
  c.attempt_count = 2;
  c.attempts = [
    { ...c.attempts[0], status: "failed", policy_action: "deny", report_summary: "1 deny" },
    { ...c.attempts[0], attempt_id: `attempt:${c.case_id.toLowerCase()}:2`, attempt_index: 2, session_id: "session:feedface0000000000000000feedface", status: "passed", policy_action: c.expected_action, report_summary: "1 " + c.expected_action }
  ];
  c.status = "passed";
  assert.ok(normalizeTrack1CampaignDetail(detail));
});

test("REQ-T1-DEMO-010 rejects second attempt after running first attempt", () => {
  const detail = makeValidCampaignDetail();
  const c = detail.agents[0].cases[0];
  // first attempt still running, but second attempt exists — invalid
  c.attempt_count = 2;
  c.attempts = [
    { ...c.attempts[0], status: "running", policy_action: null, report_summary: "no decisions" },
    { ...c.attempts[0], attempt_id: `attempt:${c.case_id.toLowerCase()}:2`, attempt_index: 2, session_id: "session:feedface0000000000000000feedface", status: "running", policy_action: null, report_summary: "no decisions" }
  ];
  c.status = "running";
  detail.agents[0].status = "running";
  detail.status = "running";
  assert.equal(normalizeTrack1CampaignDetail(detail), null);
});

test("REQ-T1-DEMO-010 rejects created campaign with non-pending children", () => {
  const detail = makeValidCampaignDetail();
  // campaign is "created" but all cases are "passed" — invalid
  detail.status = "created";
  detail.agents[0].status = "created";
  assert.equal(normalizeTrack1CampaignDetail(detail), null);
});

test("REQ-T1-DEMO-010 rejects validating campaign with non-pending children", () => {
  const detail = makeValidCampaignDetail();
  detail.status = "validating";
  detail.agents[0].status = "validating";
  assert.equal(normalizeTrack1CampaignDetail(detail), null);
});

test("REQ-T1-DEMO-010 accepts created campaign with all pending cases", () => {
  const detail = makeValidCampaignDetail();
  detail.status = "created";
  for (const agent of detail.agents) {
    agent.status = "created";
    for (const c of agent.cases) {
      c.status = "pending";
      c.attempt_count = 0;
      c.attempts = [];
    }
  }
  assert.ok(normalizeTrack1CampaignDetail(detail));
});

// -- P1-2 rework 4: pending session null + parent-child status matrix ---------

test("REQ-T1-DEMO-010 rejects pending case summary with non-null current_session_id", () => {
  // pending cases have no session yet; a fake session ID is currently accepted
  // but must be rejected. current_session_id must be null for pending cases.
  assert.equal(
    normalizeTrack1CampaignCaseSummary({
      ...makeValidCaseSummary(),
      status: "pending",
      attempt_count: 0,
      actual_action: null,
      current_session_id: "session:0123456789abcdef0123456789abcdef"
    }),
    null
  );
});

test("REQ-T1-DEMO-010 accepts pending case summary with null current_session_id", () => {
  assert.ok(
    normalizeTrack1CampaignCaseSummary({
      ...makeValidCaseSummary(),
      status: "pending",
      attempt_count: 0,
      actual_action: null,
      current_session_id: null
    })
  );
});

test("REQ-T1-DEMO-010 rejects non-pending case summary with null current_session_id", () => {
  assert.equal(
    normalizeTrack1CampaignCaseSummary({
      ...makeValidCaseSummary(),
      current_session_id: null
    }),
    null
  );
});

test("REQ-T1-DEMO-010 rejects created campaign with failed agents", () => {
  // created campaign must have all agents in created state, not failed
  const detail = makeValidCampaignDetail();
  detail.status = "created";
  for (const agent of detail.agents) {
    agent.status = "created";
    for (const c of agent.cases) {
      c.status = "pending";
      c.attempt_count = 0;
      c.attempts = [];
    }
  }
  // inject a failed agent — must be rejected
  detail.agents[0].status = "failed";
  assert.equal(normalizeTrack1CampaignDetail(detail), null);
});

test("REQ-T1-DEMO-010 rejects collecting campaign with running agents", () => {
  // collecting campaign requires all agents completed, not running
  const detail = makeValidCampaignDetail();
  detail.status = "collecting";
  detail.agents[0].status = "running";
  assert.equal(normalizeTrack1CampaignDetail(detail), null);
});

test("REQ-T1-DEMO-010 accepts collecting campaign with all agents completed", () => {
  const detail = makeValidCampaignDetail();
  detail.status = "collecting";
  // default fixture has all agents completed and all cases passed
  assert.ok(normalizeTrack1CampaignDetail(detail));
});

test("REQ-T1-DEMO-010 rejects created agent with non-pending cases in detail", () => {
  // created agent must have all cases pending
  const detail = makeValidCampaignDetail();
  detail.status = "created";
  detail.agents[0].status = "created";
  // agent 0 has a created status but its cases are passed (default fixture)
  assert.equal(normalizeTrack1CampaignDetail(detail), null);
});

test("REQ-T1-DEMO-010 rejects collecting agent with non-terminal cases", () => {
  const detail = makeValidCampaignDetail();
  detail.status = "collecting";
  detail.agents[0].status = "collecting";
  // agent 0 is collecting but cases are passed (terminal) — that's fine
  // but agent 1 is still completed with terminal cases — also fine
  // Let's make agent 0 collecting but with a running case
  detail.agents[0].cases[0].status = "running";
  detail.agents[0].cases[0].attempt_count = 1;
  detail.agents[0].cases[0].attempts = [{
    ...detail.agents[0].cases[0].attempts[0],
    status: "running",
    actual_action: null
  }];
  assert.equal(normalizeTrack1CampaignDetail(detail), null);
});

// -- Rework 6: completed requires 9 passed + time monotonicity -----------------

test("REQ-T1-DEMO-010 rejects completed summary with any failed cases", () => {
  // Design spec: completed requires every final attempt's derived action
  // equals the manifest oracle. A completed campaign with 8 passed + 1 failed
  // must be rejected.
  // Rework 7: sync updated_at to completed_at so the only failure reason is
  // the failed-case counter, not time ordering.
  assert.equal(
    normalizeTrack1CampaignSummary({
      ...VALID_SUMMARY,
      status: "completed",
      updated_at: "2026-06-30T00:10:00.000Z",
      completed_at: "2026-06-30T00:10:00.000Z",
      passed_case_count: 8,
      failed_case_count: 1
    }),
    null
  );
});

test("REQ-T1-DEMO-010 accepts completed summary with 9 passed and 0 failed", () => {
  assert.ok(
    normalizeTrack1CampaignSummary({
      ...VALID_SUMMARY,
      status: "completed",
      updated_at: "2026-06-30T00:10:00.000Z",
      completed_at: "2026-06-30T00:10:00.000Z",
      passed_case_count: 9,
      failed_case_count: 0
    })
  );
});

test("REQ-T1-DEMO-010 rejects completed detail with a failed case", () => {
  const detail = makeValidCampaignDetail();
  // Flip one case to failed — completed campaign must have all 9 passed
  detail.agents[0].cases[0].status = "failed";
  detail.agents[0].cases[0].attempts[0].status = "failed";
  assert.equal(normalizeTrack1CampaignDetail(detail), null);
});

test("REQ-T1-DEMO-010 rejects summary with updated_at before started_at", () => {
  assert.equal(
    normalizeTrack1CampaignSummary({
      ...VALID_SUMMARY,
      started_at: "2026-06-30T00:00:01.000Z",
      updated_at: "2026-06-30T00:00:00.000Z"
    }),
    null
  );
});

test("REQ-T1-DEMO-010 rejects completed summary with completed_at after updated_at", () => {
  assert.equal(
    normalizeTrack1CampaignSummary({
      ...VALID_SUMMARY,
      status: "completed",
      started_at: "2026-06-30T00:00:00.000Z",
      updated_at: "2026-06-30T00:00:01.000Z",
      completed_at: "2026-06-30T00:00:02.000Z",
      passed_case_count: 9,
      failed_case_count: 0
    }),
    null
  );
});

test("REQ-T1-DEMO-010 rejects attempt with updated_at before started_at", () => {
  const detail = makeValidCampaignDetail();
  detail.agents[0].cases[0].attempts[0].started_at = "2026-06-30T00:00:01.000Z";
  detail.agents[0].cases[0].attempts[0].updated_at = "2026-06-30T00:00:00.000Z";
  assert.equal(normalizeTrack1CampaignDetail(detail), null);
});

// -- Rework 7: campaign detail parent-level time monotonicity ------------------

test("REQ-T1-DEMO-010 rejects campaign detail with updated_at before started_at", () => {
  // Rework 7: detail normalizer only validated ISO-8601 format, not ordering.
  // Only parent-level times are flipped so the RED failure is attributable
  // solely to the missing started_at <= updated_at check, not to any child
  // constraint (attempt/case/agent times remain valid).
  const detail = makeValidCampaignDetail();
  detail.started_at = "2026-06-30T00:00:01.000Z";
  detail.updated_at = "2026-06-30T00:00:00.000Z";
  assert.equal(normalizeTrack1CampaignDetail(detail), null);
});
