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

// NOTE: The start-envelope lifecycle byte boundary tests were removed in
// P1-2. The model_ref content boundary (max 256 bytes) now prevents a start
// envelope from ever reaching the 256 KiB lifecycle limit. The lifecycle
// byte limit remains as a defense-in-depth check in the normalizer, but is
// no longer reachable via model_ref padding. The snapshot byte boundary
// tests above cover the byte-limit enforcement for the snapshot envelope,
// which is the envelope type where large payloads are expected.

// -- P1-1: snapshot agent/scenario/case correlation + hash chain ----------------

test("REQ-T1-DEMO-010 rejects snapshot with agent/scenario mismatch", () => {
  const withoutHash = {
    ...makeEnvelope(),
    snapshot_sha256: undefined
  };
  delete (withoutHash as Record<string, unknown>).snapshot_sha256;
  const mismatched = {
    ...withoutHash,
    agent_id: "agent:track1:prompt-injection",
    scenario_id: "T1-SC-002",
    case_id: "T1-SC-002-C001",
    attempt_id: "attempt:t1-sc-002-c001:1"
  };
  mismatched.snapshot_sha256 = calculateTrack1SnapshotSha256(mismatched);
  assert.equal(
    normalizeTrack1CampaignSnapshotEnvelope(mismatched),
    null
  );
});

test("REQ-T1-DEMO-010 rejects snapshot with scenario/case mismatch", () => {
  const withoutHash = { ...makeEnvelope() };
  delete (withoutHash as Record<string, unknown>).snapshot_sha256;
  const mismatched = {
    ...withoutHash,
    scenario_id: "T1-SC-001",
    case_id: "T1-SC-002-C001",
    attempt_id: "attempt:t1-sc-002-c001:1"
  };
  mismatched.snapshot_sha256 = calculateTrack1SnapshotSha256(mismatched);
  assert.equal(
    normalizeTrack1CampaignSnapshotEnvelope(mismatched),
    null
  );
});

test("REQ-T1-DEMO-010 rejects snapshot with agent/case mismatch", () => {
  const withoutHash = { ...makeEnvelope() };
  delete (withoutHash as Record<string, unknown>).snapshot_sha256;
  const mismatched = {
    ...withoutHash,
    agent_id: "agent:track1:tool-hijack",
    case_id: "T1-SC-001-C001",
    attempt_id: "attempt:t1-sc-001-c001:1"
  };
  mismatched.snapshot_sha256 = calculateTrack1SnapshotSha256(mismatched);
  assert.equal(
    normalizeTrack1CampaignSnapshotEnvelope(mismatched),
    null
  );
});

test("REQ-T1-DEMO-010 rejects sequence 1 with non-null previous hash", () => {
  const withoutHash = { ...makeEnvelope() };
  delete (withoutHash as Record<string, unknown>).snapshot_sha256;
  const bad = {
    ...withoutHash,
    sequence: 1,
    previous_snapshot_sha256: "a".repeat(64)
  };
  bad.snapshot_sha256 = calculateTrack1SnapshotSha256(bad);
  assert.equal(
    normalizeTrack1CampaignSnapshotEnvelope(bad),
    null
  );
});

test("REQ-T1-DEMO-010 rejects sequence > 1 with null previous hash", () => {
  const withoutHash = { ...makeEnvelope() };
  delete (withoutHash as Record<string, unknown>).snapshot_sha256;
  const bad = {
    ...withoutHash,
    sequence: 2,
    previous_snapshot_sha256: null
  };
  bad.snapshot_sha256 = calculateTrack1SnapshotSha256(bad);
  assert.equal(
    normalizeTrack1CampaignSnapshotEnvelope(bad),
    null
  );
});

// -- P1-2: start envelope SRI integrity + model_ref content boundary ------------

test("REQ-T1-DEMO-010 accepts start envelope with sha512 SRI package integrity", () => {
  const envelope = {
    ...makeCampaignStartEnvelope(),
    openclaw_package_integrity:
      "sha512-LcooND2tBQw8A+kc1Ujltu3lg30bJ0w7XaeRy7eYzobb8BBdcW6DOGbwJL4vpj1vl9+gjRceOtlh5nh9OARcug=="
  };
  assert.ok(normalizeTrack1CampaignStartEnvelope(envelope));
});

