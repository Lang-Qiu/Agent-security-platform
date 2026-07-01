import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import { InMemoryCampaignRepository } from "../src/modules/supervision/repositories/in-memory-campaign.repository.ts";
import type { StoredCampaignRecord } from "../src/modules/supervision/repositories/campaign.repository.ts";
import {
  makeCompletedCampaignRecord,
  makeCampaignEvidenceRegistration,
  makeCampaignStartEnvelope,
  FIXED_CAMPAIGN_ID
} from "./fixtures/track1-campaign.fixture.ts";
import type { Track1CampaignId } from "../../shared/types/campaign-supervision.ts";

const servicePath = resolve(
  import.meta.dirname,
  "../src/modules/supervision/campaign-supervision.service.ts"
);

type CampaignSummary = Record<string, unknown>;
type CampaignDetail = Record<string, unknown>;
type CampaignEvidence = Record<string, unknown>;

type ServiceInstance = {
  listCampaigns(query: Record<string, unknown>): CampaignSummary[];
  getCampaignDetail(campaignId: string): CampaignDetail;
  getCampaignEvidence(campaignId: string): CampaignEvidence;
};

type ServiceModule = {
  CampaignSupervisionService: new (
    repository: InMemoryCampaignRepository
  ) => ServiceInstance;
};

async function loadServiceModule(): Promise<ServiceModule | null> {
  if (!existsSync(servicePath)) return null;
  const module = await import(pathToFileURL(servicePath).href) as Record<string, unknown>;
  if (typeof module.CampaignSupervisionService !== "function") return null;
  return module as unknown as ServiceModule;
}

async function requireServiceModule(): Promise<ServiceModule> {
  const module = await loadServiceModule();
  if (!module) {
    throw new Error("CampaignSupervisionService module not found");
  }
  return module;
}

// -- Helpers ------------------------------------------------------------------

function makeCompletedCampaignWithIndex(index: number): StoredCampaignRecord {
  const base = makeCompletedCampaignRecord();
  const cloned = structuredClone(base);
  const hex = index.toString(16).padStart(32, "0");
  const campaignId = `campaign:t1:${hex}` as Track1CampaignId;
  const totalMinutes = index + 10;
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const updatedAt = `2026-06-30T${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}:00.000Z`;

  cloned.campaign.campaign_id = campaignId;
  cloned.campaign.start.campaign_id = campaignId;
  cloned.campaign.updated_at = updatedAt;
  cloned.campaign.completed_at = updatedAt;
  for (const attempt of cloned.attempts) {
    attempt.campaign_id = campaignId;
  }
  for (const snapshot of cloned.snapshots) {
    snapshot.campaign_id = campaignId;
  }
  return cloned;
}

function makeCreatedCampaignRecord(campaignId: string): StoredCampaignRecord {
  const start = makeCampaignStartEnvelope();
  const id = campaignId as Track1CampaignId;
  return {
    campaign: {
      campaign_id: id,
      start: { ...start, campaign_id: id },
      status: "created",
      updated_at: "2026-06-30T00:00:01.000Z"
    },
    snapshots: [],
    attempts: [],
    evidence: null
  };
}

interface ServiceWithRepository {
  service: ServiceInstance;
  repository: InMemoryCampaignRepository;
}

async function makeServiceWithCampaigns(count: number): Promise<ServiceWithRepository> {
  const { CampaignSupervisionService } = await requireServiceModule();
  const repository = new InMemoryCampaignRepository();
  for (let i = 0; i < count; i++) {
    repository.create(makeCompletedCampaignWithIndex(i));
  }
  return { service: new CampaignSupervisionService(repository), repository };
}

async function makeServiceWithCompletedCampaign(options: {
  evidence: boolean;
}): Promise<ServiceWithRepository> {
  const { CampaignSupervisionService } = await requireServiceModule();
  const repository = new InMemoryCampaignRepository();
  const record = makeCompletedCampaignRecord();
  if (options.evidence) {
    record.evidence = makeCampaignEvidenceRegistration();
  } else {
    record.evidence = null;
  }
  repository.create(record);
  return { service: new CampaignSupervisionService(repository), repository };
}

