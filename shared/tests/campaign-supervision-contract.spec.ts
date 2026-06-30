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
        actual_action: "allow",
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
    completed_at: "2026-06-30T00:10:00.000Z"
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
