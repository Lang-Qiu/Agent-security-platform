import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import { makeStoredCampaignRecord } from "./fixtures/track1-campaign.fixture.ts";

const repositoryPath = resolve(
  import.meta.dirname,
  "../src/modules/supervision/repositories/in-memory-campaign.repository.ts"
);

type RepositoryConstructor = new () => {
  create(record: unknown): unknown;
  save(record: unknown): unknown;
  findById(campaignId: string): unknown;
  list(): unknown[];
};

async function loadRepository(): Promise<RepositoryConstructor> {
  if (!existsSync(repositoryPath)) {
    throw new Error(`Repository module not found at ${repositoryPath}`);
  }
  const module = await import(pathToFileURL(repositoryPath).href) as Record<string, unknown>;
  const InMemoryCampaignRepository = module.InMemoryCampaignRepository;
  if (typeof InMemoryCampaignRepository !== "function") {
    throw new Error("InMemoryCampaignRepository export not found");
  }
  return InMemoryCampaignRepository as RepositoryConstructor;
}

// -- Module existence ---------------------------------------------------------

test("REQ-T1-DEMO-010 campaign repository module exists", () => {
  assert.equal(existsSync(repositoryPath), true);
});

// -- Defensive copies --------------------------------------------------------

test("REQ-T1-DEMO-010 campaign repository returns defensive copies", async () => {
  const InMemoryCampaignRepository = await loadRepository();
  const repository = new InMemoryCampaignRepository();
  const source = makeStoredCampaignRecord();
  repository.save(source);

  const first = repository.findById(source.campaign.campaign_id) as {
    campaign: { status: string };
    attempts: unknown[];
  };
  assert.ok(first);
  first.attempts.length = 0;
  first.campaign.status = "failed";

  const second = repository.findById(source.campaign.campaign_id) as {
    campaign: { status: string };
    attempts: unknown[];
  };
  assert.ok(second);
  assert.equal(second.campaign.status, "created");
  assert.equal(second.attempts.length, source.attempts.length);
});

// -- Duplicate creation rejection --------------------------------------------

test("REQ-T1-DEMO-010 campaign repository rejects duplicate creation", async () => {
  const InMemoryCampaignRepository = await loadRepository();
  const repository = new InMemoryCampaignRepository();
  const source = makeStoredCampaignRecord();
  repository.create(source);
  assert.throws(
    () => repository.create(source),
    { code: "CAMPAIGN_ALREADY_EXISTS" }
  );
});

// -- List ordering ------------------------------------------------------------

test("REQ-T1-DEMO-010 campaign repository lists newest update first", async () => {
  const InMemoryCampaignRepository = await loadRepository();
  const repository = new InMemoryCampaignRepository();
  const older = makeStoredCampaignRecord({
    campaignId: "campaign:t1:00000000000000000000000000000001",
    updatedAt: "2026-06-30T00:00:01.000Z"
  });
  const newer = makeStoredCampaignRecord({
    campaignId: "campaign:t1:00000000000000000000000000000002",
    updatedAt: "2026-06-30T00:00:02.000Z"
  });
  repository.create(newer);
  repository.create(older);
  const list = repository.list() as Array<{ campaign: { campaign_id: string; updated_at: string } }>;
  assert.deepEqual(
    list.map((record) => record.campaign.campaign_id),
    [newer.campaign.campaign_id, older.campaign.campaign_id]
  );
});

// -- Save does not mutate caller input ---------------------------------------

test("REQ-T1-DEMO-010 campaign repository save does not freeze or mutate caller input", async () => {
  const InMemoryCampaignRepository = await loadRepository();
  const repository = new InMemoryCampaignRepository();
  const source = makeStoredCampaignRecord();
  repository.save(source);
  // Caller should still be able to mutate their own object after save.
  source.campaign.status = "failed";
  assert.equal(source.campaign.status, "failed");
});

// -- findById returns null for unknown campaign -------------------------------

test("REQ-T1-DEMO-010 campaign repository findById returns null for unknown id", async () => {
  const InMemoryCampaignRepository = await loadRepository();
  const repository = new InMemoryCampaignRepository();
  assert.equal(repository.findById("campaign:t1:unknown000000000000000000000000"), null);
});
