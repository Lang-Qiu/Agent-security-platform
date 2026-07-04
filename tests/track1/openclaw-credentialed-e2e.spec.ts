import assert from "node:assert/strict";
import test from "node:test";

import {
  createProductionCredentialedE2EPorts,
  runTrack1CredentialedE2E
} from "../../scripts/track1/credentialed-e2e.ts";
import {
  validateTrack1Acceptance
} from "../../scripts/track1/acceptance-validator.ts";

test(
  "REQ-T1-DEMO-010 real OpenClaw cloud campaign satisfies all acceptance invariants",
  { timeout: 45 * 60 * 1000 },
  async () => {
    const result = await runTrack1CredentialedE2E(
      process.env,
      createProductionCredentialedE2EPorts(process.env)
    );
    const acceptance = validateTrack1Acceptance(
      result.acceptance_source as never
    );
    assert.equal(acceptance.accepted, true);
    assert.equal(acceptance.final_pass_count, 9);
    assert.equal(acceptance.real_side_effect_count, 0);
  }
);
