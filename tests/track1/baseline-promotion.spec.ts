import assert from "node:assert/strict";
import test from "node:test";

import {
  promoteTrack1Baseline
} from "../../scripts/track1/promote-openclaw-baseline.ts";
import {
  CAMPAIGN_ID,
  EXPECTED_BASELINE_PATHS,
  makeBaselinePromotionPorts
} from "./fixtures/credentialed-e2e.fixture.ts";

test("REQ-T1-DEMO-010 baseline promotion copies only the exact accepted tree", async () => {
  const ports = makeBaselinePromotionPorts();
  const result = await promoteTrack1Baseline(
    { campaign_id: CAMPAIGN_ID },
    ports
  );
  assert.deepEqual(ports.copiedPaths, EXPECTED_BASELINE_PATHS);
  assert.equal(result.file_count, 9);
  assert.match(result.manifest_sha256, /^[a-f0-9]{64}$/);
});

test("REQ-T1-DEMO-010 baseline promotion rejects unsafe source entries", async () => {
  for (const mutation of [
    "extra-file",
    "missing-file",
    "symlink",
    "junction",
    "alternate-data-stream",
    "path-traversal",
    "wrong-magic",
    "content-sentinel"
  ] as const) {
    await assert.rejects(
      () =>
        promoteTrack1Baseline(
          { campaign_id: CAMPAIGN_ID },
          makeBaselinePromotionPorts({ mutation })
        ),
      /track1_baseline_promotion_failed/
    );
  }
});

test("REQ-T1-DEMO-010 failed promotion leaves no partial baseline", async () => {
  const ports = makeBaselinePromotionPorts({ failCopyAt: 4 });
  await assert.rejects(
    () => promoteTrack1Baseline({ campaign_id: CAMPAIGN_ID }, ports),
    /track1_baseline_promotion_failed/
  );
  assert.equal(ports.destinationExists(), false);
  assert.equal(ports.temporaryDirectories.length, 0);
});

test("REQ-T1-DEMO-010 existing accepted baseline cannot be overwritten", async () => {
  const ports = makeBaselinePromotionPorts({ destinationExists: true });
  await assert.rejects(
    () => promoteTrack1Baseline({ campaign_id: CAMPAIGN_ID }, ports),
    /track1_baseline_exists/
  );
  assert.equal(ports.copiedPaths.length, 0);
});
