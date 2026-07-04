import assert from "node:assert/strict";
import test from "node:test";

import { buildTrack1Pdf } from "../../scripts/track1/report/pdf-builder.ts";
import {
  FIXED_COMPLETION_EPOCH,
  makeFailingPdfPort,
  makePdfBuildInput,
  makeRecordingPdfBuilderPort
} from "./fixtures/report-evidence.fixture.ts";

test("REQ-T1-DEMO-010 PDF builder passes only fixed deterministic container input", async () => {
  const port = makeRecordingPdfBuilderPort();
  const bytes = await buildTrack1Pdf(makePdfBuildInput(), port);

  assert.equal(Buffer.from(bytes).subarray(0, 5).toString("ascii"), "%PDF-");
  assert.deepEqual(Object.keys(port.inputs[0] ?? {}).sort(), [
    "completed_at",
    "markdown_sha256",
    "screenshots",
    "source_date_epoch"
  ]);
  assert.equal(port.inputs[0]?.source_date_epoch, FIXED_COMPLETION_EPOCH);
  assert.equal(
    (port.inputs[0]?.screenshots as Array<unknown>).length,
    5
  );
});

test("REQ-T1-DEMO-010 PDF builder validates screenshot set and PNG bytes", async () => {
  const missing = makePdfBuildInput();
  missing.screenshot_files.delete("screenshots/campaign-running.png");
  const invalid = makePdfBuildInput();
  invalid.screenshot_files.set(
    "screenshots/campaign-running.png",
    Buffer.from("not-png")
  );

  for (const input of [missing, invalid]) {
    await assert.rejects(
      () => buildTrack1Pdf(input, makeRecordingPdfBuilderPort()),
      /track1_pdf_input_invalid/
    );
  }
});

test("REQ-T1-DEMO-010 PDF errors cannot leak engine input or stderr", async () => {
  const sentinel = "PDF_ENGINE_SENTINEL_4fd2";
  await assert.rejects(
    () => buildTrack1Pdf(makePdfBuildInput(), makeFailingPdfPort(sentinel)),
    (error: unknown) => {
      assert.equal(String(error).includes(sentinel), false);
      return String(error).includes("track1_pdf_build_failed");
    }
  );
});

test("REQ-T1-DEMO-010 PDF builder returns a defensive byte copy", async () => {
  const port = makeRecordingPdfBuilderPort();
  const first = await buildTrack1Pdf(makePdfBuildInput(), port);
  const expected = Buffer.from(first);
  const second = await buildTrack1Pdf(makePdfBuildInput(), port);
  second[8] = 0;

  assert.deepEqual(Buffer.from(first), expected);
});
