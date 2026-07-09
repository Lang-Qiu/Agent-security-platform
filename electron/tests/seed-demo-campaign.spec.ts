import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildDemoEvidenceRegistration,
  buildDemoFinalizeEnvelope,
  buildDemoSnapshotEnvelopes,
  buildDemoStartEnvelope,
  DEMO_CAMPAIGN_ID
} from "../src/seed-demo-campaign.ts";
import {
  normalizeTrack1CampaignEvidenceRegistration,
  normalizeTrack1CampaignFinalizeEnvelope,
  normalizeTrack1CampaignSnapshotEnvelope,
  normalizeTrack1CampaignStartEnvelope
} from "../../shared/index.ts";
import {
  TRACK1_CASE_EXPECTED_ACTIONS,
  TRACK1_CASE_IDS
} from "../../shared/types/campaign-supervision.ts";

test("buildDemoStartEnvelope normalizes via the shared contract", () => {
  const normalized = normalizeTrack1CampaignStartEnvelope(buildDemoStartEnvelope());
  assert.ok(normalized);
  assert.equal(normalized?.campaign_id, DEMO_CAMPAIGN_ID);
});

test("buildDemoSnapshotEnvelopes produces exactly the 9 fixed cases in order", () => {
  const envelopes = buildDemoSnapshotEnvelopes();
  assert.equal(envelopes.length, TRACK1_CASE_IDS.length);
  assert.deepEqual(envelopes.map((e) => e.case_id), TRACK1_CASE_IDS);
});

test("buildDemoSnapshotEnvelopes matches the fixed policy oracle for every case", () => {
  const envelopes = buildDemoSnapshotEnvelopes();
  for (let i = 0; i < envelopes.length; i++) {
    const decision = envelopes[i].result.details.policy_decisions?.[0];
    assert.equal(decision?.action, TRACK1_CASE_EXPECTED_ACTIONS[i]);
  }
});

test("every demo snapshot envelope normalizes via the shared contract", () => {
  for (const envelope of buildDemoSnapshotEnvelopes()) {
    const normalized = normalizeTrack1CampaignSnapshotEnvelope(envelope);
    assert.ok(normalized, `snapshot for ${envelope.case_id} must normalize`);
  }
});

test("demo snapshot hash chain starts at sequence 1 with a null previous hash", () => {
  const [first] = buildDemoSnapshotEnvelopes();
  assert.equal(first.sequence, 1);
  assert.equal(first.previous_snapshot_sha256, null);
});

test("buildDemoFinalizeEnvelope and buildDemoEvidenceRegistration normalize via shared contracts", () => {
  assert.ok(normalizeTrack1CampaignFinalizeEnvelope(buildDemoFinalizeEnvelope()));
  assert.ok(normalizeTrack1CampaignEvidenceRegistration(buildDemoEvidenceRegistration()));
});
