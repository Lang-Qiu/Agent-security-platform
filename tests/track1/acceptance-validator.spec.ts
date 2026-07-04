import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  validateTrack1Acceptance
} from "../../scripts/track1/acceptance-validator.ts";
import {
  ACCEPTANCE_MUTATIONS,
  CAMPAIGN_ID,
  makeAcceptedRealCampaignSource
} from "./fixtures/credentialed-e2e.fixture.ts";

test("REQ-T1-DEMO-010 validator accepts one complete independent 9-of-9 source", () => {
  const source = makeAcceptedRealCampaignSource();
  const result = validateTrack1Acceptance(source);
  const manifestBytes = source.artifact_files.get("manifest.json");
  assert.ok(manifestBytes);
  assert.deepEqual(result, {
    schema_version: "track1-acceptance.v1",
    campaign_id: CAMPAIGN_ID,
    accepted: true,
    agent_count: 3,
    case_count: 9,
    final_pass_count: 9,
    retry_count: 1,
    attempt_count: 10,
    real_side_effect_count: 0,
    manifest_sha256: createHash("sha256")
      .update(manifestBytes)
      .digest("hex")
  });
});

test("REQ-T1-DEMO-010 validator rejects every acceptance invariant mutation", () => {
  for (const mutation of ACCEPTANCE_MUTATIONS) {
    assert.throws(
      () =>
        validateTrack1Acceptance(
          mutation.apply(makeAcceptedRealCampaignSource())
        ),
      (error: unknown) => {
        assert.equal(String(error).includes(mutation.sentinel), false);
        return String(error).includes(mutation.expectedCode);
      },
      mutation.name
    );
  }
});

test("REQ-T1-DEMO-010 validator rejects extra artifact and forged action matrix", () => {
  const extra = makeAcceptedRealCampaignSource();
  extra.artifact_files.set("extra.txt", Buffer.from("x"));
  assert.throws(
    () => validateTrack1Acceptance(extra),
    /track1_acceptance_invalid/
  );

  const forged = makeAcceptedRealCampaignSource();
  const bytes = forged.artifact_files.get("manifest.json");
  assert.ok(bytes);
  const manifest = JSON.parse(Buffer.from(bytes).toString("utf8"));
  manifest.action_matrix[0].actual_action = "allow";
  forged.artifact_files.set(
    "manifest.json",
    Buffer.from(JSON.stringify(manifest) + "\n")
  );
  assert.throws(
    () => validateTrack1Acceptance(forged),
    /track1_acceptance_invalid/
  );
});