test("REQ-T1-DEMO-010 rejects start envelope with sha256 hex integrity (wrong format)", () => {
  const envelope = {
    ...makeCampaignStartEnvelope(),
    openclaw_package_integrity: "a".repeat(64)
  };
  assert.equal(
    normalizeTrack1CampaignStartEnvelope(envelope),
    null
  );
});

test("REQ-T1-DEMO-010 rejects model_ref with newline", () => {
  const envelope = {
    ...makeCampaignStartEnvelope(),
    model_ref: "model://track1/openclaw-demo\nsk-secret-token"
  };
  assert.equal(
    normalizeTrack1CampaignStartEnvelope(envelope),
    null
  );
});

test("REQ-T1-DEMO-010 rejects model_ref with credential-like content", () => {
  const envelope = {
    ...makeCampaignStartEnvelope(),
    model_ref: "sk-abcdef1234567890abcdef1234567890abcdef1234567890abcdef123456"
  };
  assert.equal(
    normalizeTrack1CampaignStartEnvelope(envelope),
    null
  );
});

test("REQ-T1-DEMO-010 rejects model_ref exceeding 256 bytes", () => {
  const envelope = {
    ...makeCampaignStartEnvelope(),
    model_ref: "model://track1/" + "x".repeat(300)
  };
  assert.equal(
    normalizeTrack1CampaignStartEnvelope(envelope),
    null
  );
});

// -- P1-1 rework: strict SRI pin + model_ref URI whitelist ---------------------

test("REQ-T1-DEMO-010 rejects forged SRI integrity (sha512-A)", () => {
  const envelope = {
    ...makeCampaignStartEnvelope(),
    openclaw_package_integrity: "sha512-A"
  };
  assert.equal(
    normalizeTrack1CampaignStartEnvelope(envelope),
    null
  );
});

test("REQ-T1-DEMO-010 rejects model_ref with Bearer token", () => {
  const envelope = {
    ...makeCampaignStartEnvelope(),
    model_ref: "Bearer SECRET"
  };
  assert.equal(
    normalizeTrack1CampaignStartEnvelope(envelope),
    null
  );
});

test("REQ-T1-DEMO-010 rejects model_ref with api_key query parameter", () => {
  const envelope = {
    ...makeCampaignStartEnvelope(),
    model_ref: "model://track1/openclaw-demo?api_key=secret"
  };
  assert.equal(
    normalizeTrack1CampaignStartEnvelope(envelope),
    null
  );
});

test("REQ-T1-DEMO-010 rejects model_ref with URL userinfo credentials", () => {
  const envelope = {
    ...makeCampaignStartEnvelope(),
    model_ref: "model://user:pass@track1/openclaw-demo"
  };
  assert.equal(
    normalizeTrack1CampaignStartEnvelope(envelope),
    null
  );
});

test("REQ-T1-DEMO-010 accepts only the canonical model_ref URI", () => {
  // The only allowed model_ref is the canonical reference URI, not a URL
  // with credentials, query strings, or alternative schemes.
  assert.ok(
    normalizeTrack1CampaignStartEnvelope(makeCampaignStartEnvelope())
  );
  const envelope = {
    ...makeCampaignStartEnvelope(),
    model_ref: "model://track1/openclaw-demo/v2"
  };
  assert.equal(
    normalizeTrack1CampaignStartEnvelope(envelope),
    null
  );
});

// -- P2-6: finalize schema name drift ------------------------------------------

test("REQ-T1-DEMO-010 finalize envelope uses track1-campaign-finalize.v1", () => {
  // The Phase 1 plan fixes the schema_version as "track1-campaign-finalize.v1",
  // not the abbreviated "track1-campaign-final.v1". The normalizer must accept
  // the plan value and reject the implementation's drift.
  const finalize = makeCampaignFinalizeEnvelope();
  assert.notEqual(
    finalize.schema_version,
    "track1-campaign-final.v1",
    "fixture must not drift to track1-campaign-final.v1"
  );
  assert.equal(
    finalize.schema_version,
    "track1-campaign-finalize.v1",
    "fixture must use the plan-canonical schema_version"
  );
  assert.ok(normalizeTrack1CampaignFinalizeEnvelope(finalize));
  assert.equal(
    normalizeTrack1CampaignFinalizeEnvelope({
      ...finalize,
      schema_version: "track1-campaign-final.v1"
    }),
    null,
    "normalizer must reject the drifted schema_version"
  );
});
