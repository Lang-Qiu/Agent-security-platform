import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import { InMemoryCampaignRepository } from "../src/modules/supervision/repositories/in-memory-campaign.repository.ts";
import {
  makeCampaignEvidenceRegistration,
  makeCampaignFinalizeEnvelope,
  makeCampaignSnapshot,
  makeCampaignSnapshotForCase,
  makeCampaignStartEnvelope,
  makeCompletedCampaignRecord,
  FIXED_CAMPAIGN_ID
} from "./fixtures/track1-campaign.fixture.ts";

const servicePath = resolve(
  import.meta.dirname,
  "../src/modules/supervision/campaign-ingest.service.ts"
);

type ServiceModule = {
  CampaignIngestService: new (repository: unknown) => {
    startCampaign(input: unknown): unknown;
    ingestSnapshot(input: unknown): unknown;
    finalizeCampaign(input: unknown): unknown;
    registerEvidence(input: unknown): unknown;
    getStoredCampaign(campaignId: string): unknown;
  };
};

async function loadServiceModule(): Promise<ServiceModule> {
  if (!existsSync(servicePath)) {
    throw new Error(`Service module not found at ${servicePath}`);
  }
  const module = await import(pathToFileURL(servicePath).href) as Record<string, unknown>;
  if (typeof module.CampaignIngestService !== "function") {
    throw new Error("CampaignIngestService export not found");
  }
  return module as unknown as ServiceModule;
}

function makeRepository(): InstanceType<typeof InMemoryCampaignRepository> {
  return new InMemoryCampaignRepository();
}

async function makeStartedService(): Promise<{
  service: ServiceModule["CampaignIngestService"]["prototype"];
  repository: InstanceType<typeof InMemoryCampaignRepository>;
}> {
  const repository = makeRepository();
  const { CampaignIngestService } = await loadServiceModule();
  const service = new CampaignIngestService(repository);
  service.startCampaign(makeCampaignStartEnvelope());
  return { service, repository };
}

async function ingestAllNineCases(
  service: ServiceModule["CampaignIngestService"]["prototype"]
): Promise<void> {
  for (let i = 0; i < 9; i++) {
    const snapshot = makeCampaignSnapshotForCase(i, 1, 1, null);
    service.ingestSnapshot(snapshot);
  }
}

// -- Module existence ---------------------------------------------------------

test("REQ-T1-DEMO-010 campaign ingest service module exists", () => {
  assert.equal(existsSync(servicePath), true);
});

// -- Start lifecycle ----------------------------------------------------------

test("REQ-T1-DEMO-010 starts only one fixed campaign", async () => {
  const { CampaignIngestService } = await loadServiceModule();
  const repository = makeRepository();
  const service = new CampaignIngestService(repository);
  const started = service.startCampaign(makeCampaignStartEnvelope()) as {
    status: string;
    campaign_id: string;
  };
  assert.equal(started.status, "created");
  assert.equal(started.campaign_id, FIXED_CAMPAIGN_ID);

  assert.throws(
    () => service.startCampaign(makeCampaignStartEnvelope()),
    { code: "CAMPAIGN_ALREADY_EXISTS" }
  );
});

// R2 (Phase 2 rework finding 5): the campaign manifest hash must be pinned
// to the canonical SHA-256 of samples/track1/openclaw/campaign.v1.json.
// Any other 64-hex string must be rejected at start time, not accepted and
// persisted as a campaign.
test("REQ-T1-DEMO-010 start rejects a non-pinned campaign manifest hash", async () => {
  const { CampaignIngestService } = await loadServiceModule();
  const repository = makeRepository();
  const service = new CampaignIngestService(repository);

  const malicious = {
    ...makeCampaignStartEnvelope(),
    campaign_manifest_sha256: "b".repeat(64)
  };
  assert.throws(
    () => service.startCampaign(malicious),
    { code: "CAMPAIGN_START_INVALID" }
  );
  assert.equal(repository.list().length, 0);
});

