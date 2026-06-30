import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeTrack1CampaignAgentSummary,
  normalizeTrack1CampaignCaseSummary,
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
