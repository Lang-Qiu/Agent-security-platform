import assert from "node:assert/strict";
import test from "node:test";

import {
  TRACK1_REPORT_SCREENSHOT_PATHS,
  buildTrack1MarkdownReport
} from "../../scripts/track1/report/markdown-report.ts";
import {
  RUNTIME_SENTINELS,
  makeCanonicalFixturePort,
  makeCompletedReportModel
} from "./fixtures/report-evidence.fixture.ts";

test("REQ-T1-DEMO-010 report contains all required sections in fixed order", async () => {
  const markdown = await buildTrack1MarkdownReport(
    makeCompletedReportModel(),
    makeCanonicalFixturePort()
  );
  const headings = markdown
    .split("\n")
    .filter((line) => /^## \d+\./.test(line));

  assert.equal(headings.length, 18);
  for (let index = 1; index < headings.length; index += 1) {
    assert.ok(
      markdown.indexOf(headings[index - 1]) < markdown.indexOf(headings[index])
    );
  }
  assert.match(markdown, /中文摘要/);
  assert.match(markdown, /English Abstract/);
  assert.equal(
    (markdown.match(/\| T1-SC-00[1-3]-C00[1-3] \|/g) ?? []).length,
    9
  );
});

test("REQ-T1-DEMO-010 appendix contains only hash-verified canonical fixture content", async () => {
  const fixturePort = makeCanonicalFixturePort();
  const markdown = await buildTrack1MarkdownReport(
    makeCompletedReportModel(),
    fixturePort
  );
  assert.deepEqual(
    fixturePort.readPaths,
    makeCompletedReportModel().fixture_appendix.map((entry) => entry.path)
  );
  for (const fixture of fixturePort.fixtures) {
    assert.equal(markdown.includes(fixture.controlled_content.trim()), true);
  }
  for (const scenario of ["T1-SC-001", "T1-SC-002", "T1-SC-003"]) {
    assert.match(
      markdown,
      new RegExp(`samples/track1/attack-scripts/${scenario}/replay\\.ts`)
    );
  }
});

test("REQ-T1-DEMO-010 fixture hash mismatch stops report generation", async () => {
  await assert.rejects(
    () =>
      buildTrack1MarkdownReport(
        makeCompletedReportModel(),
        makeCanonicalFixturePort({ tamperCase: "T1-SC-002-C002" })
      ),
    /track1_fixture_hash_mismatch/
  );
});

test("REQ-T1-DEMO-010 report references five exact screenshots and discloses retry", async () => {
  const markdown = await buildTrack1MarkdownReport(
    makeCompletedReportModel(),
    makeCanonicalFixturePort()
  );
  for (const path of TRACK1_REPORT_SCREENSHOT_PATHS) {
    assert.equal((markdown.match(new RegExp(path.replaceAll("/", "\\/"), "g")) ?? []).length, 1);
  }
  assert.match(markdown, /attempt:t1-sc-001-c001:1/);
  assert.match(markdown, /attempt:t1-sc-001-c001:2/);
  assert.match(markdown, /真实副作用计数：0/);
});

test("REQ-T1-DEMO-010 report documents the direct CLI terminal hook", async () => {
  const markdown = await buildTrack1MarkdownReport(
    makeCompletedReportModel(),
    makeCanonicalFixturePort()
  );

  assert.match(markdown, /agent_end/);
  assert.match(markdown, /七类 hook/);
});

test("REQ-T1-DEMO-010 report is deterministic and contains no runtime secrets", async () => {
  const model = makeCompletedReportModel();
  const first = await buildTrack1MarkdownReport(
    model,
    makeCanonicalFixturePort()
  );
  const second = await buildTrack1MarkdownReport(
    model,
    makeCanonicalFixturePort()
  );
  assert.equal(first, second);
  assert.equal(first.endsWith("\n"), true);
  assert.equal(first.endsWith("\n\n"), false);
  for (const sentinel of Object.values(RUNTIME_SENTINELS)) {
    assert.equal(first.includes(sentinel), false);
  }
  assert.doesNotMatch(first, /OPENCLAW_MODEL_API_KEY|TRACK1_INGEST_TOKEN=/);
});