test("REQ-T1-DEMO-010 start rejects a non-pinned campaign manifest hash even with valid hex shape", async () => {
  const { CampaignIngestService } = await loadServiceModule();
  const repository = makeRepository();
  const service = new CampaignIngestService(repository);

  // Different 64-hex string that is NOT the canonical manifest hash.
  const malicious = {
    ...makeCampaignStartEnvelope(),
    campaign_manifest_sha256: "0".repeat(64)
  };
  assert.throws(
    () => service.startCampaign(malicious),
    { code: "CAMPAIGN_START_INVALID" }
  );
  assert.equal(repository.list().length, 0);
});

// -- Snapshot lifecycle -------------------------------------------------------

test("REQ-T1-DEMO-010 accepts byte-identical snapshot retry only", async () => {
  const { service } = await makeStartedService();
  const first = makeCampaignSnapshot(1, null);
  const accepted = service.ingestSnapshot(first) as Record<string, unknown>;
  const duplicate = service.ingestSnapshot(first) as Record<string, unknown>;
  assert.deepEqual(duplicate, accepted);

  // Same sequence with different content (recomputed hash) must conflict.
  const conflict = makeCampaignSnapshotForCase(0, 1, 1, null, {
    observed_at: "2026-06-30T00:09:00.000Z"
  });
  assert.throws(
    () => service.ingestSnapshot(conflict),
    { code: "CAMPAIGN_SNAPSHOT_CONFLICT" }
  );
});

test("REQ-T1-DEMO-010 rejects gap and broken hash chain atomically", async () => {
  const { service } = await makeStartedService();
  const first = makeCampaignSnapshot(1, null);
  service.ingestSnapshot(first);

  const before = service.getStoredCampaign(FIXED_CAMPAIGN_ID);

  // Sequence gap: 1 → 3 (skips 2).
  assert.throws(
    () => service.ingestSnapshot(makeCampaignSnapshot(3, first.snapshot_sha256)),
    { code: "CAMPAIGN_SEQUENCE_INVALID" }
  );

  // State must be unchanged after rejection.
  assert.deepEqual(service.getStoredCampaign(FIXED_CAMPAIGN_ID), before);
});

test("REQ-T1-DEMO-010 rejects broken hash chain atomically", async () => {
  const { service } = await makeStartedService();
  const first = makeCampaignSnapshot(1, null);
  service.ingestSnapshot(first);
  const before = service.getStoredCampaign(FIXED_CAMPAIGN_ID);

  // Correct sequence (2) but wrong previous_snapshot_sha256.
  const wrongHash = makeCampaignSnapshotForCase(0, 1, 2, "b".repeat(64));
  assert.throws(
    () => service.ingestSnapshot(wrongHash),
    { code: "CAMPAIGN_HASH_CHAIN_BROKEN" }
  );
  assert.deepEqual(service.getStoredCampaign(FIXED_CAMPAIGN_ID), before);
});

test("REQ-T1-DEMO-010 rejects snapshot for unknown campaign", async () => {
  const { CampaignIngestService } = await loadServiceModule();
  const repository = makeRepository();
  const service = new CampaignIngestService(repository);
  const snapshot = makeCampaignSnapshot(1, null);
  assert.throws(
    () => service.ingestSnapshot(snapshot),
    { code: "CAMPAIGN_NOT_FOUND" }
  );
});

test("REQ-T1-DEMO-010 rejects snapshot with mismatched manifest hash", async () => {
  const { service } = await makeStartedService();
  const snapshot = makeCampaignSnapshot(1, null);
  const tampered = {
    ...snapshot,
    campaign_manifest_sha256: "b".repeat(64),
    snapshot_sha256: undefined
  };
  // Recompute hash to pass normalizer — but manifest won't match start.
  // The normalizer will reject because manifest hash is just format-validated,
  // but the service must enforce manifest consistency with the start envelope.
  // We need a snapshot that normalizes OK but has a different manifest hash.
  // Since the normalizer only checks sha256 format, we can use a different valid hash.
  const { calculateTrack1SnapshotSha256 } = await import(
    pathToFileURL(resolve(import.meta.dirname, "../../shared/contracts/campaign-ingest.ts")).href
  );
  const withoutHash = { ...tampered };
  delete (withoutHash as Record<string, unknown>).snapshot_sha256;
  const reHash = calculateTrack1SnapshotSha256(withoutHash);
  tampered.snapshot_sha256 = reHash;

  assert.throws(
    () => service.ingestSnapshot(tampered),
    { code: "CAMPAIGN_MANIFEST_MISMATCH" }
  );
});

