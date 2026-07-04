import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { canonicalJson } from "../../scripts/track1/report/canonical-json.ts";
import {
  buildTrack1EvidenceManifest
} from "../../scripts/track1/report/evidence-manifest.ts";
import {
  EXPECTED_ARTIFACT_PATHS,
  makeCompleteArtifactByteMap,
  makeCompletedReportModel
} from "./fixtures/report-evidence.fixture.ts";

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

test("REQ-T1-DEMO-010 canonical JSON sorts keys and emits one final LF", () => {
  assert.equal(
    canonicalJson({ z: 1, a: { y: true, b: null } }),
    '{"a":{"b":null,"y":true},"z":1}\n'
  );
  assert.throws(
    () => canonicalJson({ invalid: Number.POSITIVE_INFINITY }),
    /track1_canonical_json_invalid/
  );
});

test("REQ-T1-DEMO-010 evidence manifest hashes exact artifact bytes in fixed order", () => {
  const artifacts = makeCompleteArtifactByteMap();
  const result = buildTrack1EvidenceManifest(
    makeCompletedReportModel(),
    artifacts
  );

  assert.deepEqual(
    result.manifest.artifacts.map((entry) => entry.path),
    EXPECTED_ARTIFACT_PATHS
  );
  for (const entry of result.manifest.artifacts) {
    const bytes = artifacts.get(entry.path);
    assert.ok(bytes);
    assert.equal(entry.byte_length, bytes.byteLength);
    assert.equal(entry.sha256, sha256(bytes));
  }
  assert.equal(
    result.manifest_sha256,
    sha256(Buffer.from(result.canonical_json, "utf8"))
  );
});

test("REQ-T1-DEMO-010 manifest rejects missing extra and unsafe artifacts", () => {
  const mutations: Map<string, Uint8Array>[] = [];
  const missing = makeCompleteArtifactByteMap();
  missing.delete("campaign.json");
  mutations.push(missing);
  const extra = makeCompleteArtifactByteMap();
  extra.set("extra.txt", Buffer.from("x"));
  mutations.push(extra);
  const unsafe = makeCompleteArtifactByteMap();
  const campaign = unsafe.get("campaign.json");
  assert.ok(campaign);
  unsafe.delete("campaign.json");
  unsafe.set("../campaign.json", campaign);
  mutations.push(unsafe);

  for (const artifacts of mutations) {
    assert.throws(
      () => buildTrack1EvidenceManifest(makeCompletedReportModel(), artifacts),
      /track1_evidence_manifest_invalid/
    );
  }
});

test("REQ-T1-DEMO-010 manifest rejects empty and wrong-magic artifacts", () => {
  for (const [path, bytes] of [
    ["security-risk-analysis.pdf", Buffer.from("not-pdf")],
    ["screenshots/campaign-running.png", Buffer.from("not-png")],
    ["campaign.json", Buffer.alloc(0)]
  ] as const) {
    const artifacts = makeCompleteArtifactByteMap();
    artifacts.set(path, bytes);
    assert.throws(
      () => buildTrack1EvidenceManifest(makeCompletedReportModel(), artifacts),
      /track1_evidence_manifest_invalid/
    );
  }
});

test("REQ-T1-DEMO-010 manifest is detached from mutable model and artifact maps", () => {
  const model = structuredClone(makeCompletedReportModel());
  const artifacts = makeCompleteArtifactByteMap();
  const result = buildTrack1EvidenceManifest(model, artifacts);
  model.cases[0].actual_action = "allow";
  artifacts.get("campaign.json")![0] = 0;
  artifacts.clear();

  assert.equal(result.manifest.action_matrix[0]?.actual_action, "deny");
  assert.equal(result.manifest.artifacts.length, 8);
  assert.equal(Object.isFrozen(result.manifest), true);
  assert.equal(Object.isFrozen(result.manifest.artifacts), true);
});
