import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTrack1EvidencePack,
  parseTrack1ReportCli
} from "../../scripts/track1/report/evidence-pipeline.ts";
import { makeReportBuildPorts } from "./fixtures/report-evidence.fixture.ts";

const CAMPAIGN_ID = "campaign:t1:0123456789abcdef0123456789abcdef";

test("REQ-T1-DEMO-010 evidence pipeline validates before registration", async () => {
  const ports = makeReportBuildPorts();
  const result = await buildTrack1EvidencePack(
    { campaign_id: CAMPAIGN_ID },
    ports
  );

  assert.deepEqual(ports.calls, [
    "load-source",
    "project-report",
    "capture-running",
    "capture-final",
    "build-markdown",
    "build-pdf",
    "write-campaign-json",
    "build-manifest",
    "write-temp-files",
    "reread-validate",
    "atomic-publish",
    "register-evidence"
  ]);
  assert.equal(
    result.artifact_ref,
    "artifact://track1/campaign/0123456789abcdef0123456789abcdef/manifest"
  );
  assert.deepEqual(Object.keys(ports.registrationInputs[0] ?? {}).sort(), [
    "artifact_manifest_ref",
    "artifact_manifest_sha256",
    "campaign_id",
    "registered_at",
    "schema_version"
  ]);
});

test("REQ-T1-DEMO-010 any artifact validation failure prevents registration", async () => {
  for (const failure of [
    "capture",
    "markdown",
    "pdf",
    "manifest",
    "reread"
  ] as const) {
    const ports = makeReportBuildPorts({ failure });
    await assert.rejects(
      () => buildTrack1EvidencePack({ campaign_id: CAMPAIGN_ID }, ports),
      /track1_evidence_build_failed/
    );
    assert.equal(ports.registrationInputs.length, 0);
    assert.equal(ports.publishedDirectories.length, 0);
  }
});

test("REQ-T1-DEMO-010 registration failure keeps validated local artifacts but fails command", async () => {
  const ports = makeReportBuildPorts({ failure: "registration" });
  await assert.rejects(
    () => buildTrack1EvidencePack({ campaign_id: CAMPAIGN_ID }, ports),
    /track1_evidence_registration_failed/
  );
  assert.equal(ports.publishedDirectories.length, 1);
  assert.equal(ports.registrationInputs.length, 1);
});

test("REQ-T1-DEMO-010 report CLI accepts one canonical campaign argument only", () => {
  assert.deepEqual(
    parseTrack1ReportCli(["--campaign-id", CAMPAIGN_ID]),
    { campaign_id: CAMPAIGN_ID }
  );
  for (const args of [
    [],
    ["--campaign-id"],
    [CAMPAIGN_ID],
    ["--campaign-id", CAMPAIGN_ID, "--extra"],
    ["--campaign-id", "campaign:t1:ABC"]
  ]) {
    assert.throws(() => parseTrack1ReportCli(args), /track1_report_cli_invalid/);
  }
});
