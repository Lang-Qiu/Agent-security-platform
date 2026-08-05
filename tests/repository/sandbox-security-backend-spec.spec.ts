import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const SPRINT_PATH = "docs/sprint-current.md";
const PACKAGE_PATH = "package.json";
const TEST_PATH = "tests/repository/sandbox-security-backend-spec.spec.ts";
const CANONICAL_SPEC_PATH =
  "docs/superpowers/specs/2026-08-05-sandbox-security-backend-api-design.md";

const LEGAL_GENERAL_003_STATUSES = new Set([
  "PLAN_FIXED_PENDING_REVIEW",
  "PLAN_REVIEWED_PENDING_USER_APPROVAL",
  "IMPLEMENTATION_IN_PROGRESS",
  "IMPLEMENTED_PENDING_GLOBAL_P6_GATE"
]);

function readText(relativePath: string): string {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

function extractSection(text: string, heading: string): string {
  const start = text.indexOf(heading);
  assert.notEqual(start, -1, `missing section ${heading}`);
  const bodyStart = start + heading.length;
  const next = text.slice(bodyStart).search(/^## /m);
  return next === -1
    ? text.slice(bodyStart).trim()
    : text.slice(bodyStart, bodyStart + next).trim();
}

function currentStatus(sprint: string): string {
  const matches = [
    ...sprint.matchAll(/^## Status\s*\n+([A-Z][A-Z0-9_]*)\s*$/gm)
  ];
  assert.equal(
    matches.length,
    1,
    "sprint-current.md must expose exactly one uppercase Status value"
  );
  return matches[0]![1]!;
}

function assertNoVerifiedClaims(sprint: string): void {
  for (const line of sprint.split(/\r?\n/)) {
    if (
      !/\bGENERAL-(?:002|003)\b/.test(line) ||
      !/\bVERIFIED\b/.test(line)
    ) {
      continue;
    }

    assert.match(
      line,
      /\b(?:not|never|does not|cannot|without|absent|pending|provisional|unverified|neither|nor)\b/i,
      `GENERAL-002/003 must not be described as VERIFIED: ${line}`
    );
    if (
      /\bneither\b[^\n]*\bnor\b/i.test(line) ||
      /\bGENERAL-(?:002|003)\s+nor\s+GENERAL-(?:002|003)\b/i.test(line)
    ) {
      continue;
    }
    assert.doesNotMatch(
      line,
      /\b(?:is|was|were|has been|status\s*(?:is|:)|state\s*(?:is|:)|marked|declared|returned)\s+`?VERIFIED`?\b/i,
      `GENERAL-002/003 has a positive VERIFIED claim: ${line}`
    );
  }
}

test("REQ-SBX-GENERAL-003 repository gate enforces canonical identity and dependency-safe status", () => {
  const sprint = readText(SPRINT_PATH);
  const packageJson = JSON.parse(readText(PACKAGE_PATH)) as {
    scripts?: Record<string, string>;
  };

  assert.match(sprint, /\bREQ-SBX-GENERAL-003\b/);
  const canonicalSpec = readText(CANONICAL_SPEC_PATH);
  assert.ok(canonicalSpec.length > 0, `canonical spec is empty: ${CANONICAL_SPEC_PATH}`);
  assert.ok(
    sprint.includes(CANONICAL_SPEC_PATH),
    `sprint-current.md must reference ${CANONICAL_SPEC_PATH}`
  );

  const status = currentStatus(sprint);
  assert.ok(
    LEGAL_GENERAL_003_STATUSES.has(status),
    `illegal GENERAL-003 status: ${status}`
  );

  const dependencyGate = extractSection(sprint, "## Dependency Gate");
  assert.match(
    dependencyGate,
    /PROVISIONAL_ACCEPTED_PENDING_P6_RECAPTURE/
  );
  assertNoVerifiedClaims(sprint);

  if (dependencyGate.includes("PROVISIONAL_ACCEPTED_PENDING_P6_RECAPTURE")) {
    if (status.startsWith("IMPLEMENTED")) {
      assert.equal(status, "IMPLEMENTED_PENDING_GLOBAL_P6_GATE");
    }
  }

  const testRepoScript = packageJson.scripts?.["test:repo"] ?? "";
  assert.ok(
    testRepoScript.split(/\s+/).includes(TEST_PATH),
    `test:repo must register ${TEST_PATH}`
  );
});
