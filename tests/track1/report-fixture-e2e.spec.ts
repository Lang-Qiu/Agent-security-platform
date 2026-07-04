import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  RUNTIME_SENTINELS,
  buildFixtureEvidencePack
} from "./fixtures/report-evidence.fixture.ts";

test("REQ-T1-DEMO-010 fixture evidence pack is byte-identical across two builds", async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), "track1-report-e2e-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const first = await buildFixtureEvidencePack(join(temporary, "first"));
  const second = await buildFixtureEvidencePack(join(temporary, "second"));

  assert.deepEqual(first.relativePaths, second.relativePaths);
  for (const path of first.relativePaths) {
    assert.deepEqual(Buffer.from(first.bytes(path)), Buffer.from(second.bytes(path)), path);
  }
  assert.equal(first.manifest.coverage.agent_count, 3);
  assert.equal(first.manifest.coverage.case_count, 9);
  assert.equal(first.manifest.action_matrix.length, 9);
});

test("REQ-T1-DEMO-010 fixture evidence pack has readable media markers and no runtime sentinel", async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), "track1-report-scan-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const pack = await buildFixtureEvidencePack(temporary);

  const pdf = Buffer.from(pack.bytes("security-risk-analysis.pdf"));
  assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.match(pdf.toString("utf8"), /Track 1/);
  const markdown = Buffer.from(
    pack.bytes("security-risk-analysis.md")
  ).toString("utf8");
  assert.match(markdown, /中文摘要/);
  assert.match(markdown, /English Abstract/);
  for (const path of pack.relativePaths.filter((path) => path.endsWith(".png"))) {
    const png = Buffer.from(pack.bytes(path));
    assert.equal(png.readUInt32BE(16), 1440, path);
    assert.equal(png.readUInt32BE(20), 1000, path);
    assert.ok(png.byteLength > 100, path);
  }
  for (const [path, bytes] of pack.files) {
    for (const sentinel of Object.values(RUNTIME_SENTINELS)) {
      assert.equal(Buffer.from(bytes).includes(Buffer.from(sentinel)), false, path);
    }
  }
});