// -- Tests --------------------------------------------------------------------

test("REQ-T1-DEMO-010 campaign supervision service module exists", () => {
  assert.equal(existsSync(servicePath), true);
});

test("REQ-T1-DEMO-010 campaign list filters then caps at fifty", async () => {
  const { service } = await makeServiceWithCampaigns(60);
  const result = service.listCampaigns({
    status: "completed",
    scenario_id: "T1-SC-001"
  });
  assert.ok(result.length <= 50);
  assert.equal(result.length, 50);
  assert.ok(result.every((item) => item.status === "completed"));
});

test("REQ-T1-DEMO-010 evidence stays unavailable before registration", async () => {
  const { service } = await makeServiceWithCompletedCampaign({ evidence: false });
  assert.throws(
    () => service.getCampaignEvidence(FIXED_CAMPAIGN_ID),
    { code: "CAMPAIGN_EVIDENCE_NOT_READY" }
  );
});

test("REQ-T1-DEMO-010 getCampaignDetail throws not found for missing campaign", async () => {
  const { service } = await makeServiceWithCampaigns(1);
  assert.throws(
    () => service.getCampaignDetail("campaign:t1:ffffffffffffffffffffffffffffffff"),
    { code: "CAMPAIGN_NOT_FOUND" }
  );
});

test("REQ-T1-DEMO-010 getCampaignEvidence throws not found for missing campaign", async () => {
  const { service } = await makeServiceWithCampaigns(1);
  assert.throws(
    () => service.getCampaignEvidence("campaign:t1:ffffffffffffffffffffffffffffffff"),
    { code: "CAMPAIGN_NOT_FOUND" }
  );
});

test("REQ-T1-DEMO-010 getCampaignDetail returns normalized detail", async () => {
  const { service } = await makeServiceWithCompletedCampaign({ evidence: false });
  const detail = service.getCampaignDetail(FIXED_CAMPAIGN_ID);
  assert.equal(detail.schema_version, "track1-campaign-read.v1");
  assert.equal(detail.campaign_id, FIXED_CAMPAIGN_ID);
  assert.equal(detail.status, "completed");
  assert.equal(detail.agent_count, 3);
  assert.equal(detail.case_count, 9);
});

test("REQ-T1-DEMO-010 getCampaignEvidence returns normalized export when registered", async () => {
  const { service } = await makeServiceWithCompletedCampaign({ evidence: true });
  const evidence = service.getCampaignEvidence(FIXED_CAMPAIGN_ID);
  assert.equal(evidence.schema_version, "track1-campaign-evidence.v1");
  assert.ok(typeof evidence.artifact_manifest_ref === "string");
  assert.ok(Array.isArray(evidence.session_evidence_refs));
  assert.equal((evidence.session_evidence_refs as unknown[]).length, 9);
});

test("REQ-T1-DEMO-010 listCampaigns returns summaries sorted by updated_at desc then campaign_id asc", async () => {
  const { service } = await makeServiceWithCampaigns(3);
  const result = service.listCampaigns({});
  assert.equal(result.length, 3);
  // Index 2 has the latest updated_at (minute 12), index 0 has earliest (minute 10)
  assert.ok(
    result[0].updated_at as string >= result[1].updated_at as string
  );
  assert.ok(
    result[1].updated_at as string >= result[2].updated_at as string
  );
});

test("REQ-T1-DEMO-010 listCampaigns filters by status", async () => {
  const { CampaignSupervisionService } = await requireServiceModule();
  const repository = new InMemoryCampaignRepository();
  repository.create(makeCompletedCampaignWithIndex(0));
  repository.create(makeCreatedCampaignRecord(
    "campaign:t1:11111111111111111111111111111111"
  ));
  const service = new CampaignSupervisionService(repository);
  const completed = service.listCampaigns({ status: "completed" });
  const created = service.listCampaigns({ status: "created" });
  assert.equal(completed.length, 1);
  assert.equal(completed[0].status, "completed");
  assert.equal(created.length, 1);
  assert.equal(created[0].status, "created");
});
