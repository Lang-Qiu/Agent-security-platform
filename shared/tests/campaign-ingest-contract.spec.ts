import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateTrack1SnapshotSha256,
  normalizeTrack1CampaignEvidenceRegistration,
  normalizeTrack1CampaignFinalizeEnvelope,
  normalizeTrack1CampaignSnapshotAck,
  normalizeTrack1CampaignStartEnvelope,
  normalizeTrack1CampaignSnapshotEnvelope,
  TRACK1_LIFECYCLE_MAX_BYTES,
  TRACK1_SNAPSHOT_MAX_BYTES
} from "../contracts/campaign-ingest.ts";
import {
  makeCampaignEvidenceRegistration,
  makeCampaignFinalizeEnvelope,
  makeCampaignSnapshotAck,
  makeCampaignStartEnvelope,
  makeFinishedSandboxResult
} from "./fixtures/campaign-ingest.fixture.ts";

function makeEnvelope(resultSummaryOverride?: string) {
  const baseResult = makeFinishedSandboxResult();
  const result =
    resultSummaryOverride === undefined
      ? baseResult
      : { ...baseResult, summary: resultSummaryOverride };
  const withoutHash = {
    schema_version: "track1-campaign-snapshot.v1",
    campaign_id: "campaign:t1:0123456789abcdef0123456789abcdef",
    campaign_manifest_sha256: "a".repeat(64),
    agent_id: "agent:track1:prompt-injection",
    scenario_id: "T1-SC-001",
    case_id: "T1-SC-001-C001",
    attempt_id: "attempt:t1-sc-001-c001:1",
    attempt_index: 1,
    sequence: 1,
    previous_snapshot_sha256: null,
    observed_at: "2026-06-30T00:00:01.000Z",
    result
  };
  return {
    ...withoutHash,
    snapshot_sha256: calculateTrack1SnapshotSha256(withoutHash)
  };
}

test("REQ-T1-DEMO-010 accepts a canonical hashed snapshot", () => {
  assert.ok(normalizeTrack1CampaignSnapshotEnvelope(makeEnvelope()));
});

test("REQ-T1-DEMO-010 accepts exact campaign lifecycle and evidence envelopes", () => {
  assert.ok(normalizeTrack1CampaignStartEnvelope(makeCampaignStartEnvelope()));
  assert.ok(normalizeTrack1CampaignSnapshotAck(makeCampaignSnapshotAck()));
  assert.ok(normalizeTrack1CampaignFinalizeEnvelope(makeCampaignFinalizeEnvelope()));
  assert.ok(
    normalizeTrack1CampaignEvidenceRegistration(
      makeCampaignEvidenceRegistration()
    )
  );
});

test("REQ-T1-DEMO-010 rejects a forged hash", () => {
  assert.equal(normalizeTrack1CampaignSnapshotEnvelope({
    ...makeEnvelope(),
    snapshot_sha256: "b".repeat(64)
  }), null);
});

test("REQ-T1-DEMO-010 rejects raw content in an envelope", () => {
  assert.equal(normalizeTrack1CampaignSnapshotEnvelope({
    ...makeEnvelope(),
    raw_prompt: "SNAPSHOT_RAW_SENTINEL"
  }), null);
});

test("REQ-T1-DEMO-010 rejects sequence zero and invalid previous hash", () => {
  assert.equal(normalizeTrack1CampaignSnapshotEnvelope({
    ...makeEnvelope(),
    sequence: 0
  }), null);
  assert.equal(normalizeTrack1CampaignSnapshotEnvelope({
    ...makeEnvelope(),
    sequence: 2,
    previous_snapshot_sha256: "not-a-sha256"
  }), null);
});

test("REQ-T1-DEMO-010 rejects lifecycle raw content and correlation drift", () => {
  assert.equal(normalizeTrack1CampaignStartEnvelope({
    ...makeCampaignStartEnvelope(),
    api_key: "INGEST_START_SECRET_SENTINEL"
  }), null);
  assert.equal(normalizeTrack1CampaignSnapshotAck({
    ...makeCampaignSnapshotAck(),
    sequence: 0
  }), null);
  assert.equal(normalizeTrack1CampaignFinalizeEnvelope({
    ...makeCampaignFinalizeEnvelope(),
    requested_status: "running"
  }), null);
  assert.equal(normalizeTrack1CampaignEvidenceRegistration({
    ...makeCampaignEvidenceRegistration(),
    report_body: "INGEST_EVIDENCE_RAW_SENTINEL"
  }), null);
});

// -- body-limit boundary tests -------------------------------------------------

function utf8ByteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function padSummaryForTargetByteLength(target: number): string {
  const base = makeEnvelope();
  const baseLength = utf8ByteLength(JSON.stringify(base));
  const paddingNeeded = target - baseLength;
  if (paddingNeeded < 0) {
    throw new Error("target byte length is smaller than the base envelope");
  }
  return "x".repeat(paddingNeeded) + base.result.summary;
}

test("REQ-T1-DEMO-010 accepts a snapshot at the exact snapshot byte boundary", () => {
  const paddedSummary = padSummaryForTargetByteLength(TRACK1_SNAPSHOT_MAX_BYTES);
  const envelope = makeEnvelope(paddedSummary);
  const actualLength = utf8ByteLength(JSON.stringify(envelope));
  assert.equal(actualLength, TRACK1_SNAPSHOT_MAX_BYTES);
  assert.ok(normalizeTrack1CampaignSnapshotEnvelope(envelope));
});

test("REQ-T1-DEMO-010 rejects a snapshot exceeding the snapshot byte boundary", () => {
  const paddedSummary = padSummaryForTargetByteLength(TRACK1_SNAPSHOT_MAX_BYTES + 1);
  const envelope = makeEnvelope(paddedSummary);
  const actualLength = utf8ByteLength(JSON.stringify(envelope));
  assert.equal(actualLength, TRACK1_SNAPSHOT_MAX_BYTES + 1);
  assert.equal(normalizeTrack1CampaignSnapshotEnvelope(envelope), null);
});

function padModelRefForTargetByteLength(target: number): string {
  const base = makeCampaignStartEnvelope();
  const baseLength = utf8ByteLength(JSON.stringify(base));
  const paddingNeeded = target - baseLength;
  if (paddingNeeded < 0) {
    throw new Error("target byte length is smaller than the base start envelope");
  }
  return base.model_ref + "x".repeat(paddingNeeded);
}

test("REQ-T1-DEMO-010 accepts a start envelope at the exact lifecycle byte boundary", () => {
  const paddedModelRef = padModelRefForTargetByteLength(TRACK1_LIFECYCLE_MAX_BYTES);
  const envelope = {
    ...makeCampaignStartEnvelope(),
    model_ref: paddedModelRef
  };
  const actualLength = utf8ByteLength(JSON.stringify(envelope));
  assert.equal(actualLength, TRACK1_LIFECYCLE_MAX_BYTES);
  assert.ok(normalizeTrack1CampaignStartEnvelope(envelope));
});

test("REQ-T1-DEMO-010 rejects a start envelope exceeding the lifecycle byte boundary", () => {
  const paddedModelRef = padModelRefForTargetByteLength(TRACK1_LIFECYCLE_MAX_BYTES + 1);
  const envelope = {
    ...makeCampaignStartEnvelope(),
    model_ref: paddedModelRef
  };
  const actualLength = utf8ByteLength(JSON.stringify(envelope));
  assert.equal(actualLength, TRACK1_LIFECYCLE_MAX_BYTES + 1);
  assert.equal(normalizeTrack1CampaignStartEnvelope(envelope), null);
});
