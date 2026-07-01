import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import { InMemoryCampaignRepository } from "../src/modules/supervision/repositories/in-memory-campaign.repository.ts";
import { InMemoryTaskRepository } from "../src/modules/task-center/repositories/in-memory-task.repository.ts";
import {
  makeCampaignEvidenceRegistration,
  makeCampaignFinalizeEnvelope,
  makeCampaignSnapshot,
  makeCampaignSnapshotForCase,
  makeCampaignStartEnvelope,
  makeCompletedCampaignRecord,
  FIXED_CAMPAIGN_ID
} from "./fixtures/track1-campaign.fixture.ts";
import type { Track1CampaignSnapshotEnvelope, Track1CampaignSnapshotWithoutHash } from "../../shared/types/campaign-ingest.ts";
import type { BaseResult, SandboxRunResultDetails } from "../../shared/types/result.ts";

const servicePath = resolve(
  import.meta.dirname,
  "../src/modules/supervision/campaign-ingest.service.ts"
);

type ServiceModule = {
  CampaignIngestService: new (
    repository: unknown,
    taskRepository?: unknown
  ) => {
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

// R1 (Phase 2 rework finding 4): a sandbox result with status="failed" is a
// legitimate terminal state produced by the sandbox monitor. The ingest
// service must treat it as terminal so the attempt becomes "failed" (or
// "passed" when expected_action matches), not "running". Without this fix
// failed attempts could never enter the retry flow or be finalized.
test("REQ-T1-DEMO-010 treats sandbox result status=failed as terminal", async () => {
  const { service } = await makeStartedService();
  // Build a snapshot whose result has status="failed" AND a non-matching
  // action ("allow" while case 0 expects "deny") so the attempt becomes
  // "failed" rather than "passed".
  const baseSnapshot = makeCampaignSnapshotForCase(0, 1, 1, null, {
    action: "allow"
  });
  const failedResult = {
    ...baseSnapshot.result,
    status: "failed" as const,
    summary: "Sandbox failed terminally"
  };
  // Recompute snapshot hash because result changed.
  const { calculateTrack1SnapshotSha256 } = await import(
    "../../shared/contracts/campaign-ingest.ts"
  );
  const withoutHash = { ...baseSnapshot, result: failedResult };
  delete (withoutHash as { snapshot_sha256?: string }).snapshot_sha256;
  const snapshot = {
    ...withoutHash,
    snapshot_sha256: calculateTrack1SnapshotSha256(withoutHash)
  };

  const ack = service.ingestSnapshot(snapshot) as { status: string };
  assert.equal(ack.status, "failed");
});

test("REQ-T1-DEMO-010 treats sandbox result status=partial_success as terminal", async () => {
  const { service } = await makeStartedService();
  const baseSnapshot = makeCampaignSnapshotForCase(0, 1, 1, null);
  const partialResult = {
    ...baseSnapshot.result,
    status: "partial_success" as const,
    summary: "Sandbox partial success terminal state"
  };
  const { calculateTrack1SnapshotSha256 } = await import(
    "../../shared/contracts/campaign-ingest.ts"
  );
  const withoutHash = { ...baseSnapshot, result: partialResult };
  delete (withoutHash as { snapshot_sha256?: string }).snapshot_sha256;
  const snapshot = {
    ...withoutHash,
    snapshot_sha256: calculateTrack1SnapshotSha256(withoutHash)
  };

  const ack = service.ingestSnapshot(snapshot) as { status: string };
  // R10: partial_success is terminal but represents a provider/execution
  // failure, so it must always produce "failed" regardless of action match.
  assert.equal(ack.status, "failed",
    "status=partial_success must always produce a failed attempt");
});

// R10 (Phase 2 rework review P1 #1): a sandbox result with status="failed"
// or status="partial_success" represents a provider/execution failure.
// Such a result must NEVER be classified as "passed", even when the
// observed action matches the expected action. Action comparison is only
// meaningful for successful terminal statuses (finished/blocked). The
// previous logic allowed a failed provider to fake a "passed" attempt,
// skipping retry and forging campaign success.

test("REQ-T1-DEMO-010 failed result with matching action stays failed", async () => {
  const { service } = await makeStartedService();
  // Case 0 expects "deny"; keep the default "deny" action so action matches.
  const baseSnapshot = makeCampaignSnapshotForCase(0, 1, 1, null);
  const failedResult = {
    ...baseSnapshot.result,
    status: "failed" as const,
    summary: "Provider crashed after emitting the expected deny decision"
  };
  const { calculateTrack1SnapshotSha256 } = await import(
    "../../shared/contracts/campaign-ingest.ts"
  );
  const withoutHash = { ...baseSnapshot, result: failedResult };
  delete (withoutHash as { snapshot_sha256?: string }).snapshot_sha256;
  const snapshot = {
    ...withoutHash,
    snapshot_sha256: calculateTrack1SnapshotSha256(withoutHash)
  };

  const ack = service.ingestSnapshot(snapshot) as { status: string };
  assert.equal(ack.status, "failed",
    "status=failed must always produce a failed attempt even when action matches expected");
});

test("REQ-T1-DEMO-010 partial_success result with matching action stays failed", async () => {
  const { service } = await makeStartedService();
  // Case 0 expects "deny"; keep the default "deny" action so action matches.
  const baseSnapshot = makeCampaignSnapshotForCase(0, 1, 1, null);
  const partialResult = {
    ...baseSnapshot.result,
    status: "partial_success" as const,
    summary: "Partial success: provider emitted deny but execution did not finish cleanly"
  };
  const { calculateTrack1SnapshotSha256 } = await import(
    "../../shared/contracts/campaign-ingest.ts"
  );
  const withoutHash = { ...baseSnapshot, result: partialResult };
  delete (withoutHash as { snapshot_sha256?: string }).snapshot_sha256;
  const snapshot = {
    ...withoutHash,
    snapshot_sha256: calculateTrack1SnapshotSha256(withoutHash)
  };

  const ack = service.ingestSnapshot(snapshot) as { status: string };
  assert.equal(ack.status, "failed",
    "status=partial_success must always produce a failed attempt even when action matches expected");
});

// R3 (Phase 2 rework finding 2): close the snapshot content boundary.
// The ingest service must (a) validate canonical task_id and session_id
// formats, (b) validate time ordering, and (c) strip or reject content
// fields (summary, metadata, target) that are not needed for campaign
// projection. Without this, arbitrary content like
// metadata.raw_prompt="SECRET_SENTINEL" or task_id="not-a-canonical-task-id"
// would be persisted.

test("REQ-T1-DEMO-010 rejects snapshot with non-canonical task_id", async () => {
  const { service } = await makeStartedService();
  const baseSnapshot = makeCampaignSnapshotForCase(0, 1, 1, null);
  const badResult = {
    ...baseSnapshot.result,
    task_id: "not-a-canonical-task-id"
  };
  const { calculateTrack1SnapshotSha256 } = await import(
    "../../shared/contracts/campaign-ingest.ts"
  );
  const withoutHash = { ...baseSnapshot, result: badResult };
  delete (withoutHash as { snapshot_sha256?: string }).snapshot_sha256;
  const snapshot = {
    ...withoutHash,
    snapshot_sha256: calculateTrack1SnapshotSha256(withoutHash)
  };

  assert.throws(
    () => service.ingestSnapshot(snapshot),
    { code: "CAMPAIGN_SNAPSHOT_INVALID" }
  );
});

test("REQ-T1-DEMO-010 rejects snapshot with non-canonical session_id", async () => {
  const { service } = await makeStartedService();
  const baseSnapshot = makeCampaignSnapshotForCase(0, 1, 1, null);
  // Replace session_id everywhere it appears (details + events) so the
  // sandbox supervision contract passes, then verify the ingest service
  // rejects the non-canonical session_id format.
  const badSessionId = "not-a-canonical-session-id";
  const originalDetails = baseSnapshot.result.details as {
    events?: Array<{ session_id: string }>;
  };
  const badEvents = (originalDetails.events ?? []).map((e) => ({
    ...e,
    session_id: badSessionId
  }));
  const badDetails = {
    ...baseSnapshot.result.details,
    session_id: badSessionId,
    events: badEvents
  };
  const badResult = { ...baseSnapshot.result, details: badDetails };
  const { calculateTrack1SnapshotSha256 } = await import(
    "../../shared/contracts/campaign-ingest.ts"
  );
  const withoutHash = { ...baseSnapshot, result: badResult };
  delete (withoutHash as { snapshot_sha256?: string }).snapshot_sha256;
  const snapshot = {
    ...withoutHash,
    snapshot_sha256: calculateTrack1SnapshotSha256(withoutHash)
  };

  assert.throws(
    () => service.ingestSnapshot(snapshot),
    { code: "CAMPAIGN_SNAPSHOT_INVALID" }
  );
});

test("REQ-T1-DEMO-010 rejects snapshot with created_at > updated_at", async () => {
  const { service } = await makeStartedService();
  const baseSnapshot = makeCampaignSnapshotForCase(0, 1, 1, null);
  const badResult = {
    ...baseSnapshot.result,
    created_at: "2026-06-30T00:10:00.000Z",
    updated_at: "2026-06-30T00:01:00.000Z"
  };
  const { calculateTrack1SnapshotSha256 } = await import(
    "../../shared/contracts/campaign-ingest.ts"
  );
  const withoutHash = { ...baseSnapshot, result: badResult };
  delete (withoutHash as { snapshot_sha256?: string }).snapshot_sha256;
  const snapshot = {
    ...withoutHash,
    snapshot_sha256: calculateTrack1SnapshotSha256(withoutHash)
  };

  assert.throws(
    () => service.ingestSnapshot(snapshot),
    { code: "CAMPAIGN_SNAPSHOT_INVALID" }
  );
});

// R12 (Phase 2 rework review P1 #3): timestamps must be validated as strict
// ISO-8601 with real calendar dates, and monotonicity must be checked on
// the PARSED instants, not lexicographically. The previous check
// `created_at > updated_at` accepted arbitrary strings like "aaa"/"bbb"
// and would silently produce a passed attempt from malformed timestamps.
test("REQ-T1-DEMO-010 rejects snapshot with non-ISO-8601 created_at", async () => {
  const { service } = await makeStartedService();
  const baseSnapshot = makeCampaignSnapshotForCase(0, 1, 1, null);
  const badResult = {
    ...baseSnapshot.result,
    created_at: "aaa",
    updated_at: "bbb"
  };
  const { calculateTrack1SnapshotSha256 } = await import(
    "../../shared/contracts/campaign-ingest.ts"
  );
  const withoutHash = { ...baseSnapshot, result: badResult };
  delete (withoutHash as { snapshot_sha256?: string }).snapshot_sha256;
  const snapshot = {
    ...withoutHash,
    snapshot_sha256: calculateTrack1SnapshotSha256(withoutHash)
  };

  assert.throws(
    () => service.ingestSnapshot(snapshot),
    { code: "CAMPAIGN_SNAPSHOT_INVALID" }
  );
});

test("REQ-T1-DEMO-010 rejects snapshot with invalid calendar date in updated_at", async () => {
  const { service } = await makeStartedService();
  const baseSnapshot = makeCampaignSnapshotForCase(0, 1, 1, null);
  const badResult = {
    ...baseSnapshot.result,
    created_at: "2026-06-30T00:00:00.000Z",
    updated_at: "2026-13-45T00:00:00.000Z"
  };
  const { calculateTrack1SnapshotSha256 } = await import(
    "../../shared/contracts/campaign-ingest.ts"
  );
  const withoutHash = { ...baseSnapshot, result: badResult };
  delete (withoutHash as { snapshot_sha256?: string }).snapshot_sha256;
  const snapshot = {
    ...withoutHash,
    snapshot_sha256: calculateTrack1SnapshotSha256(withoutHash)
  };

  assert.throws(
    () => service.ingestSnapshot(snapshot),
    { code: "CAMPAIGN_SNAPSHOT_INVALID" }
  );
});

test("REQ-T1-DEMO-010 rejects snapshot where parsed instant created_at > updated_at despite lex order", async () => {
  const { service } = await makeStartedService();
  const baseSnapshot = makeCampaignSnapshotForCase(0, 1, 1, null);
  // Same UTC instant expressed with different timezone offsets. Lexically
  // "2026-06-30T00:05:00+00:00" < "2026-06-30T00:01:00+05:00" but the
  // parsed instants are 00:05Z and 2026-06-29T19:01Z, so created_at is
  // actually LATER than updated_at.
  const badResult = {
    ...baseSnapshot.result,
    created_at: "2026-06-30T00:05:00+00:00",
    updated_at: "2026-06-30T00:01:00+05:00"
  };
  const { calculateTrack1SnapshotSha256 } = await import(
    "../../shared/contracts/campaign-ingest.ts"
  );
  const withoutHash = { ...baseSnapshot, result: badResult };
  delete (withoutHash as { snapshot_sha256?: string }).snapshot_sha256;
  const snapshot = {
    ...withoutHash,
    snapshot_sha256: calculateTrack1SnapshotSha256(withoutHash)
  };

  assert.throws(
    () => service.ingestSnapshot(snapshot),
    { code: "CAMPAIGN_SNAPSHOT_INVALID" }
  );
});

test("REQ-T1-DEMO-010 strips metadata from stored snapshot result", async () => {
  const { service, repository } = await makeStartedService();
  const baseSnapshot = makeCampaignSnapshotForCase(0, 1, 1, null);
  const resultWithMetadata = {
    ...baseSnapshot.result,
    metadata: { raw_prompt: "SECRET_SENTINEL" }
  };
  const { calculateTrack1SnapshotSha256 } = await import(
    "../../shared/contracts/campaign-ingest.ts"
  );
  const withoutHash = { ...baseSnapshot, result: resultWithMetadata };
  delete (withoutHash as { snapshot_sha256?: string }).snapshot_sha256;
  const snapshot = {
    ...withoutHash,
    snapshot_sha256: calculateTrack1SnapshotSha256(withoutHash)
  };

  service.ingestSnapshot(snapshot);

  const stored = repository.findById(FIXED_CAMPAIGN_ID);
  assert.ok(stored);
  const attempt = stored!.attempts[0];
  assert.equal(
    (attempt.result as { metadata?: unknown }).metadata,
    undefined,
    "metadata must be stripped from the stored result"
  );
});

test("REQ-T1-DEMO-010 strips summary content from stored snapshot result", async () => {
  const { service, repository } = await makeStartedService();
  const baseSnapshot = makeCampaignSnapshotForCase(0, 1, 1, null);
  const resultWithSummary = {
    ...baseSnapshot.result,
    summary: "ARBITRARY_SECRET_CONTENT_IN_SUMMARY"
  };
  const { calculateTrack1SnapshotSha256 } = await import(
    "../../shared/contracts/campaign-ingest.ts"
  );
  const withoutHash = { ...baseSnapshot, result: resultWithSummary };
  delete (withoutHash as { snapshot_sha256?: string }).snapshot_sha256;
  const snapshot = {
    ...withoutHash,
    snapshot_sha256: calculateTrack1SnapshotSha256(withoutHash)
  };

  service.ingestSnapshot(snapshot);

  const stored = repository.findById(FIXED_CAMPAIGN_ID);
  assert.ok(stored);
  const attempt = stored!.attempts[0];
  assert.equal(
    (attempt.result as { summary: string }).summary,
    "",
    "summary must be empty in the stored result"
  );
  assert.equal(
    (attempt.result as { summary: string }).summary.includes("SECRET"),
    false,
    "summary must not contain arbitrary content"
  );
});

test("REQ-T1-DEMO-010 strips target from stored snapshot details", async () => {
  const { service, repository } = await makeStartedService();
  const baseSnapshot = makeCampaignSnapshotForCase(0, 1, 1, null);
  // Use a valid TaskTarget shape so normalizeTaskTarget accepts it and the
  // snapshot hash recomputation matches. The ingest service must then strip
  // target before storing.
  const detailsWithTarget = {
    ...baseSnapshot.result.details,
    target: {
      target_type: "url",
      target_value: "https://evil.example.com/exfil"
    }
  };
  const resultWithTarget = {
    ...baseSnapshot.result,
    details: detailsWithTarget
  };
  const { calculateTrack1SnapshotSha256 } = await import(
    "../../shared/contracts/campaign-ingest.ts"
  );
  const withoutHash = { ...baseSnapshot, result: resultWithTarget };
  delete (withoutHash as { snapshot_sha256?: string }).snapshot_sha256;
  const snapshot = {
    ...withoutHash,
    snapshot_sha256: calculateTrack1SnapshotSha256(withoutHash)
  };

  service.ingestSnapshot(snapshot);

  const stored = repository.findById(FIXED_CAMPAIGN_ID);
  assert.ok(stored);
  const attempt = stored!.attempts[0];
  assert.equal(
    (attempt.result.details as { target?: unknown }).target,
    undefined,
    "target must be stripped from the stored result details"
  );
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

// R11 (Phase 2 rework review P1 #2): the raw normalized snapshot must NOT
// be persisted verbatim in record.snapshots. The previous implementation
// appended the full normalized snapshot (including result.summary,
// result.metadata, and result.details.target) to record.snapshots, so
// injecting metadata.raw_prompt="SECRET_SENTINEL" or summary content
// would persist that content even though attempt.result was projected.
// The stored snapshot must be a closed receipt: structural IDs, hashes,
// and timestamps only — never the raw result content.
test("REQ-T1-DEMO-010 stored snapshot receipt contains no raw result content", async () => {
  const { service, repository } = await makeStartedService();
  const baseSnapshot = makeCampaignSnapshotForCase(0, 1, 1, null);
  const resultWithSecret = {
    ...baseSnapshot.result,
    summary: "ARBITRARY_SECRET_IN_SUMMARY",
    metadata: { raw_prompt: "SECRET_SENTINEL" }
  };
  const { calculateTrack1SnapshotSha256 } = await import(
    "../../shared/contracts/campaign-ingest.ts"
  );
  const withoutHash = { ...baseSnapshot, result: resultWithSecret };
  delete (withoutHash as { snapshot_sha256?: string }).snapshot_sha256;
  const snapshot = {
    ...withoutHash,
    snapshot_sha256: calculateTrack1SnapshotSha256(withoutHash)
  };

  service.ingestSnapshot(snapshot);

  const stored = repository.findById(FIXED_CAMPAIGN_ID);
  assert.ok(stored);
  assert.ok(stored!.snapshots.length > 0, "at least one snapshot receipt must be stored");
  const storedSnapshotJson = JSON.stringify(stored!.snapshots);
  assert.ok(
    !storedSnapshotJson.includes("SECRET_SENTINEL"),
    "stored snapshot receipt must not contain raw metadata content"
  );
  assert.ok(
    !storedSnapshotJson.includes("ARBITRARY_SECRET_IN_SUMMARY"),
    "stored snapshot receipt must not contain raw summary content"
  );
  // The receipt must not carry the full result object.
  const firstSnapshot = stored!.snapshots[0] as { result?: unknown };
  assert.equal(
    firstSnapshot.result,
    undefined,
    "stored snapshot receipt must not include the result object"
  );
});

// R7 (Phase 2 rework finding 3): campaign sessions must be written to the
// TaskRepository on ingest so the public session inspector can query them.
// Without this, ingest only writes to the CampaignRepository, and the
// session_id in campaign detail cannot be looked up via the existing
// supervision session API.

test("REQ-T1-DEMO-010 ingestSnapshot writes campaign session to TaskRepository", async () => {
  const { CampaignIngestService } = await loadServiceModule();
  const campaignRepository = makeRepository();
  const taskRepository = new InMemoryTaskRepository();
  const service = new CampaignIngestService(campaignRepository, taskRepository);
  service.startCampaign(makeCampaignStartEnvelope());

  const snapshot = makeCampaignSnapshotForCase(0, 1, 1, null);
  service.ingestSnapshot(snapshot);

  const tasks = taskRepository.list();
  assert.equal(tasks.length, 1, "TaskRepository must have exactly one record after ingest");

  const record = tasks[0];
  assert.equal(record.task.task_type, "sandbox_run");
  assert.equal(record.task.engine_type, "sandbox");
  assert.equal(record.task.task_id, snapshot.result.task_id);
  assert.equal(record.result.task_id, snapshot.result.task_id);
  assert.equal(record.result.details.session_id, snapshot.result.details.session_id);
  assert.equal(record.task.status, record.result.status);
});

// R13 (Phase 2 rework review P1 #4): Campaign ↔ TaskRepository mirror must
// stay fresh, enforce identity continuity, and be rollback-safe. The
// previous implementation only wrote the task on the FIRST snapshot of an
// attempt, leaving the session stale at "running" after a terminal update.
// It also saved the campaign BEFORE the task (so a task failure left a
// committed campaign), did not validate task_id/session_id stability within
// an attempt, and allowed duplicate task_ids across attempts (silently
// overwriting the earlier task in the TaskRepository).

// Helper: build a non-terminal (running) snapshot from a finished fixture
// snapshot, preserving task_id/session_id but stripping terminal arrays.
async function makeRunningSnapshot(
  baseSnap: Track1CampaignSnapshotEnvelope,
  sequence: number,
  previousHash: string | null,
  observedAt?: string
): Promise<Track1CampaignSnapshotEnvelope> {
  const { calculateTrack1SnapshotSha256 } = await import(
    "../../shared/contracts/campaign-ingest.ts"
  );
  const runningDetails: SandboxRunResultDetails = {
    session_id: baseSnap.result.details.session_id!
  };
  const runningResult: BaseResult<SandboxRunResultDetails> = {
    ...baseSnap.result,
    status: "running",
    details: runningDetails
  };
  const withoutHash: Track1CampaignSnapshotWithoutHash = {
    ...baseSnap,
    sequence,
    previous_snapshot_sha256: previousHash,
    observed_at: observedAt ?? baseSnap.observed_at,
    result: runningResult
  };
  delete (withoutHash as { snapshot_sha256?: string }).snapshot_sha256;
  return {
    ...withoutHash,
    snapshot_sha256: calculateTrack1SnapshotSha256(withoutHash)
  };
}

test("REQ-T1-DEMO-010 TaskRepository task record stays fresh after second snapshot for same attempt", async () => {
  const { CampaignIngestService } = await loadServiceModule();
  const campaignRepository = makeRepository();
  const taskRepository = new InMemoryTaskRepository();
  const service = new CampaignIngestService(campaignRepository, taskRepository);
  service.startCampaign(makeCampaignStartEnvelope());

  // Snapshot 1: non-terminal (running) result for case 0, attempt 1.
  const baseSnap1 = makeCampaignSnapshotForCase(0, 1, 1, null);
  const snap1 = await makeRunningSnapshot(baseSnap1, 1, null, "2026-06-30T00:01:00.000Z");
  service.ingestSnapshot(snap1);

  const taskAfter1 = taskRepository.findById(snap1.result.task_id);
  assert.equal(taskAfter1?.task.status, "running");

  // Snapshot 2: terminal (finished) result for same attempt.
  const snap2 = makeCampaignSnapshotForCase(0, 1, 2, snap1.snapshot_sha256);
  service.ingestSnapshot(snap2);

  // R13: task record must be updated to reflect the terminal status.
  const taskAfter2 = taskRepository.findById(snap2.result.task_id);
  assert.equal(
    taskAfter2?.task.status,
    "finished",
    "task record must be updated to reflect terminal status after second snapshot"
  );
});

test("REQ-T1-DEMO-010 rejects snapshot with drifted task_id for same attempt", async () => {
  const { CampaignIngestService } = await loadServiceModule();
  const { calculateTrack1SnapshotSha256 } = await import(
    "../../shared/contracts/campaign-ingest.ts"
  );
  const campaignRepository = makeRepository();
  const taskRepository = new InMemoryTaskRepository();
  const service = new CampaignIngestService(campaignRepository, taskRepository);
  service.startCampaign(makeCampaignStartEnvelope());

  const baseSnap1 = makeCampaignSnapshotForCase(0, 1, 1, null);
  const snap1 = await makeRunningSnapshot(baseSnap1, 1, null, "2026-06-30T00:01:00.000Z");
  service.ingestSnapshot(snap1);

  // Snapshot 2: same attempt, but a DIFFERENT canonical task_id.
  const driftedTaskId = "task:ffffffffffffffffffffffffffffffff";
  const driftedResult: BaseResult<SandboxRunResultDetails> = {
    ...baseSnap1.result,
    task_id: driftedTaskId
  };
  const withoutHash: Track1CampaignSnapshotWithoutHash = {
    ...baseSnap1,
    sequence: 2,
    previous_snapshot_sha256: snap1.snapshot_sha256,
    observed_at: "2026-06-30T00:02:00.000Z",
    result: driftedResult
  };
  delete (withoutHash as { snapshot_sha256?: string }).snapshot_sha256;
  const snap2: Track1CampaignSnapshotEnvelope = {
    ...withoutHash,
    snapshot_sha256: calculateTrack1SnapshotSha256(withoutHash)
  };

  assert.throws(
    () => service.ingestSnapshot(snap2),
    { code: "CAMPAIGN_SNAPSHOT_IDENTITY_DRIFT" }
  );
});

test("REQ-T1-DEMO-010 rejects snapshot with drifted session_id for same attempt", async () => {
  const { CampaignIngestService } = await loadServiceModule();
  const { calculateTrack1SnapshotSha256 } = await import(
    "../../shared/contracts/campaign-ingest.ts"
  );
  const campaignRepository = makeRepository();
  const taskRepository = new InMemoryTaskRepository();
  const service = new CampaignIngestService(campaignRepository, taskRepository);
  service.startCampaign(makeCampaignStartEnvelope());

  const baseSnap1 = makeCampaignSnapshotForCase(0, 1, 1, null);
  const snap1 = await makeRunningSnapshot(baseSnap1, 1, null, "2026-06-30T00:01:00.000Z");
  service.ingestSnapshot(snap1);

  // Snapshot 2: same attempt, but a DIFFERENT canonical session_id. Use a
  // running result (no events/policy_decisions arrays) so the normalizer's
  // sandbox supervision contract check (which requires every event's
  // session_id to match details.session_id) does not reject the snapshot
  // before the service-level identity drift check runs.
  const driftedSessionId = "session:ffffffffffffffffffffffffffffffff";
  const driftedDetails: SandboxRunResultDetails = {
    session_id: driftedSessionId
  };
  const driftedResult: BaseResult<SandboxRunResultDetails> = {
    ...baseSnap1.result,
    status: "running",
    details: driftedDetails
  };
  const withoutHash: Track1CampaignSnapshotWithoutHash = {
    ...baseSnap1,
    sequence: 2,
    previous_snapshot_sha256: snap1.snapshot_sha256,
    observed_at: "2026-06-30T00:02:00.000Z",
    result: driftedResult
  };
  delete (withoutHash as { snapshot_sha256?: string }).snapshot_sha256;
  const snap2: Track1CampaignSnapshotEnvelope = {
    ...withoutHash,
    snapshot_sha256: calculateTrack1SnapshotSha256(withoutHash)
  };

  assert.throws(
    () => service.ingestSnapshot(snap2),
    { code: "CAMPAIGN_SNAPSHOT_IDENTITY_DRIFT" }
  );
});

test("REQ-T1-DEMO-010 task save failure does not commit campaign", async () => {
  const { CampaignIngestService } = await loadServiceModule();
  const campaignRepository = makeRepository();
  const failingTaskRepository = {
    save(): never { throw new Error("task save boom"); },
    list(): unknown[] { return []; },
    findById(): null { return null; },
    delete(): boolean { return false; }
  };
  const service = new CampaignIngestService(campaignRepository, failingTaskRepository);
  service.startCampaign(makeCampaignStartEnvelope());

  const snapshot = makeCampaignSnapshotForCase(0, 1, 1, null);
  assert.throws(
    () => service.ingestSnapshot(snapshot),
    /task save boom/
  );

  // R13: campaign must NOT be modified when the task save fails.
  const stored = campaignRepository.findById(FIXED_CAMPAIGN_ID) as {
    snapshots: unknown[];
    attempts: unknown[];
  };
  assert.equal(stored.snapshots.length, 0, "campaign must not be committed when task save fails");
  assert.equal(stored.attempts.length, 0, "campaign must not have attempts when task save fails");
});

test("REQ-T1-DEMO-010 rejects new attempt with task_id already used by another attempt", async () => {
  const { CampaignIngestService } = await loadServiceModule();
  const { calculateTrack1SnapshotSha256 } = await import(
    "../../shared/contracts/campaign-ingest.ts"
  );
  const campaignRepository = makeRepository();
  const taskRepository = new InMemoryTaskRepository();
  const service = new CampaignIngestService(campaignRepository, taskRepository);
  service.startCampaign(makeCampaignStartEnvelope());

  // First attempt: case 0, attempt 1, wrong action → "failed".
  const failedSnapshot = makeCampaignSnapshotForCase(0, 1, 1, null, {
    action: "allow"
  });
  service.ingestSnapshot(failedSnapshot);

  const firstTaskId = failedSnapshot.result.task_id;

  // Second attempt: case 0, attempt 2, but manually overriding task_id to
  // duplicate the first attempt's task_id. The TaskRepository is keyed by
  // task_id, so this would silently overwrite the first attempt's task
  // record while the campaign retains both attempts.
  const secondSnapshot = makeCampaignSnapshotForCase(0, 2, 1, null);
  const duplicatedResult: BaseResult<SandboxRunResultDetails> = {
    ...secondSnapshot.result,
    task_id: firstTaskId
  };
  const withoutHash: Track1CampaignSnapshotWithoutHash = {
    ...secondSnapshot,
    result: duplicatedResult
  };
  delete (withoutHash as { snapshot_sha256?: string }).snapshot_sha256;
  const duplicateSnapshot: Track1CampaignSnapshotEnvelope = {
    ...withoutHash,
    snapshot_sha256: calculateTrack1SnapshotSha256(withoutHash)
  };

  assert.throws(
    () => service.ingestSnapshot(duplicateSnapshot),
    { code: "CAMPAIGN_TASK_ID_DUPLICATE" }
  );
});

// R19 (Phase 2 rework review 2 P1 #2): if campaignRepository.save fails
// AFTER the task has been saved, the task mirror must be rolled back
// (deleted) so there is no orphaned task record without a corresponding
// campaign attempt. The previous code only reversed the write order
// without handling the second failure direction.

test("REQ-T1-DEMO-010 campaign save failure rolls back task record", async () => {
  const { CampaignIngestService } = await loadServiceModule();
  const taskRepository = new InMemoryTaskRepository();

  // Create a campaign repository whose save() throws on the second call
  // (the first call is create() during startCampaign).
  const campaignRepository = makeRepository();
  const originalSave = campaignRepository.save.bind(campaignRepository);
  let saveCallCount = 0;
  campaignRepository.save = (record: unknown) => {
    saveCallCount++;
    if (saveCallCount >= 1) {
      throw new Error("campaign save boom");
    }
    return originalSave(record);
  };

  const service = new CampaignIngestService(campaignRepository, taskRepository);
  service.startCampaign(makeCampaignStartEnvelope());

  const snapshot = makeCampaignSnapshotForCase(0, 1, 1, null);
  assert.throws(
    () => service.ingestSnapshot(snapshot),
    /campaign save boom/
  );

  // R19: the task record must have been rolled back (deleted) because the
  // campaign save failed. Without rollback, the task would be orphaned.
  const taskId = snapshot.result.task_id;
  const taskRecord = taskRepository.findById(taskId);
  assert.equal(
    taskRecord,
    null,
    "task record must be rolled back when campaign save fails"
  );
});

test("REQ-T1-DEMO-010 task save failure does not leave campaign modified", async () => {
  // R19: verify the FIRST failure direction too — task save failure must
  // not commit the campaign. This is the existing R13 test, re-verified
  // here as part of the atomic contract.
  const { CampaignIngestService } = await loadServiceModule();
  const campaignRepository = makeRepository();
  const failingTaskRepository = {
    save(): never { throw new Error("task save boom"); },
    list(): unknown[] { return []; },
    findById(): null { return null; },
    delete(): boolean { return false; }
  };
  const service = new CampaignIngestService(campaignRepository, failingTaskRepository);
  service.startCampaign(makeCampaignStartEnvelope());

  const snapshot = makeCampaignSnapshotForCase(0, 1, 1, null);
  assert.throws(
    () => service.ingestSnapshot(snapshot),
    /task save boom/
  );

  const stored = campaignRepository.findById(FIXED_CAMPAIGN_ID) as {
    snapshots: unknown[];
    attempts: unknown[];
  };
  assert.equal(stored.snapshots.length, 0, "campaign must not be committed when task save fails");
  assert.equal(stored.attempts.length, 0, "campaign must not have attempts when task save fails");
});

// R20 (Phase 2 rework review 2 P1 #3): global task_id and session_id
// uniqueness. The previous conflict check only scanned the current
// campaign's attempts. A task_id already in the global TaskRepository
// (from another campaign) would be silently overwritten. A session_id
// reused across different attempts in the same campaign would cause
// the supervision session lookup to return SUPERVISION_SESSION_AMBIGUOUS.

test("REQ-T1-DEMO-010 rejects task_id already in global TaskRepository from another campaign", async () => {
  const { CampaignIngestService } = await loadServiceModule();
  const campaignRepository = makeRepository();
  const taskRepository = new InMemoryTaskRepository();

  // Pre-populate the TaskRepository with a task record that uses the same
  // task_id as the snapshot we are about to ingest. This simulates a task
  // left over from another campaign.
  const snapshot = makeCampaignSnapshotForCase(0, 1, 1, null);
  const conflictingTaskId = snapshot.result.task_id;
  taskRepository.save({
    task: {
      task_id: conflictingTaskId,
      task_type: "sandbox_run",
      engine_type: "sandbox",
      status: "finished",
      title: "Pre-existing task from another campaign",
      target: { target_type: "campaign_case", target_value: "T1-SC-999/C999" },
      created_at: "2026-06-30T00:00:00.000Z",
      updated_at: "2026-06-30T00:00:00.000Z"
    },
    result: snapshot.result,
    riskSummary: {
      task_id: conflictingTaskId,
      task_type: "sandbox_run",
      status: "finished",
      risk_level: "info",
      summary: "",
      total_findings: 0,
      info_count: 0,
      low_count: 0,
      medium_count: 0,
      high_count: 0,
      critical_count: 0,
      updated_at: "2026-06-30T00:00:00.000Z"
    }
  });

  const service = new CampaignIngestService(campaignRepository, taskRepository);
  service.startCampaign(makeCampaignStartEnvelope());

  assert.throws(
    () => service.ingestSnapshot(snapshot),
    { code: "CAMPAIGN_TASK_ID_GLOBAL_CONFLICT" }
  );

  // The pre-existing task record must NOT be overwritten.
  const existing = taskRepository.findById(conflictingTaskId);
  assert.ok(existing, "pre-existing task record must not be deleted");
  assert.equal(
    existing.task.title,
    "Pre-existing task from another campaign",
    "pre-existing task record must not be overwritten"
  );
});

test("REQ-T1-DEMO-010 rejects session_id reused by different attempt in same campaign", async () => {
  const { CampaignIngestService } = await loadServiceModule();
  const { calculateTrack1SnapshotSha256 } = await import(
    "../../shared/contracts/campaign-ingest.ts"
  );
  const campaignRepository = makeRepository();
  const taskRepository = new InMemoryTaskRepository();
  const service = new CampaignIngestService(campaignRepository, taskRepository);
  service.startCampaign(makeCampaignStartEnvelope());

  // First attempt: case 0, attempt 1, wrong action → "failed".
  const firstSnapshot = makeCampaignSnapshotForCase(0, 1, 1, null, {
    action: "allow"
  });
  const firstSessionId = (firstSnapshot.result.details as { session_id: string }).session_id;
  service.ingestSnapshot(firstSnapshot);

  // Second attempt: case 0, attempt 2, but reusing the same session_id.
  const secondSnapshot = makeCampaignSnapshotForCase(0, 2, 1, null);
  const secondResult: BaseResult<SandboxRunResultDetails> = {
    ...secondSnapshot.result,
    details: {
      ...secondSnapshot.result.details,
      session_id: firstSessionId,
      events: [],
      policy_decisions: [],
      alerts: [],
      blocked_records: [],
      blocked: false,
      event_count: 0
    }
  };
  const withoutHash: Track1CampaignSnapshotWithoutHash = {
    ...secondSnapshot,
    result: secondResult
  };
  delete (withoutHash as { snapshot_sha256?: string }).snapshot_sha256;
  const reuseSessionSnapshot: Track1CampaignSnapshotEnvelope = {
    ...withoutHash,
    snapshot_sha256: calculateTrack1SnapshotSha256(withoutHash)
  };

  assert.throws(
    () => service.ingestSnapshot(reuseSessionSnapshot),
    { code: "CAMPAIGN_SESSION_ID_DUPLICATE" }
  );
});

// R21 (Phase 2 rework review 2 P1 #4): nested narrative content in
// policy_decisions, alerts, and blocked_records must not be persisted.
// The previous projection only stripped top-level result fields (summary,
// metadata, target) but copied the full arrays, allowing arbitrary text
// in reason/reason_code/title/category fields to be stored. The ingest
// must project these arrays to keep only structural fields.

test("REQ-T1-DEMO-010 does not persist narrative content in policy_decision reason fields", async () => {
  const { service, repository } = await makeStartedService();
  const baseSnapshot = makeCampaignSnapshotForCase(0, 1, 1, null);
  const SECRET_MARKER = "SECRET_SENTINEL_IN_REASON";
  const maliciousDecision = {
    ...baseSnapshot.result.details.policy_decisions![0],
    reason: SECRET_MARKER,
    reason_code: SECRET_MARKER
  };
  // R21: the supervision contract requires the policy_decision event payload
  // to match the policy_decisions entry 1:1. Inject the secret into BOTH
  // places so the contract passes — then verify BOTH are stripped by the
  // projection.
  const maliciousEvents = baseSnapshot.result.details.events!.map((e) =>
    e.event_type === "policy_decision"
      ? { ...e, payload: maliciousDecision }
      : e
  );
  const maliciousDetails = {
    ...baseSnapshot.result.details,
    events: maliciousEvents,
    policy_decisions: [maliciousDecision]
  };
  const maliciousResult = { ...baseSnapshot.result, details: maliciousDetails };
  const { calculateTrack1SnapshotSha256 } = await import(
    "../../shared/contracts/campaign-ingest.ts"
  );
  const withoutHash = { ...baseSnapshot, result: maliciousResult };
  delete (withoutHash as { snapshot_sha256?: string }).snapshot_sha256;
  const snapshot = {
    ...withoutHash,
    snapshot_sha256: calculateTrack1SnapshotSha256(withoutHash)
  };

  service.ingestSnapshot(snapshot);
  const stored = repository.findById(FIXED_CAMPAIGN_ID) as {
    attempts: Array<{
      result: {
        details: {
          policy_decisions?: Array<{ reason?: string; reason_code?: string }>;
          events?: Array<{
            event_type: string;
            payload?: { reason?: string; reason_code?: string };
          }>;
        };
      };
    }>;
  };
  const storedDecisions = stored.attempts[0].result.details.policy_decisions!;
  const storedReason = storedDecisions[0].reason;
  const storedReasonCode = storedDecisions[0].reason_code;
  assert.ok(
    storedReason !== SECRET_MARKER && storedReasonCode !== SECRET_MARKER,
    "narrative content in policy_decision reason/reason_code must not be persisted"
  );
  // R21: the event payload must also be projected.
  const storedEventPayload = stored.attempts[0].result.details.events!.find(
    (e) => e.event_type === "policy_decision"
  )!.payload!;
  assert.ok(
    storedEventPayload.reason !== SECRET_MARKER &&
      storedEventPayload.reason_code !== SECRET_MARKER,
    "narrative content in policy_decision event payload must not be persisted"
  );
});

test("REQ-T1-DEMO-010 does not persist narrative content in blocked_record reason fields", async () => {
  const { service, repository } = await makeStartedService();
  // Use case 1 (index 1, deny) so blocked_records are present.
  const baseSnapshot = makeCampaignSnapshotForCase(1, 1, 1, null);
  const SECRET_BLOCKED = "SECRET_BLOCKED_REASON";
  const maliciousBlocked = baseSnapshot.result.details.blocked_records!.map(
    (r: Record<string, unknown>) => ({ ...r, reason: SECRET_BLOCKED })
  );
  const maliciousDetails = {
    ...baseSnapshot.result.details,
    blocked_records: maliciousBlocked
  };
  const maliciousResult = { ...baseSnapshot.result, details: maliciousDetails };
  const { calculateTrack1SnapshotSha256 } = await import(
    "../../shared/contracts/campaign-ingest.ts"
  );
  const withoutHash = { ...baseSnapshot, result: maliciousResult };
  delete (withoutHash as { snapshot_sha256?: string }).snapshot_sha256;
  const snapshot = {
    ...withoutHash,
    snapshot_sha256: calculateTrack1SnapshotSha256(withoutHash)
  };

  service.ingestSnapshot(snapshot);
  const stored = repository.findById(FIXED_CAMPAIGN_ID) as {
    attempts: Array<{
      result: {
        details: {
          blocked_records?: Array<{ reason?: string }>;
        };
      };
    }>;
  };
  const storedBlocked = stored.attempts[0].result.details.blocked_records!;
  assert.ok(
    storedBlocked.length > 0 && storedBlocked[0].reason !== SECRET_BLOCKED,
    "narrative content in blocked_record reason must not be persisted"
  );
});

// R22 (Phase 2 rework review 2 P1 #5): envelope-to-event correlation.
// The validation function only receives `result` and has no access to the
// outer envelope's scenario_id/case_id. A client can set the envelope to
// T1-SC-001-C001 while injecting events with scenario_id=T1-SC-002 and
// case_id=T1-SC-002-C001, and the mismatch is accepted as "passed".
// The validation must receive the envelope context and reject events whose
// scenario_id or case_id disagree with the envelope.

test("REQ-T1-DEMO-010 rejects snapshot when event scenario_id mismatches envelope scenario_id", async () => {
  const { service } = await makeStartedService();
  const baseSnapshot = makeCampaignSnapshotForCase(0, 1, 1, null);
  // Envelope says T1-SC-001 / T1-SC-001-C001 (case index 0).
  // Inject events with mismatched scenario_id and case_id.
  const maliciousEvents = baseSnapshot.result.details.events!.map((e) => ({
    ...e,
    scenario_id: "T1-SC-002",
    case_id: "T1-SC-002-C001"
  }));
  const maliciousDetails = {
    ...baseSnapshot.result.details,
    events: maliciousEvents
  };
  const maliciousResult = { ...baseSnapshot.result, details: maliciousDetails };
  const { calculateTrack1SnapshotSha256 } = await import(
    "../../shared/contracts/campaign-ingest.ts"
  );
  const withoutHash = { ...baseSnapshot, result: maliciousResult };
  delete (withoutHash as { snapshot_sha256?: string }).snapshot_sha256;
  const snapshot = {
    ...withoutHash,
    snapshot_sha256: calculateTrack1SnapshotSha256(withoutHash)
  };

  assert.throws(
    () => service.ingestSnapshot(snapshot),
    { code: "CAMPAIGN_SNAPSHOT_INVALID" }
  );
});

// R22: event-prefix monotonicity across snapshots. When a new snapshot
// arrives for an existing attempt, its events must be a superset of the
// previous snapshot's events (by event_id). A snapshot that drops or
// rewrites an event_id from the previous snapshot must be rejected —
// otherwise a client could silently rewrite history.

test("REQ-T1-DEMO-010 rejects snapshot when event_prefix shrinks across snapshots", async () => {
  const { service } = await makeStartedService();
  // Snapshot 1 (sequence 1): use status="running" so the attempt is
  // non-terminal and can accept a second snapshot. The events are
  // [event_tool_request_1, event_policy_decision_1].
  const baseSnapshot1 = makeCampaignSnapshotForCase(0, 1, 1, null);
  const { calculateTrack1SnapshotSha256 } = await import(
    "../../shared/contracts/campaign-ingest.ts"
  );
  const runningResult = {
    ...baseSnapshot1.result,
    status: "running" as const,
    updated_at: "2026-06-30T00:01:05.000Z"
  };
  const withoutHash1: Track1CampaignSnapshotWithoutHash = {
    ...baseSnapshot1,
    result: runningResult,
    observed_at: "2026-06-30T00:01:05.000Z"
  };
  delete (withoutHash1 as { snapshot_sha256?: string }).snapshot_sha256;
  const snapshot1 = {
    ...withoutHash1,
    snapshot_sha256: calculateTrack1SnapshotSha256(withoutHash1)
  };
  service.ingestSnapshot(snapshot1);

  // Snapshot 2 (sequence 2): change event_policy_decision_1's event_id to
  // a different value. The supervision contract still passes (policy_decision
  // event is identified by event_type, not event_id), but the prefix check
  // must reject this because "event_policy_decision_1" from snapshot 1 is
  // no longer present.
  const modifiedEvents = snapshot1.result.details.events!.map((e) =>
    e.event_type === "policy_decision"
      ? { ...e, event_id: "event_policy_decision_REWRITTEN" }
      : e
  );
  const modifiedDetails = {
    ...snapshot1.result.details,
    events: modifiedEvents
  };
  const modifiedResult = {
    ...snapshot1.result,
    details: modifiedDetails,
    updated_at: "2026-06-30T00:01:10.000Z"
  };
  const withoutHash2: Track1CampaignSnapshotWithoutHash = {
    ...snapshot1,
    result: modifiedResult,
    sequence: 2,
    previous_snapshot_sha256: snapshot1.snapshot_sha256,
    observed_at: "2026-06-30T00:01:10.000Z"
  };
  delete (withoutHash2 as { snapshot_sha256?: string }).snapshot_sha256;
  const snapshot2 = {
    ...withoutHash2,
    snapshot_sha256: calculateTrack1SnapshotSha256(withoutHash2)
  };

  assert.throws(
    () => service.ingestSnapshot(snapshot2),
    { code: "CAMPAIGN_SNAPSHOT_INVALID" }
  );
});
