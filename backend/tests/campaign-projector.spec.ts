import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import {
  makeCompletedCampaignRecord,
  makeCampaignEvidenceRegistration
} from "./fixtures/track1-campaign.fixture.ts";
import {
  normalizeTrack1CampaignSummary,
  normalizeTrack1CampaignDetail,
  normalizeTrack1CampaignEvidenceExport
} from "../../shared/contracts/campaign-supervision.ts";
import { satisfiesSandboxSupervisionContract } from "../../shared/contracts/sandbox.ts";
import {
  TRACK1_CAMPAIGN_AGENT_IDS,
  TRACK1_CASE_IDS
} from "../../shared/types/campaign-supervision.ts";
import type { StoredCampaignRecord } from "../src/modules/supervision/repositories/campaign.repository.ts";

const projectorPath = resolve(
  import.meta.dirname,
  "../src/modules/supervision/campaign-projector.ts"
);

type ProjectedCampaign = {
  summary: Record<string, unknown>;
  detail: Record<string, unknown> & {
    agents: Array<Record<string, unknown> & {
      cases: Array<Record<string, unknown> & {
        attempts: Array<Record<string, unknown>>;
      }>;
    }>;
  };
  evidence: Record<string, unknown> | null;
};

type ProjectorModule = {
  projectTrack1Campaign: (stored: StoredCampaignRecord) => ProjectedCampaign;
};

async function loadProjector(): Promise<ProjectorModule | null> {
  if (!existsSync(projectorPath)) return null;
  const module = await import(pathToFileURL(projectorPath).href) as Record<string, unknown>;
  if (typeof module.projectTrack1Campaign !== "function") return null;
  return module as unknown as ProjectorModule;
}

async function requireProjector(): Promise<ProjectorModule> {
  const module = await loadProjector();
  if (!module) {
    throw new Error("Campaign projector module not found");
  }
  return module;
}

test("REQ-T1-DEMO-010 projector module exists", () => {
  assert.equal(existsSync(projectorPath), true);
});

test("REQ-T1-DEMO-010 projector recomputes campaign counters", async () => {
  const { projectTrack1Campaign } = await requireProjector();
  const stored = makeCompletedCampaignRecord();
  const projected = projectTrack1Campaign(stored);

  assert.equal(projected.summary.passed_case_count, 9);
  assert.equal(projected.summary.failed_case_count, 0);
  assert.equal(projected.summary.retry_count, 0);

  const expectedBlocked = stored.attempts.filter(
    (a) => (a.result.details.blocked_records ?? []).length > 0
  ).length;
  assert.equal(projected.summary.blocked_count, expectedBlocked);

  const expectedAlerts = stored.attempts.reduce(
    (total, a) => total + (a.result.details.alerts ?? []).length,
    0
  );
  assert.equal(projected.summary.alert_count, expectedAlerts);

  const expectedAsk = stored.attempts.filter((a) => {
    const decisions = a.result.details.policy_decisions ?? [];
    if (decisions.length === 0) return false;
    // R4: use highest-action reduction (matches ingest service + projector).
    let highest: import("../../shared/types/sandbox.ts").SandboxPolicyAction = "allow";
    for (const d of decisions) {
      const prec = { allow: 0, alert: 1, ask: 2, deny: 3 } as const;
      if (prec[d.action] > prec[highest]) highest = d.action;
    }
    return highest === "ask";
  }).length;
  assert.equal(projected.summary.ask_count, expectedAsk);

  assert.equal(projected.summary.evidence_available, false);
});

test("REQ-T1-DEMO-010 projector rejects a cross-agent case", async () => {
  const { projectTrack1Campaign } = await requireProjector();
  const stored = makeCompletedCampaignRecord();
  stored.attempts[0].agent_id = "agent:track1:memory-poison";
  assert.throws(
    () => projectTrack1Campaign(stored),
    { code: "CAMPAIGN_PROJECTION_INVALID" }
  );
});

test("REQ-T1-DEMO-010 projector produces exactly three ordered agents and nine ordered cases", async () => {
  const { projectTrack1Campaign } = await requireProjector();
  const stored = makeCompletedCampaignRecord();
  const projected = projectTrack1Campaign(stored);

  assert.equal(projected.detail.agents.length, 3);

  for (let i = 0; i < projected.detail.agents.length; i++) {
    const agent = projected.detail.agents[i];
    assert.equal(agent.agent_id, TRACK1_CAMPAIGN_AGENT_IDS[i]);
    assert.equal(agent.cases.length, 3);
  }

  const allCaseIds = projected.detail.agents.flatMap(
    (a) => a.cases.map((c) => c.case_id as string)
  );
  assert.deepEqual(allCaseIds, [...TRACK1_CASE_IDS]);
});

test("REQ-T1-DEMO-010 projector detail reuses stored session IDs without copying raw content", async () => {
  const { projectTrack1Campaign } = await requireProjector();
  const stored = makeCompletedCampaignRecord();
  const projected = projectTrack1Campaign(stored);

  const storedSessionIds = stored.attempts.map(
    (a) => a.result.details.session_id
  );
  const projectedSessionIds: string[] = [];
  for (const agent of projected.detail.agents) {
    for (const c of agent.cases) {
      for (const at of c.attempts) {
        projectedSessionIds.push(at.session_id as string);
      }
    }
  }
  assert.deepEqual(projectedSessionIds, storedSessionIds);

  const attempt = projected.detail.agents[0].cases[0].attempts[0];
  assert.equal("events" in attempt, false);
  assert.equal("policy_decisions" in attempt, false);
  assert.equal("alerts" in attempt, false);
  assert.equal("blocked_records" in attempt, false);
  assert.equal("result" in attempt, false);
});