test("REQ-T1-DEMO-010 rejects snapshot to finalized campaign", async () => {
  const { CampaignIngestService } = await loadServiceModule();
  const repository = makeRepository();
  const completed = makeCompletedCampaignRecord();
  repository.create(completed);
  const service = new CampaignIngestService(repository);

  const snapshot = makeCampaignSnapshot(1, null);
  assert.throws(
    () => service.ingestSnapshot(snapshot),
    { code: "CAMPAIGN_ALREADY_FINALIZED" }
  );
});

// -- Cross-agent / attempt index validation -----------------------------------

test("REQ-T1-DEMO-010 rejects cross-agent case assignment", async () => {
  const { service } = await makeStartedService();
  // Case T1-SC-001-C001 belongs to agent:track1:prompt-injection (group 0).
  // Assign it to agent:track1:tool-hijack (group 1) — a cross-agent mismatch.
  const snapshot = makeCampaignSnapshot(1, null);
  const crossAgent = {
    ...snapshot,
    agent_id: "agent:track1:tool-hijack",
    scenario_id: "T1-SC-001",
    case_id: "T1-SC-001-C001",
    attempt_id: "attempt:t1-sc-001-c001:1"
  };
  // Recompute hash for the modified content.
  const { calculateTrack1SnapshotSha256 } = await import(
    pathToFileURL(resolve(import.meta.dirname, "../../shared/contracts/campaign-ingest.ts")).href
  );
  const withoutHash = { ...crossAgent };
  delete (withoutHash as Record<string, unknown>).snapshot_sha256;
  crossAgent.snapshot_sha256 = calculateTrack1SnapshotSha256(withoutHash);

  // This should be rejected because the normalizer validates agent/scenario/case.
  assert.throws(
    () => service.ingestSnapshot(crossAgent),
    { code: "CAMPAIGN_SNAPSHOT_INVALID" }
  );
});

test("REQ-T1-DEMO-010 rejects attempt index 3 through shared normalizer", async () => {
  const { service } = await makeStartedService();
  // Craft a raw object with attempt_index 3 — the normalizer must reject.
  const snapshot = {
    ...makeCampaignSnapshot(1, null),
    attempt_index: 3,
    attempt_id: "attempt:t1-sc-001-c001:3"
  };
  // Recompute hash for the modified content.
  const { calculateTrack1SnapshotSha256 } = await import(
    pathToFileURL(resolve(import.meta.dirname, "../../shared/contracts/campaign-ingest.ts")).href
  );
  const withoutHash = { ...snapshot };
  delete (withoutHash as Record<string, unknown>).snapshot_sha256;
  snapshot.snapshot_sha256 = calculateTrack1SnapshotSha256(withoutHash);

  assert.throws(
    () => service.ingestSnapshot(snapshot),
    { code: "CAMPAIGN_SNAPSHOT_INVALID" }
  );
});

// -- Terminal attempt mutation ------------------------------------------------

test("REQ-T1-DEMO-010 rejects terminal-attempt mutation", async () => {
  const { service } = await makeStartedService();
  // Ingest a terminal snapshot (finished result → passed attempt).
  const first = makeCampaignSnapshot(1, null);
  service.ingestSnapshot(first);

  // Try to add another snapshot to the same attempt.
  const second = makeCampaignSnapshot(2, first.snapshot_sha256);
  assert.throws(
    () => service.ingestSnapshot(second),
    { code: "CAMPAIGN_ATTEMPT_TERMINAL" }
  );
});

// -- Second attempt preservation ----------------------------------------------

test("REQ-T1-DEMO-010 preserves second attempt after failed first", async () => {
  const { service } = await makeStartedService();
  // Ingest first attempt with WRONG action → attempt is "failed".
  const failedSnapshot = makeCampaignSnapshotForCase(0, 1, 1, null, {
    action: "allow" // expected is "deny" for case 0
  });
  service.ingestSnapshot(failedSnapshot);

  // Ingest second attempt with CORRECT action → attempt is "passed".
  const passedSnapshot = makeCampaignSnapshotForCase(0, 2, 1, null);
  const result = service.ingestSnapshot(passedSnapshot) as {
    attempt_index: number;
    status: string;
  };
  assert.equal(result.attempt_index, 2);
  assert.equal(result.status, "passed");

  // Both attempts must be preserved.
  const stored = service.getStoredCampaign(FIXED_CAMPAIGN_ID) as {
    attempts: Array<{ attempt_index: number; status: string }>;
  };
  const caseAttempts = stored.attempts.filter((a) =>
    a.attempt_index === 1 || a.attempt_index === 2
  );
  assert.equal(caseAttempts.length, 2);
});

