import assert from "node:assert/strict";
import test from "node:test";

import {
  captureTrack1CampaignEvidence
} from "../../scripts/track1/capture-openclaw-evidence.ts";
import {
  makeCompletedCampaignCaptureInput,
  makeRecordingBrowserPort
} from "./fixtures/report-evidence.fixture.ts";

const EXPECTED_CAPTURE_PATHS = [
  "screenshots/campaign-running.png",
  "screenshots/campaign-overview.png",
  "screenshots/scenario-1-prompt-injection.png",
  "screenshots/scenario-2-tool-hijack.png",
  "screenshots/scenario-3-memory-poisoning.png"
];

test("REQ-T1-DEMO-010 evidence capture emits exactly five fixed screenshots", async () => {
  const browser = makeRecordingBrowserPort();
  const result = await captureTrack1CampaignEvidence(
    makeCompletedCampaignCaptureInput(),
    browser
  );

  assert.deepEqual(
    result.map((capture) => capture.path),
    EXPECTED_CAPTURE_PATHS
  );
  assert.deepEqual(browser.overflowViewports, [
    [390, 844],
    [1024, 900],
    [1440, 1000]
  ]);
  assert.deepEqual(
    browser.requests.slice(2).map((request) => request.session_id),
    [
      "session:00000000000000000000000000000181",
      "session:00000000000000000000000000000004",
      "session:00000000000000000000000000000007"
    ]
  );
});

test("REQ-T1-DEMO-010 capture rejects non-fresh or leaking UI states", async () => {
  for (const mutation of [
    "stale",
    "mock",
    "loading",
    "fallback",
    "error",
    "horizontal-overflow",
    "console-error",
    "failed-api",
    "raw-sentinel"
  ] as const) {
    await assert.rejects(
      () =>
        captureTrack1CampaignEvidence(
          makeCompletedCampaignCaptureInput(),
          makeRecordingBrowserPort({ mutation })
        ),
      /track1_capture_failed/
    );
  }
});

test("REQ-T1-DEMO-010 capture rejects identity mismatch and blank PNG", async () => {
  for (const mutation of [
    "wrong-campaign",
    "wrong-session",
    "blank"
  ] as const) {
    await assert.rejects(
      () =>
        captureTrack1CampaignEvidence(
          makeCompletedCampaignCaptureInput(),
          makeRecordingBrowserPort({ mutation })
        ),
      /track1_capture_failed/
    );
  }
});

test("REQ-T1-DEMO-010 capture results are recursively frozen defensive bytes", async () => {
  const browser = makeRecordingBrowserPort();
  const captures = await captureTrack1CampaignEvidence(
    makeCompletedCampaignCaptureInput(),
    browser
  );
  const original = captures[0].bytes[8];
  const browserBytes = (await browser.capture(browser.requests[0])).bytes;
  browserBytes[8] = 0;

  assert.equal(captures[0].bytes[8], original);
  assert.equal(Object.isFrozen(captures), true);
  assert.equal(Object.isFrozen(captures[0]), true);
});