test("REQ-T1-DEMO-010 projector evidence is null before registration", async () => {
  const { projectTrack1Campaign } = await requireProjector();
  const stored = makeCompletedCampaignRecord();
  stored.evidence = null;
  const projected = projectTrack1Campaign(stored);
  assert.equal(projected.evidence, null);
});

test("REQ-T1-DEMO-010 projector evidence is available after registration", async () => {
  const { projectTrack1Campaign } = await requireProjector();
  const stored = makeCompletedCampaignRecord();
  stored.evidence = makeCampaignEvidenceRegistration();
  const projected = projectTrack1Campaign(stored);
  assert.notEqual(projected.evidence, null);
  assert.notEqual(
    normalizeTrack1CampaignEvidenceExport(projected.evidence),
    null
  );
});

test("REQ-T1-DEMO-010 projector summary normalizes through campaign summary normalizer", async () => {
  const { projectTrack1Campaign } = await requireProjector();
  const stored = makeCompletedCampaignRecord();
  const projected = projectTrack1Campaign(stored);
  assert.notEqual(
    normalizeTrack1CampaignSummary(projected.summary),
    null
  );
});

test("REQ-T1-DEMO-010 projector detail normalizes through campaign detail normalizer", async () => {
  const { projectTrack1Campaign } = await requireProjector();
  const stored = makeCompletedCampaignRecord();
  const projected = projectTrack1Campaign(stored);
  assert.notEqual(
    normalizeTrack1CampaignDetail(projected.detail),
    null
  );
});

// R4 (Phase 2 rework finding 7): ask_count must be consistent between the
// ingest service's finalize response and the public read projector. Both
// must use the same reduction: an attempt counts toward ask_count when its
// HIGHEST policy action is "ask" (not when EVERY decision is "ask"). An
// attempt with mixed decisions [allow, ask] has highest action "ask" and
// must be counted.
//
// The completed record has 2 cases with expected_action "ask" (case index 4
// and 6), each with a single "ask" decision. Baseline ask_count = 2. We
// prepend an "allow" decision to case 4's existing "ask" decision, producing
// [allow, ask]. Highest action is still "ask" (precedence 2 > 0), so the
// correct ask_count remains 2. The previous buggy projector logic used
// decisions.every(d => d.action === "ask"), which would return false for
// [allow, ask] and drop case 4 from the count, yielding 1.
test("REQ-T1-DEMO-010 projector ask_count counts attempts whose highest action is ask (not every decision)", async () => {
  const { projectTrack1Campaign } = await requireProjector();
  const stored = makeCompletedCampaignRecord();

  // Case 4 (index 4) has expected_action "ask" and a single "ask" decision.
  // Prepend an "allow" decision so decisions = [allow, ask]. Highest action
  // is "ask" (precedence 2 > 0). actual_action stays "ask" === expected_action.
  const targetAttempt = stored.attempts[4];
  const originalAsk = targetAttempt.result.details.policy_decisions![0];
  const allowDecision = {
    decision_id: "decision_allow_mixed_4",
    subject_event_id: originalAsk.subject_event_id,
    policy_id: "policy_allow_mixed_4",
    action: "allow" as const,
    reason_code: "allow_mixed",
    reason: "Allow decision prepended to a mixed ask attempt",
    evidence_refs: ["evidence://mixed/allow"],
    decided_at: originalAsk.decided_at
  };
  targetAttempt.result.details.policy_decisions = [allowDecision, originalAsk];

  // R16 (Phase 2 rework review P2 #7): adding a policy_decision requires a
  // matching policy_decision event in the events array. The supervision
  // contract enforces a 1:1 relationship between policy_decisions entries
  // and events with event_type="policy_decision". Without the matching
  // event, the fixture violates the contract and could not have been
  // produced by a real ingestion.
  const details = targetAttempt.result.details;
  const existingEvents = details.events!;
  const sessionId = existingEvents[0].session_id;
  const maxSequence = Math.max(...existingEvents.map((e) => e.sequence));
  existingEvents.push({
    event_id: "event_policy_decision_allow_mixed_4",
    session_id: sessionId,
    sequence: maxSequence + 1,
    event_type: "policy_decision",
    occurred_at: originalAsk.decided_at,
    source: "policy",
    evidence_refs: allowDecision.evidence_refs,
    payload: allowDecision
  });
  details.event_count = existingEvents.length;

  // R16: verify the modified fixture satisfies the supervision contract.
  assert.equal(
    satisfiesSandboxSupervisionContract(targetAttempt.result.details),
    true,
    "fixture must satisfy the supervision contract after adding a policy_decision"
  );

  const projected = projectTrack1Campaign(stored);
  assert.equal(
    projected.summary.ask_count,
    2,
    "ask_count must be 2: case 4 (mixed [allow, ask], highest=ask) + case 6 (single ask). The buggy every() logic would return 1."
  );
});