test("REQ-T1-DEMO-010 rejects second attempt without failed first", async () => {
  const { service } = await makeStartedService();
  // First attempt with correct action → "passed".
  const first = makeCampaignSnapshot(1, null);
  service.ingestSnapshot(first);

  // Second attempt should be rejected because first is "passed", not "failed".
  const second = makeCampaignSnapshotForCase(0, 2, 1, null);
  assert.throws(
    () => service.ingestSnapshot(second),
    { code: "CAMPAIGN_SECOND_ATTEMPT_NOT_ALLOWED" }
  );
});

// -- Finalize lifecycle -------------------------------------------------------

test("REQ-T1-DEMO-010 does not finalize fewer than nine cases", async () => {
  const { service } = await makeStartedService();
  // Ingest only one terminal case.
  service.ingestSnapshot(makeCampaignSnapshot(1, null));

  assert.throws(
    () => service.finalizeCampaign(makeCampaignFinalizeEnvelope()),
    { code: "CAMPAIGN_INCOMPLETE" }
  );
});

test("REQ-T1-DEMO-010 rejects derived action mismatch at finalize", async () => {
  const { service } = await makeStartedService();
  // Ingest all 9 cases, but one with a wrong action.
  for (let i = 0; i < 9; i++) {
    const action = i === 0 ? "allow" : undefined; // case 0 expects "deny"
    const snapshot = makeCampaignSnapshotForCase(i, 1, 1, null, action ? { action } : undefined);
    service.ingestSnapshot(snapshot);
  }

  assert.throws(
    () => service.finalizeCampaign(makeCampaignFinalizeEnvelope()),
    { code: "CAMPAIGN_DERIVED_ACTION_MISMATCH" }
  );
});

test("REQ-T1-DEMO-010 finalizes a complete campaign with all passed cases", async () => {
  const { service } = await makeStartedService();
  await ingestAllNineCases(service);

  const summary = service.finalizeCampaign(makeCampaignFinalizeEnvelope()) as {
    status: string;
    completed_at: string;
  };
  assert.equal(summary.status, "completed");
  assert.ok(summary.completed_at);
});

// -- Evidence lifecycle -------------------------------------------------------

test("REQ-T1-DEMO-010 registers evidence only after completion", async () => {
  const { service } = await makeStartedService();
  assert.throws(
    () => service.registerEvidence(makeCampaignEvidenceRegistration()),
    { code: "CAMPAIGN_NOT_COMPLETED" }
  );
});

test("REQ-T1-DEMO-010 rejects evidence re-registration conflict", async () => {
  const { CampaignIngestService } = await loadServiceModule();
  const repository = makeRepository();
  const completed = makeCompletedCampaignRecord();
  repository.create(completed);
  const service = new CampaignIngestService(repository);

  service.registerEvidence(makeCampaignEvidenceRegistration());
  assert.throws(
    () => service.registerEvidence(makeCampaignEvidenceRegistration()),
    { code: "CAMPAIGN_EVIDENCE_ALREADY_REGISTERED" }
  );
});

// -- Raw content sentinel absence ---------------------------------------------

test("REQ-T1-DEMO-010 stored records contain no raw content sentinels", async () => {
  const { service } = await makeStartedService();
  service.ingestSnapshot(makeCampaignSnapshot(1, null));

  const stored = service.getStoredCampaign(FIXED_CAMPAIGN_ID) as Record<string, unknown>;
  const json = JSON.stringify(stored);

  // The stored record must not contain raw prompt/content sentinels.
  // Only structured references (evidence_refs, content_ref) are allowed.
  assert.ok(!json.includes("raw_prompt"));
  assert.ok(!json.includes("raw_content"));
  assert.ok(!json.includes("prompt_text"));
  assert.ok(!json.includes("user_message"));
  assert.ok(!json.includes("system_prompt"));
});
