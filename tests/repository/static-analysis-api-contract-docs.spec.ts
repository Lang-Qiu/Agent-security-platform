import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readApiContract(): string {
  return readFileSync(new URL("../../docs/api-contract.md", import.meta.url), "utf8");
}

function getSection(document: string, heading: string, nextHeading: string): string {
  const startIndex = document.indexOf(heading);
  const endIndex = document.indexOf(nextHeading, startIndex + heading.length);

  assert.notEqual(startIndex, -1, `expected to find section heading: ${heading}`);
  assert.notEqual(endIndex, -1, `expected to find next section heading after: ${heading}`);

  return document.slice(startIndex, endIndex);
}

test("api contract explicitly scopes pending read examples away from the static-analysis closed-loop contract", () => {
  const apiContract = readApiContract();
  const resultSection = getSection(
    apiContract,
    "### 6.6 GET /api/tasks/:taskId/result",
    "### 6.7 GET /api/tasks/:taskId/risk-summary"
  );
  const riskSummarySection = getSection(
    apiContract,
    "### 6.7 GET /api/tasks/:taskId/risk-summary",
    "### 6.8"
  );

  assert.match(
    resultSection,
    /asset_scan/i,
    "the result example should stay clearly scoped to the placeholder asset-scan read path"
  );
  assert.match(
    riskSummarySection,
    /asset_scan/i,
    "the risk-summary example should stay clearly scoped to the placeholder asset-scan read path"
  );
  assert.match(
    resultSection,
    /static_analysis|REQ-SKILLS-STATIC Mock Closed Loop/i,
    "the result section should explicitly say that static-analysis closed-loop reads follow a different contract"
  );
  assert.match(
    riskSummarySection,
    /static_analysis|REQ-SKILLS-STATIC Mock Closed Loop/i,
    "the risk-summary section should explicitly say that static-analysis closed-loop reads follow a different contract"
  );
});

test("api contract explicitly deprecates the stale static-analysis rule_hit example shape in favor of the standardized contract", () => {
  const apiContract = readApiContract();
  const standardizedSection = apiContract.slice(apiContract.indexOf("## REQ-SKILLS-STATIC Standardized Risk Result"));

  assert.notEqual(
    apiContract.indexOf("## REQ-SKILLS-STATIC Standardized Risk Result"),
    -1,
    "the api contract should contain an authoritative standardized static-analysis section"
  );
  assert.match(
    apiContract,
    /rule_name[\s\S]{0,400}file[\s\S]{0,400}reason[\s\S]{0,400}snippet/i,
    "the older static-analysis table/example still documents the stale rule_name/file/reason/snippet shape and must be explicitly deprecated"
  );
  assert.match(
    standardizedSection,
    /deprecated|superseded/i,
    "the authoritative standardized section should explicitly mark the older static-analysis field shape as deprecated"
  );
  assert.match(
    standardizedSection,
    /rule_name/i,
    "the deprecation note should name the old rule_name-based shape so implementers do not follow it by accident"
  );
  assert.match(
    standardizedSection,
    /file_path/i,
    "the authoritative section should keep pointing readers at the current file_path-based shape"
  );
});
