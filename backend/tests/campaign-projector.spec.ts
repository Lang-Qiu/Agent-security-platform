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
    return decisions.every((d) => d.action === "ask");
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
